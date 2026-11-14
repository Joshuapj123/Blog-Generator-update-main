import { z } from 'zod';

// 1. BusinessScale & SaaSProfile Schema
export const BusinessScaleSchema = z.enum([
  'SOLO_PRACTITIONER',
  'SMALL_TEAM',
  'AGENCY',
  'ENTERPRISE',
  'UNKNOWN'
]);
export type BusinessScale = z.infer<typeof BusinessScaleSchema>;

// Phase 6D.1: Practitioner Knowledge Foundation Schemas
export const KnowledgeVerificationStatusSchema = z.enum([
  'UNVERIFIED',
  'PENDING_APPROVAL',
  'VERIFIED',
  'REJECTED',
  'EXPIRED'
]);
export type KnowledgeVerificationStatus = z.infer<typeof KnowledgeVerificationStatusSchema>;

export const KnowledgeApprovalStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED'
]);
export type KnowledgeApprovalStatus = z.infer<typeof KnowledgeApprovalStatusSchema>;

export const ProjectConfidentialityLevelSchema = z.enum([
  'PUBLIC',
  'ANONYMIZED',
  'CONFIDENTIAL',
  'INTERNAL_ONLY'
]);
export type ProjectConfidentialityLevel = z.infer<typeof ProjectConfidentialityLevelSchema>;

export const PractitionerProfileStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
  'DRAFT'
]);
export type PractitionerProfileStatus = z.infer<typeof PractitionerProfileStatusSchema>;

export const PractitionerIdentitySchema = z.object({
  practitionerId: z.string().min(1, 'practitionerId is required'),
  tenantId: z.string().min(1, 'tenantId is required'),
  displayName: z.string().min(1, 'displayName is required'),
  professionalTitle: z.string().min(1, 'professionalTitle is required'),
  biography: z.string().default(''),
  domainFocus: z.array(z.string()).default([]),
  approvedAuthorName: z.string().default(''),
  profileStatus: PractitionerProfileStatusSchema.default('ACTIVE'),
  yearsOfExperience: z.number().nonnegative().optional(),
  verificationStatus: KnowledgeVerificationStatusSchema.default('UNVERIFIED'),
  verifiedAt: z.string().optional(),
  verifiedBy: z.string().optional(),
});
export type PractitionerIdentity = z.infer<typeof PractitionerIdentitySchema>;

export const VerifiedExpertiseItemSchema = z.object({
  expertiseId: z.string().min(1, 'expertiseId is required'),
  capability: z.string().min(1, 'capability is required'),
  description: z.string().min(1, 'description is required'),
  verificationStatus: KnowledgeVerificationStatusSchema.default('UNVERIFIED'),
  approvalStatus: KnowledgeApprovalStatusSchema.default('DRAFT'),
  evidenceReferences: z.array(z.string()).default([]),
  verifiedAt: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().optional(),
  sourceReference: z.string().optional(),
});
export type VerifiedExpertiseItem = z.infer<typeof VerifiedExpertiseItemSchema>;

export const DesignPrincipleItemSchema = z.object({
  principleId: z.string().min(1, 'principleId is required'),
  statement: z.string().min(1, 'statement is required'),
  explanation: z.string().default(''),
  context: z.string().default(''),
  sourceReferences: z.array(z.string()).default([]),
  verificationStatus: KnowledgeVerificationStatusSchema.default('UNVERIFIED'),
  approvalStatus: KnowledgeApprovalStatusSchema.default('DRAFT'),
  verifiedAt: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().optional(),
  sourceReference: z.string().optional(),
});
export type DesignPrincipleItem = z.infer<typeof DesignPrincipleItemSchema>;

export const VerifiedProjectItemSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  projectTitle: z.string().min(1, 'projectTitle is required'),
  projectType: z.string().default('Consultancy'),
  clientName: z.string().optional(),
  confidentialityLevel: ProjectConfidentialityLevelSchema.default('CONFIDENTIAL'),
  clientNamingPermission: z.boolean().default(false),
  anonymizedDescription: z.string().min(1, 'anonymizedDescription is required'),
  problemObserved: z.string().min(1, 'problemObserved is required'),
  intervention: z.string().min(1, 'intervention is required'),
  documentedOutcome: z.string().min(1, 'documentedOutcome is required'),
  documentedOutcomes: z.array(z.string()).optional(),
  evidenceReferences: z.array(z.string()).default([]),
  verificationStatus: KnowledgeVerificationStatusSchema.default('UNVERIFIED'),
  approvalStatus: KnowledgeApprovalStatusSchema.default('DRAFT'),
  verifiedAt: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().optional(),
  sourceReference: z.string().optional(),
});
export type VerifiedProjectItem = z.infer<typeof VerifiedProjectItemSchema>;

export const PractitionerAttributionRulesSchema = z.object({
  firstPersonVoiceAllowed: z.boolean().default(false),
  thirdPersonVoiceAllowed: z.boolean().default(true),
  approvedByline: z.string().optional(),
  approvedCredentials: z.array(z.string()).optional().default([]),
  clientNamingPermission: z.boolean().default(false),
  approvedUsageScope: z.array(z.string()).optional().default([]),
  requireAnonymization: z.boolean().default(true),
  prohibitedClaims: z.array(z.string()).optional().default([]),
});
export type PractitionerAttributionRules = z.infer<typeof PractitionerAttributionRulesSchema>;

