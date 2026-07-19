import { SerpTerm, SerpEntity, ContentGapReport, HeadingFrequencyItem, TopicClusterItem, PaaQuestionItem, FeaturedSnippetBlueprint } from '@/types/serp';
import { stem, STOP_WORDS } from '@/lib/serp-nlp-processing';
import { calculateSeoScore } from './seo-intelligence/seo_scoring_engine';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface ContentScoreResult {
  totalScore: number;         // 0–100 final blended score

  // 6-component breakdown (each 0–100, shown independently in UI)
  breakdown: {
    S: number;  // Semantic coverage   — 30% weight
    I: number;  // Intent similarity   — 20% weight
    E: number;  // Entity coverage     — 20% weight
    O: number;  // On-page structure   — 15% weight
    G: number;  // Content Gap coverage— 10% weight
    R: number;  // Readability         — 5% weight
  };
  penalties: number;          // total deducted points (positive number)
  penaltyReasons: string[];   // human-readable list for UI display

  // Expose exact aggregation details (Issue 1)
  baseScore: number;          // Base weighted score (before penalties)
  penaltyDetails: { reason: string; points: number }[];

  // Expose structure sub-scores (Issue 2)
  structureDetails: {
    h1Quality: number;
    h2Coverage: number;
    h3Coverage: number;
    faqCoverage: number;
    tableCoverage: number;
    wordCountAlignment: number;
    headingFrequencyAlignment: number;
    featuredSnippetCoverage: number;
  };

  // Legacy fields kept for backwards compat with existing UI slots
  titleScore: number;         // alias: part of O-score
  headingsScore: number;      // alias: part of O-score
  termsScore: number;         // alias: S-score
  lengthScore: number;        // alias: part of O-score
  overusePenalty: number;     // alias: keyword-stuffing portion of penalties

  stats: {
    wordCount: number;
    uniqueRatio: number;
    avgWordsPerParagraph: number;
    mustHaveCovered: string;    // e.g. "7/10"
    entityCovered: string;      // e.g. "3/5"
    h2Count: number;
    h3Count: number;
    totalEntities?: number;
    coveredEntities?: number;
    missingEntitiesCount?: number;
    entityScoreContribution?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// scoreTokenize uses the same STOP_WORDS + stem from the extractor
// so that draft tokens are treated identically to term rootForms.
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, ' ')
    .replace(/\*\*?|__?|~~|`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function scoreTokenize(text: string): string[] {
  return stripMarkdown(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Jaccard similarity between two sets */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  a.forEach(v => { if (b.has(v)) intersection++; });
  return intersection / (a.size + b.size - intersection);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCORER
// Formula: Score = 100 × (0.30·S + 0.20·I + 0.20·E + 0.15·O + 0.10·G + 0.05·R) − P
// ─────────────────────────────────────────────────────────────────────────────
export function computeStructuredScore(params: {
  textContext: string;            // full draft text (markdown OK)
  title: string;
  headings: string[];             // list of H2 text
  liveTerms: (SerpTerm & { currentCount: number; overuseRisk: boolean })[];
  entities: SerpEntity[];
  topTermsForIntent: string[];    // top-30 stems from competitors (for I-score)
  medianWordCount: number;
  medianTitleLength: number;
  medianH2Count: number;
  contentGapReport?: ContentGapReport;
  headingFrequency?: HeadingFrequencyItem[];
  topicClusters?: TopicClusterItem[];
  paaQuestions?: PaaQuestionItem[];
  medianLexicalDiversity?: number;
  featuredSnippetBlueprint?: FeaturedSnippetBlueprint;
}): ContentScoreResult {
  return calculateSeoScore(params);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 5: TERM IMPACT SCORE
// ─────────────────────────────────────────────────────────────────────────────
export function computeTermImpactScore(
  term: SerpTerm,
  topTermsForIntentSet?: Set<string>
): number {
  // 40% Competitor coverage
  const compScore = (term.competitorCoverage || 0) * 40;

  // 30% TF-IDF / Semantic Relevance
  const tfidfScore = (term.tfidfWeight || 0) * 30;

  // 20% Placement tagging (h1, h2 are high value)
  let placementScore = 0;
  if (term.placements.includes('h1')) placementScore = 20;
  else if (term.placements.includes('h2')) placementScore = 15;
  else if (term.placements.includes('title')) placementScore = 10;
  else placementScore = 5;

  // 10% Query/Intent mapping
  let intentScore = 0;
  if (topTermsForIntentSet && topTermsForIntentSet.has(term.rootForm.toLowerCase())) {
    intentScore = 10;
  }

  return Math.round(compScore + tfidfScore + placementScore + intentScore);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1: SECTION-LEVEL SCORING
// ─────────────────────────────────────────────────────────────────────────────
export function computeSectionLevelScores(
  sections: { id: string; body: string }[],
  liveTerms: (SerpTerm & { currentCount: number })[]
): Record<string, number> {
  const sectionScores: Record<string, number> = {};
  
  const basicTerms = liveTerms.filter(t => t.category === 'basic');
  if (basicTerms.length === 0) return sectionScores;
  
  for (const sec of sections) {
    if (!sec.body || sec.body.trim().length === 0) {
      sectionScores[sec.id] = 0;
      continue;
    }
    
    let localizedHits = 0;
    const bodyClean = stripMarkdown(sec.body).toLowerCase();
    const tokens = new Set(scoreTokenize(sec.body).map(stem));
    
    basicTerms.forEach(term => {
      if (tokens.has(term.rootForm) || bodyClean.includes(term.term.toLowerCase())) {
        localizedHits++;
      }
    });
    
    // An H2 targeting ~4 basic terms gets 100% local score
    const score = Math.min(100, (localizedHits / 4) * 100);
    sectionScores[sec.id] = Math.round(score);
  }
  
  return sectionScores;
}
