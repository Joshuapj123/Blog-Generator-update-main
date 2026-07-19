export type TermCategory = 'basic' | 'supplementary' | 'contextual';
export type PlacementContext = 'title' | 'h1' | 'h2' | 'body';

export interface SerpTerm {
  term: string;
  rootForm: string;             // stemmed root for draft matching
  category: TermCategory;
  importance: number;           // 1 to 10
  currentCount: number;
  recommendedMin: number;
  recommendedMax: number;
  competitorCoverage: number;   // 0–1 fraction of competitors using this term
  weightedCoverage?: number;    // 0-1 weighted coverage by competitor authority
  docFrequency: number;         // 0–1 raw DF (deterministic, pre-AI)
  tfidfWeight: number;          // normalized TF-IDF score (0–1)
  overuseRisk: boolean;
  placements: PlacementContext[];
  competitorExamples?: { text: string; rank: number }[]; // Layer 3: Contextual sentences
}

export interface SerpEntity {
  entityName: string;
  entityType: string;
  relatedTerms: string[];
  missingContext: string;
  competitorExamples: string[];
  competitorCoverage?: number;
  importanceScore?: number; // 0-100 Importance score based on prominence, frequency and authority
}

export type FormatType = "Listicle" | "How-To" | "Guide" | "Review" | "Comparison" | "Landing Page";

export interface HeadingFrequencyItem {
  heading: string;
  count: number;
  competitorPercentage: number;
  weightedScore?: number;
}

export interface RecommendedTable {
  name: string;
  type: string;
  columns: string[];
  purpose: string;
}

export interface TableDetectionResult {
  tablesFound: boolean;
  competitorTableCount: number;
  competitorPercentage: number;
  recommendedTables: RecommendedTable[];
}

export interface PaaQuestionItem {
  question: string;
  frequency: number;
  snippet?: string;
}

export interface TopicClusterItem {
  clusterName: string;
  keywords: string[];
}

export interface IntentBlueprint {
  intent: 'informational' | 'commercial' | 'transactional' | 'comparison';
  confidenceScore: number;
  formatRecommendation: string;
  toneGuidelines: string;
  structureGuidelines: string;
  recommendedOutlineSections: {
    heading: string;
    level: 'H2' | 'H3';
    purpose: string;
  }[];
  intentConfidence?: {
    informational: number;
    commercial: number;
    transactional: number;
    comparison: number;
  };
}

export interface FeaturedSnippetBlueprint {
  hasFeaturedSnippet: boolean;
  snippetType: 'definition' | 'list' | 'table' | 'howto' | 'none';
  targetQuery?: string;
  extractedSnippetText?: string;
  optimizedSnippetRecommendation?: string;
  generationDirectives?: string;
}

export interface EntityRelationship {
  source: string;
  target: string;
  type: string;
}

export interface EntityGraph {
  nodes: { id: string; label: string; type: string }[];
  edges: EntityRelationship[];
}

export interface ContentGapReport {
  commonTopics: string[];
  uniqueHeadings: string[]; // Added: interesting headings only 1 or 2 competitors have
  missingTopics: string[];
  recommendedNewSections: {
    heading: string;
    level: 'H2' | 'H3';
    reason: string;
    suggestedOutline: string;
  }[];
  unansweredQuestions: string[];
  shouldIncludeFaq?: boolean;
  faqQuestions?: string[];
}

export interface ExtractionAuditLog {
  url: string;
  domain: string;
  readabilitySuccess: boolean;
  fallbackUsed: boolean;
  fallbackType: string;
  wordCount: number;
  headingCount: number;
  paragraphCount: number;
  qualityScore: number;
  extractionConfidence: number;
  weight: number;
  rejected: boolean;
  rejectionReason?: string | null;
}

export interface ExtractionConfidenceMetrics {
  readabilitySuccessRate: number;
  fallbackUsageRate: number;
  qualityDistribution: { high: number; medium: number; low: number };
  rejectedCompetitorCount: number;
  averageExtractedWordCount: number;
  auditLogs: ExtractionAuditLog[];
}

export interface SerpAnalysisResult {
  keyword: string;
  locale: string;
  terms: SerpTerm[];
  entities: SerpEntity[];
  medianWordCount: number;
  medianTitleLength: number;
  medianH2Count: number;
  medianLexicalDiversity?: number; // Median competitor lexical diversity
  analyzedCompetitors: number;
  topTermsForIntent: string[];  // top-30 stemmed terms for I-score Jaccard computation
  competitorTitles?: string[];
  contentGapReport?: ContentGapReport;
  headingFrequency?: HeadingFrequencyItem[];
  tableDetection?: TableDetectionResult;
  paaQuestions?: PaaQuestionItem[];
  topicClusters?: TopicClusterItem[];
  intentBlueprint?: IntentBlueprint;
  featuredSnippetBlueprint?: FeaturedSnippetBlueprint;
  entityRelationships?: EntityRelationship[];
  recommendedEntityConnections?: string[];
  competitorWeights?: { rank: number; url: string; title: string; weight: number }[];
  extractionConfidenceMetrics?: ExtractionConfidenceMetrics;
}