export const PractitionerKnowledgeProfileSchema = z.object({
  id: z.string().min(1, 'id is required'),
  tenantId: z.string().min(1, 'tenantId is required'),
  userId: z.string().min(1, 'userId is required'),
  identity: PractitionerIdentitySchema,
  expertise: z.array(VerifiedExpertiseItemSchema).default([]),
  designPrinciples: z.array(DesignPrincipleItemSchema).default([]),
  verifiedProjects: z.array(VerifiedProjectItemSchema).default([]),
  attributionRules: PractitionerAttributionRulesSchema.default({
    firstPersonVoiceAllowed: false,
    thirdPersonVoiceAllowed: true,
    approvedCredentials: [],
    clientNamingPermission: false,
    approvedUsageScope: [],
    requireAnonymization: true,
    prohibitedClaims: [],
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive().default(1),
});
export type PractitionerKnowledgeProfile = z.infer<typeof PractitionerKnowledgeProfileSchema>;

export const VerifiedPractitionerContextSchema = z.object({
  practitionerId: z.string(),
  displayName: z.string(),
  professionalTitle: z.string(),
  approvedAuthorName: z.string(),
  firstPersonVoiceAllowed: z.boolean(),
  thirdPersonVoiceAllowed: z.boolean(),
  approvedByline: z.string().optional(),
  verifiedPrinciples: z.array(z.object({
    principleId: z.string(),
    statement: z.string(),
    explanation: z.string(),
    context: z.string(),
  })),
  verifiedProjects: z.array(z.object({
    projectId: z.string(),
    projectTitle: z.string(),
    anonymizedDescription: z.string(),
    problemObserved: z.string(),
    intervention: z.string(),
    documentedOutcome: z.string(),
    clientName: z.string().optional(),
  })),
  verifiedExpertise: z.array(z.object({
    expertiseId: z.string(),
    capability: z.string(),
    description: z.string(),
  })),
  safeAttributionDirectives: z.array(z.string()),
});
export type VerifiedPractitionerContext = z.infer<typeof VerifiedPractitionerContextSchema>;

export const SaaSProfileSchema = z.object({
  name: z.string().min(1, 'SaaS Name is required'),
  description: z.string().min(1, 'SaaS Description is required'),
  targetAudience: z.string().min(1, 'Target Audience is required'),
  keyFeatures: z.array(z.string()).optional().default([]),
  primaryCompetitors: z.array(z.string()).optional().default([]),
  website: z.string().optional(),
  tone: z.string().optional().default('professional'),
  customInsights: z.string().optional().default(''),
  businessType: z.enum(['SaaS', 'Agency/Portfolio', 'Ecommerce', 'Publisher/Blog', 'Services', 'Other', 'UNKNOWN']).optional(),
  businessScale: BusinessScaleSchema.optional(),
  businessScaleEvidence: z.string().optional(),
  verifiedOfferings: z.array(z.string()).optional(),
  evidenceSources: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  identityConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  canonicalUrl: z.string().optional(),
  crawlStatus: z.enum(['SUCCESS', 'SPARSE', 'FAILED']).optional(),
  extractedTextLength: z.number().optional(),
  crawlFailureReason: z.string().optional(),
  targetExcerpts: z.array(z.string()).optional(),
  practitionerProfile: PractitionerKnowledgeProfileSchema.optional(),
});

export type SaaSProfile = z.infer<typeof SaaSProfileSchema>;

// 2. SearchIntent Schema
export const SearchIntentSchema = z.object({
  primaryKeyword: z.string().min(1, 'Primary keyword is required'),
  intentType: z.enum(['Informational', 'Transactional', 'Commercial', 'Navigational', 'Comparison']).default('Informational'),
  contentType: z.enum(['Listicle', 'How-To', 'Guide', 'Review', 'Comparison', 'Other']).default('Guide'),
  confidenceScore: z.number().min(0).max(100).optional(),
});

export type SearchIntent = z.infer<typeof SearchIntentSchema>;

// 3. ContentBrief Schema
// Content Block Planning Contracts (Phase R2)
export const ContentBlockRoleSchema = z.enum([
  'HOOK',
  'EXPLAIN',
  'EVIDENCE',
  'TACTICAL',
  'SUMMARY'
]);
export type ContentBlockRole = z.infer<typeof ContentBlockRoleSchema>;

export const ContentBlockModeSchema = z.enum([
  'PROSE',
  'LIST',
  'TABLE'
]);
export type ContentBlockMode = z.infer<typeof ContentBlockModeSchema>;

export const SentenceCountRangeSchema = z.object({
  min: z.number().int().min(1, 'min sentence count must be at least 1'),
  max: z.number().int().min(1, 'max sentence count must be at least 1'),
}).refine(data => data.min <= data.max, {
  message: 'min sentence count must be less than or equal to max sentence count'
});
export type SentenceCountRange = z.infer<typeof SentenceCountRangeSchema>;

export const ContentBlockPlanSchema = z.object({
  blockId: z.string().min(1, 'blockId is required'),
  role: ContentBlockRoleSchema,
  mode: ContentBlockModeSchema,
  sentenceCountRange: SentenceCountRangeSchema.optional(),
  targetSignature: z.string().optional(),
  parentHeading: z.string().optional(),
  protectedRequirements: z.array(z.string()).optional().default([]),
}).refine(data => {
  // Invariant: PROSE mode blocks must require sentenceCountRange
  if (data.mode === 'PROSE' && !data.sentenceCountRange) {
    return false;
  }
  return true;
}, {
  message: 'PROSE blocks require a valid sentenceCountRange constraint'
});
export type ContentBlockPlan = z.infer<typeof ContentBlockPlanSchema>;

export const EvidenceAvailabilityStatusSchema = z.enum([
  'AVAILABLE_VERIFIED',
  'AVAILABLE_UNVERIFIED',
  'MISSING',
  'NOT_APPLICABLE',
  'REQUIRES_EXTERNAL_RESEARCH'
]);
export type EvidenceAvailabilityStatus = z.infer<typeof EvidenceAvailabilityStatusSchema>;

export const ClaimEvidenceClassificationSchema = z.enum([
  'OBSERVED_FACT',
  'VERIFIED_PRACTITIONER_EXPERIENCE',
  'EXTERNAL_SOURCE_FACT',
  'INFERENCE',
  'HYPOTHESIS',
  'ILLUSTRATIVE_EXAMPLE',
  'PROPOSED_RECOMMENDATION'
]);
export type ClaimEvidenceClassification = z.infer<typeof ClaimEvidenceClassificationSchema>;

export const SectionPurposePlanSchema = z.object({
  sectionId: z.string().min(1, 'sectionId is required'),
  heading: z.string().min(1, 'heading is required'),
  sectionPurpose: z.string().min(1, 'sectionPurpose is required'),
  buyerQuestion: z.string().min(10, 'buyerQuestion must be a substantive question of at least 10 characters'),
  readerKnowledgeLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXECUTIVE']).default('INTERMEDIATE'),
  intendedReaderOutcome: z.string().min(1, 'intendedReaderOutcome is required'),
}).refine(data => {
  const normQ = data.buyerQuestion.trim().toLowerCase().replace(/[^\w\s]/g, '');
  const normH = data.heading.trim().toLowerCase().replace(/[^\w\s]/g, '');
  return normQ !== normH;
}, {
  message: 'buyerQuestion cannot simply repeat or match the heading'
});
export type SectionPurposePlan = z.infer<typeof SectionPurposePlanSchema>;

export const EvidenceRequirementsPlanSchema = z.object({
  requiredEvidenceTypes: z.array(z.string()).default([]),
  assignedEvidenceReferences: z.array(z.string()).default([]),
  practitionerEvidenceReferences: z.array(z.string()).default([]),
  externalSourceReferences: z.array(z.string()).default([]),
  evidenceAvailability: EvidenceAvailabilityStatusSchema,
  evidenceGapReason: z.string().optional(),
}).refine(data => {
  if ((data.evidenceAvailability === 'MISSING' || data.evidenceAvailability === 'REQUIRES_EXTERNAL_RESEARCH') && (!data.evidenceGapReason || data.evidenceGapReason.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'evidenceGapReason is required when evidenceAvailability is MISSING or REQUIRES_EXTERNAL_RESEARCH'
});
export type EvidenceRequirementsPlan = z.infer<typeof EvidenceRequirementsPlanSchema>;

export const ReasoningRequirementsPlanSchema = z.object({
  observationRequirement: z.string().min(1, 'observationRequirement is required'),
  interpretationRequirement: z.string().min(1, 'interpretationRequirement is required'),
  recommendationRequirement: z.string().min(1, 'recommendationRequirement is required'),
  implementationRequirement: z.string().min(1, 'implementationRequirement is required'),
  validationRequirement: z.string().min(1, 'validationRequirement is required'),
});
export type ReasoningRequirementsPlan = z.infer<typeof ReasoningRequirementsPlanSchema>;

export const SectionEvidencePlanSchema = z.object({
  sectionId: z.string().min(1, 'sectionId is required'),
  heading: z.string().min(1, 'heading is required'),
  purpose: SectionPurposePlanSchema,
  evidence: EvidenceRequirementsPlanSchema,
  reasoning: ReasoningRequirementsPlanSchema,
  claimClassificationGuidance: z.array(z.string()).default([]),
  isSubstantive: z.boolean().default(true),
});
export type SectionEvidencePlan = z.infer<typeof SectionEvidencePlanSchema>;

export const FindingTypeSchema = z.enum([
  'PROBLEM_FINDING',
  'OPPORTUNITY_FINDING',
  'BENCHMARK_FINDING',
  'VERIFICATION_FINDING',
  'STRATEGIC_FINDING',
  'RISK_FINDING',
  'HEURISTIC_VIOLATION'
]);
export type FindingType = z.infer<typeof FindingTypeSchema>;

export const FindingConfidenceSchema = z.enum([
  'HIGH',
  'MEDIUM',
  'LOW',
  'HYPOTHETICAL'
]);
export type FindingConfidence = z.infer<typeof FindingConfidenceSchema>;

export const ThresholdProvenanceSchema = z.enum([
  'EMPIRICAL_BENCHMARK',
  'INDUSTRY_STANDARD',
  'CLIENT_HISTORICAL',
  'PROPOSED_TARGET',
  'THEORETICAL_LIMIT',
  'NOT_APPLICABLE'
]);
export type ThresholdProvenance = z.infer<typeof ThresholdProvenanceSchema>;

export const WorkedFindingSchema = z.object({
  findingId: z.string().min(1, 'findingId is required'),
  sectionId: z.string().min(1, 'sectionId is required'),
  findingType: FindingTypeSchema,
  title: z.string().min(3, 'title must be at least 3 characters'),
  observation: z.string().min(10, 'observation must be at least 10 characters'),
  evidenceReferences: z.array(z.string()).default([]),
  evidenceClassification: ClaimEvidenceClassificationSchema,
  confidence: FindingConfidenceSchema,
  limitations: z.array(z.string().min(5, 'limitation must be at least 5 characters')).default([]),
  interpretation: z.string().min(10, 'interpretation must be at least 10 characters'),
  businessImpact: z.string().min(10, 'businessImpact must be at least 10 characters'),
  recommendation: z.string().min(10, 'recommendation must be at least 10 characters'),
  implementationSteps: z.array(z.string().min(5, 'step must be at least 5 characters')).min(1, 'At least one implementation step is required'),
  validationMethod: z.string().min(5, 'validationMethod must be at least 5 characters'),
  successCriteria: z.string().min(5, 'successCriteria must be at least 5 characters'),
  thresholdProvenance: ThresholdProvenanceSchema,
}).refine(data => {
  // Rule 1: Factual findings must have supporting evidence references
  if ((data.evidenceClassification === 'OBSERVED_FACT' || data.evidenceClassification === 'EXTERNAL_SOURCE_FACT') && data.evidenceReferences.length === 0) {
    return false;
  }
  return true;
}, {
  message: 'OBSERVED_FACT and EXTERNAL_SOURCE_FACT findings must contain at least one valid evidence reference'
}).refine(data => {
  // Rule 2: Practitioner experience must reference verified practitioner evidence
  if (data.evidenceClassification === 'VERIFIED_PRACTITIONER_EXPERIENCE') {
    return data.evidenceReferences.some(r => r.includes('[PRACTITIONER EXPERIENCE]') || r.startsWith('practitioner:') || r.startsWith('pe_'));
  }
  return true;
}, {
  message: 'VERIFIED_PRACTITIONER_EXPERIENCE findings must cite a verified practitioner evidence reference'
}).refine(data => {
  // Rule 3: External source facts must not cite practitioner evidence
  if (data.evidenceClassification === 'EXTERNAL_SOURCE_FACT') {
    return !data.evidenceReferences.some(r => r.includes('[PRACTITIONER EXPERIENCE]'));
  }
  return true;
}, {
  message: 'EXTERNAL_SOURCE_FACT findings cannot cite practitioner experience'
}).refine(data => {
  // Rule 4: Limitations mandatory when evidence is missing, unverified, inference, hypothesis, or low/hypothetical confidence
  const nonFactual = ['INFERENCE', 'HYPOTHESIS', 'ILLUSTRATIVE_EXAMPLE', 'PROPOSED_RECOMMENDATION'].includes(data.evidenceClassification);
  const lowConf = data.confidence === 'LOW' || data.confidence === 'HYPOTHETICAL';
  const noEvidence = data.evidenceReferences.length === 0;
  const meaningfulLimitations = (data.limitations || []).filter(l => {
    const trimmed = l.trim().toLowerCase();
    return trimmed.length >= 10 && !['none', 'n/a', 'na', 'nil', 'tbd', 'placeholder', 'not applicable', 'no limitations'].includes(trimmed);
  });
  if ((nonFactual || lowConf || noEvidence) && meaningfulLimitations.length === 0) {
    return false;
  }
  return true;
}, {
  message: 'Findings with non-factual classification, low/hypothetical confidence, or empty evidence references must declare at least one explicit substantive limitation (at least 10 chars, not a placeholder)'
}).refine(data => {
  // Rule 5: Hypotheses and illustrative examples cannot claim HIGH confidence
  if (data.evidenceClassification === 'HYPOTHESIS' && (data.confidence === 'HIGH' || data.confidence === 'MEDIUM')) {
    return false;
  }
  if (data.evidenceClassification === 'ILLUSTRATIVE_EXAMPLE' && data.confidence === 'HIGH') {
    return false;
  }
  return true;
}, {
  message: 'HYPOTHESIS must have LOW or HYPOTHETICAL confidence; ILLUSTRATIVE_EXAMPLE cannot have HIGH confidence'
}).refine(data => {
  // Rule 6: Observation and recommendation must be distinct substantive statements
  const normObs = data.observation.trim().toLowerCase().replace(/[^\w\s]/g, '');
  const normRec = data.recommendation.trim().toLowerCase().replace(/[^\w\s]/g, '');
  if (normObs === normRec) {
    return false;
  }
  // Prevent trivial paraphrases where one simply wraps the other
  if (normRec.includes(normObs) || normObs.includes(normRec)) {
    const lenRatio = Math.min(normObs.length, normRec.length) / Math.max(normObs.length, normRec.length);
    if (lenRatio > 0.70) {
      return false; // Trivially derived by prepending/appending a boilerplate wrapper
    }
  }
  return true;
}, {
  message: 'observation and recommendation must be distinct substantive statements, not trivial paraphrases'
}).refine(data => {
  // Rule 7: Numerical thresholds must have declared provenance
  const hasMetric = /\b\d+(\.\d+)?%|\$\d+|\b\d+\s*(?:ms|seconds|minutes|hours|days|points|users|clicks)\b/i.test(data.observation + ' ' + data.recommendation + ' ' + data.successCriteria);
  if (hasMetric && data.thresholdProvenance === 'NOT_APPLICABLE') {
    return false;
  }
  return true;
}, {
  message: 'Findings containing numerical metrics or thresholds must declare a valid thresholdProvenance other than NOT_APPLICABLE'
});
export type WorkedFinding = z.infer<typeof WorkedFindingSchema>;

// Phase 6D.4: Expertise & Genericity Validation Contracts
export const ValidationSeveritySchema = z.enum([
  'CRITICAL',
  'WARNING',
  'SUGGESTION'
]);
export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>;

export const ValidationDecisionSchema = z.enum([
  'PASS',
  'PASS_WITH_WARNINGS',
  'REVIEW_REQUIRED',
  'REJECT'
]);
export type ValidationDecision = z.infer<typeof ValidationDecisionSchema>;

export const ValidationDimensionSchema = z.enum([
  'EVIDENCE_GROUNDING',
  'EXPERTISE_SPECIFICITY',
  'REASONING_DEPTH',
  'RECOMMENDATION_QUALITY',
  'REPETITION_CONTROL',
  'BUSINESS_IMPACT_INTEGRITY',
  'PRACTITIONER_PROVENANCE',
  'QUANTITATIVE_INTEGRITY'
]);
export type ValidationDimension = z.infer<typeof ValidationDimensionSchema>;

export const ValidationFindingSchema = z.object({
  findingId: z.string().min(1, 'findingId is required'),
  sectionId: z.string().optional(),
  workedFindingId: z.string().optional(),
  ruleId: z.string().optional(),
  dimension: ValidationDimensionSchema,
  severity: ValidationSeveritySchema,
  explanation: z.string().min(5, 'explanation must be at least 5 characters'),
  evidenceOrTextLocation: z.string().default(''),
  reason: z.string().min(5, 'reason must be at least 5 characters'),
  suggestedCorrectionCategory: z.enum([
    'ADD_EVIDENCE',
    'SPECIFY_CONTEXT',
    'DEEPEN_CAUSAL_REASONING',
    'CONCRETIZE_ACTION',
    'DEDUPLICATE',
    'QUALIFY_OUTCOME',
    'SCRUB_CLIENT',
    'PROVIDE_PROVENANCE',
    'GENERAL_CORRECTION'
  ]),
  requiresHumanReview: z.boolean().default(false),
});
export type ValidationFinding = z.infer<typeof ValidationFindingSchema>;

export const DimensionScoreSchema = z.object({
  dimension: ValidationDimensionSchema,
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  passed: z.boolean(),
  criticalCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  rubricSummary: z.string(),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

export const ExpertiseValidationResultSchema = z.object({
  decision: ValidationDecisionSchema,
  aggregateScore: z.number().min(0).max(100),
  passed: z.boolean(),
  dimensionScores: z.record(ValidationDimensionSchema, DimensionScoreSchema),
  findings: z.array(ValidationFindingSchema),
  criticalViolationsCount: z.number().int().nonnegative(),
  warningsCount: z.number().int().nonnegative(),
  evaluatedFindingCount: z.number().int().nonnegative(),
  evaluatedSectionCount: z.number().int().nonnegative(),
  evaluatedArticleWordCount: z.number().int().nonnegative(),
  deterministicSummary: z.string(),
  timestamp: z.string(),
});
export type ExpertiseValidationResult = z.infer<typeof ExpertiseValidationResultSchema>;

export const OutlineNodeSchema = z.object({
  heading: z.string().min(1, 'Heading is required'),
  level: z.enum(['H2', 'H3']).default('H2'),
  generate_table: z.boolean().optional().default(false),
  assignedKeywords: z.array(z.string()).optional().default([]),
  assignedEntities: z.array(z.string()).optional().default([]),
  core_concept: z.string().optional(),
  blockPlans: z.array(ContentBlockPlanSchema).optional(),
  evidencePlan: SectionEvidencePlanSchema.optional(),
  workedFindings: z.array(WorkedFindingSchema).optional(),
});

export type OutlineNode = z.infer<typeof OutlineNodeSchema>;

export const ContentBriefSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  targetKeywords: z.array(z.string()).min(1, 'At least one target keyword is required'),
  outline: z.array(OutlineNodeSchema).min(1, 'Outline must contain at least one node'),
  wordCountBudget: z.object({
    min: z.number().positive(),
    max: z.number().positive(),
    target: z.number().positive(),
  }),
  intent: SearchIntentSchema,
  competitorInsights: z.array(z.object({
    url: z.string().url(),
    title: z.string().optional(),
    wordCount: z.number().optional(),
  })).optional().default([]),
  // Evolved fields for Phase 13
  assetType: z.string().optional().default('ARTICLE'),
  audience: z.string().optional().default(''),
  businessObjective: z.string().optional().default(''),
  primaryEntities: z.array(z.string()).optional().default([]),
  supportingEntities: z.array(z.string()).optional().default([]),
  competitorGaps: z.array(z.string()).optional().default([]),
  serpFeatures: z.array(z.string()).optional().default([]),
  geoRequirements: z.array(z.string()).optional().default([]),
  supportingTerms: z.array(z.string()).optional().default([]),
  internalLinks: z.array(z.string()).optional().default([]),
  ctaStrategy: z.string().optional().default('')
});

export type ContentBrief = z.infer<typeof ContentBriefSchema>;

// 4. ContentAsset Schema
export const ReferenceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  category: z.enum(['Official Sources', 'Community', 'Learning', 'Documentation', 'Other']).default('Other'),
  authorityScore: z.number().min(0).max(100).optional(),
});

export const ArtifactValidationStatusSchema = z.enum([
  'DRAFT',
  'READY',
  'REVIEW_REQUIRED',
  'REJECTED'
]);

export type ArtifactValidationStatus = z.infer<typeof ArtifactValidationStatusSchema>;

export const ContentAssetSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  bodyMarkdown: z.string().min(1, 'Markdown body is required'),
  htmlContent: z.string().optional(),
  wordCount: z.number().positive(),
  seoScore: z.number().min(0).max(100),
  references: z.array(ReferenceSchema).optional().default([]),
  pitchEmail: z.string().optional(),
  generatedAt: z.string().optional(),
  slug: z.string().optional(),
  assetType: z.string().optional(),
  targetKeyword: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  outline: z.array(OutlineNodeSchema).optional(),
  sections: z.array(z.any()).optional(),
  entities: z.array(z.string()).optional(),
  citations: z.array(z.any()).optional(),
  faqs: z.array(z.any()).optional(),
  geoScore: z.number().min(0).max(100).optional(),
  qualityScore: z.number().min(0).max(100).optional(),
  validationStatus: z.string().optional(),
  geoStatus: z.string().optional(),
  observedGeoScore: z.number().optional(),
  geoReadinessScore: z.number().optional(),
  geoMetrics: z.any().optional(),
  geoOpportunities: z.array(z.any()).optional(),
  geoProviderResults: z.array(z.any()).optional(),
  targetBrand: z.string().optional(),
  validationFingerprint: z.string().optional(),
  contentVersion: z.union([z.number(), z.string()]).optional(),
  validatedAt: z.string().optional()
});

