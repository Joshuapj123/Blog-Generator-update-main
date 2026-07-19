import { ContentScoreResult } from '@/lib/content-scoring';
import { SerpTerm, SerpEntity, ContentGapReport, HeadingFrequencyItem, TopicClusterItem, PaaQuestionItem, FeaturedSnippetBlueprint } from '@/types/serp';
import { stem } from '../serp-nlp-processing';

export interface ScorerParams {
  textContext: string;
  title: string;
  headings: string[];
  liveTerms: (SerpTerm & { currentCount: number; overuseRisk: boolean })[];
  entities: SerpEntity[];
  topTermsForIntent: string[];
  medianWordCount: number;
  medianTitleLength: number;
  medianH2Count: number;
  contentGapReport?: ContentGapReport;
  headingFrequency?: HeadingFrequencyItem[];
  topicClusters?: TopicClusterItem[];
  paaQuestions?: PaaQuestionItem[];
  medianLexicalDiversity?: number; // Expose competitor average lexical diversity
  featuredSnippetBlueprint?: FeaturedSnippetBlueprint;
}

export const PHRASE_EXPANSIONS: Record<string, string[]> = {
  'crm workflow automation': [
    'workflow automation crm',
    'sales workflow automation',
    'automated crm workflows',
    'automated workflows',
    'sales workflows',
    'lead routing',
    'customer lifecycle automation'
  ],
  'customer lifecycle workflows': [
    'lifecycle automation',
    'customer lifecycle automation',
    'customer journey automation',
    'lifecycle workflows'
  ],
  'lead assignment automation': [
    'automated lead assignment',
    'lead routing automation',
    'automated lead routing',
    'lead distribution automation'
  ],
  'workflow automation crm': [
    'crm workflow automation',
    'crm automation workflows'
  ],
  'sales workflow automation': [
    'automated sales workflows',
    'sales automation workflows'
  ]
};

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s+|\n+)|[\n\r]+/g)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

export function checkPhraseStemOverlap(phraseA: string, phraseB: string, threshold = 0.5): boolean {
  const stemsA = tokenize(phraseA).map(stem);
  const stemsB = tokenize(phraseB).map(stem);
  if (stemsA.length === 0 || stemsB.length === 0) return false;
  const setA = new Set(stemsA);
  const setB = new Set(stemsB);
  let overlap = 0;
  setA.forEach(t => { if (setB.has(t)) overlap++; });
  return overlap / Math.min(setA.size, setB.size) >= threshold;
}

