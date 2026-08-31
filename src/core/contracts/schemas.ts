import { z } from 'zod';

// 1. SaaSProfile Schema
export const SaaSProfileSchema = z.object({
  name: z.string().min(1, 'SaaS Name is required'),
  description: z.string().min(1, 'SaaS Description is required'),
  targetAudience: z.string().min(1, 'Target Audience is required'),
  keyFeatures: z.array(z.string()).optional().default([]),
  primaryCompetitors: z.array(z.string()).optional().default([]),
  website: z.string().optional(),
  tone: z.string().optional().default('professional'),
  customInsights: z.string().optional().default(''),
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
export const OutlineNodeSchema = z.object({
  heading: z.string().min(1, 'Heading is required'),
  level: z.enum(['H2', 'H3']).default('H2'),
  generate_table: z.boolean().optional().default(false),
  assignedKeywords: z.array(z.string()).optional().default([]),
  assignedEntities: z.array(z.string()).optional().default([]),
  core_concept: z.string().optional(),
});

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
  geoProviderResults: z.array(z.any()).optional()
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