export type ContentAsset = z.infer<typeof ContentAssetSchema>;

export const AssetStrategySchema = z.object({
  assetType: z.enum(['ARTICLE', 'COMPARISON', 'ALTERNATIVE', 'USE_CASE_LANDING_PAGE', 'GUIDE', 'FAQ']),
  targetKeyword: z.string(),
  searchIntent: z.string(),
  recommendedStructure: z.array(z.string()).default([]),
  targetAudience: z.string(),
  primaryGoal: z.string(),
  requiredEntities: z.array(z.string()).default([]),
  requiredTopics: z.array(z.string()).default([]),
  competitorReferences: z.array(z.string()).default([]),
  differentiationRequirements: z.array(z.string()).default([]),
  geoRequirements: z.array(z.string()).default([]),
  estimatedWordCount: z.number().default(1000),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  reasoning: z.string().default('')
});

export type AssetStrategy = z.infer<typeof AssetStrategySchema>;

// 5. SaaS Intelligence Layer Schemas
export const ProductSchema = z.object({
  name: z.string(),
  website: z.string().optional().default(''),
  description: z.string(),
  category: z.string(),
  businessType: z.enum(['SaaS', 'Agency/Portfolio', 'Ecommerce', 'Publisher/Blog', 'Services', 'Other', 'UNKNOWN']).optional().default('SaaS'),
  features: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  pricingInfo: z.string().optional().default(''),
  differentiators: z.array(z.string()).default([]),
  useCases: z.array(z.string()).default([])
});

