// src/core/contracts/evidence.ts
import { z } from 'zod';

export type SourceType =
  | 'TARGET_SITE'
  | 'COMPETITOR'
  | 'SERP'
  | 'INDUSTRY'
  | 'GOVERNMENT'
  | 'DOCUMENTATION'
  | 'OTHER';

export type EvidenceType =
  | 'BUSINESS_FACT'
  | 'FEATURE'
  | 'DIFFERENTIATOR'
  | 'TECHNICAL_SPEC'
  | 'STATISTIC'
  | 'CASE_STUDY'
  | 'MARKET_FACT'
  | 'COMPETITOR_OBSERVATION'
  | 'SERP_OBSERVATION'
  | 'INDUSTRY_CLAIM'
  | 'FACT'
  | 'INFERENCE';

/**
 * Content Intelligence Policy Constants
 * Deterministic operational policy thresholds for content gap classification and quality gates.
 * These thresholds are guardrails selected for predictable behavior and should be calibrated against production data.
 */
export const CONTENT_INTELLIGENCE_POLICY = {
  /**
   * Competitor Coverage Threshold (<35%):
   * If fewer than 35% of analyzed competitors address a specific technical
   * or buyer topic, it is classified as an underserved blind spot (HIGH importance gap).
   * Guardrail selected for predictable behavior and should be calibrated against production data.
   */
  COMPETITOR_GAP_COVERAGE_THRESHOLD: 35,

  /**
   * Maximum Keyword Density (>3.0%):
   * If primary keyword density exceeds 3.0% of total article word count,
   * it triggers a critical keyword stuffing failure.
   * Guardrail selected for predictable behavior and should be calibrated against production data.
   */
  KEYWORD_DENSITY_MAX_PERCENT: 3.0,

  /**
   * Maximum Paragraph Keyword Occurrence (>65%):
   * If the primary keyword appears in more than 65% of body paragraphs,
   * it triggers an unnatural keyword looping warning.
   * Guardrail selected for predictable behavior and should be calibrated against production data.
   */
  PARAGRAPH_KEYWORD_LOOP_MAX_RATIO: 0.65,

  /**
   * Maximum Structural Cross-Section Similarity (>75%):
   * If token similarity or identical phrasing across distinct sections exceeds 75%,
   * it triggers a cross-section repetition alert.
   * Guardrail selected for predictable behavior and should be calibrated against production data.
   */
  CROSS_SECTION_SIMILARITY_MAX_PERCENT: 75,

  /**
   * Minimum Research Evidence Usage (>=40%):
   * At least 40% of assigned research evidence items must be meaningfully used
   * in the final article.
   * Guardrail selected for predictable behavior and should be calibrated against production data.
   */
  EVIDENCE_USAGE_MIN_PERCENT: 40,
} as const;

export type EvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ClaimClassification =
  | 'VERIFIED_FACT'
  | 'SOURCED_CLAIM'
  | 'BUSINESS_FACT'
  | 'COMPETITOR_OBSERVATION'
  | 'SERP_OBSERVATION'
  | 'INFERENCE'
  | 'RECOMMENDATION'
  | 'MARKETING_CLAIM'
  | 'UNSUPPORTED';

export interface EvidenceItem {
  id: string;
  sourceUrl: string;
  sourceTitle?: string;
  sourceType: SourceType;
  claim: string;
  evidenceType: EvidenceType;
  confidence: EvidenceConfidence;
  extractedFrom?: string;
  entities?: string[];
  topics?: string[];
  supports?: string[];
  contradicts?: string[];
  freshness?: string;
  citationRequired: boolean;
}

export interface EvidenceSet {
  items: EvidenceItem[];
  extractedAt: string;
  summary: {
    totalCount: number;
    highConfidenceCount: number;
    businessFactCount: number;
    competitorObservationCount: number;
    serpObservationCount: number;
    inferenceCount: number;
  };
}

export type GapImportance = 'HIGH' | 'MEDIUM' | 'LOW';

export type GapTreatment =
  | 'SECTION'
  | 'SUBSECTION'
  | 'EXAMPLE'
  | 'TABLE'
  | 'FAQ'
  | 'OMIT';

export interface ContentGap {
  id: string;
  topic: string;
  importance: GapImportance;
  competitorCoverage: number; // 0 to 100
  targetSiteCoverage: number; // 0 to 100
  buyerQuestion?: string;
  missingFromCompetitors?: boolean;
  businessOpportunity?: string;
  evidenceIds: string[];
  recommendedTreatment: GapTreatment;
}

export interface ContentGapMatrix {
  gaps: ContentGap[];
  analyzedAt: string;
  summary: {
    totalGaps: number;
    highPriorityGaps: number;
    missingFromCompetitorsCount: number;
  };
}

export type SectionIntent =
  | 'ANSWER'
  | 'EXPLAIN'
  | 'COMPARE'
  | 'PROVE'
  | 'RECOMMEND';

export interface SectionEvidenceMap {
  sectionId: string;
  heading: string;
  intent: SectionIntent;
  evidenceIds: string[];
  requiredEntities: string[];
  buyerQuestion?: string;
  competitorGap?: string;
  targetBusinessFacts: string[];
  claimConstraints: string[];
  prohibitedClaims: string[];
}

export interface ResearchIntelligenceDiagnostics {
  evidenceCount: number;
  highConfidenceEvidenceCount: number;
  competitorObservationCount: number;
  businessFactCount: number;
  inferenceCount: number;
  contentGapCount: number;
  highPriorityGapCount: number;
  sectionsWithEvidence: number;
  sectionsWithoutEvidence: number;
  unsupportedClaimCount: number;
  evidenceUsageRate: number; // 0 to 100%
  repetitionFlags: number;
  keywordStuffingFlags: number;
}
