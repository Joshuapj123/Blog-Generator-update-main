import { z } from 'zod';

export const RichMediaQuerySchema = z.object({
  type: z.enum(['youtube', 'image']),
  suggested_search_query: z.string().describe("Query to find the relevant media on YouTube or Image Search."),
  alt_text: z.string().optional().describe("SEO optimized alt text for the media snippet."),
  youtube_video_id: z.string().optional().describe("The ID of the fetched youtube video (populated later)."),
});

export const OutboundAuthorityLinkSchema = z.object({
  anchor_text: z.string().describe("The exact text snippet from the paragraph to link."),
  search_query: z.string().describe("A search query to find an authoritative source to link to for validation."),
  resolved_url: z.string().optional().describe("The actual URL found for the authority link."),
  resolved_title: z.string().optional().describe("The title of the resolved authority link."),
});

export const SectionSchema = z.object({
  heading: z.string().describe("The primary heading for this section."),
  level: z.enum(['H2', 'H3']).describe("The structural level of this heading."),
  what_it_is: z.string().describe("A paragraph explaining what this section covers. Expand the concept fully and write a detailed description to meet the word budget. Heavy use of markdown bolding."),
  why_it_works: z.string().describe("A persuasive paragraph explaining why this concept is effective. Provide detailed explanation to meet the word budget. Heavy use of markdown bolding."),
  experience_or_data_point: z.string().describe("An expert insight, factual reasoning, or recent data point to satisfy E-E-A-T."),
  outbound_authority_link: OutboundAuthorityLinkSchema.optional(),
  example_brands: z.array(z.string()).describe("2-3 real well-known brands that are documented examples of this concept. Format each as 'BrandName: one concrete sentence explaining exactly how they apply this concept with a real example (e.g. a product name or campaign). No placeholders."),
  copy_formula: z.array(z.string()).describe("3-4 real, specific, ready-to-use writing patterns for this exact section concept. Each item must be a complete, usable sentence or structural template filled in with real terms — NOT brackets like [Insert X] or generic instructions. Example: 'Lead with the problem your reader faces, then pivot to the concept as the named solution.' or 'Open with a stat, then explain the mechanism behind it in plain language.'"),
  takeaway: z.string().describe("A single, clear takeaway sentence."),
  rich_media_query: RichMediaQuerySchema.optional(),
  markdown_table: z.string().optional().describe("A markdown-formatted comparison, pricing, features, or pros/cons table. Always use standard markdown table syntax (e.g. | Header 1 | Header 2 |)."),
  SectionExecutionScore: z.object({
    coverage_percent: z.number().int().describe("Percentage of checklist requirements covered."),
    information_density_percent: z.number().int().describe("Percentage of prose dedicated to concrete facts, architecture, and specifications instead of high-level filler."),
    entity_coverage_percent: z.number().int().describe("Percentage of assigned entities naturally integrated."),
    buyer_utility_percent: z.number().int().describe("Score reflecting usefulness for enterprise procurement decision makers."),
    technical_depth_percent: z.number().int().describe("Score reflecting inclusion of architecture, performance, security, and scalability metrics.")
  }).optional(),
});

export const IntroSchema = z.object({
  hook: z.string().describe("A compelling opening sentence or paragraph. MUST include the target keyword naturally."),
  thesis: z.string().describe("The main thesis of the article."),
  business_context: z.string().describe("Context explaining why this matters for the target audience."),
});

export const CtaSchema = z.object({
  heading: z.string(),
  description: z.string(),
  button_text: z.string(),
  url: z.string().optional(),
});

export const OutlineNodeSchema = z.object({
  heading: z.string(),
  level: z.enum(['H2', 'H3']).describe("Whether this is a main section (H2) or a sub-section (H3)."),
  core_concept: z.string(),
  target_entities: z.array(z.string()).optional().describe("Key entities/terms that must be weaved into this section."),
  generate_table: z.boolean().optional().describe("Set to true if a comparison/pricing/features table should be generated in this section (e.g. if table detection recommends a table here)."),
  min_word_budget: z.number().int().optional().describe("Minimum word budget for this section."),
  target_word_budget: z.number().int().optional().describe("Target word budget for this section."),
});