export const AudienceSchema = z.object({
  icp: z.string(),
  personas: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  jobRoles: z.array(z.string()).default([]),
  painPoints: z.array(z.string()).default([]),
  jtbd: z.array(z.string()).default([])
});

export const CompetitorSchema = z.object({
  name: z.string(),
  domain: z.string(),
  category: z.string(),
  relevanceScore: z.number().min(0).max(100),
  discoveryReason: z.string()
});

export const MarketSchema = z.object({
  competitors: z.array(CompetitorSchema).default([]),
  competitorProducts: z.array(z.string()).default([]),
  alternatives: z.array(z.string()).default([]),
  adjacentCategories: z.array(z.string()).default([]),
  positioning: z.string().optional().default('')
});

export const SearchOpportunitySchema = z.object({
  keyword: z.string(),
  normalizedKeyword: z.string().default(''),
  intent: z.enum(['Informational', 'Transactional', 'Commercial', 'Navigational', 'Comparison']).default('Informational'),
  contentType: z.enum(['Listicle', 'How-To', 'Guide', 'Review', 'Comparison', 'Other']).default('Guide'),
  businessRelevance: z.number().min(1).max(100).default(50),
  estimatedDifficulty: z.number().min(1).max(100).default(50),
  competitorPresence: z.number().min(1).max(100).default(50),
  opportunityScore: z.number().min(0).max(100).default(0),
  explanation: z.string().default(''),
  serpTypes: z.array(z.object({ type: z.string(), count: z.number() })).default([]),
  rankingDomains: z.array(z.string()).default([]),
  competitors: z.array(z.string()).default([]),
  searchFeatures: z.array(z.string()).default([]),
  supportingTerms: z.array(z.string()).optional().default([]),
  contentGap: z.string().default(''),
  recommendedAssetType: z.string().default(''),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  reasoning: z.string().default('')
});

