import { 
  EvidenceSet, 
  EvidenceItem,
  ContentGapMatrix,
  SectionEvidenceMap, 
  ResearchIntelligenceDiagnostics,
  CONTENT_INTELLIGENCE_POLICY
} from '@/core/contracts/evidence';
import { ContentBrief } from '@/core/contracts/schemas';

export interface EvidenceValidationResult {
  passed: boolean;
  evidenceUsageRate: number;
  unsupportedClaims: string[];
  keywordStuffingIssues: string[];
  repetitionIssues: string[];
  accuracyIssues: string[];
  diagnostics: ResearchIntelligenceDiagnostics;
  warnings: string[];
  criticalErrors: string[];
}

export class ContentEvidenceValidator {
  /**
   * Generalized Quantitative Claim Patterns:
   * Percentages, Currency, Performance Metrics, Durations, Quantities, and Multipliers.
   */
  private static QUANTITATIVE_REGEXES = [
    /\b\d+(?:\.\d+)?\s*(?:%|\bpercent\b)/gi, // Percentages: 20%, 99.95%, 99.9 percent
    /(?:[\$€£]\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b(?:USD|EUR|GBP)\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:USD|EUR|GBP|dollars|euros|million|billion|k|m|b)\b)/gi, // Currency: $1.2M, EUR 450,000, USD 1.2 million
    /\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:ms|milliseconds|seconds|req\/s|rps|tps|qps|gbps|mbps|tb|gb|mb|ghz|iops)\b/gi, // Performance metrics: 45ms, 15,000 req/s
    /\b\d+(?:\.\d+)?\s*(?:times|x|fold)\s*(?:faster|cheaper|more|increase|reduction|growth)\b/gi, // Comparative multipliers: 10x faster
    /\b\d+\s*(?:days?|weeks?|months?|quarters?|years?|hours?)\b/gi, // Durations: 6 months
    /\b\d+(?:,\d+)?\s*(?:users|clients|nodes|servers|clusters|engineers|microservices|pipelines|tenants)\b/gi, // Concrete quantities
  ];

  /**
   * Negation patterns used by the deterministic evidence-use heuristic to detect
   * contradictory or reversed evidence assertions.
   */
  private static NEGATION_PATTERNS = [
    /\b(?:does\s+not|doesn't|do\s+not|don't|did\s+not|didn't)\s+(?:provide|deliver|offer|feature|include|support|guarantee)\b/i,
    /\b(?:fails?\s+to|failed\s+to|failing\s+to)\s+(?:provide|deliver|offer|feature|include|support)\b/i,
    /\b(?:never|lacks?|lacking|unable\s+to|cannot|can't)\s+(?:provide|deliver|offer|feature|include|support)\b/i,
    /\b(?:is\s+not|isn't|are\s+not|aren't)\s+(?:available|provided|offered|capable|present)\b/i,
    /\bno\s+longer\s+(?:provides|delivers|offers|supports)\b/i,
  ];

  /**
   * Generic words and functional prepositions to exclude when isolating distinctive claim tokens.
   */
  private static GENERIC_CLAIM_STOPWORDS = new Set([
    'software', 'development', 'platform', 'service', 'services', 'business', 'company', 
    'solutions', 'solution', 'provides', 'delivers', 'verified', 'capability', 'operational', 
    'client', 'clients', 'target', 'enterprise', 'features', 'feature',
    'without', 'within', 'across', 'between', 'during', 'through', 'about', 'under',
    'their', 'there', 'which', 'where', 'while', 'after', 'before', 'other', 'another',
    'these', 'those', 'being', 'having', 'into', 'from', 'with'
  ]);

  /**
   * Validates generated article content against verified research evidence and policy thresholds.
   */
  public static validate(
    bodyMarkdown: string,
    brief: ContentBrief,
    evidenceSet?: EvidenceSet,
    sectionEvidenceMaps?: SectionEvidenceMap[],
    targetBrand?: string,
    gapMatrix?: ContentGapMatrix
  ): EvidenceValidationResult {
    const warnings: string[] = [];
    const criticalErrors: string[] = [];
    const unsupportedClaims: string[] = [];
    const keywordStuffingIssues: string[] = [];
    const repetitionIssues: string[] = [];
    const accuracyIssues: string[] = [];

    const bodyLower = (bodyMarkdown || '').toLowerCase();
    const primaryKeyword = (brief.targetKeywords?.[0] || '').toLowerCase().trim();
    const allEvidence = evidenceSet?.items || [];

    // 1. Meaningful Evidence Usage Rate Analysis
    const assignedIds = new Set<string>();
    (sectionEvidenceMaps || []).forEach(m => m.evidenceIds.forEach(id => assignedIds.add(id)));
    const totalAssigned = assignedIds.size > 0 ? assignedIds.size : allEvidence.length;

    let usedEvidenceCount = 0;
    const itemsToCheck = assignedIds.size > 0
      ? allEvidence.filter(e => assignedIds.has(e.id))
      : allEvidence;

    for (const ev of itemsToCheck) {
      if (this.isEvidenceMeaningfullyUsed(ev, bodyMarkdown)) {
        usedEvidenceCount++;
      }
    }

    const evidenceUsageRate = totalAssigned > 0 
      ? Math.min(100, Math.round((usedEvidenceCount / totalAssigned) * 100))
      : 100;

    if (evidenceUsageRate < CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT && totalAssigned > 2) {
      warnings.push(`Evidence usage rate is ${evidenceUsageRate}% (target: >= ${CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT}%). Article does not sufficiently reflect researched evidence.`);
    }

    // 2. Generalized Quantitative Claims Verification
    const detectedQuantitativeClaims = this.extractQuantitativeClaims(bodyMarkdown);
    const rawCorpus = allEvidence.map(e => `${e.claim} ${e.extractedFrom || ''}`).join(' ').toLowerCase();
    const normCorpus = this.normalizeQuantitativeString(rawCorpus);

    for (const claim of detectedQuantitativeClaims) {
      const cleanClaim = claim.toLowerCase().trim();
      // Skip benign non-claim numbers (e.g. 100%, 0%, dates/years)
      if (cleanClaim === '100%' || cleanClaim === '0%') continue;

      const normClaim = this.normalizeQuantitativeString(cleanClaim);
      const numMatch = cleanClaim.match(/\d+(?:[,\.]\d+)?/);
      const numToken = numMatch ? numMatch[0].replace(/,/g, '') : cleanClaim;

      const isSupported = 
        rawCorpus.includes(cleanClaim) || 
        normCorpus.includes(normClaim) ||
        rawCorpus.includes(normClaim);

      if (!isSupported) {
        unsupportedClaims.push(claim);
      }
    }

    if (unsupportedClaims.length > 0) {
      warnings.push(`Detected ${unsupportedClaims.length} quantitative, statistical, or performance claim(s) without supporting research evidence: ${unsupportedClaims.slice(0, 3).join(', ')}.`);
    }

    // 3. Keyword Stuffing & Repetitive City/Keyword Loops
    const words = bodyMarkdown.split(/\s+/).filter(Boolean);
    const totalWords = words.length || 1;

    if (primaryKeyword) {
      const kwRegex = new RegExp(primaryKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const kwMatches = bodyMarkdown.match(kwRegex) || [];
      const kwWords = primaryKeyword.split(/\s+/).filter(Boolean).length;
      const density = ((kwMatches.length * kwWords) / totalWords) * 100;

      if (density > CONTENT_INTELLIGENCE_POLICY.KEYWORD_DENSITY_MAX_PERCENT) {
        const msg = `Keyword Stuffing Alert: Keyword "${primaryKeyword}" has density of ${density.toFixed(2)}% (exceeds maximum safe limit of ${CONTENT_INTELLIGENCE_POLICY.KEYWORD_DENSITY_MAX_PERCENT}%).`;
        keywordStuffingIssues.push(msg);
        criticalErrors.push(msg);
      }

      // Check paragraph repetition of primary keyword
      const paragraphs = bodyMarkdown.split(/\n\s*\n/).filter(p => p.trim().length > 0 && !p.trim().startsWith('#'));
      let kwParagraphCount = 0;
      for (const p of paragraphs) {
        if (p.toLowerCase().includes(primaryKeyword)) {
          kwParagraphCount++;
        }
      }

      const pRatio = paragraphs.length > 0 ? (kwParagraphCount / paragraphs.length) : 0;
      if (paragraphs.length > 4 && pRatio > CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO) {
        const msg = `Unnatural keyword repetition: Primary keyword "${primaryKeyword}" appears in ${(pRatio * 100).toFixed(0)}% of body paragraphs (limit: ${(CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO * 100)}%).`;
        keywordStuffingIssues.push(msg);
        warnings.push(msg);
      }
    }

    // 4. Cross-Section Structural Repetition Check
    const sections = bodyMarkdown.split(/\n(?=##\s+)/);
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const secA = sections[i].trim();
        const secB = sections[j].trim();
        if (secA.length > 100 && secB.length > 100) {
          const sentencesA = secA.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 25);
          const sentencesB = secB.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 25);
          
          for (const sA of sentencesA) {
            for (const sB of sentencesB) {
              if (sA === sB) {
                const msg = `Identical sentence repeated across sections: "${sA.substring(0, 60)}..."`;
                repetitionIssues.push(msg);
                warnings.push(msg);
                break;
              }
            }
          }

          // Check token Jaccard similarity across sections against policy threshold
          const tokensA = new Set(secA.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          const tokensB = new Set(secB.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          let inter = 0;
          for (const t of tokensA) { if (tokensB.has(t)) inter++; }
          const union = new Set([...tokensA, ...tokensB]).size;
          const similarity = union > 0 ? (inter / union) * 100 : 0;
          if (similarity > CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT) {
            const msg = `Cross-section structural similarity of ${similarity.toFixed(1)}% exceeds maximum allowable threshold (${CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT}%).`;
            repetitionIssues.push(msg);
            warnings.push(msg);
          }
        }
      }
    }

    // 5. Target Business Facts Representation
    if (targetBrand) {
      const brandLower = targetBrand.toLowerCase();
      if (!bodyLower.includes(brandLower)) {
        const msg = `Target brand "${targetBrand}" is not referenced in the article content.`;
        accuracyIssues.push(msg);
        warnings.push(msg);
      }
    }

    // 6. Compute Diagnostics
    const sectionsCount = sectionEvidenceMaps?.length || brief.outline.length;
    const sectionsWithEvidence = (sectionEvidenceMaps || []).filter(m => m.evidenceIds.length > 0).length || sectionsCount;
    const sectionsWithoutEvidence = sectionsCount - sectionsWithEvidence;

    const diagnostics: ResearchIntelligenceDiagnostics = {
      evidenceCount: allEvidence.length,
      highConfidenceEvidenceCount: allEvidence.filter(e => e.confidence === 'HIGH').length,
      competitorObservationCount: allEvidence.filter(e => e.evidenceType === 'COMPETITOR_OBSERVATION' || e.evidenceType === 'STATISTIC').length,
      businessFactCount: allEvidence.filter(e => 
        e.evidenceType === 'BUSINESS_FACT' || 
        e.evidenceType === 'FEATURE' || 
        e.evidenceType === 'DIFFERENTIATOR' || 
        e.evidenceType === 'TECHNICAL_SPEC'
      ).length,
      inferenceCount: allEvidence.filter(e => e.evidenceType === 'INFERENCE').length,
      contentGapCount: gapMatrix?.summary?.totalGaps ?? gapMatrix?.gaps?.length ?? 0,
      highPriorityGapCount: gapMatrix?.summary?.highPriorityGaps ?? gapMatrix?.gaps?.filter(g => g.importance === 'HIGH').length ?? 0,
      sectionsWithEvidence,
      sectionsWithoutEvidence,
      unsupportedClaimCount: unsupportedClaims.length,
      evidenceUsageRate,
      repetitionFlags: repetitionIssues.length,
      keywordStuffingFlags: keywordStuffingIssues.length,
    };

    return {
      passed: criticalErrors.length === 0,
      evidenceUsageRate,
      unsupportedClaims,
      keywordStuffingIssues,
      repetitionIssues,
      accuracyIssues,
      diagnostics,
      warnings,
      criticalErrors,
    };
  }

  /**
   * Deterministic Evidence-Use Heuristic:
   * Validates whether an evidence item is meaningfully utilized in the article text.
   *
   * Capabilities and Supported Behaviors:
   * A. Exact evidence phrase reuse: Detects contiguous n-grams (>= 3 words) verbatim.
   * B. Bounded lexical co-occurrence: Requires >= 3 distinctive tokens (or >= 60% for short claims)
   *    to co-occur within the exact same sentence.
   * C. Incidental-token rejection: Rejects isolated token matches or tokens dispersed across separate paragraphs.
   * D. Contradictory/reversed evidence meaning rejection: Disqualifies sentences that assert explicit negation
   *    or reversal of positive evidence claims (e.g. "does not provide", "fails to provide", "never delivers").
   *
   * Note on Paraphrase Behavior:
   * Legitimate paraphrases that retain key distinctive domain terminology within a single sentence are accepted
   * by bounded lexical co-occurrence. Paraphrases that substitute all vocabulary with distant synonyms will fail
   * this deterministic heuristic, as an LLM-based semantic judge is deliberately omitted to maintain predictable,
   * fast, and deterministic verification.
   */
  public static isEvidenceMeaningfullyUsed(ev: EvidenceItem, bodyMarkdown: string): boolean {
    const bodyLower = bodyMarkdown.toLowerCase();

    // Clean claim and isolate distinctive tokens
    const rawClaim = (ev.claim || '')
      .replace(/^[^:]+:\s*/, '') // Remove prefixes like "Smetytech provides verified capability: "
      .toLowerCase();

    const claimTokens = rawClaim
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3 && !this.GENERIC_CLAIM_STOPWORDS.has(t));

    if (claimTokens.length === 0) return false;

    // Helper: checks if a sentence contradicts/reverses a positive claim
    const isSentenceContradictory = (sentence: string): boolean => {
      for (const pat of this.NEGATION_PATTERNS) {
        if (pat.test(sentence) && !pat.test(rawClaim)) {
          return true; // Negated or contradictory assertion
        }
      }
      return false;
    };

    const sentences = bodyLower.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 20);

    // Rule 1: Multi-word phrase / n-gram match (length >= 3 distinctive words)
    if (claimTokens.length >= 3) {
      for (let i = 0; i <= claimTokens.length - 3; i++) {
        const triGram = `${claimTokens[i]} ${claimTokens[i + 1]} ${claimTokens[i + 2]}`;
        if (bodyLower.includes(triGram)) {
          // Verify that the sentence containing this triGram does not contradict/reverse the evidence
          const matchingSentence = sentences.find(s => s.includes(triGram));
          if (!matchingSentence || !isSentenceContradictory(matchingSentence)) {
            return true; // Verified contiguous non-contradictory phrase usage
          }
        }
      }
    }

    // Rule 2: Bounded Sentence-Level Co-occurrence
    // At least 3 significant tokens (or >=60% of distinctive tokens for short claims)
    // MUST co-occur within the exact same sentence, and the sentence must not contradict the claim.
    const requiredCooccurrence = Math.min(3, Math.ceil(claimTokens.length * 0.6));

    for (const sent of sentences) {
      let sentenceMatches = 0;
      for (const token of claimTokens) {
        if (sent.includes(token)) {
          sentenceMatches++;
        }
      }
      if (sentenceMatches >= requiredCooccurrence) {
        if (!isSentenceContradictory(sent)) {
          return true; // Meaningful, non-contradictory sentence-level evidence usage
        }
      }
    }

    // Incidental-token and dispersed-token rejection:
    // Isolated tokens or tokens scattered across disparate paragraphs do NOT count as evidence usage.
    return false;
  }

  /**
   * Deterministically normalizes quantitative terms and currencies to assist equivalent format matching.
   * (e.g. "99.9 percent" -> "99.9%", "USD 1.2 million" -> "$1.2m").
   * Note: This is an evidence-backed deterministic heuristic, not a semantic equivalence engine.
   */
  public static normalizeQuantitativeString(str: string): string {
    return str.toLowerCase()
      .replace(/\s*percent\b/g, '%')
      .replace(/\busd\s*/g, '$')
      .replace(/\beur\s*/g, '€')
      .replace(/\bgbp\s*/g, '£')
      .replace(/\s*dollars?\b/g, '')
      .replace(/\s*euros?\b/g, '')
      .replace(/\s*million\b/g, 'm')
      .replace(/\s*billion\b/g, 'b')
      .replace(/,/g, '');
  }

  /**
   * Extracts generalized quantitative claims from article text.
   */
  private static extractQuantitativeClaims(bodyMarkdown: string): string[] {
    const claims: string[] = [];
    const seen = new Set<string>();

    for (const regex of this.QUANTITATIVE_REGEXES) {
      const matches = bodyMarkdown.match(regex) || [];
      for (const m of matches) {
        const clean = m.trim();
        if (!seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          claims.push(clean);
        }
      }
    }

    return claims;
  }
}
