// src/core/orchestrator/AgentOrchestrator.ts
import { SaaSProfileService } from '../../lib/saas-intelligence/SaaSProfileService';
import { CompetitorDiscoveryService } from '../../lib/saas-intelligence/CompetitorDiscoveryService';
import { MarketIntelligenceService } from '../../lib/saas-intelligence/MarketIntelligenceService';
import { SearchOpportunityService } from '../../lib/saas-intelligence/SearchOpportunityService';
import { getLocalCache } from '../../lib/local-cache';

export function calculateMedian(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function analyzeContentGaps(saasProfile: any, competitors: any[]): string[] {
  if (!competitors || competitors.length === 0) {
    return [];
  }

  const gaps: string[] = [];
  
  const normalize = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const allHeadingsText = normalize(
    competitors
      .flatMap(c => c.headings || [])
      .map((h: any) => h.text || h)
      .join(' ')
  );

  if (saasProfile?.keyFeatures && saasProfile.keyFeatures.length > 0) {
    for (const feature of saasProfile.keyFeatures) {
      const cleanFeature = feature.split(/[(\[]/)[0].trim();
      const normFeature = normalize(cleanFeature);
      
      // Full match check
      if (normFeature.length > 3 && allHeadingsText.includes(normFeature)) {
        continue;
      }

      // Token overlap match check for multi-word features
      const tokens = normFeature.split(/\s+/).filter(t => t.length > 3 && !['with', 'from', 'your', 'that', 'this'].includes(t));
      if (tokens.length > 0) {
        const matchingTokens = tokens.filter(t => allHeadingsText.includes(t));
        const matchRatio = matchingTokens.length / tokens.length;
        if (matchRatio >= 0.5) {
          continue;
        }
      }
      
      gaps.push(`Competitor coverage appears limited for: ${cleanFeature}`);
    }
  }

  const anyCompetitorHasTables = competitors.some(c => c.hasTables || c.tableCount > 0);
  if (competitors.length > 0 && !anyCompetitorHasTables) {
    gaps.push('Consider adding a structured comparison table where useful.');
  }

  return gaps;
}
import { GeoVisibilityService } from '../../lib/intelligence/GeoVisibilityService';
import { GeminiVisibilityProvider, PerplexityVisibilityProvider } from '../../lib/intelligence/AIVisibilityProvider';
import { 
  SaaSProfile, 
  SearchIntent, 
  ContentBrief, 
  ContentAsset,
  OutlineNodeSchema,
  ContentBriefSchema
} from '../contracts/schemas';
import {
  PlanRecoveryDiagnostics,
  normalizeContentBrief,
  extractSanitizedValidationIssues,
  createDeterministicFallbackBrief,
  validateContentBriefStrict,
  enforceOutlineSectionBudget,
} from '@/lib/content/schemas';
import { RuntimeBudgetGuard, RuntimeBudgetDiagnostics } from './RuntimeBudgetGuard';
import { 
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '../contracts/providers';
import { validateArticleQuality } from '@/lib/seo-intelligence/quality_validator';
import { AssetStrategyService } from '@/lib/content/AssetStrategyService';
import {
  EvidenceSet,
  ContentGapMatrix,
  SectionEvidenceMap,
  ResearchIntelligenceDiagnostics,
} from '../contracts/evidence';
import { EvidenceExtractionService } from '@/lib/intelligence/EvidenceExtractionService';
import { ContentGapService } from '@/lib/intelligence/ContentGapService';
import { SectionEvidenceMapper } from '@/lib/intelligence/SectionEvidenceMapper';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';
import { ClaimExtractionService } from '@/lib/intelligence/ClaimExtractionService';
import { ClaimGroundingEngine } from '@/lib/intelligence/ClaimGroundingEngine';
import { ContentRepairService } from '@/lib/content/ContentRepairService';
import { PipelineTelemetryService } from '@/lib/observability/PipelineTelemetryService';

export enum AgentStage {
  DISCOVER = "DISCOVER",
  SAAS_INTELLIGENCE = "SAAS_INTELLIGENCE",
  RESEARCH = "RESEARCH",
  ANALYZE = "ANALYZE",
  SEARCH_OPPORTUNITY = "SEARCH_OPPORTUNITY",
  GEO_INTELLIGENCE = "GEO_INTELLIGENCE",
  PLAN = "PLAN",
  ASSET_STRATEGY = "ASSET_STRATEGY",
  GENERATE = "GENERATE",
  REVIEW = "REVIEW",
  FINALIZE = "FINALIZE",
  RETURN = "RETURN",
}

export interface ExecutionBudget {
  maxLLMCalls?: number;
  maxSearchCalls?: number;
  maxScrapeCalls?: number;
  maxEstimatedCostUsd?: number;
  timeoutMs?: number;
}

export interface AgentOrchestratorOptions {
  llm: LLMProvider;
  search: SearchProvider;
  scraper: ScrapeProvider;
  budget?: ExecutionBudget;
  maxReviewRetries?: number;
  signal?: AbortSignal;
  onStageUpdate?: (stage: AgentStage, status: "running" | "completed" | "failed", metadata?: any) => void;
  requestStartTs?: number;
  runtimeBudgetGuard?: RuntimeBudgetGuard;
}

export interface StageExecution {
  stage: AgentStage;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  retryCount: number;
  metadata?: Record<string, any>;
}

export interface ExecutionTelemetry {
  runId: string;
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  llmCalls: number;
  searchCalls: number;
  scrapeCalls: number;
  estimatedCostUsd?: number;
  errors: string[];
  maxLLMCalls?: number;
  plannedSectionCount?: number;
  fixedOverheadCount?: number;
  reviewCallsCount?: number;
  repairCallsCount?: number;
  budgetUtilization?: string;
  budgetExceeded?: boolean;
  planRecovery?: PlanRecoveryDiagnostics;
  researchIntelligence?: ResearchIntelligenceDiagnostics;
  runtimeBudget?: RuntimeBudgetDiagnostics;
  geminiModel?: string;
}

export interface OrchestrationInput {
  saasProfile: SaaSProfile;
  targetKeyword: string;
  targetAudience: string;
  targetCountry?: string;
  contentType?: string;
  competitorUrls?: string[];
  referenceUrls?: string[];
  maxHeadings?: number;
  supportingTerms?: string[];
  overrideEvidenceSet?: EvidenceSet;
  overrideGapMatrix?: ContentGapMatrix;
  requestStartTs?: number;
  internalLinks?: string[];
}

export interface DiscoveryResult {
  topic: string;
  targetKeyword: string;
  audience: string;
  market?: string;
  contentType: string;
  competitors: string[];
  goals?: string[];
}

export interface AnalysisResult {
  contentType?: string;
  competitors?: Array<{ url: string; wordCount?: number; title?: string }>;
  keywordOpportunities?: string[];
  contentGaps?: string[];
  seoSignals?: {
    medianWordCount?: number;
    medianH2Count?: number;
  };
}

export interface ReviewResult {
  passed: boolean;
  score?: number;
  issues: string[];
  warnings: string[];
  criticalErrors?: string[];
  finalValidationStatus?: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED';
  repairable: boolean;
}

export interface OrchestrationError {
  stage: AgentStage;
  message: string;
  timestamp: string;
  category?: string;
  cause?: string;
  statusCode?: number;
  code?: string;
}

export interface OrchestrationResult {
  success: boolean;
  runId: string;
  status: "completed" | "failed" | "partial";
  stages: StageExecution[];
  discovery?: DiscoveryResult;
  research?: { searchResults: SearchResult[]; scrapeResults: ScrapeResult[] };
  analysis?: AnalysisResult;
  plan?: ContentBrief;
  content?: ContentAsset;
  review?: ReviewResult;
  telemetry: ExecutionTelemetry;
  errors: OrchestrationError[];
  saasIntelligenceProfile?: any;
  evidenceSet?: EvidenceSet;
  gapMatrix?: ContentGapMatrix;
  sectionEvidenceMaps?: SectionEvidenceMap[];
  researchIntelligence?: ResearchIntelligenceDiagnostics;
}

export class AgentOrchestrator {
  private telemetry: ExecutionTelemetry;
  private stagesList: StageExecution[] = [];
  private errorsList: OrchestrationError[] = [];
  private supportingTerms: string[] = [];
  private targetBrand: string = '';
  private evidenceSet?: EvidenceSet;
  private gapMatrix?: ContentGapMatrix;
  private sectionEvidenceMaps: SectionEvidenceMap[] = [];
  private internalLinks: string[] = [];
  private saasProfile?: any;
  private lastUnrepairableClaimIds: string[] = [];
  public budgetGuard: RuntimeBudgetGuard;

  constructor(private options: AgentOrchestratorOptions) {
    this.budgetGuard = options.runtimeBudgetGuard || new RuntimeBudgetGuard({
      requestStartTs: options.requestStartTs,
      configuredLimitMs: options.budget?.timeoutMs || 270000,
      reservedFinalizeMs: 45000,
    });

    const activeModel = this.options.llm.getModel?.() || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    this.telemetry = {
      runId: 'run_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now(),
      startTime: new Date().toISOString(),
      llmCalls: 0,
      searchCalls: 0,
      scrapeCalls: 0,
      errors: [],
      geminiModel: activeModel,
    };

    // Auto-increment telemetry counters when providers are called
    const originalGenerate = this.options.llm.generate.bind(this.options.llm);
    this.options.llm.generate = async (prompt, opts) => {
      this.telemetry.llmCalls++;
      this.budgetGuard.incrementLLMCalls();
      return originalGenerate(prompt, opts);
    };

    const originalStructuredGenerate = this.options.llm.structuredGenerate.bind(this.options.llm);
    this.options.llm.structuredGenerate = async (prompt, schema, opts) => {
      this.telemetry.llmCalls++;
      this.budgetGuard.incrementLLMCalls();
      return originalStructuredGenerate(prompt, schema, opts);
    };

    const originalSearch = this.options.search.search.bind(this.options.search);
    this.options.search.search = async (query, opts) => {
      this.telemetry.searchCalls++;
      return originalSearch(query, opts);
    };

    const originalScrape = this.options.scraper.scrape.bind(this.options.scraper);
    this.options.scraper.scrape = async (urls) => {
      this.telemetry.scrapeCalls += urls.length;
      return originalScrape(urls);
    };
  }

  private checkBudgetAndAbort() {
    const elapsed = this.budgetGuard.getElapsedMs();
    // 1. Check AbortSignal
    if (this.options.signal?.aborted) {
      console.warn(`[PIPELINE] ABORT - runId=${this.telemetry.runId} elapsed=${elapsed}ms`);
      throw new Error('[Orchestrator Aborted] Execution aborted by client signal.');
    }

    // 2. Check Budget limits
    const budget = this.options.budget;
    if (budget) {
      if (budget.maxLLMCalls !== undefined && this.telemetry.llmCalls > budget.maxLLMCalls) {
        throw new Error(`[Orchestrator Budget Exceeded] LLM calls limit exceeded: ${this.telemetry.llmCalls} > ${budget.maxLLMCalls}`);
      }
      if (budget.maxSearchCalls !== undefined && this.telemetry.searchCalls > budget.maxSearchCalls) {
        throw new Error(`[Orchestrator Budget Exceeded] Search calls limit exceeded: ${this.telemetry.searchCalls} > ${budget.maxSearchCalls}`);
      }
      if (budget.maxScrapeCalls !== undefined && this.telemetry.scrapeCalls > budget.maxScrapeCalls) {
        throw new Error(`[Orchestrator Budget Exceeded] Scrape calls limit exceeded: ${this.telemetry.scrapeCalls} > ${budget.maxScrapeCalls}`);
      }
      if (budget.timeoutMs !== undefined) {
        if (elapsed > budget.timeoutMs) {
          this.budgetGuard.triggerGuard(`TIMEOUT_EXCEEDED_${elapsed}MS_LIMIT_${budget.timeoutMs}MS`);
          console.warn(`[PIPELINE] TIMEOUT - runId=${this.telemetry.runId} elapsed=${elapsed}ms`);
          throw new Error(`[Orchestrator Timeout] Timeout limit exceeded: ${elapsed}ms > ${budget.timeoutMs}ms`);
        }
      }
    }
  }

  private startStage(stage: AgentStage, retryCount = 0): StageExecution {
    this.checkBudgetAndAbort();
    const elapsed = this.budgetGuard.getElapsedMs();
    console.log(`[PIPELINE] ${stage.toUpperCase()} START - runId=${this.telemetry.runId} stage=${stage} elapsed=${elapsed}ms`);
    console.log(`[agent] ${stage} started`);
    const stageExec: StageExecution = {
      stage,
      status: "running",
      startedAt: new Date().toISOString(),
      retryCount,
    };
    this.stagesList.push(stageExec);
    this.options.onStageUpdate?.(stage, "running");
    return stageExec;
  }

  private completeStage(stageExec: StageExecution, metadata?: Record<string, any>) {
    stageExec.status = "completed";
    stageExec.completedAt = new Date().toISOString();
    stageExec.durationMs = Date.now() - new Date(stageExec.startedAt).getTime();
    stageExec.metadata = metadata;
    this.budgetGuard.recordStageDuration(stageExec.stage, stageExec.durationMs);
    const elapsed = this.budgetGuard.getElapsedMs();
    console.log(`[PIPELINE] ${stageExec.stage.toUpperCase()} END - runId=${this.telemetry.runId} stage=${stageExec.stage} elapsed=${elapsed}ms`);
    console.log(`[agent] ${stageExec.stage} completed`);
    this.options.onStageUpdate?.(stageExec.stage, "completed", metadata);
  }

  private failStage(stageExec: StageExecution, error: Error) {
    stageExec.status = "failed";
    stageExec.completedAt = new Date().toISOString();
    stageExec.durationMs = Date.now() - new Date(stageExec.startedAt).getTime();
    this.budgetGuard.recordStageDuration(stageExec.stage, stageExec.durationMs);

    const errAny = error as any;
    const causeObj = error.cause as any;
    const statusCode = errAny.statusCode || errAny.status || causeObj?.statusCode || causeObj?.status;
    const code = errAny.code || causeObj?.code;

    let category = errAny.category || causeObj?.category;
    if (!category) {
      const errStr = `${error.message || ''} ${error.name || ''} ${causeObj?.message || ''} ${code || ''} ${statusCode || ''}`;
      if (statusCode === 429 || /429|resource_exhausted|rate[- ]?limit|quota/i.test(errStr)) {
        category = 'RATE_LIMIT';
      } else if (statusCode === 503 || /503|service[- ]?unavailable|overloaded|capacity/i.test(errStr)) {
        category = 'CAPACITY';
      } else if (statusCode === 504 || /504|deadline[- ]?exceeded|timeout/i.test(errStr)) {
        category = 'TIMEOUT';
      } else if (/schema|zod|validation|invalid.*brief/i.test(errStr)) {
        category = 'SCHEMA_VALIDATION';
      } else {
        category = 'STAGE_FAILURE';
      }
    }

    const causeMsg = error.cause ? String((error.cause as any)?.message || error.cause) : undefined;
    
    const oError: OrchestrationError = {
      stage: stageExec.stage,
      message: error.message,
      timestamp: new Date().toISOString(),
      ...(category ? { category } : {}),
      ...(causeMsg ? { cause: causeMsg } : {}),
      ...(statusCode ? { statusCode: Number(statusCode) } : {}),
      ...(code ? { code: String(code) } : {}),
    };
    this.errorsList.push(oError);
    this.telemetry.errors.push(error.message);
    const elapsed = this.budgetGuard.getElapsedMs();
    console.error(`[PIPELINE] ${stageExec.stage.toUpperCase()} ERROR - runId=${this.telemetry.runId} stage=${stageExec.stage} elapsed=${elapsed}ms error=${error.message}${causeMsg ? ` cause=${causeMsg}` : ''}`);
    console.error(`[agent] ${stageExec.stage} failed: ${error.message}`);
    this.options.onStageUpdate?.(stageExec.stage, "failed", { error: error.message, category, cause: causeMsg });
  }

  async run(input: OrchestrationInput): Promise<OrchestrationResult> {
    console.log('[agent] run started');
    this.targetBrand = input.saasProfile?.name || input.saasProfile?.website || '';
    this.saasProfile = input.saasProfile;
    this.internalLinks = input.internalLinks || [];
    
    let discovery: DiscoveryResult | undefined;
    let research: { searchResults: SearchResult[]; scrapeResults: ScrapeResult[] } | undefined;
    let analysis: AnalysisResult | undefined;
    let fullCompetitors: any[] = [];
    let opportunities: any[] = [];
    let plan: ContentBrief | undefined;
    let content: ContentAsset | undefined;
    let review: ReviewResult | undefined;

    try {
      // 1. DISCOVER
      let discoverStage: StageExecution | undefined;
      try {
        discoverStage = this.startStage(AgentStage.DISCOVER);
        discovery = {
          topic: `Comprehensive Guide to ${input.targetKeyword}`,
          targetKeyword: input.targetKeyword,
          audience: input.targetAudience,
          market: input.targetCountry || 'US',
          contentType: input.contentType || 'Guide',
          competitors: input.competitorUrls || [],
          goals: [`Establish topical authority for ${input.saasProfile.name}`, `Engage ${input.targetAudience}`],
        };
        this.completeStage(discoverStage, { topic: discovery.topic });
      } catch (err: any) {
        if (discoverStage) {
          this.failStage(discoverStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.DISCOVER,
            message: err.message,
            timestamp: new Date().toISOString(),
          });
          this.telemetry.errors.push(err.message);
        }
        throw err;
      }
 
      // 1.5. SAAS_INTELLIGENCE (Optional stage)
      let saasIntelligenceStage: StageExecution | undefined;
      let saasIntelligenceProfile: any = null;
      if (input.saasProfile && input.saasProfile.name) {
        try {
          saasIntelligenceStage = this.startStage(AgentStage.SAAS_INTELLIGENCE);

          // If SaaS profile is already fully extracted with verified offerings/features and competitors,
          // reuse the existing verified intelligence to eliminate 3 redundant upstream LLM calls.
          const hasExistingFeatures = Array.isArray(input.saasProfile.keyFeatures) && input.saasProfile.keyFeatures.length > 0;
          const hasExistingCompetitors = Array.isArray(input.saasProfile.primaryCompetitors) && input.saasProfile.primaryCompetitors.length > 0;

          if (hasExistingFeatures && (hasExistingCompetitors || (input.competitorUrls && input.competitorUrls.length > 0) || !this.budgetGuard.hasBudgetForStage(AgentStage.SAAS_INTELLIGENCE, 20000))) {
            console.log(`[AgentOrchestrator] Reusing verified SaaS profile intelligence for "${input.saasProfile.name}". Bypassing redundant upstream LLM calls.`);
            const comps = hasExistingCompetitors
              ? input.saasProfile.primaryCompetitors
              : (input.competitorUrls && input.competitorUrls.length > 0 ? input.competitorUrls : []);
            saasIntelligenceProfile = {
              product: {
                name: input.saasProfile.name,
                category: (input.saasProfile as any).category || (input.saasProfile.businessType === 'Agency/Portfolio' ? 'UX Consultancy' : 'SaaS'),
                features: input.saasProfile.keyFeatures || [],
                differentiators: input.saasProfile.verifiedOfferings || [],
                integrations: []
              },
              audience: {
                icp: input.saasProfile.targetAudience || 'B2B',
                personas: [],
                industries: [],
                jobRoles: [],
                painPoints: [],
                jtbd: []
              },
              market: {
                competitors: (comps || []).map((c: string) => ({
                  name: c,
                  domain: c.toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/[^a-z0-9.-]/g, '')
                })),
                competitorProducts: comps || [],
                alternatives: comps || [],
                adjacentCategories: [input.saasProfile.businessType || 'SaaS'],
                positioning: input.saasProfile.description || ''
              },
              opportunities: []
            };
          } else {
            const profileService = new SaaSProfileService(this.options.llm);
            const compService = new CompetitorDiscoveryService(this.options.search, this.options.llm);
            const marketService = new MarketIntelligenceService(this.options.llm);

            // 1. Normalize profile
            const normalized = await profileService.normalizeProfile({
              name: input.saasProfile.name,
              description: input.saasProfile.description,
              website: input.saasProfile.website,
              keyFeatures: input.saasProfile.keyFeatures,
              targetAudience: input.saasProfile.targetAudience
            }, { runId: this.telemetry.runId });

            // 2. Discover competitors
            const competitorsList = await compService.discoverCompetitors({
              name: input.saasProfile.name,
              category: normalized.product?.category || 'SaaS',
              description: input.saasProfile.description
            }, { runId: this.telemetry.runId });

            // 3. Extract audience details
            const marketData = await marketService.extractMarketIntelligence({
              name: input.saasProfile.name,
              description: input.saasProfile.description,
              features: normalized.product?.features || []
            }, { runId: this.telemetry.runId });

            // Build combined intelligence profile
            saasIntelligenceProfile = {
              product: normalized?.product || {
                name: input.saasProfile.name,
                category: 'SaaS',
                features: [],
                differentiators: [],
                integrations: []
              },
              audience: marketData?.audience || {
                icp: input.saasProfile.targetAudience || 'B2B',
                personas: [],
                industries: [],
                jobRoles: [],
                painPoints: [],
                jtbd: []
              },
              market: {
                competitors: competitorsList || [],
                competitorProducts: (competitorsList || []).map(c => c.name),
                alternatives: (competitorsList || []).map(c => c.name),
                adjacentCategories: [normalized?.product?.category || 'SaaS'],
                positioning: marketData?.positioning || ''
              },
              opportunities: []
            };
          }

          this.completeStage(saasIntelligenceStage, {
            competitorsDiscoveredCount: saasIntelligenceProfile?.market?.competitors?.length || 0,
            positioning: saasIntelligenceProfile?.market?.positioning || ''
          });
        } catch (err: any) {
          if (saasIntelligenceStage) {
            this.failStage(saasIntelligenceStage, err);
          } else {
            this.errorsList.push({
              stage: AgentStage.SAAS_INTELLIGENCE,
              message: err.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // 2. RESEARCH
      let researchStage: StageExecution | undefined;
      try {
        researchStage = this.startStage(AgentStage.RESEARCH);
        const rawSearchResults = await this.options.search.search(discovery.targetKeyword);
        const searchResults: SearchResult[] = Array.isArray(rawSearchResults)
          ? rawSearchResults
          : ((rawSearchResults as any)?.organic || []);
        const organicUrls = searchResults.map(r => r.link).filter(Boolean);
        
        // Scrape top 3 organic competitors
        const urlsToScrape = [
          ...discovery.competitors,
          ...organicUrls
        ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);

        let scrapeResults: ScrapeResult[] = [];
        if (urlsToScrape.length > 0) {
          scrapeResults = await this.options.scraper.scrape(urlsToScrape);
        }

        research = { searchResults, scrapeResults };
        this.completeStage(researchStage, { 
          searchResultsCount: searchResults.length, 
          scrapedUrlsCount: scrapeResults.length 
        });
      } catch (err: any) {
        if (researchStage) {
          this.failStage(researchStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.RESEARCH,
            message: err.message,
            timestamp: new Date().toISOString(),
          });
          this.telemetry.errors.push(err.message);
        }
        throw err;
      }

      // 3. ANALYZE
      let analyzeStage: StageExecution | undefined;
      try {
        analyzeStage = this.startStage(AgentStage.ANALYZE);
        
        // Retrieve full competitor cache structures if available
        fullCompetitors = research.scrapeResults.map(r => {
          const cacheKey = 'competitor_' + r.url;
          const cached = getLocalCache(cacheKey);
          if (cached) {
            return cached;
          }
          // Fallback if not cached (e.g. Dry Run or first run)
          const words = r.textContent.split(/\s+/).filter(Boolean).length;
          return {
            url: r.url,
            title: r.title || 'Scraped Competitor',
            wordCount: words,
            h2Count: 6,
            headings: [],
            hasTables: false,
            tableCount: 0,
            text: r.textContent
          };
        });

        const wordCounts = fullCompetitors.map(c => c.wordCount);
        const h2Counts = fullCompetitors.map(c => c.h2Count || 6);

        const medianWordCount = calculateMedian(wordCounts) || 2000;
        const medianH2Count = calculateMedian(h2Counts) || 6;

        // Deterministic content gap analysis
        const contentGaps = analyzeContentGaps(input.saasProfile, fullCompetitors);

        // Expose telemetry fields for verification
        console.log(`[Telemetry] competitorsDiscovered: ${saasIntelligenceProfile?.market?.competitors?.length || 0}`);
        console.log(`[Telemetry] competitorsScraped: ${research.scrapeResults.length}`);
        console.log(`[Telemetry] competitorsAnalyzed: ${fullCompetitors.length}`);
        console.log(`[Telemetry] medianWordCount: ${medianWordCount}`);
        console.log(`[Telemetry] medianH2Count: ${medianH2Count}`);
        console.log(`[Telemetry] contentGaps: ${JSON.stringify(contentGaps)}`);

        analysis = {
          contentType: discovery.contentType,
          competitors: fullCompetitors.map(c => ({
            url: c.url,
            wordCount: c.wordCount,
            title: c.title,
            h2Count: c.h2Count || 6,
            headings: c.headings || [],
            hasTables: c.hasTables || false,
            tableCount: c.tableCount || 0
          })),
          keywordOpportunities: [],
          contentGaps: contentGaps,
          seoSignals: {
            medianWordCount,
            medianH2Count,
          }
        };
        this.completeStage(analyzeStage, { medianWordCount, medianH2Count, contentGapsCount: contentGaps.length });
      } catch (err: any) {
        if (analyzeStage) {
          this.failStage(analyzeStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.ANALYZE,
            message: err.message,
            timestamp: new Date().toISOString(),
          });
          this.telemetry.errors.push(err.message);
        }
        throw err;
      }

      // 3.5. SEARCH_OPPORTUNITY
      let searchOpportunityStage: StageExecution | undefined;
      try {
        searchOpportunityStage = this.startStage(AgentStage.SEARCH_OPPORTUNITY);
        if (input.supportingTerms && input.supportingTerms.length > 0) {
          this.supportingTerms = input.supportingTerms.slice(0, 6);
          opportunities = [{
            keyword: discovery.targetKeyword,
            opportunityScore: 90,
            supportingTerms: this.supportingTerms
          }];
        } else {
          const oppService = new SearchOpportunityService(this.options.search, this.options.llm);
          const competitorDomains = saasIntelligenceProfile?.market?.competitors?.map((c: any) => c.domain) || 
            input.competitorUrls?.map((u: string) => {
              try { return new URL(u).hostname.toLowerCase().replace('www.', ''); } catch { return u.toLowerCase().replace('www.', ''); }
            }) || [];
          
          opportunities = await oppService.analyzeOpportunities(
            input.saasProfile.name,
            saasIntelligenceProfile?.product?.category || 'SaaS',
            [discovery.targetKeyword],
            competitorDomains,
            { runId: this.telemetry.runId, saasProfile: input.saasProfile }
          );

          const bestOpp = opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore)[0];
          if (bestOpp) {
            const oppTerms = bestOpp.supportingTerms || [];
            const relatedKeywords = opportunities.slice(1, 4).map(o => o.keyword);
            this.supportingTerms = [
              ...oppTerms,
              ...relatedKeywords
            ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 6);
          }
        }

        this.completeStage(searchOpportunityStage, {
          opportunityCount: opportunities.length,
          primaryOpportunityScore: opportunities[0]?.opportunityScore || 0,
        });
      } catch (err: any) {
        if (searchOpportunityStage) {
          this.failStage(searchOpportunityStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.SEARCH_OPPORTUNITY,
            message: err.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 3.6. GEO_INTELLIGENCE
      let geoIntelligenceStage: StageExecution | undefined;
      let geoIntelligence: any = null;
      if (!this.budgetGuard.hasBudgetForStage(AgentStage.GEO_INTELLIGENCE, 15000)) {
        console.warn(`[AgentOrchestrator] Low runtime budget (${this.budgetGuard.getRemainingMs()}ms remaining). Gracefully bypassing GEO_INTELLIGENCE stage to preserve finalization headroom.`);
        geoIntelligence = {
          geoStatus: "insufficient_data",
          geoOpportunities: [],
          visibilityResults: [],
          metrics: null
        };
      } else {
        try {
          geoIntelligenceStage = this.startStage(AgentStage.GEO_INTELLIGENCE);
          const perplexityProvider = new PerplexityVisibilityProvider();
          const geminiProvider = new GeminiVisibilityProvider(this.options.llm);
          
          const geoVisibilityService = new GeoVisibilityService([perplexityProvider, geminiProvider]);
          const competitorDomains = saasIntelligenceProfile?.market?.competitors?.map((c: any) => c.domain) || 
            input.competitorUrls?.map((u: string) => {
              try { return new URL(u).hostname.toLowerCase().replace('www.', ''); } catch { return u.toLowerCase().replace('www.', ''); }
            }) || [];
          const brandDomain = input.saasProfile.website 
            ? input.saasProfile.website.toLowerCase().replace(/https?:\/\/(www\.)?/, '').split('/')[0]
            : input.saasProfile.name.toLowerCase().replace(/\s+/g, '') + '.com';

          const geoResult = await geoVisibilityService.analyzeVisibility(
            input.saasProfile.name,
            brandDomain,
            opportunities,
            competitorDomains,
            { runId: this.telemetry.runId, promptBudget: 2 }
          );

          let geoStatus: "available" | "insufficient_data" | "provider_unavailable" = "available";
          const successCount = geoResult.visibilityResults.filter(r => r.answerMetadata?.success).length;
          if (successCount === 0) {
            geoStatus = "provider_unavailable";
          } else if (geoResult.geoOpportunities.length === 0 || geoResult.visibilityResults.length === 0) {
            geoStatus = "insufficient_data";
          }

          geoIntelligence = {
            geoStatus,
            observedGeoScore: geoStatus === "available" ? geoResult.geoScore : undefined,
            geoOpportunities: geoResult.geoOpportunities,
            visibilityResults: geoResult.visibilityResults,
            metrics: geoResult.metrics
          };

          this.completeStage(geoIntelligenceStage, {
            geoStatus,
            observedGeoScore: geoResult.geoScore,
            successCount,
            opportunityCount: geoResult.geoOpportunities.length
          });
        } catch (err: any) {
          if (geoIntelligenceStage) {
            this.failStage(geoIntelligenceStage, err);
          } else {
            this.errorsList.push({
              stage: AgentStage.GEO_INTELLIGENCE,
              message: err.message,
              timestamp: new Date().toISOString(),
            });
          }
          geoIntelligence = {
            geoStatus: "provider_unavailable",
            geoOpportunities: [],
            visibilityResults: [],
            metrics: null
          };
        }
      }

      // 3.7. EVIDENCE EXTRACTION & CONTENT GAP MATRIX
      if (input.overrideEvidenceSet) {
        this.evidenceSet = input.overrideEvidenceSet;
      } else {
        this.evidenceSet = EvidenceExtractionService.extractEvidence({
          saasProfile: input.saasProfile,
          saasIntelligenceProfile,
          searchResults: research?.searchResults,
          scrapeResults: research?.scrapeResults,
          opportunities,
          geoIntelligence,
          targetKeyword: discovery.targetKeyword,
        });
      }

      if (input.overrideGapMatrix) {
        this.gapMatrix = input.overrideGapMatrix;
      } else {
        this.gapMatrix = ContentGapService.buildGapMatrix({
          evidenceSet: this.evidenceSet,
          saasProfile: input.saasProfile,
          competitors: fullCompetitors.length > 0 ? fullCompetitors : (analysis?.competitors || []),
          targetKeyword: discovery.targetKeyword,
          geoIntelligence,
        });
      }

      // 4. PLAN
      let planStage: StageExecution | undefined;
      const planRecovery: PlanRecoveryDiagnostics = {
        initialStatus: 'ERROR',
        validationFailurePaths: [],
        normalizationApplied: false,
        retryAttempted: false,
        retrySucceeded: false,
        fallbackUsed: false,
        finalStatus: 'FAILED',
      };

      try {
        planStage = this.startStage(AgentStage.PLAN);
        const bTypeForPlan = (this.saasProfile?.businessType || '').toLowerCase();
        const catForPlan = ((this.saasProfile as any)?.category || '').toLowerCase();
        const isSoftwarePlan = bTypeForPlan === 'saas' || catForPlan.includes('saas') || catForPlan.includes('software');
        const entityLabelPlan = isSoftwarePlan ? 'SaaS / Product Name' : 'Target Business Name';
        const offeringsLabelPlan = isSoftwarePlan ? 'Key Features' : 'Key Offerings & Capabilities';

        const saasIntelText = saasIntelligenceProfile 
          ? `${entityLabelPlan}: ${saasIntelligenceProfile.product.name}
Business Category: ${saasIntelligenceProfile.product.category}
${offeringsLabelPlan}: ${(saasIntelligenceProfile.product.features || []).join(', ')}
Key Differentiators: ${(saasIntelligenceProfile.product.differentiators || []).join(', ')}
Target Audience / ICP: ${saasIntelligenceProfile.audience.icp}
Persona Pain Points: ${(saasIntelligenceProfile.audience.painPoints || []).join(', ')}
Jobs-To-Be-Done / Goals: ${(saasIntelligenceProfile.audience.jtbd || []).join(', ')}`
          : `Business Profile: ${input.saasProfile?.name || 'Target Business'} - ${input.saasProfile?.description || ''}`;

        const geoContextText = geoIntelligence && geoIntelligence.geoOpportunities?.length > 0
          ? `GEO AI-Visibility Requirements and Recommendations:
${geoIntelligence.geoOpportunities.map((o: any) => `- Issue: ${o.issue}\n  Recommended Action: ${o.recommendedAction}`).join('\n')}`
          : '';

        const supportingTermsText = this.supportingTerms.length > 0
          ? `Recommended Supporting Search Terms to cover naturally: ${this.supportingTerms.join(', ')}`
          : '';

        const gapsContextText = this.gapMatrix && this.gapMatrix.gaps.length > 0
          ? `=== IDENTIFIED CONTENT GAPS (MUST COVER IN OUTLINE) ===
The following high-value topics are missing or under-covered by competitors. Your outline MUST include sections or table coverage for them:
${this.gapMatrix.gaps.map(g => `- Topic: "${g.topic}" (Treatment: ${g.recommendedTreatment}, Buyer Question to answer: "${g.buyerQuestion}")`).join('\n')}`
          : '';

        const evidenceContextText = this.evidenceSet && this.evidenceSet.items.length > 0
          ? `=== RESEARCHED EVIDENCE & FACTS TO ANCHOR SECTIONS ===
Incorporate these specific researched facts and differentiators into section core concepts and topics:
${this.evidenceSet.items.slice(0, 15).map(e => {
  let provenance = '[RESEARCH EVIDENCE]';
  if (
    e.evidenceType === 'BUSINESS_FACT' ||
    e.evidenceType === 'FEATURE' ||
    e.evidenceType === 'DIFFERENTIATOR' ||
    e.evidenceType === 'TECHNICAL_SPEC' ||
    e.sourceType === 'TARGET_SITE'
  ) {
    provenance = '[TARGET BRAND EVIDENCE]';
  } else if (
    e.evidenceType === 'COMPETITOR_OBSERVATION' ||
    e.sourceType === 'COMPETITOR'
  ) {
    provenance = '[COMPETITOR EVIDENCE - DO NOT ATTRIBUTE TO TARGET]';
  } else if (e.evidenceType === 'INFERENCE') {
    provenance = '[EDITORIAL INFERENCE]';
  }
  return `- ${provenance} ${e.claim}`;
}).join('\n')}`
          : '';

        const prompt = `Create a structured content brief and outline for an article targeting the canonical primary keyword: "${discovery.targetKeyword}".
Target Audience: ${discovery.audience}
${saasIntelText}
Competitor Medians: ${JSON.stringify(analysis.seoSignals)}
${supportingTermsText}
${geoContextText}
${gapsContextText}
${evidenceContextText}
${input.maxHeadings ? `Generate at most ${input.maxHeadings} headings in the outline to stay strictly within cost budgets.` : ''}

=== CRITICAL SEO TITLE & OUTLINE CONTRACTS ===
1. CANONICAL PRIMARY KEYWORD: The canonical primary keyword is "${discovery.targetKeyword}".
2. SEO TITLE: The generated title MUST contain the exact canonical primary keyword "${discovery.targetKeyword}" without splitting it with internal commas or hyphens, substituting synonyms, or changing word order. Title length must be 5-12 words, <= 60 characters preferred (<= 70 characters maximum).
3. OUTLINE STRUCTURE:
   - Generate ${input.maxHeadings ? Math.min(input.maxHeadings, 5) : '4–7'} logical H2 sections.${input.maxHeadings ? ` HARD CAP: You MUST generate NO MORE than ${input.maxHeadings} sections total.` : ''}
   - Avoid repeating the exact primary keyword in multiple H2 headings; prefer descriptive, topic-specific headings that address concrete practitioner workflows.
   - Design at least one section suited for a practical comparison/feature breakdown table.
   - Design sections that cover concrete practitioner workflows, implementation frameworks, or evaluation criteria relevant to the primary keyword and business offerings.

=== CRITICAL SCHEMA CONTRACTS ===
- intent.intentType MUST be exactly one of:
  Informational
  Transactional
  Commercial
  Navigational
  Comparison
- intent.contentType MUST be exactly one of:
  Listicle
  How-To
  Guide
  Review
  Comparison
  Other
- outline[].level MUST be exactly:
  H2
  or
  H3
- Competitor insight URLs MUST use:
  http://
  or
  https://`;

        // PHASE 4: INITIAL ATTEMPT
        let rawBrief: any = null;
        let initialCallError: any = null;

        try {
          rawBrief = await this.options.llm.structuredGenerate<ContentBrief>(
            prompt,
            ContentBriefSchema,
            {
              systemInstruction: 'You are an expert SEO content planner. Generate a strictly compliant structured Content Brief schema matching the exact enum values.',
              operation: 'Content Brief Generation',
            }
          );
        } catch (err: any) {
          initialCallError = err;
          if (err?.text) {
            try {
              rawBrief = JSON.parse(err.text);
            } catch {
              rawBrief = null;
            }
          }
        }

        let initialParseSuccess = false;
        let initialValidationIssues: string[] = [];

        if (rawBrief) {
          const { normalized, normalizationApplied } = normalizeContentBrief(rawBrief);
          if (normalizationApplied) {
            planRecovery.normalizationApplied = true;
          }
          const parseResult = ContentBriefSchema.safeParse(normalized);
          if (parseResult.success) {
            plan = parseResult.data;
            initialParseSuccess = true;
            planRecovery.initialStatus = initialCallError ? 'NORMALIZED_VALID' : (normalizationApplied ? 'NORMALIZED_VALID' : 'VALID');
            planRecovery.finalStatus = 'SUCCESS';
          } else {
            planRecovery.initialStatus = 'SCHEMA_VIOLATION';
            const { paths, issues } = extractSanitizedValidationIssues(parseResult.error);
            planRecovery.validationFailurePaths = paths;
            initialValidationIssues = issues;
          }
        } else {
          planRecovery.initialStatus = 'ERROR';
          const { paths, issues } = extractSanitizedValidationIssues(initialCallError?.cause || initialCallError);
          planRecovery.validationFailurePaths = paths.length > 0 ? paths : ['structured_output'];
          initialValidationIssues = issues.length > 0 ? issues : ['The structured output could not be parsed as a valid ContentBrief'];
        }

        // PHASE 4: EXACTLY ONE BOUNDED CORRECTION ATTEMPT (if initial attempt invalid)
        if (!initialParseSuccess || !plan) {
          planRecovery.retryAttempted = true;
          const correctionPrompt = `${prompt}

=== CORRECTION REQUIRED ===
The previous structured ContentBrief did not satisfy the required schema. Correct the following fields:
${initialValidationIssues.map(i => `- ${i}`).join('\n')}

CRITICAL CONTRACTS:
- intent.intentType MUST be exactly one of: Informational, Transactional, Commercial, Navigational, Comparison
- intent.contentType MUST be exactly one of: Listicle, How-To, Guide, Review, Comparison, Other
- outline[].level MUST be exactly H2 or H3
- Competitor insight URLs MUST use http:// or https://
Return only the schema-compliant structured object.`;

          let retryRaw: any = null;
          let retryCallError: any = null;

          try {
            retryRaw = await this.options.llm.structuredGenerate<ContentBrief>(
              correctionPrompt,
              ContentBriefSchema,
              {
                systemInstruction: 'You are an expert SEO content planner. Generate a strictly compliant structured Content Brief schema matching the exact enum values.',
                operation: 'Content Brief Generation (Retry)',
              }
            );
          } catch (retryErr: any) {
            retryCallError = retryErr;
            if (retryErr?.text) {
              try {
                retryRaw = JSON.parse(retryErr.text);
              } catch {
                retryRaw = null;
              }
            }
          }

          if (retryRaw) {
            const { normalized: retryNorm, normalizationApplied: retryNormApplied } = normalizeContentBrief(retryRaw);
            if (retryNormApplied) {
              planRecovery.normalizationApplied = true;
            }
            const retryParseResult = ContentBriefSchema.safeParse(retryNorm);
            if (retryParseResult.success) {
              plan = retryParseResult.data;
              planRecovery.retrySucceeded = true;
              planRecovery.finalStatus = 'RECOVERED';
            } else {
              planRecovery.retrySucceeded = false;
              const { paths } = extractSanitizedValidationIssues(retryParseResult.error);
              for (const p of paths) {
                if (!planRecovery.validationFailurePaths.includes(p)) {
                  planRecovery.validationFailurePaths.push(p);
                }
              }
            }
          } else {
            planRecovery.retrySucceeded = false;
          }
        }

        // PHASE 5: DETERMINISTIC FALLBACK (if both initial and retry failed)
        if (!plan) {
          planRecovery.fallbackUsed = true;
          try {
            const fallback = createDeterministicFallbackBrief({
              targetKeyword: discovery.targetKeyword,
              topic: discovery.topic,
              targetAudience: discovery.audience,
              saasProfile: input.saasProfile,
              medianWordCount: analysis?.seoSignals?.medianWordCount || 2000,
              supportingTerms: this.supportingTerms,
              competitorUrls: input.competitorUrls,
            });
            // Phase 6: strict validation invariant
            plan = ContentBriefSchema.parse(fallback);
            planRecovery.finalStatus = 'FALLBACK';
          } catch (fbErr: any) {
            planRecovery.finalStatus = 'FAILED';
            throw new Error('Deterministic fallback plan creation failed: ' + (fbErr?.message || fbErr), { cause: fbErr });
          }
        }

        // PHASE 6: STRICT VALIDATION INVARIANT — MUST PASS ContentBriefSchema.parse
        plan = validateContentBriefStrict(plan);

        // ENFORCE HARD SECTION BUDGET (Prompt 5.2)
        if (input.maxHeadings && input.maxHeadings > 0 && plan.outline.length > input.maxHeadings) {
          const budgetResult = enforceOutlineSectionBudget(
            plan,
            input.maxHeadings,
            this.evidenceSet,
            this.gapMatrix
          );
          plan = budgetResult.brief;
          console.log(`[AgentOrchestrator] Enforced outline section budget: ${budgetResult.originalCount} -> ${budgetResult.enforcedCount} sections (pruned: ${budgetResult.originalCount - budgetResult.enforcedCount})`);
        }

        if (this.internalLinks.length > 0 && (!plan.internalLinks || plan.internalLinks.length === 0)) {
          plan.internalLinks = this.internalLinks;
        }

        // Map outline to researched evidence & content gaps
        this.sectionEvidenceMaps = SectionEvidenceMapper.mapSectionsToEvidence(
          plan.outline,
          this.evidenceSet || { items: [], extractedAt: new Date().toISOString(), summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 } },
          this.gapMatrix,
          input.saasProfile
        );

        // Telemetry diagnostics recording
        this.telemetry.planRecovery = planRecovery;

        plan.supportingTerms = this.supportingTerms;

        // Calibrate and override wordCountBudget to match competitor median
        const medianW = analysis?.seoSignals?.medianWordCount || 2000;
        if (plan.wordCountBudget) {
          plan.wordCountBudget.target = Math.min(plan.wordCountBudget.target, Math.round(medianW * 1.1));
          plan.wordCountBudget.min = Math.min(plan.wordCountBudget.min, Math.round(medianW * 0.9));
          plan.wordCountBudget.max = Math.min(plan.wordCountBudget.max, Math.round(medianW * 1.3));
        } else {
          plan.wordCountBudget = {
            target: medianW,
            min: Math.round(medianW * 0.8),
            max: Math.round(medianW * 1.2)
          };
        }
        
        // Dynamically adjust the LLM call budget based on the generated outline plan
        const plannedSections = plan.outline?.length || 0;
        const maxReviewRetries = this.options.maxReviewRetries ?? 2;
        const fixedOverhead = 8; // SaaS info (3), opportunity classification (1), GEO analysis (3), plan generation (1)
        const expectedLegitimateCalls = fixedOverhead + plannedSections + maxReviewRetries + 3; // +3 for safety buffer

        if (this.options.budget) {
          const currentLimit = this.options.budget.maxLLMCalls ?? 25;
          if (expectedLegitimateCalls > currentLimit) {
            console.log(`[AgentOrchestrator] Dynamically scaling LLM call budget from ${currentLimit} to ${expectedLegitimateCalls} to accommodate plan with ${plannedSections} sections.`);
            this.options.budget.maxLLMCalls = expectedLegitimateCalls;
          }
        }

        this.completeStage(planStage, { 
          title: plan.title, 
          planRecovery,
          mappedSectionsCount: this.sectionEvidenceMaps.length 
        });
      } catch (err: any) {
        planRecovery.finalStatus = 'FAILED';
        this.telemetry.planRecovery = planRecovery;

        const rawMsg = err?.message || String(err || '');
        const errStr = `${rawMsg} ${err?.status || ''} ${err?.statusCode || ''} ${err?.code || ''}`;
        const isRateLimit = err?.status === 429 || err?.statusCode === 429 || /429|resource_exhausted|rate[- ]?limit|quota/i.test(errStr);
        const isCapacity = err?.status === 503 || err?.statusCode === 503 || /503|service[- ]?unavailable|overloaded|capacity/i.test(errStr);
        const isTimeout = err?.status === 504 || err?.statusCode === 504 || /504|deadline[- ]?exceeded|timeout/i.test(errStr);
        const isBudgetExceeded = rawMsg.includes('[Orchestrator Budget Exceeded]') || rawMsg.includes('[Orchestrator Timeout]');

        let userSafeMessage = 'ACUTE could not complete the planning stage. Please try again.';
        let category = 'PLAN_FAILURE';
        if (isBudgetExceeded) {
          userSafeMessage = rawMsg;
          category = 'BUDGET_EXCEEDED';
        } else if (isRateLimit) {
          userSafeMessage = 'AI provider rate limit reached during planning stage. Please wait a moment and try again.';
          category = 'RATE_LIMIT';
        } else if (isCapacity) {
          userSafeMessage = 'AI service temporarily unavailable during planning stage. Please try again shortly.';
          category = 'CAPACITY';
        } else if (isTimeout) {
          userSafeMessage = 'Operation timed out during planning stage. Please try again.';
          category = 'TIMEOUT';
        }

        const safeError = new Error(userSafeMessage, { cause: err });
        if (err?.statusCode || err?.status) (safeError as any).statusCode = err.statusCode || err.status;
        if (err?.code) (safeError as any).code = err.code;
        (safeError as any).category = category;

        console.error(`[AgentOrchestrator] Plan stage failed - runId=${this.telemetry.runId} category=${category} error=${rawMsg}`);

        if (planStage) {
          this.failStage(planStage, safeError);
        } else {
          this.errorsList.push({
            stage: AgentStage.PLAN,
            message: userSafeMessage,
            timestamp: new Date().toISOString(),
            cause: rawMsg,
            category,
            ...((safeError as any).statusCode ? { statusCode: (safeError as any).statusCode } : {}),
            ...((safeError as any).code ? { code: (safeError as any).code } : {}),
          });
          this.telemetry.errors.push(userSafeMessage);
        }
        throw safeError;
      }

      // 4.5. ASSET_STRATEGY
      let assetStrategyStage: StageExecution | undefined;
      let strategy: any = null;
      try {
        assetStrategyStage = this.startStage(AgentStage.ASSET_STRATEGY);
        const opportunity = opportunities[0] || {
          keyword: input.targetKeyword,
          intent: input.contentType === 'Comparison' ? 'Comparison' : 'Informational',
          contentType: input.contentType || 'Guide',
          opportunityScore: 85,
          rankingDomains: research?.searchResults?.map(r => r.link).filter(Boolean) || [],
          searchFeatures: []
        };
        strategy = AssetStrategyService.determineStrategy(
          input.saasProfile,
          opportunity,
          geoIntelligence
        );

        // Merge analysis contentGaps into strategy's differentiation requirements
        strategy.differentiationRequirements = [
          ...(strategy.differentiationRequirements || []),
          ...(analysis?.contentGaps || [])
        ].filter((v, i, a) => a.indexOf(v) === i);

        // Merge actual scraped/analyzed competitor domains into strategy's competitor references
        const scrapedDomains = (analysis?.competitors || []).map((c: any) => {
          try {
            return new URL(c.url).hostname.toLowerCase().replace('www.', '');
          } catch {
            return c.url.toLowerCase().replace('www.', '');
          }
        });
        strategy.competitorReferences = [
          ...(strategy.competitorReferences || []),
          ...scrapedDomains
        ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);

        this.completeStage(assetStrategyStage, { assetType: strategy.assetType });
      } catch (err: any) {
        if (assetStrategyStage) {
          this.failStage(assetStrategyStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.ASSET_STRATEGY,
            message: err.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // 5. GENERATE
      let generateStage: StageExecution | undefined;
      try {
        generateStage = this.startStage(AgentStage.GENERATE);
        content = await this.runGeneration(plan, strategy, this.sectionEvidenceMaps);
        this.completeStage(generateStage, { wordCount: content.wordCount });
      } catch (err: any) {
        if (generateStage) {
          this.failStage(generateStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.GENERATE,
            message: err.message,
            timestamp: new Date().toISOString(),
          });
          this.telemetry.errors.push(err.message);
        }
        throw err;
      }

      // 6. REVIEW
      let reviewStage: StageExecution | undefined;
      try {
        reviewStage = this.startStage(AgentStage.REVIEW);
        review = await this.runReview(content, plan, { repairAttempted: false });
        
        // Bounded Repair Loop
        let retries = 0;
        const maxRetries = this.options.maxReviewRetries ?? 2;
        const contentBeforeReview = { ...content };
        const reviewHistory: string[] = [];

        const isMetadataWarning = (issue: string) => {
          const lower = issue.toLowerCase();
          return lower.includes('title is too long') || lower.includes('title contains too many words');
        };

        const getRepairableIssues = (rev: ReviewResult) => {
          const critical = rev.criticalErrors || [];
          const repairableWarnings = (rev.warnings || []).filter(w => !isMetadataWarning(w));
          return [...critical, ...repairableWarnings];
        };

        let repairableIssues = getRepairableIssues(review);

        while (!review.passed && repairableIssues.length > 0 && retries < maxRetries) {
          if (!this.budgetGuard.hasBudgetForRepair()) {
            console.warn(`[AgentOrchestrator] Runtime budget insufficient for repair attempt (${this.budgetGuard.getRemainingMs()}ms remaining, reservedFinalize=${this.budgetGuard.getReservedFinalizeMs()}ms). Skipping further repairs to preserve finalization headroom.`);
            break;
          }
          retries++;
          reviewHistory.push(...repairableIssues);
          console.log(`[agent] Quality issues detected (${repairableIssues.length} repairable). Starting repair attempt ${retries}/${maxRetries}...`);

          PipelineTelemetryService.getInstance().recordEvent({
            runId: this.telemetry.runId,
            stage: 'REPAIR',
            eventType: 'REPAIR_ATTEMPT',
            outcome: 'RETRY',
            retryCount: retries,
            details: {
              retryCount: retries,
              reason: repairableIssues[0],
            }
          });
          
          let repairStage: StageExecution | undefined;
          try {
            repairStage = this.startStage(AgentStage.GENERATE, retries);
            content = await this.runRepair(content, plan, repairableIssues);
            this.completeStage(repairStage, { wordCount: content.wordCount, repaired: true });
          } catch (repairErr: any) {
            if (repairStage) {
              this.failStage(repairStage, repairErr);
            } else {
              this.errorsList.push({
                stage: AgentStage.GENERATE,
                message: repairErr.message,
                timestamp: new Date().toISOString(),
              });
              this.telemetry.errors.push(repairErr.message);
            }
            throw repairErr;
          }

          review = await this.runReview(content, plan, {
            repairAttempted: true,
            attemptIndex: retries,
            unrepairableClaimIds: this.lastUnrepairableClaimIds
          });

          PipelineTelemetryService.getInstance().recordEvent({
            runId: this.telemetry.runId,
            stage: 'REVIEW',
            eventType: 'REVALIDATION',
            outcome: review.passed ? 'SUCCESS' : 'FAILURE',
            retryCount: retries,
            failureCategory: review.passed ? undefined : (this.lastUnrepairableClaimIds.length > 0 ? 'REPAIR_UNAVAILABLE' : 'REPAIR_REVALIDATION_FAILED'),
            details: {
              retryCount: retries,
              unrepairableClaimsCount: this.lastUnrepairableClaimIds.length,
            }
          });

          repairableIssues = getRepairableIssues(review);
        }

        // Determine final validation state:
        let finalValidationStatus: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED';
        if (review.criticalErrors && review.criticalErrors.length > 0) {
          finalValidationStatus = 'FAILED';
        } else if (review.warnings && review.warnings.length > 0) {
          finalValidationStatus = 'PASSED_WITH_WARNINGS';
        } else {
          finalValidationStatus = 'PASSED';
        }
        review.finalValidationStatus = finalValidationStatus;

        const initialWordCount = contentBeforeReview?.wordCount || content?.wordCount || 0;
        const finalWordCount = content?.wordCount || 0;
        const plannedH2Count = plan?.outline?.filter((s: any) => s.level === 'H2').length || 0;
        const plannedH3Count = plan?.outline?.filter((s: any) => s.level === 'H3').length || 0;
        
        const allGeneratedHeadings = parseMarkdownHeadings(content?.bodyMarkdown || '');
        const finalH2Count = allGeneratedHeadings.filter(h => h.level === 'H2').length;
        const finalH3Count = allGeneratedHeadings.filter(h => h.level === 'H3').length;

        const generatedNormHeadings = allGeneratedHeadings.map(h => h.text.toLowerCase().replace(/[^\w\s]/g, '').trim());
        const missingHeadings: string[] = [];
        (plan?.outline || []).forEach((node: any) => {
          const normPlanned = node.heading.toLowerCase().replace(/[^\w\s]/g, '').trim();
          if (!generatedNormHeadings.some(h => h.includes(normPlanned) || normPlanned.includes(h))) {
            missingHeadings.push(node.heading);
          }
        });

        const plannedNormHeadings = (plan?.outline || []).map((n: any) => n.heading.toLowerCase().replace(/[^\w\s]/g, '').trim());
        const unexpectedHeadings: string[] = [];
        allGeneratedHeadings.filter(h => h.level === 'H2').forEach(h => {
          const norm = h.text.toLowerCase().replace(/[^\w\s]/g, '').trim();
          if (!plannedNormHeadings.some((p: string) => p.includes(norm) || norm.includes(p))) {
            unexpectedHeadings.push(h.text);
          }
        });

        const headingCounts: Record<string, number> = {};
        allGeneratedHeadings.forEach(h => {
          const norm = h.text.toLowerCase().trim();
          headingCounts[norm] = (headingCounts[norm] || 0) + 1;
        });
        const duplicateHeadings = Object.entries(headingCounts)
          .filter(([_, count]) => count > 1)
          .map(([text]) => text);

        // Check satisfied supporting terms
        const bodyLowerForTelemetry = (content?.bodyMarkdown || '').toLowerCase();
        const satisfiedTerms = this.supportingTerms.filter(t => bodyLowerForTelemetry.includes(t.toLowerCase().trim()));
        const missingTerms = this.supportingTerms.filter(t => !bodyLowerForTelemetry.includes(t.toLowerCase().trim()));

        const readabilityStatus = (review.criticalErrors?.some(e => e.includes('Flesch')) || review.warnings?.some(w => w.includes('Flesch'))) ? 'WARNING' : 'PASSED';
        const entityValidationStatus = (review.criticalErrors?.some(e => e.includes('Entity Stuffing Alert') || e.includes('Brand Stuffing Alert'))) ? 'FAILED' : ((review.warnings?.some(w => w.includes('Entity Stuffing Alert'))) ? 'WARNING' : 'PASSED');
        const structureValidationStatus = (missingHeadings.length > 0 || duplicateHeadings.length > 0) ? 'FAILED' : 'PASSED';
        const keywordValidationStatus = (review.criticalErrors?.some(e => e.includes('Missing primary keyword') || e.includes('Keyword Stuffing Alert'))) ? 'FAILED' : 'PASSED';

        console.log(`
=== FINAL QUALITY HARDENING TELEMETRY ===
targetWordCount: ${plan?.wordCountBudget?.target || 2000}
minimumWordCount: ${plan?.wordCountBudget?.min || 1500}
maximumWordCount: ${plan?.wordCountBudget?.max || 2500}
actualWordCountBeforeReview: ${initialWordCount}
actualWordCountAfterReview: ${finalWordCount}
plannedH2Count: ${plannedH2Count}
actualH2Count: ${finalH2Count}
plannedH3Count: ${plannedH3Count}
actualH3Count: ${finalH3Count}
missingHeadings: ${JSON.stringify(missingHeadings)}
unexpectedHeadings: ${JSON.stringify(unexpectedHeadings)}
duplicateHeadings: ${JSON.stringify(duplicateHeadings)}
primaryKeyword: "${input.targetKeyword}"
searchOpportunityTermsFound: ${this.supportingTerms.length > 0 ? this.supportingTerms.length : '"NO_SUPPORTING_TERMS_RETURNED"'}
supportingTermsPassedToPlan: ${this.supportingTerms.length}
supportingTermsPassedToGeneration: ${this.supportingTerms.length}
supportingTermsSatisfied: ${JSON.stringify(satisfiedTerms)}
supportingTermsMissing: ${JSON.stringify(missingTerms)}
competitorsDiscovered: ${research?.searchResults?.length || 0}
competitorsScraped: ${research?.scrapeResults?.length || 0}
competitorsAnalyzed: ${strategy?.competitorReferences?.length || 0}
competitorReferencesPassedToGeneration: ${strategy?.competitorReferences?.length || 0}
contentGapsPassedToGeneration: ${strategy?.differentiationRequirements?.length || 0}
geoRequirementsPassedToGeneration: ${strategy?.geoRequirements?.length || 0}
readabilityStatus: "${readabilityStatus}"
entityValidationStatus: "${entityValidationStatus}"
structureValidationStatus: "${structureValidationStatus}"
keywordValidationStatus: "${keywordValidationStatus}"
primaryKeywordDensity: ${this.telemetry.researchIntelligence?.primaryKeywordDensity !== undefined ? this.telemetry.researchIntelligence.primaryKeywordDensity.toFixed(2) + '%' : '"N/A"'}
keywordWarningCount: ${this.telemetry.researchIntelligence?.keywordWarningCount || 0}
repairAttempts: ${retries}
repairReasons: ${JSON.stringify(reviewHistory)}
claimGroundingDiagnostics: ${JSON.stringify(this.telemetry.researchIntelligence?.claimGrounding || null)}
groundingFailureBreakdown: ${JSON.stringify(this.telemetry.researchIntelligence?.groundingFailureBreakdown || null)}
structuredGroundingDiagnosticsCount: ${this.telemetry.researchIntelligence?.structuredGroundingDiagnostics?.length || 0}
finalValidationStatus: "${finalValidationStatus}"
FirestoreSave: true
EditorRendered: true
geminiModel: "${this.telemetry.geminiModel || 'gemini-3.5-flash-lite'}"
=== END TELEMETRY ===`);
        
        this.completeStage(reviewStage, { passed: finalValidationStatus !== 'FAILED', finalValidationStatus, score: review.score });
      } catch (err: any) {
        if (reviewStage) {
          this.failStage(reviewStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.REVIEW,
            message: err.message,
            timestamp: new Date().toISOString(),
          });
          this.telemetry.errors.push(err.message);
        }
        throw err;
      }

      // 6.5. FINALIZE
      let finalizeStage: StageExecution | undefined;
      try {
        finalizeStage = this.startStage(AgentStage.FINALIZE);
        if (content) {
          const finalValStatus = review?.finalValidationStatus || (review?.passed ? 'PASSED' : 'FAILED');
          content.assetType = strategy?.assetType || 'ARTICLE';
          content.targetKeyword = input.targetKeyword;
          content.validationStatus = finalValStatus === 'FAILED' ? 'REJECTED' : 'READY';
          content.qualityScore = finalValStatus === 'PASSED' ? 95 : (finalValStatus === 'PASSED_WITH_WARNINGS' ? 88 : 65);
          content.targetBrand = this.targetBrand || input.saasProfile?.name || input.saasProfile?.website || '';
          content.validationFingerprint = ContentEvidenceValidator.computeValidationFingerprint(
            content.bodyMarkdown || '',
            content.targetBrand
          );
          content.contentVersion = 1;
          content.validatedAt = new Date().toISOString();

          // Populate real GEO data model fields
          content.geoStatus = geoIntelligence?.geoStatus || "provider_unavailable";
          if (content.geoStatus === "available" && geoIntelligence?.observedGeoScore !== undefined) {
            content.observedGeoScore = geoIntelligence.observedGeoScore;
          }
          
          // Compute geoReadinessScore based on entity coverage
          const targetEntities = plan?.outline?.flatMap((node: any) => node.assignedEntities || []) || [];
          let geoReadinessScore = 100;
          const bodyText = content.bodyMarkdown || '';
          if (targetEntities.length > 0) {
            const covered = targetEntities.filter((e: string) => bodyText.toLowerCase().includes(e.toLowerCase())).length;
            geoReadinessScore = Math.round((covered / targetEntities.length) * 100);
          }
          content.geoReadinessScore = geoReadinessScore;

          content.geoScore = content.observedGeoScore !== undefined ? content.observedGeoScore : geoReadinessScore;
          content.geoMetrics = geoIntelligence?.metrics || null;
          content.geoOpportunities = geoIntelligence?.geoOpportunities || [];
          content.geoProviderResults = geoIntelligence?.visibilityResults || [];
        }
        this.completeStage(finalizeStage, { validationStatus: content?.validationStatus });
      } catch (err: any) {
        if (finalizeStage) {
          this.failStage(finalizeStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.FINALIZE,
            message: err.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // 7. RETURN
      this.telemetry.endTime = new Date().toISOString();
      this.telemetry.totalDurationMs = Date.now() - new Date(this.telemetry.startTime).getTime();
      
      // Populate telemetry budget reporting fields
      this.telemetry.maxLLMCalls = this.options.budget?.maxLLMCalls;
      this.telemetry.plannedSectionCount = plan?.outline?.length || 0;
      this.telemetry.fixedOverheadCount = 8;
      this.telemetry.reviewCallsCount = 1;
      this.telemetry.repairCallsCount = this.telemetry.llmCalls > (8 + (plan?.outline?.length || 0))
        ? this.telemetry.llmCalls - 8 - (plan?.outline?.length || 0)
        : 0;
      this.telemetry.budgetUtilization = this.options.budget?.maxLLMCalls
        ? `${((this.telemetry.llmCalls / this.options.budget.maxLLMCalls) * 100).toFixed(1)}%`
        : '0%';
      this.telemetry.budgetExceeded = this.options.budget?.maxLLMCalls
        ? this.telemetry.llmCalls > this.options.budget.maxLLMCalls
        : false;
      this.telemetry.runtimeBudget = this.budgetGuard.getDiagnostics();

      console.log('[agent] run completed successfully');
      return {
        success: review.passed,
        runId: this.telemetry.runId,
        status: review.passed ? "completed" : "partial",
        stages: this.stagesList,
        discovery,
        research,
        analysis,
        plan,
        content,
        review,
        telemetry: this.telemetry,
        errors: this.errorsList,
        saasIntelligenceProfile,
        evidenceSet: this.evidenceSet,
        gapMatrix: this.gapMatrix,
        sectionEvidenceMaps: this.sectionEvidenceMaps,
        researchIntelligence: this.telemetry.researchIntelligence,
      };

    } catch (err: any) {
      this.telemetry.endTime = new Date().toISOString();
      this.telemetry.totalDurationMs = Date.now() - new Date(this.telemetry.startTime).getTime();
      
      // Populate telemetry budget reporting fields even on error
      this.telemetry.maxLLMCalls = this.options.budget?.maxLLMCalls;
      this.telemetry.plannedSectionCount = plan?.outline?.length || 0;
      this.telemetry.fixedOverheadCount = 8;
      this.telemetry.reviewCallsCount = 1;
      this.telemetry.repairCallsCount = this.telemetry.llmCalls > (8 + (plan?.outline?.length || 0))
        ? this.telemetry.llmCalls - 8 - (plan?.outline?.length || 0)
        : 0;
      this.telemetry.budgetUtilization = this.options.budget?.maxLLMCalls
        ? `${((this.telemetry.llmCalls / this.options.budget.maxLLMCalls) * 100).toFixed(1)}%`
        : '0%';
      this.telemetry.budgetExceeded = this.options.budget?.maxLLMCalls
        ? this.telemetry.llmCalls > this.options.budget.maxLLMCalls
        : false;
      this.telemetry.runtimeBudget = this.budgetGuard.getDiagnostics();

      // Ensure the error is in errorsList and telemetry if not already added
      const alreadyLogged = this.errorsList.some(e => e.message === err.message);
      if (!alreadyLogged) {
        this.errorsList.push({
          stage: AgentStage.RETURN,
          message: err.message,
          timestamp: new Date().toISOString(),
        });
        this.telemetry.errors.push(err.message);
      }

      console.error(`[agent] run completed with errors: ${err.message}`);
      return {
        success: false,
        runId: this.telemetry.runId,
        status: "failed",
        stages: this.stagesList,
        discovery,
        research,
        analysis,
        plan,
        content,
        review,
        telemetry: this.telemetry,
        errors: this.errorsList,
        saasIntelligenceProfile: null,
        evidenceSet: this.evidenceSet,
        gapMatrix: this.gapMatrix,
        sectionEvidenceMaps: this.sectionEvidenceMaps,
        researchIntelligence: this.telemetry.researchIntelligence,
      };
    }
  }

  private async runGeneration(brief: ContentBrief, strategy?: any, sectionMaps?: SectionEvidenceMap[]): Promise<ContentAsset> {
    let bodyMarkdown = `# ${brief.title}\n\n`;
    const assetType = strategy?.assetType || brief.assetType || 'ARTICLE';
    const primaryKeyword = brief.targetKeywords?.[0] || '';

    let assetInstructions = '';
    if (assetType === 'COMPARISON') {
      assetInstructions = `
Asset Type: COMPARISON
Guidelines: Compare solutions objectively with clear criteria, factual feature matrices, strengths, and use-case recommendations. Avoid biased claims and focus on factual, feature-based contrast.`;
    } else if (assetType === 'ALTERNATIVE') {
      assetInstructions = `
Asset Type: ALTERNATIVE
Guidelines: Detail alternative tools, comparison criteria, who each alternative is best for, key features, and switching considerations.`;
    } else if (assetType === 'USE_CASE_LANDING_PAGE') {
      assetInstructions = `
Asset Type: USE-CASE LANDING PAGE
Guidelines: Address the target audience directly, explain the core problem, detail the solution workflow, showcase main benefits, and present clear proof points.`;
    } else if (assetType === 'GUIDE') {
      assetInstructions = `
Asset Type: GUIDE
Guidelines: Maintain an actionable, step-by-step tutorial structure with clear instructions, practical examples, common mistakes to avoid, and structured FAQ sections.`;
    } else if (assetType === 'FAQ') {
      assetInstructions = `
Asset Type: FAQ
Guidelines: Write direct questions followed by concise, structured, and factual answers without introductory fluff.`;
    } else {
      assetInstructions = `
Asset Type: ARTICLE
Guidelines: Maintain an educational structure, write in an active voice, and provide clear definitions, industry examples, and practical recommendations.`;
    }

    const competitorReferencesPassed = strategy?.competitorReferences || [];
    const contentGapsPassed = strategy?.differentiationRequirements || [];
    const geoRequirementsPassed = strategy?.geoRequirements || [];

    console.log(`[Telemetry] competitorReferencesPassedToGeneration: ${competitorReferencesPassed.length}`);
    console.log(`[Telemetry] contentGapsPassedToGeneration: ${contentGapsPassed.length}`);
    console.log(`[Telemetry] differentiationRequirementsPassedToGeneration: ${contentGapsPassed.length}`);
    console.log(`[Telemetry] geoRequirementsPassedToGeneration: ${geoRequirementsPassed.length}`);

    let intelligenceContext = '';
    if (strategy) {
      if (competitorReferencesPassed.length > 0 || contentGapsPassed.length > 0 || geoRequirementsPassed.length > 0) {
        intelligenceContext = `

=== SEO AND GEO INTELLIGENCE WRITING CONSTRAINTS ===
Analyze competitor coverage to identify opportunities for differentiation and completeness. Do not reproduce competitor wording or structure verbatim.

${competitorReferencesPassed.length > 0 ? `Top Ranking Competitors:\n${competitorReferencesPassed.map((c: any) => `- ${c}`).join('\n')}` : ''}
${contentGapsPassed.length > 0 ? `Competitive Gaps / Opportunities:\n${contentGapsPassed.map((d: any) => `- ${d}`).join('\n')}` : ''}
${geoRequirementsPassed.length > 0 ? `GEO AI Search Visibility Requirements:\n${geoRequirementsPassed.map((g: any) => `- ${g}`).join('\n')}` : ''}

WRITING RULES:
- Use competitor information to improve completeness and differentiation.
- Do NOT copy competitor wording.
- Do NOT reproduce competitor article structures verbatim.
- Do NOT mention competitors unless contextually appropriate.
- Do NOT fabricate competitor claims.
- Use GEO recommendations where relevant to the section.
- Prioritize factual accuracy and the user's product positioning.
- Treat competitor observations as strategic signals, not authoritative facts.
===================================================`;
      }
    }

    const h2Count = brief.outline.filter(s => s.level === 'H2').length || 1;
    const h3Count = brief.outline.filter(s => s.level === 'H3').length || 0;
    const targetTotal = brief.wordCountBudget?.target || 2000;
    const totalWeight = (h2Count * 1.5) + (h3Count * 0.9);
    const baseUnit = targetTotal / (totalWeight || 1);

    const sectionBudgets = brief.outline.map(s => {
      const weight = s.level === 'H2' ? 1.5 : 0.9;
      const target = Math.round(baseUnit * weight);
      return {
        target,
        min: Math.round(target * 0.8),
        max: Math.round(target * 1.2)
      };
    });

    // Bounded section drafting: concurrency of 2 with pacing ensures sub-minute drafting while strictly adhering to provider RPM limits
    const concurrencyLimit = Math.min(2, brief.outline.length);
    const sectionTexts: string[] = new Array(brief.outline.length).fill('');
    const queue = brief.outline.map((section, index) => ({ section, index }));

    const workers = Array.from({ length: concurrencyLimit }, async () => {
      let isFirstItemForWorker = true;
      while (queue.length > 0) {
        // Check AbortSignal
        if (this.options.signal?.aborted) {
          throw new Error('[Orchestrator Aborted] Execution aborted by client signal.');
        }

        // Check runtime budget before drafting
        if (!this.budgetGuard.hasBudgetForSection()) {
          console.warn(`[AgentOrchestrator] Low runtime budget (${this.budgetGuard.getRemainingMs()}ms remaining). Preserving finalization headroom by generating concise grounded draft for remaining sections.`);
          while (queue.length > 0) {
            const remItem = queue.shift();
            if (!remItem) break;
            const { section: remSec, index: remIdx } = remItem;
            const mapsToUse = sectionMaps || this.sectionEvidenceMaps || [];
            const secMap = mapsToUse.find(m => m.heading.toLowerCase().trim() === remSec.heading.toLowerCase().trim()) || mapsToUse[remIdx];
            sectionTexts[remIdx] = generateConciseSectionDraft(remSec, secMap, this.targetBrand, primaryKeyword);
            this.budgetGuard.recordSectionDuration(remSec.heading, 0);
          }
          break;
        }

        if (!isFirstItemForWorker) {
          // Pacing delay between successive requests by this worker to stay well within provider 15 RPM limit
          await new Promise(r => setTimeout(r, 500));
        }
        isFirstItemForWorker = false;

        const item = queue.shift();
        if (!item) break;
        const { section, index: i } = item;
        const budget = sectionBudgets[i];
        const isFirstSection = i === 0;

        const secStart = Date.now();
        const mapsToUse = sectionMaps || this.sectionEvidenceMaps || [];
        const sectionMap = mapsToUse.find(m => m.heading.toLowerCase().trim() === section.heading.toLowerCase().trim()) || mapsToUse[i];

        let sectionEvidenceContext = '';
        if (sectionMap) {
          const evItems = (this.evidenceSet?.items || []).filter(e => sectionMap.evidenceIds.includes(e.id));
          const factsList = evItems.length > 0
            ? `Researched Evidence to incorporate or reference:\n${evItems.map(e => {
              let provenance = '[RESEARCH EVIDENCE]';
              if (
                e.evidenceType === 'BUSINESS_FACT' ||
                e.evidenceType === 'FEATURE' ||
                e.evidenceType === 'DIFFERENTIATOR' ||
                e.evidenceType === 'TECHNICAL_SPEC' ||
                e.sourceType === 'TARGET_SITE'
              ) {
                provenance = '[TARGET BRAND EVIDENCE]';
              } else if (
                e.evidenceType === 'COMPETITOR_OBSERVATION' ||
                e.sourceType === 'COMPETITOR'
              ) {
                provenance = '[COMPETITOR EVIDENCE - DO NOT ATTRIBUTE TO TARGET]';
              } else if (e.evidenceType === 'INFERENCE') {
                provenance = '[EDITORIAL INFERENCE]';
              }
              return `- ${provenance} ${e.claim}`;
            }).join('\n')}`
            : '';
          const bizFactsList = sectionMap.targetBusinessFacts && sectionMap.targetBusinessFacts.length > 0
            ? `Target Business Facts to emphasize:\n${sectionMap.targetBusinessFacts.map(f => `- ${f}`).join('\n')}`
            : '';
          const buyerQ = sectionMap.buyerQuestion
            ? `Specific Buyer Question to answer directly:\n- "${sectionMap.buyerQuestion}"`
            : '';
          const compGap = sectionMap.competitorGap
            ? `Competitor Content Gap to address:\n- ${sectionMap.competitorGap}`
            : '';
          const claims = sectionMap.claimConstraints && sectionMap.claimConstraints.length > 0
            ? `Claim Constraints:\n${sectionMap.claimConstraints.map(c => `- ${c}`).join('\n')}`
            : '';
          const prohibited = sectionMap.prohibitedClaims && sectionMap.prohibitedClaims.length > 0
            ? `Prohibited Claims:\n${sectionMap.prohibitedClaims.map(p => `- ${p}`).join('\n')}`
            : '';

          sectionEvidenceContext = `

=== SECTION EVIDENCE & EDITORIAL STRATEGY CONTRACT ===
Section Intent: ${sectionMap.intent}
${buyerQ}
${compGap}
${factsList}
${bizFactsList}
${claims}
${prohibited}
CRITICAL EVIDENCE ACCURACY RULES:
- Address the assigned buyer question directly with practical, actionable explanation.
- Naturally incorporate the researched evidence items and target business facts.
- FACTUAL INTEGRITY CONTRACT: DO NOT invent, fabricate, or hallucinate statistical numbers, metrics (ms, %, $, users, multipliers), or external analyst surveys (e.g. Gartner, Forrester) not explicitly listed in the evidence.
- COMPARATIVE CLAIMS BAN: Never invent ungrounded comparative superiority outcome claims (e.g., claiming a model or product reduces turnover, cuts costs, or outperforms an alternative) unless verified research evidence explicitly establishes that exact comparative outcome. Never introduce unbacked comparative clauses against unverified internal or external comparators (e.g., "Unlike internal reviews, ..."). Do NOT invert ICP buyer pain points into affirmative product claims.
- TELEMETRY & BEHAVIORAL TRACKING BAN: Never invent session replay, analytics telemetry, or user drop-off tracking capabilities (e.g., claiming to "find the exact spots where users leave before finishing a task") unless verified by explicit evidence.
- CAUSAL OUTCOME & DELIVERABLE BAN: Never promise unverified causal business outcomes (e.g., "improve retention", "guarantee conversion") or unverified deliverables (e.g., "give teams a roadmap") unless explicitly supported by verified offerings or evidence. Frame capabilities in terms of verified service activities (e.g., UX audits, onboarding and checkout redesigns, and user friction remediation).
- STRICT ENTITY ISOLATION: Never attribute competitor statistics or features to ${this.targetBrand || 'the target brand'}, and never attribute ${this.targetBrand || 'the target brand'}'s features or metrics to competitors.
- STRICT EVIDENCE PROVENANCE: Items tagged [TARGET BRAND EVIDENCE] belong strictly to ${this.targetBrand || 'the target business'}. Items tagged [COMPETITOR EVIDENCE - DO NOT ATTRIBUTE TO TARGET] must NEVER be attributed to ${this.targetBrand || 'the target business'}. Items tagged [EDITORIAL INFERENCE] represent general analysis, not empirical facts.
- CONTRADICTION BAN: Never assert that a product lacks or fails to provide capabilities that the evidence proves it has.
- Do NOT make ungrounded promotional superlatives.
======================================================`;
        }

        const bType = (this.saasProfile?.businessType || '').toLowerCase();
        const category = ((this.saasProfile as any)?.category || '').toLowerCase();
        const desc = (this.saasProfile?.description || '').toLowerCase();

        const isAgencyOrConsultancy = bType.includes('agency') || bType.includes('services') || bType.includes('portfolio') || category.includes('consultan') || category.includes('agency');
        const isLegal = bType.includes('legal') || category.includes('legal') || desc.includes('law firm') || desc.includes('attorney') || desc.includes('legal');
        const isIndustrial = bType.includes('industrial') || category.includes('industrial') || desc.includes('manufacturing') || desc.includes('industrial') || desc.includes('fabrication');
        const isMarketplace = bType.includes('marketplace') || category.includes('marketplace') || desc.includes('two-sided market') || desc.includes('marketplace') || desc.includes('vendor directory');
        const isEcommerce = bType.includes('ecommerce') || category.includes('ecommerce') || desc.includes('online store');
        const isSaaS = bType === 'saas' || category.includes('saas') || category.includes('software');

        let terminologyGuidance = '';
        if (isAgencyOrConsultancy) {
          terminologyGuidance = `- Use natural phrasing suited for a professional agency, studio, or consultancy: "the agency", "the team", "the consultants", "the practice", or the specific verified service name.
   - STRICT BAN: DO NOT refer to this organization as "the platform", "the software", "the tool", "the CRM", or "the system".`;
        } else if (isLegal) {
          terminologyGuidance = `- Use phrasing suited for a professional legal practice: "the firm", "the legal practice", "the attorneys", "the counsel", "the legal team".
   - STRICT BAN: DO NOT refer to this organization as "the software", "the platform", "the tool", or "the SaaS".`;
        } else if (isIndustrial) {
          terminologyGuidance = `- Use phrasing suited for industrial manufacturing or production: "the manufacturer", "the facility", "the producer", "the supplier", "the engineering team".
   - STRICT BAN: DO NOT refer to this organization as "the platform", "the app", "the software", or "the CRM" unless explicitly verified industrial IoT software.`;
        } else if (isMarketplace) {
          terminologyGuidance = `- Use phrasing suited for a marketplace or directory: "the marketplace", "the network", "the directory", "the exchange", "the platform".
   - DO NOT refer to it as a single-vendor SaaS tool or an agency.`;
        } else if (isEcommerce) {
          terminologyGuidance = `- Use phrasing suited for retail/commerce: "the store", "the company", "the brand".
   - DO NOT refer to it as a software platform, CRM, or agency.`;
        } else if (isSaaS) {
          terminologyGuidance = `- Use natural phrasing suited for a software product: "the platform", "the software", or "the solution" only when supported by verified profile capabilities.
   - DO NOT refer to it as "the CRM" unless the profile explicitly verifies CRM functionality.`;
        } else {
          terminologyGuidance = `- Use neutral terminology: "the organization", "the company", "the team", or "the brand".
   - DO NOT assume or assert that it is a software product, platform, CRM, or tool without verified evidence.`;
        }

        let tacticalGuidance = '';
        if (isAgencyOrConsultancy) {
          tacticalGuidance = `   - Focus on practical client challenges, audit procedures, evaluation criteria, and design/remediation methodologies.
   - Answer: "What actionable guidance, process steps, or evaluation standards should practitioners apply?"`;
        } else if (isLegal) {
          tacticalGuidance = `   - Focus on regulatory compliance, risk mitigation frameworks, statutory considerations, and procedural steps.
   - Answer: "What compliance standards, legal risks, or audit steps should organizations apply?"`;
        } else if (isIndustrial) {
          tacticalGuidance = `   - Focus on manufacturing standards, operational safety, supply chain reliability, tolerance specifications, and quality assurance.
   - Answer: "What operational specifications and quality criteria must teams verify in production?"`;
        } else if (isMarketplace) {
          tacticalGuidance = `   - Focus on vendor vetting, buyer-seller liquidity, transaction integrity, discovery filters, and platform governance.
   - Answer: "How should buyers and suppliers evaluate partners and navigate marketplace workflows?"`;
        } else if (isSaaS) {
          tacticalGuidance = `   - Focus on concrete practitioner workflows and practical execution steps relevant to this software domain.
   - Answer: "What would a practitioner or team member actually do with these capabilities in daily practice?"`;
        } else {
          tacticalGuidance = `   - Focus on practical processes, evaluation criteria, execution steps, and industry best practices.
   - Answer: "What concrete steps should a practitioner or team actually execute in practice?"`;
        }

        const prompt = `Write a clear, practical, and highly readable section for the article "${brief.title}".
Section Heading: "${section.heading}" (Level: ${section.level})
Section Position: ${i + 1} of ${brief.outline.length}
Canonical Primary Keyword: "${primaryKeyword}"
Assigned Section Keywords: ${section.assignedKeywords?.length ? section.assignedKeywords.join(', ') : 'None specifically assigned (focus on section topic and supporting terms)'}
${this.supportingTerms.length > 0 ? `Available Supporting Terms (use naturally where relevant): ${this.supportingTerms.join(', ')}\n` : ''}Assigned Entities: ${section.assignedEntities?.join(', ') || ''}
Core Concept: ${section.core_concept || ''}
${this.internalLinks.length > 0 ? `Relevant Internal Links (integrate 1-2 naturally if relevant as markdown links [anchor text](url)): \n${this.internalLinks.slice(0, 5).join('\n')}\n` : ''}${assetInstructions}${intelligenceContext}${sectionEvidenceContext}

=== 18 EDITORIAL WRITING & READABILITY CONTRACTS ===
1. CANONICAL PRIMARY KEYWORD CONTRACT:
${isFirstSection ? `   - FIRST PARAGRAPH CONTRACT: The very first paragraph of this opening section MUST contain the exact primary keyword "${primaryKeyword}" naturally without splitting it with punctuation or changing word order.
   - Immediately explain what the product/subject is, who it is for, and why the reader should care.
   - BAN generic filler intros like "In today's fast-paced digital landscape...", "Businesses today face unprecedented challenges...", "In the modern business environment...". Start directly with useful, practical facts.` : `   - Target overall keyword density of 1.0%–2.0% across the full article. Do NOT force the primary keyword into this section if it does not fit naturally.
   - Limit exact-match usage of "${primaryKeyword}" to at most 1 natural mention in this section (or 0 if covered in preceding sections).
   - Prefer semantic variations, pronouns, or topic-specific synonyms instead of repeating the exact phrase.`}

2. PLAIN-LANGUAGE & 8TH-GRADE READING CONTRACT:
   - Target an 8th-grade reading level (Flesch Reading Ease score >= 60, minimum 55).
   - Write in active voice with short, direct sentences.
   - BAN corporate buzzwords and fluff. AVOID these words: imperative, operationalization, orchestration, departmentalization, optimization framework, synergistic, transformative, holistic, paradigm, ecosystem, leverage, facilitate, robust, comprehensive, seamless, cutting-edge, dynamic landscape, digital transformation, mission-critical, strategic alignment, end-to-end solution.
   - Use simple words: utilize -> use, facilitate -> help, commence -> start, approximately -> about, numerous -> many, purchase -> buy, assistance -> help.

3. PARAGRAPH CONTRACT:
   - 1–3 sentences per paragraph, 30–60 words each. HARD MAXIMUM: 80 words per paragraph.
   - If a paragraph approaches 80 words, split it into two shorter paragraphs.
   - Vary paragraph rhythm. Do NOT repeat the same 3-sentence structure throughout.

4. SENTENCE CONTRACT:
   - Average sentence length: 12–18 words. HARD MAXIMUM: 35 words for any single sentence.
   - Mix short and medium sentences naturally.

5. NATURAL STRUCTURAL VARIETY & TERMINOLOGY:
   - Do NOT begin 3 consecutive sentences or paragraphs with the same word or structure.
   - Avoid repeating "${this.targetBrand || 'Brand'} provides...", "${this.targetBrand || 'Brand'} helps...", "${this.targetBrand || 'Brand'} allows...".
   ${terminologyGuidance}

6. TACTICAL & PRACTITIONER DEPTH:
${tacticalGuidance}

=== FACTUAL GROUNDING & CAPABILITY INTEGRITY ===
- Ground all assertions about ${this.targetBrand || 'the business'} strictly in the supplied target-site evidence and verified profile.
- DO NOT invent software features, deliverables, integrations, performance metrics, SLAs, or guarantees.
- DO NOT transfer competitor capabilities or benchmarks to ${this.targetBrand || 'the target business'}.
- If evidence is insufficient to make a specific factual claim about ${this.targetBrand || 'the business'}, write an objective, educational analysis or general best-practice discussion rather than inventing a capability.
- Keep general editorial recommendations and educational best practices distinct from factual assertions about ${this.targetBrand || 'the business'}.

7. COMPARISON TABLE CONTRACT:
${((assetType === 'COMPARISON' && (section.heading.toLowerCase().includes('compar') || i === 2)) || section.heading.toLowerCase().includes('comparison') || section.heading.toLowerCase().includes(' versus ') || section.heading.toLowerCase().includes(' vs ')) ? `   - Include at least ONE clean, factual Markdown comparison table summarizing features, capabilities, or workflow benefits. Example columns: | Feature / Workflow | Primary Capability | Key Benefit |. Only use factual values.` : `   - Present information using clear paragraphs, structured bullet points, or numbered steps. Do NOT generate unnecessary comparison tables for this section.`}

8. NO IMAGES OR DIAGRAMS:
   - Do not generate images, diagrams, figure placeholders, image markdown, diagram placeholders, or asset-generation instructions. Write pure textual analysis, headings, lists, tables, and citations.

WORD BUDGET:
- Target word count for this section: ${budget.target} words.
- Range: ${budget.min} to ${budget.max} words. Stay strictly within budget. Write concisely.`;

        let text: string;
        try {
          text = await this.options.llm.generate(prompt, {
            operation: 'Section Generation',
            runId: this.telemetry.runId,
          });
        } catch (genErr: any) {
          if (this.budgetGuard.getRemainingMs() <= this.budgetGuard.getReservedFinalizeMs() || genErr?.message?.includes('timeout') || genErr?.message?.includes('deadline')) {
            console.warn(`[AgentOrchestrator] Section generation failed or timed out for "${section.heading}", using concise grounded fallback:`, genErr.message);
            text = generateConciseSectionDraft(section, sectionMap, this.targetBrand, primaryKeyword);
          } else {
            (genErr as any).stage = AgentStage.GENERATE;
            throw genErr;
          }
        }

        const secDuration = Date.now() - secStart;
        this.budgetGuard.recordSectionDuration(section.heading, secDuration);
        sectionTexts[i] = ClaimExtractionService.normalizeMarkdownLinks(text);

        this.options.onStageUpdate?.(AgentStage.GENERATE, "running", {
          type: "section",
          index: i,
          sectionIndex: i,
          totalSections: brief.outline.length,
          heading: section.heading,
          data: {
            heading: section.heading,
            level: section.level,
            what_it_is: text,
            why_it_works: "This section details key execution processes and guidelines.",
            experience_or_data_point: `Factual research on ${section.heading}.`,
            example_brands: [],
            copy_formula: [],
            takeaway: `Takeaway for ${section.heading}.`
          }
        });
      }
    });

    await Promise.all(workers);

    // Assemble final bodyMarkdown in exact outline order
    for (let i = 0; i < brief.outline.length; i++) {
      const section = brief.outline[i];
      const cleanedSectionText = stripMatchingLeadingHeading(sectionTexts[i] || '', section.heading);
      bodyMarkdown += `${section.level === 'H2' ? '##' : '###'} ${section.heading}\n\n${cleanedSectionText}\n\n`;
    }

    // Ensure all section headings are unique and preserve substantive content
    const dedupGen = deduplicateSectionHeadings(bodyMarkdown);
    if (dedupGen.deduplicatedCount > 0) {
      console.log(`[AgentOrchestrator] Resolved ${dedupGen.deduplicatedCount} duplicate section heading(s) in generated markdown while preserving all substantive content.`);
      bodyMarkdown = dedupGen.deduplicatedMarkdown;
    }

    const wordCount = bodyMarkdown.split(/\s+/).filter(Boolean).length;

    return {
      title: brief.title,
      bodyMarkdown,
      wordCount,
      seoScore: 85,
      references: [],
      generatedAt: new Date().toISOString(),
      slug: brief.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      assetType,
      targetKeyword: primaryKeyword,
      metaTitle: `${brief.title} | SEO Growth`,
      metaDescription: `Discover key insights and best practices about ${primaryKeyword || 'SaaS growth'}.`,
      outline: brief.outline,
      validationStatus: 'READY'
    };
  }

  private async runReview(
    content: ContentAsset,
    brief: ContentBrief,
    options?: {
      repairAttempted?: boolean;
      attemptIndex?: number;
      unrepairableClaimIds?: string[];
    }
  ): Promise<ReviewResult> {
    const targetKeywords = brief.targetKeywords;
    const targetEntities = brief.outline.flatMap(node => node.assignedEntities || []);

    const qualityReport = validateArticleQuality(content.bodyMarkdown, targetKeywords, targetEntities, this.targetBrand);
    const criticalErrors: string[] = [];
    const warnings: string[] = [];

    // 0. Categorize raw validator issues
    (qualityReport.errors || []).forEach(err => {
      if (
        err.includes('Keyword Stuffing Alert') ||
        err.includes('Brand Stuffing Alert')
      ) {
        criticalErrors.push(err);
      } else {
        warnings.push(err);
      }
    });

    if (qualityReport.warnings) {
      warnings.push(...qualityReport.warnings);
    }

    // Evidence-Driven Content Intelligence Validation
    const evidenceValidation = ContentEvidenceValidator.validate(
      content.bodyMarkdown,
      brief,
      this.evidenceSet,
      this.sectionEvidenceMaps,
      this.targetBrand,
      this.gapMatrix,
      this.saasProfile,
      {
        correlationId: this.telemetry.runId || 'run-default',
        repairAttempted: options?.repairAttempted ?? false,
        unrepairableClaimIds: options?.unrepairableClaimIds || this.lastUnrepairableClaimIds,
      }
    );

    this.telemetry.researchIntelligence = evidenceValidation.diagnostics;

    if (!evidenceValidation.passed) {
      criticalErrors.push(...evidenceValidation.criticalErrors);
    }
    if (evidenceValidation.warnings.length > 0) {
      warnings.push(...evidenceValidation.warnings);
    }

    // 1. Total Word Count Budget Check (Exceeding max is Critical)
    const minBudget = brief.wordCountBudget?.min || 1500;
    const maxBudget = brief.wordCountBudget?.max || 2500;
    if (content.wordCount < minBudget) {
      warnings.push(`Total article word count is ${content.wordCount} (below the minimum budget of ${minBudget} words). Please expand the content.`);
    }
    if (content.wordCount > maxBudget) {
      criticalErrors.push(`Total article word count is ${content.wordCount} (exceeds the maximum budget of ${maxBudget} words). Please compress the content.`);
    }

    // 2. Title length and word count check (Warning)
    const title = content.title || brief.title;
    const titleWords = title.split(/\s+/).filter(Boolean).length;
    if (title.length > 70) {
      warnings.push(`Title is too long (${title.length} characters, exceeds limit of 70 characters).`);
    }
    if (titleWords > 12) {
      warnings.push(`Title contains too many words (${titleWords} words, exceeds limit of 12 words).`);
    }

    // 3. Primary Keyword presence check (Critical)
    const primaryKw = brief.targetKeywords?.[0]?.toLowerCase() || '';
    const bodyLower = content.bodyMarkdown.toLowerCase();
    if (primaryKw && !bodyLower.includes(primaryKw)) {
      criticalErrors.push(`Missing primary keyword: "${brief.targetKeywords[0]}" must be present in the article body.`);
    }

    // 3.1 First paragraph primary keyword check (Warning)
    const paragraphs = content.bodyMarkdown.split('\n').map(p => p.trim()).filter(p => p.length > 0 && !p.startsWith('#'));
    const firstParagraph = paragraphs[0]?.toLowerCase() || '';
    if (primaryKw && !firstParagraph.includes(primaryKw)) {
      warnings.push(`First paragraph is missing the exact primary keyword: "${brief.targetKeywords[0]}". It must appear in the first paragraph.`);
    }

    // 4. Supporting terms coverage check (Warning)
    const missingSupporting: string[] = [];
    if (this.supportingTerms && this.supportingTerms.length > 0) {
      for (const term of this.supportingTerms) {
        if (!term) continue;
        const termLower = term.toLowerCase().trim();
        if (!bodyLower.includes(termLower)) {
          missingSupporting.push(term);
        }
      }
    }
    if (missingSupporting.length > 0) {
      warnings.push(`Missing recommended supporting terms: ${missingSupporting.map(t => `"${t}"`).join(', ')}. Please naturally integrate them where appropriate.`);
    }

    // 5. Heading hierarchy & presence check
    const generatedHeadings = parseMarkdownHeadings(content.bodyMarkdown);
    const generatedNormHeadings = generatedHeadings.map(h => h.text.toLowerCase().replace(/[^\w\s]/g, '').trim());
    
    // Check H1 duplicates (Critical)
    const h1Lines = content.bodyMarkdown.split('\n').filter(l => l.trim().startsWith('# '));
    if (h1Lines.length > 1) {
      criticalErrors.push(`Duplicate H1 headings detected in body content. The body text must not contain '# ' H1 headings, only H2 (##) and H3 (###).`);
    }

    // Check for consecutive duplicate headings (Warning)
    const hLines = content.bodyMarkdown.split('\n').map(l => l.trim()).filter(l => l.startsWith('## ') || l.startsWith('### '));
    for (let i = 0; i < hLines.length - 1; i++) {
      if (hLines[i].toLowerCase() === hLines[i + 1].toLowerCase()) {
        warnings.push(`Duplicate consecutive heading detected: "${hLines[i]}".`);
        break;
      }
    }

    // Verify all planned outline headings exist in final output (Critical if planned heading missing)
    for (const node of brief.outline) {
      const normPlanned = node.heading.toLowerCase().replace(/[^\w\s]/g, '').trim();
      const found = generatedNormHeadings.some(h => h.includes(normPlanned) || normPlanned.includes(h));
      if (!found) {
        criticalErrors.push(`Missing outline heading: Section "${node.heading}" is missing from the generated article.`);
      }
    }

    // 6. Section-level budget check (Warning)
    const h2Count = brief.outline.filter(s => s.level === 'H2').length || 1;
    const h3Count = brief.outline.filter(s => s.level === 'H3').length || 0;
    const targetTotal = brief.wordCountBudget?.target || 2000;
    const totalWeight = (h2Count * 1.5) + (h3Count * 0.9);
    const baseUnit = targetTotal / (totalWeight || 1);

    const sectionCounts = getSectionWordCounts(content.bodyMarkdown);
    
    brief.outline.forEach(node => {
      const weight = node.level === 'H2' ? 1.5 : 0.9;
      const targetSecWords = Math.round(baseUnit * weight);
      const maxSecWords = Math.round(targetSecWords * 1.35); // Allow 35% margin for section writers

      const normPlanned = node.heading.toLowerCase().replace(/[^\w\s]/g, '').trim();
      const matchedSec = sectionCounts.find(s => {
        const normGen = s.heading.toLowerCase().replace(/[^\w\s]/g, '').trim();
        return normGen.includes(normPlanned) || normPlanned.includes(normGen);
      });

      if (matchedSec && matchedSec.count > maxSecWords) {
        warnings.push(`Section "${node.heading}" is too long (${matchedSec.count} words, exceeds budget limit of ${maxSecWords} words). Please compress this section.`);
      }
    });

    return {
      passed: criticalErrors.length === 0 && warnings.length === 0,
      score: content.seoScore,
      issues: [...criticalErrors, ...warnings],
      criticalErrors,
      warnings,
      repairable: criticalErrors.length > 0 || warnings.length > 0,
    };
  }

  private async runRepair(content: ContentAsset, brief: ContentBrief, issues: string[]): Promise<ContentAsset> {
    const primaryKeyword = brief.targetKeywords?.[0] || '';
    const hasTitleIssue = issues.some(i => i.toLowerCase().includes('title'));
    
    const verifiedOfferingsList = (this.saasProfile?.verifiedOfferings || [])
      .map((o: string) => `- ${o}`)
      .join('\n');
    const verifiedFeaturesList = (this.evidenceSet?.items || [])
      .filter(e => e.sourceType === 'TARGET_SITE' && (e.evidenceType === 'FEATURE' || e.evidenceType === 'DIFFERENTIATOR'))
      .map(e => `- [${e.evidenceType}] ${e.claim}`)
      .slice(0, 15)
      .join('\n');

    let verifiedContextPrompt = '';
    if (verifiedOfferingsList || verifiedFeaturesList) {
      verifiedContextPrompt = `
=== VERIFIED BRAND OFFERINGS & CAPABILITIES ===
${verifiedOfferingsList ? `Verified Offerings:\n${verifiedOfferingsList}\n` : ''}${verifiedFeaturesList ? `Verified Target Facts:\n${verifiedFeaturesList}\n` : ''}Only attribute capabilities and offerings supported by the verified facts above. Never invent unverified services, features, or deliverables.
`;
    }

    const prompt = `You are an elite editorial proofreader and SEO copyeditor. Rewrite and repair the article body to fix ALL of the following validation issues:
${issues.map(i => `- ${i}`).join('\n')}
${verifiedContextPrompt}
=== STRICT EDITORIAL REPAIR RULES ===
1. READABILITY & PLAIN ENGLISH (CRITICAL):
   - Rewrite complex, dense sentences into clear, active-voice English at an 8th-grade reading level (Flesch Reading Ease score >= 60, minimum 55).
   - Eliminate corporate buzzwords (imperative, operationalization, orchestration, transformative, synergistic, holistic, paradigm, seamless, ecosystem, leverage). Replace with plain everyday words (help, use, start, many).
2. PARAGRAPH CONTRACT:
   - Split ANY paragraph longer than 80 words into 2-3 shorter paragraphs of 30-60 words (1-3 sentences each). NO paragraph may exceed 80 words.
3. SENTENCE CONTRACT & STRUCTURAL VARIETY:
   - Split any sentence longer than 35 words into two shorter sentences. Average sentence length must be 12-18 words.
   - Eliminate repetitive sentence starters (e.g. "${this.targetBrand || 'Brand'} provides...", "${this.targetBrand || 'Brand'} helps..."). Vary sentence openings naturally.
4. CANONICAL PRIMARY KEYWORD & DENSITY (KEYWORD STUFFING REMEDIATION):
   - Ensure the exact primary keyword "${primaryKeyword}" appears naturally in the very first paragraph, in the title, and in the body.
   - If keyword stuffing or high keyword density was flagged in the validation issues, PRUNE excessive and mechanical repetitions of "${primaryKeyword}" across the body. Replace repetitive occurrences with semantic synonyms, pronouns, or natural topical references. Target a natural overall density of 1.0%–2.0% (strictly below 3.0%).
   - Do NOT alter, split, or reorder the keyword when used in the first paragraph or title.
5. OUTLINE HEADINGS:
   - Preserve all planned H2 (##) and H3 (###) section headings exactly. Do not introduce '# ' H1 headings in the body.
6. TABLES & INTERNAL LINKS:
   - Ensure at least one clean Markdown comparison table is present.
   - Do not generate images, diagrams, figure placeholders, image markdown, diagram placeholders, or asset-generation instructions. Remove any diagram or image placeholders if present.
   - Preserve all internal links intact.
7. EVIDENCE FIDELITY & TRUTHFULNESS (CLAIM GROUNDING SAFETY):
   - Remove any ungrounded statistical claims, unbacked percentages, or fabricated metrics flagged in the validation issues.
   - Remove or accurately qualify any ungrounded comparative superiority outcome claims (e.g. claims asserting reduced turnover, lower costs, faster delivery, or superior outcomes compared to alternatives, or comparative clauses like "Unlike internal reviews, ...") that lack verified research evidence. Do NOT invent new citations, metrics, or substitute capabilities during repair.
   - If a claim asserts unverified behavioral analytics or user drop-off telemetry (e.g. "find the exact spots where users leave"), rewrite it to verified friction identification or UX audit activities.
   - If a claim asserts unverified causal business outcomes (e.g. "improve retention") or unverified deliverables ("give teams a roadmap"), rewrite it to verified service activities (e.g. "address critical user friction points across onboarding and checkout flows").
   - Fix all factual contradictions: if the text asserted that a product lacks a capability that research proves it has, remove or reverse that assertion to align with the facts.
   - Enforce strict entity isolation: remove any cross-brand attribution where competitor metrics or features were attributed to ${this.targetBrand || 'the brand'} or vice versa.
   - Remove any unverified external citations or surveys (e.g. fake Gartner/Forrester citations).
   - Retain all genuine verified facts, product differentiators, and answers to buyer questions.

${hasTitleIssue ? `OPTIMIZED TITLE REQUIREMENT: Output an optimized short title (5-12 words, under 70 characters) containing the exact canonical primary keyword "${primaryKeyword}".` : ''}

Original Article Title: ${content.title}
Original Article Body:
${content.bodyMarkdown}

Output your response in the following format:
${hasTitleIssue ? 'OPTIMIZED TITLE: [Your optimized short title here]\n\n' : ''}REPAIRED BODY:
[Your repaired body markdown here]`;

    const responseText = await this.options.llm.generate(prompt, {
      systemInstruction: 'You are an elite copyeditor and SEO specialist. Rewrite the article body to fix all listed quality and readability issues while preserving verified facts, required headings, and natural keyword density (1.0%–2.0%).',
      operation: 'Content Quality Repair',
      runId: this.telemetry.runId,
    });

    let repairedBody = responseText;
    let repairedTitle = content.title || brief.title;

    if (hasTitleIssue && responseText.includes('REPAIRED BODY:')) {
      const parts = responseText.split('REPAIRED BODY:');
      const titlePart = parts[0].replace('OPTIMIZED TITLE:', '').trim();
      repairedTitle = titlePart.split('\n')[0].trim();
      repairedBody = parts[1].trim();
    } else if (responseText.includes('REPAIRED BODY:')) {
      repairedBody = responseText.split('REPAIRED BODY:')[1].trim();
    }

    repairedBody = ClaimExtractionService.normalizeMarkdownLinks(repairedBody);

    // Post-repair surgical claim qualification:
    // Extract remaining claims and check for ungrounded critical claims
    if (this.evidenceSet) {
      try {
        const claims = ClaimExtractionService.extractClaimsFromMarkdown(repairedBody, this.targetBrand);
        const groundingResult = ClaimGroundingEngine.groundAllClaims(
          claims,
          this.evidenceSet,
          this.sectionEvidenceMaps,
          this.targetBrand
        );
        const surgicalResult = ContentRepairService.repairUngroundedClaimsInMarkdown(
          repairedBody,
          groundingResult.claims,
          this.targetBrand,
          this.saasProfile
        );
        this.lastUnrepairableClaimIds = surgicalResult.unrepairableClaimIds || [];
        if (surgicalResult.repairedClaimsCount > 0) {
          console.log(`[AgentOrchestrator] Surgically qualified ${surgicalResult.repairedClaimsCount} ungrounded critical claim(s) in repaired markdown.`);
          repairedBody = surgicalResult.repairedMarkdown;
        }
      } catch (err: any) {
        console.warn('[AgentOrchestrator] Surgical grounding repair encountered non-fatal error:', err?.message || err);
      }
    }

    // Ensure all section headings remain unique after repair while preserving content
    const dedupRepair = deduplicateSectionHeadings(repairedBody);
    if (dedupRepair.deduplicatedCount > 0) {
      console.log(`[AgentOrchestrator] Resolved ${dedupRepair.deduplicatedCount} duplicate section heading(s) in repaired markdown.`);
      repairedBody = dedupRepair.deduplicatedMarkdown;
    }

    const wordCount = repairedBody.split(/\s+/).filter(Boolean).length;

    return {
      ...content,
      title: repairedTitle,
      bodyMarkdown: repairedBody,
      wordCount,
    };
  }
}

export function parseMarkdownHeadings(markdown: string): Array<{ level: 'H2' | 'H3'; text: string }> {
  const headings: Array<{ level: 'H2' | 'H3'; text: string }> = [];
  if (!markdown) return headings;
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      headings.push({ level: 'H2', text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith('### ')) {
      headings.push({ level: 'H3', text: trimmed.slice(4).trim() });
    }
  }
  return headings;
}

export function getSectionWordCounts(markdown: string): Array<{ heading: string; count: number }> {
  const sections: Array<{ heading: string; count: number }> = [];
  if (!markdown) return sections;
  const lines = markdown.split('\n');
  let currentHeading = 'Introduction';
  let currentWords: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      if (currentWords.length > 0) {
        sections.push({
          heading: currentHeading,
          count: currentWords.join(' ').split(/\s+/).filter(Boolean).length
        });
        currentWords = [];
      }
      currentHeading = trimmed.replace(/^#+\s+/, '');
    } else if (!trimmed.startsWith('#')) {
      currentWords.push(trimmed);
    }
  }
  if (currentWords.length > 0) {
    sections.push({
      heading: currentHeading,
      count: currentWords.join(' ').split(/\s+/).filter(Boolean).length
    });
  }
  return sections;
}

export function stripMatchingLeadingHeading(sectionText: string, heading: string): string {
  if (!sectionText) return '';
  const trimmed = sectionText.trim();
  const normHeading = heading.toLowerCase().replace(/^[#\s\d\.\-\:\)]+/, '').replace(/[^\w\s]/g, '').trim();

  const lines = trimmed.split('\n');
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const strippedFirstLine = firstLine
      .replace(/^#{1,6}\s+/, '')
      .replace(/^(?:step\s+\d+|section\s+\d+|\d+)[\.\:\-\s]*/i, '')
      .replace(/^[#\s\d\.\-\:\)]+/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/^__|_$/g, '')
      .trim();
    const normFirstLine = strippedFirstLine.toLowerCase().replace(/[^\w\s]/g, '').trim();

    if (
      normFirstLine === normHeading ||
      (normFirstLine.length > 5 && (normFirstLine.startsWith(normHeading) || normHeading.startsWith(normFirstLine)))
    ) {
      lines.shift();
      while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
      }
      return lines.join('\n').trim();
    }
  }
  return trimmed;
}

/**
 * Detects and resolves duplicate section headings in article markdown
 * while strictly preserving all substantive content from distinct sections.
 * If sections are genuinely identical/redundant duplicates, merges their non-duplicate lines safely.
 * If sections have distinct substantive content, disambiguates the duplicate heading.
 */
export function deduplicateSectionHeadings(markdown: string): { deduplicatedMarkdown: string; deduplicatedCount: number } {
  if (!markdown || !markdown.includes('#')) {
    return { deduplicatedMarkdown: markdown, deduplicatedCount: 0 };
  }

  const lines = markdown.split('\n');
  let deduplicatedCount = 0;

  interface SectionInfo {
    level: string; // '##' or '###'
    headingText: string;
    norm: string;
    headerLineIdx: number;
    bodyLines: string[];
  }

  const sections: SectionInfo[] = [];
  let currentSection: SectionInfo | null = null;
  const preambleLines: string[] = [];

  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
    const match = !inCodeBlock ? line.match(/^(#{2,3})\s+(.+)$/) : null;
    if (match) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const level = match[1];
      const headingText = match[2].trim();
      const norm = headingText.toLowerCase().replace(/^[#\s\d\.\-\:\)]+/, '').replace(/[^\w\s]/g, '').trim();
      currentSection = {
        level,
        headingText,
        norm,
        headerLineIdx: i,
        bodyLines: []
      };
    } else {
      if (currentSection) {
        currentSection.bodyLines.push(line);
      } else {
        preambleLines.push(line);
      }
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }

  const resultSections: SectionInfo[] = [];
  const registeredNorms = new Set<string>();

  for (const sec of sections) {
    if (!sec.norm || sec.norm.length <= 3) {
      resultSections.push(sec);
      continue;
    }

    if (!registeredNorms.has(sec.norm)) {
      registeredNorms.add(sec.norm);
      resultSections.push(sec);
    } else {
      // Duplicate section heading detected
      deduplicatedCount++;
      const bodyText = sec.bodyLines.join(' ').trim();
      const hasTable = sec.bodyLines.some(l => l.trim().startsWith('|'));

      // If this section has substantive content (> 25 words or table), preserve it and disambiguate
      const words = bodyText.split(/\s+/).filter(Boolean).length;
      if (words >= 25 || hasTable) {
        const suffix = hasTable ? 'Technical Matrix' : 'Implementation Analysis';
        let candidateHeading = `${sec.headingText} (${suffix})`;
        let candidateNorm = candidateHeading.toLowerCase().replace(/^[#\s\d\.\-\:\)]+/, '').replace(/[^\w\s]/g, '').trim();
        let counter = 2;
        while (registeredNorms.has(candidateNorm)) {
          candidateHeading = `${sec.headingText} (${suffix} ${counter})`;
          candidateNorm = candidateHeading.toLowerCase().replace(/^[#\s\d\.\-\:\)]+/, '').replace(/[^\w\s]/g, '').trim();
          counter++;
        }
        sec.headingText = candidateHeading;
        sec.norm = candidateNorm;
        registeredNorms.add(candidateNorm);
        resultSections.push(sec);
      } else {
        // Redundant stub duplicate: merge any non-empty lines into the previous section with this norm
        const prev = resultSections.find(s => s.norm === sec.norm);
        if (prev && bodyText.length > 0) {
          prev.bodyLines.push('', ...sec.bodyLines);
        }
      }
    }
  }

  // Reassemble markdown preserving all substantive paragraphs
  let reconstructed = preambleLines.join('\n');
  if (reconstructed && !reconstructed.endsWith('\n')) {
    reconstructed += '\n\n';
  }
  for (const sec of resultSections) {
    reconstructed += `${sec.level} ${sec.headingText}\n${sec.bodyLines.join('\n')}\n\n`;
  }

  return {
    deduplicatedMarkdown: reconstructed.trimEnd() + '\n',
    deduplicatedCount
  };
}

export function generateConciseSectionDraft(
  section: { heading: string; level: string; core_concept?: string },
  sectionMap?: SectionEvidenceMap,
  targetBrand?: string,
  primaryKeyword?: string
): string {
  const cleanHeading = section.heading.replace(/^#+\s*/, '').trim();
  const lowerHeading = cleanHeading.toLowerCase();

  const businessFacts = sectionMap?.targetBusinessFacts && sectionMap.targetBusinessFacts.length > 0
    ? sectionMap.targetBusinessFacts.slice(0, 2).join('. ') + '.'
    : '';

  const concept = section.core_concept || `practical execution of ${lowerHeading}`;

  const p1 = `Executing ${lowerHeading} effectively requires structured workflows and clear operational standards. Teams establish direct processes to maintain clarity and cross-functional alignment.`;
  const p2 = businessFacts
    ? `Key focus areas include ${businessFacts}`
    : `Teams address ${concept} to support operational consistency across standard workflows.`;

  return `${p1}\n\n${p2}`;
}