export type SearchOpportunity = z.infer<typeof SearchOpportunitySchema>;

export const SaaSIntelligenceProfileSchema = z.object({
  product: ProductSchema,
  audience: AudienceSchema,
  market: MarketSchema,
  opportunities: z.array(SearchOpportunitySchema).default([])
});

export type SaaSIntelligenceProfile = z.infer<typeof SaaSIntelligenceProfileSchema>;

export const GEOPromptSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  sourceKeyword: z.string(),
  intent: z.string().default('Informational'),
  category: z.string().default(''),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium')
});

export type GEOPrompt = z.infer<typeof GEOPromptSchema>;

export const AIAnswerSchema = z.object({
  provider: z.string(),
  model: z.string(),
  prompt: z.string(),
  answer: z.string(),
  timestamp: z.string(),
  success: z.boolean(),
  latency: z.number()
});

export type AIAnswer = z.infer<typeof AIAnswerSchema>;

export const BrandMentionSchema = z.object({
  brand: z.string(),
  mentioned: z.boolean(),
  position: z.number().optional(),
  competitor: z.boolean().default(false)
});

export type BrandMention = z.infer<typeof BrandMentionSchema>;

export const CitationSchema = z.object({
  url: z.string(),
  domain: z.string(),
  title: z.string().optional(),
  citedBy: z.string().optional(),
  relevance: z.number().optional()
});