export function checkSemanticMatchForTerm(sentences: string[], draftClean: string, term: string): boolean {
  const termLower = term.toLowerCase().trim();
  if (draftClean.includes(termLower)) return true;

  const tTokens = tokenize(termLower).map(stem);
  if (tTokens.length > 0) {
    const threshold = tTokens.length >= 3 ? 0.8 : 1.0;
    for (const sentence of sentences) {
      const sTokens = tokenize(sentence).map(stem);
      const sSet = new Set(sTokens);
      let hits = 0;
      tTokens.forEach(tok => { if (sSet.has(tok)) hits++; });
      if (hits / tTokens.length >= threshold) {
        return true;
      }
    }
  }

  const expansions = PHRASE_EXPANSIONS[termLower];
  if (expansions) {
    for (const exp of expansions) {
      if (draftClean.includes(exp)) return true;
      const eTokens = tokenize(exp).map(stem);
      if (eTokens.length > 0) {
        const threshold = eTokens.length >= 3 ? 0.8 : 1.0;
        for (const sentence of sentences) {
          const sTokens = tokenize(sentence).map(stem);
          const sSet = new Set(sTokens);
          let hits = 0;
          eTokens.forEach(tok => { if (sSet.has(tok)) hits++; });
          if (hits / eTokens.length >= threshold) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/** Tokenizer helper */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/** Computes the updated 6-component blended SEO score */
export function calculateSeoScore(params: ScorerParams): ContentScoreResult {
  const {
    textContext, title, headings, liveTerms, entities,
    topTermsForIntent, medianWordCount, medianTitleLength, medianH2Count,
    contentGapReport, headingFrequency, topicClusters, paaQuestions,
    medianLexicalDiversity,
    featuredSnippetBlueprint,
  } = params;

  const draftClean = textContext.toLowerCase();
  const draftTokens = tokenize(textContext);
  const wordCount = draftTokens.length;
  const draftSentences = splitIntoSentences(textContext);

  // 1. Keyword Coverage (S, 15% weight)
  // Exclude keywords with importance < 4 from recall metrics
  const basicTerms = liveTerms.filter(t => t.category === 'basic' && t.importance >= 4);
  const suppTerms = liveTerms.filter(t => t.category === 'supplementary' && t.importance >= 4);

  const matchesTerm = (term: SerpTerm & { currentCount: number }) => {
    if (term.currentCount > 0) return true;
    return checkSemanticMatchForTerm(draftSentences, draftClean, term.term);
  };

  const basicHits = basicTerms.filter(matchesTerm).length;
  const suppHits = suppTerms.filter(matchesTerm).length;

  const basicMatchedWeight = basicTerms.filter(matchesTerm).reduce((sum, t) => sum + t.importance, 0);
  const basicTotalWeight = basicTerms.reduce((sum, t) => sum + t.importance, 0);
  const basicRecall = basicTotalWeight > 0 ? basicMatchedWeight / basicTotalWeight : 1.0;

  const suppMatchedWeight = suppTerms.filter(matchesTerm).reduce((sum, t) => sum + t.importance, 0);
  const suppTotalWeight = suppTerms.reduce((sum, t) => sum + t.importance, 0);
  const suppRecall = suppTotalWeight > 0 ? suppMatchedWeight / suppTotalWeight : 1.0;

  const S_raw = Math.min(1.0, 0.7 * basicRecall + 0.3 * suppRecall);

  // 2. Entity Coverage (E, 25% weight)
  // Target entities: competitor coverage >= 40% OR importance score >= 40
  const targetEntities = entities.filter(e => {
    const coverage = e.competitorCoverage ?? 0;
    const importance = e.importanceScore ?? Math.round(coverage * 100);
    return coverage >= 0.4 || importance >= 40;
  });

  let coveredEntitiesCount = 0;
  let totalTargetImportance = 0;
  let coveredTargetImportance = 0;

  targetEntities.forEach(e => {
    const coverage = e.competitorCoverage ?? 0;
    const importance = e.importanceScore ?? Math.round(coverage * 100);
    totalTargetImportance += importance;
    
    let isCovered = draftClean.includes(e.entityName.toLowerCase());
    if (!isCovered) {
      isCovered = checkPhraseStemOverlap(draftClean, e.entityName, 0.70);
    }
    if (isCovered) {
      coveredEntitiesCount++;
      coveredTargetImportance += importance;
    }
  });

  const E = totalTargetImportance > 0
    ? Math.min(1.0, coveredTargetImportance / totalTargetImportance)
    : 0.8; // default to neutral high if no entities found

  // Apply Entity Boost to Semantic Score (S) - Issue 4
  let S = S_raw;
  if (E >= 0.5) {
    S = Math.min(1.0, S_raw + 0.15 * E);
  }

  // 3. Intent Alignment (I, 25% weight) - Issue 1
  let headingSimilarity = 0.8;
  if (headingFrequency && headingFrequency.length > 0) {
    const popularHeadings = headingFrequency.filter(h => (h.competitorPercentage ?? (h.count / 10)) >= 0.3);
    const targets = popularHeadings.length > 0 ? popularHeadings : headingFrequency.slice(0, 5);
    let matchedWeight = 0;
    let totalWeight = 0;
    targets.forEach(h => {
      const weight = h.competitorPercentage || (h.count / 10) || 0.5;
      totalWeight += weight;
      const isMatched = headings.some(dh =>
        dh.toLowerCase().includes(h.heading.toLowerCase()) ||
        h.heading.toLowerCase().includes(dh.toLowerCase()) ||
        checkPhraseStemOverlap(dh, h.heading, 0.5)
      );
      if (isMatched) {
        matchedWeight += weight;
      }
    });
    headingSimilarity = totalWeight > 0 ? matchedWeight / totalWeight : 1.0;
  } else {
    headingSimilarity = headings.length > 0 ? 1.0 : 0.0;
  }

  let topicClusterSimilarity = 0.8;
  if (topicClusters && topicClusters.length > 0) {
    let coveredClusters = 0;
    topicClusters.forEach(cluster => {
      const clusterTerms = [cluster.clusterName, ...(cluster.keywords || [])];
      const isCovered = clusterTerms.some(term =>
        checkSemanticMatchForTerm(draftSentences, draftClean, term)
      );
      if (isCovered) {
        coveredClusters++;
      }
    });
    topicClusterSimilarity = coveredClusters / topicClusters.length;
  }

  const entitySimilarity = E;

  let paaCoverage = 0.8;
  if (paaQuestions && paaQuestions.length > 0) {
    let coveredQuestions = 0;
    paaQuestions.forEach(pq => {
      const qClean = pq.question.toLowerCase().replace(/[?.]/g, '').trim();
      const isCovered = draftClean.includes(qClean) || headings.some(h =>
        h.toLowerCase().includes(qClean) || checkPhraseStemOverlap(h, pq.question, 0.6)
      ) || checkPhraseStemOverlap(draftClean, pq.question, 0.4);
      if (isCovered) {
        coveredQuestions++;
      }
    });
    paaCoverage = coveredQuestions / paaQuestions.length;
  }

  const keywordSimilarity = S_raw;

  const I = 0.30 * headingSimilarity + 0.25 * topicClusterSimilarity + 0.20 * entitySimilarity + 0.15 * paaCoverage + 0.10 * keywordSimilarity;

  // 4. On-page Structure (O, 10% weight) - Expose and integrate sub-scores (Issue 2)
  const hasH1 = /^#\s+.+/m.test(textContext) || /<h1[^>]*>/i.test(textContext);
  const hasH2 = headings.length > 0 || /^##\s+.+/m.test(textContext);

  const h2Variance = medianH2Count > 0 ? Math.abs(headings.length - medianH2Count) / medianH2Count : 0;
  const h2Score = h2Variance < 0.25 ? 1.0 : h2Variance < 0.5 ? 0.7 : 0.4;

  const titleLenScore = (title.length >= 20 && title.length <= 100) ? 1.0
    : (title.length > 100 && title.length <= 120) ? 0.7
    : 0.3;

  const wordRatio = medianWordCount > 0 ? wordCount / medianWordCount : 1;
  const lenScore = wordCount >= medianWordCount * 0.9 ? 1.0
    : Math.abs(wordRatio - 1) < 0.2 ? 0.75
    : Math.abs(wordRatio - 1) < 0.5 ? 0.5
    : 0.2;

  // Compute structure sub-scores (0-100 scale)
  const h1QualityVal = hasH1 ? Math.round(titleLenScore * 100) : 0;
  const h2CoverageVal = Math.round(h2Score * 100);
  const h3CoverageVal = (textContext.match(/^###\s+.+/gm) || []).length > 0 ? 100 : 0;
  const faqCoverageVal = headings.some(h => h.toLowerCase().includes('faq') || h.toLowerCase().includes('frequently asked')) ? 100 : 0;
  const tableCoverageVal = (textContext.includes('|') && /\|[^\n]+\|[^\n]+\|/g.test(textContext)) ? 100 : 0;
  const wordCountAlignmentVal = Math.round(lenScore * 100);
  const headingFrequencyAlignmentVal = Math.round(headingSimilarity * 100);

  // Featured Snippet Coverage
  let featuredSnippetCoverageVal = 100;
  if (featuredSnippetBlueprint && featuredSnippetBlueprint.hasFeaturedSnippet) {
    const targetQuery = featuredSnippetBlueprint.targetQuery?.toLowerCase().trim();
    const queryMatched = targetQuery ? draftClean.includes(targetQuery) : false;
    
    let recWordsRatio = 0;
    if (featuredSnippetBlueprint.optimizedSnippetRecommendation) {
      const recWords = tokenize(featuredSnippetBlueprint.optimizedSnippetRecommendation);
      const uniqueRecWords = [...new Set(recWords)];
      if (uniqueRecWords.length > 0) {
        let matchedWords = 0;
        uniqueRecWords.forEach(word => {
          if (draftClean.includes(word)) {
            matchedWords++;
          }
        });
        recWordsRatio = matchedWords / uniqueRecWords.length;
      } else {
        recWordsRatio = 1.0;
      }
    } else {
      recWordsRatio = queryMatched ? 1.0 : 0.0;
    }
    
    // Graded scoring
    if (queryMatched && recWordsRatio >= 0.8) {
      featuredSnippetCoverageVal = 100;
    } else if ((queryMatched && recWordsRatio >= 0.5) || recWordsRatio >= 0.8) {
      featuredSnippetCoverageVal = 80;
    } else if (queryMatched || recWordsRatio >= 0.35) {
      featuredSnippetCoverageVal = 50;
    } else {
      featuredSnippetCoverageVal = 0;
    }
  }

  // New comprehensive Structure score formula including all sub-scores (Issue 2)
  const O_raw = 0.10 * (h1QualityVal / 100) + 
                0.10 * (h2CoverageVal / 100) + 
                0.10 * (h3CoverageVal / 100) + 
                0.10 * (faqCoverageVal / 100) + 
                0.10 * (tableCoverageVal / 100) + 
                0.20 * (wordCountAlignmentVal / 100) + 
                0.15 * (headingFrequencyAlignmentVal / 100) +
                0.15 * (featuredSnippetCoverageVal / 100);
  const O = Math.min(1.0, Math.max(0, O_raw));

  // 5. Content Gap Coverage (G, 15% weight)
  let G = 0.8;
  if (contentGapReport) {
    const gapTopics = [
      ...(contentGapReport.missingTopics || []),
      ...(contentGapReport.unansweredQuestions || []).map((q: string) => q.replace(/[?]/g, ''))
    ];
    let covered = 0;
    if (gapTopics.length > 0) {
      gapTopics.forEach(topic => {
        const topicLower = topic.toLowerCase().trim();
        const isMatched = draftClean.includes(topicLower) || 
                          headings.some((h: string) => h.toLowerCase().includes(topicLower)) ||
                          draftSentences.some(sentence => checkPhraseStemOverlap(sentence, topicLower, 0.45)) ||
                          headings.some(h => checkPhraseStemOverlap(h, topicLower, 0.45));
        if (isMatched) {
          covered++;
        }
      });
    }

    const recommendedHeadings = (contentGapReport.recommendedNewSections || []).map((s: any) => s.heading.toLowerCase().trim());
    let recommendedCovered = 0;
    if (recommendedHeadings.length > 0) {
      recommendedHeadings.forEach(h => {
        const isMatched = headings.some((lh: string) => 
          lh.toLowerCase().includes(h) || 
          h.includes(lh.toLowerCase()) || 
          checkPhraseStemOverlap(lh, h, 0.45)
        );
        if (isMatched) {
          recommendedCovered++;
        }
      });
    }

    const topicsScore = gapTopics.length > 0 ? (covered / gapTopics.length) : 1.0;
    const recScore = recommendedHeadings.length > 0 ? (recommendedCovered / recommendedHeadings.length) : 1.0;
    G = 0.6 * topicsScore + 0.4 * recScore;
  }

  // 6. Readability (R, 10% weight)
  const uniqueRatio = wordCount > 0 ? new Set(draftTokens).size / wordCount : 0;
  // Length-adjusted unique ratio to prevent Zipf's law / TTR decay penalty on long content
  const lengthRatio = wordCount > 0 ? Math.sqrt(wordCount / (medianWordCount || 2000)) : 1;
  const adjustedUniqueRatio = uniqueRatio * Math.max(1, lengthRatio);
  const lexicalDiversity = Math.min(1.0, adjustedUniqueRatio * 2);

  const paragraphs = textContext.split(/\n{2,}/).filter(p =>
    p.trim().length > 0 && !p.trim().startsWith('#')
  );
  const avgWordsPerParagraph = paragraphs.length > 0
    ? paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length
    : 0;
  const paragraphDepth = avgWordsPerParagraph >= 40 && avgWordsPerParagraph <= 90
    ? 1.0
    : avgWordsPerParagraph > 0
    ? Math.max(0.3, 1 - Math.abs(avgWordsPerParagraph - 65) / 100)
    : 0.5;

  const R = 0.5 * lexicalDiversity + 0.5 * paragraphDepth;

  // Penalties (caps at 30)
  let penalties = 0;
  const reasons: string[] = [];
  const penaltyDetails: { reason: string; points: number }[] = [];

  // Keyword over-optimization penalty (Issue 3)
  let overOptimizedCount = 0;
  const overOptimizedTerms: string[] = [];
  [...basicTerms, ...suppTerms].forEach(term => {
    const competitorMedian = Math.max(1, (term.recommendedMin + term.recommendedMax) / 2);
    // Scale allowed count based on word count ratio relative to competitor median length
    const lengthScale = Math.max(1, wordCount / (medianWordCount || 2000));
    if (term.currentCount > 2 * competitorMedian * lengthScale) {
      overOptimizedCount++;
      overOptimizedTerms.push(term.term);
    }
  });

  if (overOptimizedCount > 0) {
    const termPenalty = overOptimizedCount * 3;
    penalties += termPenalty;
    reasons.push(`Over-optimization (${overOptimizedTerms.join(', ')} exceed 2x competitor median): −${termPenalty}pts`);
    penaltyDetails.push({
      reason: `Over-optimization (${overOptimizedTerms.join(', ')} exceed 2x competitor median)`,
      points: termPenalty
    });
  }

  // Legacy Keyword stuffing density penalty
  let stuffedCount = 0;
  basicTerms.slice(0, 10).forEach(term => {
    const count = (draftClean.match(new RegExp(`\\b${term.term.toLowerCase()}\\b`, 'g')) || []).length;
    const density = wordCount > 0 ? count / wordCount : 0;
    if (density > 0.03) {
      penalties += 5;
      stuffedCount++;
    }
  });
  if (stuffedCount > 0) {
    penalties += stuffedCount * 5;
    reasons.push(`Keyword stuffing in ${stuffedCount} term(s): −${stuffedCount * 5}pts`);
    penaltyDetails.push({
      reason: `Keyword stuffing in ${stuffedCount} term(s) (density > 3%)`,
      points: stuffedCount * 5
    });
  }

  if (wordCount < 300) {
    penalties += 15;
    reasons.push(`Thin content (${wordCount} words < 300): −15pts`);
    penaltyDetails.push({
      reason: `Thin content (${wordCount} words < 300)`,
      points: 15
    });
  }

  // Low lexical diversity penalty based on competitor average (Issue 3)
  const compMedianLD = medianLexicalDiversity || 0.35;
  const ldThreshold = compMedianLD * 0.85; // acceptable margin within 15% of competitor median
  let ldPenalty = 0;
  if (adjustedUniqueRatio < ldThreshold) {
    ldPenalty = Math.min(15, Math.round(((ldThreshold - adjustedUniqueRatio) / ldThreshold) * 15));
    if (ldPenalty > 0) {
      penalties += ldPenalty;
      reasons.push(`Low lexical diversity (${Math.round(uniqueRatio * 100)}% [adjusted: ${Math.round(adjustedUniqueRatio * 100)}%] vs competitor median ${Math.round(compMedianLD * 100)}%): −${ldPenalty}pts`);
      penaltyDetails.push({
        reason: `Low lexical diversity (${Math.round(uniqueRatio * 100)}% vs competitor median ${Math.round(compMedianLD * 100)}%)`,
        points: ldPenalty
      });
    }
  }

  penalties = Math.min(penalties, 30);

  // New Weighted Blended Score formula:
  // Score = 100 * (0.15 * S + 0.25 * E + 0.25 * I + 0.10 * O + 0.15 * G + 0.10 * R) - P
  const raw = (0.15 * S + 0.25 * E + 0.25 * I + 0.10 * O + 0.15 * G + 0.10 * R) * 100;
  const baseScore = Math.round(raw);
  const totalScore = Math.max(0, Math.round(raw - penalties));

  // Display values mapped to 0-100
  const breakdown = {
    S: Math.round(S * 100),
    E: Math.round(E * 100),
    I: Math.round(I * 100),
    O: Math.round(O * 100),
    G: Math.round(G * 100),
    R: Math.round(R * 100),
  };

  // Backwards compatibility legacy fields
  const titleScore = Math.min(10, Math.round(titleLenScore * 10));
  const headingsScore = Math.min(25, Math.round((0.4 * Number(hasH2) + 0.6 * h2Score) * 25));
  const termsScore = Math.min(45, Math.round(S * 45));
  const lengthScoreAlias = Math.min(20, Math.round(lenScore * 20));

  return {
    totalScore,
    breakdown,
    penalties,
    penaltyReasons: reasons,
    baseScore,
    penaltyDetails,
    structureDetails: {
      h1Quality: h1QualityVal,
      h2Coverage: h2CoverageVal,
      h3Coverage: h3CoverageVal,
      faqCoverage: faqCoverageVal,
      tableCoverage: tableCoverageVal,
      wordCountAlignment: wordCountAlignmentVal,
      headingFrequencyAlignment: headingFrequencyAlignmentVal,
      featuredSnippetCoverage: featuredSnippetCoverageVal
    },
    titleScore,
    headingsScore,
    termsScore,
    lengthScore: lengthScoreAlias,
    overusePenalty: -(stuffedCount * 5 + overOptimizedCount * 3),
    stats: {
      wordCount,
      uniqueRatio: parseFloat(uniqueRatio.toFixed(2)),
      avgWordsPerParagraph: Math.round(avgWordsPerParagraph),
      mustHaveCovered: `${basicHits}/${basicTerms.length}`,
      entityCovered: `${coveredEntitiesCount}/${targetEntities.length}`,
      h2Count: headings.length,
      h3Count: (textContext.match(/^###\s+.+/gm) || []).length,
      totalEntities: targetEntities.length,
      coveredEntities: coveredEntitiesCount,
      missingEntitiesCount: targetEntities.length - coveredEntitiesCount,
      entityScoreContribution: `${Math.round(E * 100)}% (weighted)`
    }
  };
}