export const ArticleBlueprintSchema = z.object({
  title: z.string().describe("The H1 title of the post."),
  title_tag: z.string().describe("SEO optimized <title> tag. Max 60 characters. Must contain target Keyword."),
  slug: z.string().describe("URL friendly short slug containing the keyword."),
  intent: z.string().describe("The detected search intent (e.g., informational, transactional)."),
  schema_markup: z.string().optional().describe("Generated JSON-LD schema markup."),
  open_graph_tags: z.array(z.string()).optional().describe("Generated Open Graph tags."),
  intro: IntroSchema,
  sections: z.array(SectionSchema),
  cta: CtaSchema,
  diagnostics: z.object({
    h2AlignmentScore: z.number().optional(),
    h3AlignmentScore: z.number().optional(),
    headingCoverageSimilarity: z.number().optional(),
    totalPlannedBudget: z.number().optional(),
    lengthThreshold: z.number().optional(),
    sectionCompletionScore: z.number().optional(),
    entityExecutionScore: z.number().optional(),
    topicClusterExecutionScore: z.number().optional(),
    tableExecutionScore: z.number().optional(),
    faqExecutionScore: z.number().optional(),
    repairAttemptsUsed: z.number().optional(),
    // New diagnostics fields
    structureAlignmentScore: z.number().optional(),
    entityPlacementCoverage: z.number().optional(),
    budgetUtilizationPercent: z.number().optional(),
    conceptRepetitionScore: z.number().optional(),
    compressionTriggered: z.boolean().optional(),
    compressionSavingsWords: z.number().optional(),
    topicClusterCoverage: z.number().optional(),
    headingHierarchyScore: z.number().optional(),
    tier1CoveragePercent: z.number().optional(),
    tier2CoveragePercent: z.number().optional(),
    intentCoverageScore: z.number().optional(),
    totalValidationCycles: z.number().optional(),
    totalRepairCycles: z.number().optional(),
    skippedTier2Repairs: z.boolean().optional(),
    skippedTier3Repairs: z.boolean().optional(),
    fastModeEnabled: z.boolean().optional(),
    cacheHit: z.boolean().optional(),
    cacheAge: z.number().optional(),
    timeoutTriggered: z.boolean().optional(),
    repairAttempts: z.number().optional(),
    sectionRepairFailures: z.number().optional(),
    averageSectionGenerationTime: z.number().optional(),
    // Title checks
    requestedTitle: z.string().optional(),
    outlineTitle: z.string().optional(),
    finalArticleTitle: z.string().optional(),
    renderedH1: z.string().optional(),
    titleAlignmentScore: z.number().optional(),
    h1QualityScore: z.number().optional(),
    // Timing metrics
    outlineGenerationDuration: z.number().optional(),
    outlineValidationDuration: z.number().optional(),
    sectionGenerationDuration: z.number().optional(),
    sectionGenerationDurationPerSection: z.array(z.object({
      heading: z.string(),
      durationMs: z.number()
    })).optional(),
    repairPassDuration: z.number().optional(),
    assemblyDuration: z.number().optional(),
    finalValidationDuration: z.number().optional(),
    totalGenerationDuration: z.number().optional(),
    // Repair loop metrics
    outlineRegenerationAttempts: z.number().optional(),
    sectionRepairAttempts: z.number().optional(),
    compressionAttempts: z.number().optional(),
    entityInjectionPasses: z.number().optional(),
    structureRepairPasses: z.number().optional(),
    totalGeminiCalls: z.number().optional(),
    totalRepairCalls: z.number().optional(),
    totalValidationFailures: z.number().optional(),
  }).optional(),
});

export type OutlineNode = z.infer<typeof OutlineNodeSchema>;
export type SectionBlock = z.infer<typeof SectionSchema>;
export type IntroBlock = z.infer<typeof IntroSchema>;
export type CTABlock = z.infer<typeof CtaSchema>;
export type ArticleBlueprint = z.infer<typeof ArticleBlueprintSchema>;

export type GenerationState = {
  status: 'idle' | 'classifying' | 'outlining' | 'retrieving' | 'writing' | 'completed' | 'error';
  progress: number;
  message: string;
  partialArticle?: Partial<ArticleBlueprint>;
};

export interface KeywordBankTerm {
  term: string;
  source: 'serp_competitor' | 'curated_reference' | 'ai_suggested' | 'manual';
  competitorFrequency?: number;   // How many of the analyzed SERP pages mention it (0-N)
  addedAt: string; // ISO timestamp
  isPinned?: boolean; // Pinned terms are always included in prompt injection
  usageContext: {
    inOutline: boolean;
    inSections: string[];
    inInlineEdit: boolean;
  };
  status: 'active' | 'dismissed';
}

export interface KeywordBank {
  planId: string;
  targetKeyword: string;
  serpPagesAnalysed: number;      // Actual count of successful scrapes (e.g., 7 instead of assumed 10)
  terms: KeywordBankTerm[];
  lastUpdated: string;
}