export type Citation = z.infer<typeof CitationSchema>;

export const GEOVisibilityResultSchema = z.object({
  prompt: z.string(),
  provider: z.string(),
  brandMentioned: z.boolean(),
  competitorsMentioned: z.array(z.string()).default([]),
  citations: z.array(CitationSchema).default([]),
  answerMetadata: AIAnswerSchema,
  visibilityScore: z.number().min(0).max(100).default(0)
});

export type GEOVisibilityResult = z.infer<typeof GEOVisibilityResultSchema>;

export const GEOOpportunitySchema = z.object({
  issue: z.string(),
  evidence: z.string(),
  impact: z.string(),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  recommendedAction: z.string()
});

export type GEOOpportunity = z.infer<typeof GEOOpportunitySchema>;

export const DistributionChannelSchema = z.enum(['website', 'wordpress', 'webhook', 'linkedin', 'twitter', 'facebook', 'newsletter']);

export type DistributionChannel = z.infer<typeof DistributionChannelSchema>;

export const DistributionRequestSchema = z.object({
  contentAssetId: z.string(),
  channels: z.array(DistributionChannelSchema).min(1),
  publishMode: z.enum(['now', 'schedule']).optional(),
  scheduledAt: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  idempotencyKey: z.string()
});

export type DistributionRequest = z.infer<typeof DistributionRequestSchema>;

export const DistributionResultSchema = z.object({
  channel: DistributionChannelSchema,
  status: z.enum(['PENDING', 'VALIDATING', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'SCHEDULED', 'FAILED', 'CANCELLED']),
  externalId: z.string().optional(),
  publishedUrl: z.string().optional(),
  publishedAt: z.string().optional(),
  error: z.string().optional(),
  telemetry: z.object({
    durationMs: z.number().optional(),
    attempts: z.number().optional()
  }).optional()
});

export type DistributionResult = z.infer<typeof DistributionResultSchema>;

export const DistributionJobSchema = z.object({
  jobId: z.string(),
  assetId: z.string(),
  channel: DistributionChannelSchema,
  status: z.enum(['PENDING', 'VALIDATING', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'SCHEDULED', 'FAILED', 'CANCELLED']),
  attempts: z.number().default(0),
  idempotencyKey: z.string(),
  externalId: z.string().optional(),
  publishedUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  scheduledAt: z.string().optional(),
  error: z.string().optional()
});

export type DistributionJob = z.infer<typeof DistributionJobSchema>;

export const PerformanceMetricSchema = z.object({
  impressions: z.number().optional(),
  clicks: z.number().optional(),
  ctr: z.number().optional(),
  position: z.number().optional(),
  engagement: z.number().optional(),
  conversions: z.number().optional(),
  pageViews: z.number().optional(),
  reactions: z.number().optional(),
  shares: z.number().optional()
});

export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;

export const PerformanceSnapshotSchema = z.object({
  snapshotId: z.string(),
  assetId: z.string(),
  channel: z.string(),
  externalId: z.string().optional(),
  capturedAt: z.string(),
  metrics: PerformanceMetricSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  dataSource: z.string()
});

export type PerformanceSnapshot = z.infer<typeof PerformanceSnapshotSchema>;

export const PerformanceInsightSchema = z.object({
  insightId: z.string(),
  assetId: z.string(),
  type: z.string(),
  severity: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  evidence: z.string(),
  confidence: z.number(),
  suggestedAction: z.string(),
  createdAt: z.string()
});

export type PerformanceInsight = z.infer<typeof PerformanceInsightSchema>;

export const PerformanceRecommendationSchema = z.object({
  recommendationId: z.string(),
  insightId: z.string(),
  assetId: z.string(),
  changeType: z.enum([
    'UPDATE_TITLE',
    'UPDATE_META_DESCRIPTION',
    'EXPAND_TOPIC',
    'ADD_MISSING_SECTION',
    'IMPROVE_CTA',
    'IMPROVE_INTERNAL_LINKING',
    'CREATE_SUPPORTING_CONTENT',
    'CHANGE_DISTRIBUTION_CHANNEL',
    'REVIEW_SEARCH_INTENT',
    'REVIEW_GEO_VISIBILITY',
    'REUSE_ASSET_FORMAT',
    'RETIRE_ASSET'
  ]),
  rationale: z.string(),
  confidence: z.number(),
  expectedObjective: z.string(),
  applied: z.boolean().default(false),
  createdAt: z.string()
});

export type PerformanceRecommendation = z.infer<typeof PerformanceRecommendationSchema>;

export const AuthorityOpportunitySchema = z.object({
  id: z.string(),
  targetContentAssetId: z.string(),
  targetDomain: z.string(),
  targetUrl: z.string(),
  opportunityType: z.enum([
    'competitor_backlink_gap',
    'unlinked_brand_mention',
    'resource_page_opportunity',
    'editorial_mention',
    'guest_contribution_opportunity',
    'partnership_opportunity',
    'industry_directory_opportunity'
  ]),
  relationshipType: z.string().default('Competitor Referrer'),
  relevanceScore: z.number().min(0).max(100),
  authorityScore: z.number().min(0).max(100),
  topicalRelevance: z.number().min(0).max(100),
  estimatedDifficulty: z.number().min(0).max(100),
  competitorEvidence: z.array(z.string()).default([]),
  mentionStatus: z.enum(['linked', 'unlinked', 'none']).default('none'),
  backlinkStatus: z.enum(['active', 'lost', 'none']).default('none'),
  recommendedAction: z.enum([
    'OUTREACH',
    'REQUEST_LINK',
    'CREATE_RESOURCE',
    'GUEST_CONTRIBUTION',
    'PARTNERSHIP',
    'DIRECTORY_SUBMISSION',
    'MONITOR',
    'NO_ACTION'
  ]),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  reasoning: z.string()
});

export type AuthorityOpportunity = z.infer<typeof AuthorityOpportunitySchema>;

// 10. Approval Provenance Contracts (Phase R6)
export {
  ApprovalDecisionSchema,
  ApprovalRecordSchema,
  ApprovalRequestSchema
} from '@/lib/approval/types';
export type {
  ApprovalDecision,
  ApprovalRecord,
  ApprovalRequest,
  ApprovalResult
} from '@/lib/approval/types';

// 11. Durable Staged Generation Contracts (Phase R7.6)
export const AnalysisSessionStatusSchema = z.enum([
  'INITIALIZING',
  'ANALYZING',
  'COMPLETED',
  'FAILED'
]);
export type AnalysisSessionStatus = z.infer<typeof AnalysisSessionStatusSchema>;

export const GenerationSessionStatusSchema = z.enum([
  'IDLE',
  'GENERATING',
  'COMPLETED',
  'FAILED'
]);
export type GenerationSessionStatus = z.infer<typeof GenerationSessionStatusSchema>;

export const AnalysisSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ownerId: z.string(),
  targetUrl: z.string(),
  normalizedUrl: z.string(),
  status: AnalysisSessionStatusSchema.default('INITIALIZING'),
  generationStatus: GenerationSessionStatusSchema.default('IDLE'),
  profile: SaaSProfileSchema.optional(),
  candidateKeywords: z.array(z.string()).default([]),
  opportunities: z.array(SearchOpportunitySchema).default([]),
  selectedOpportunity: SearchOpportunitySchema.optional(),
  articleId: z.string().optional(),
  generatedArticleId: z.string().optional(),
  folder: z.string().optional(),
  failureReason: z.string().optional(),
  errorDetails: z.any().optional(),
  generationLeaseExpiresAt: z.number().optional(),
  generationLeaseToken: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});
export type AnalysisSession = z.infer<typeof AnalysisSessionSchema>;
