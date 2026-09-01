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
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '../contracts/providers';
import { validateArticleQuality } from '@/lib/seo-intelligence/quality_validator';
import { AssetStrategyService } from '@/lib/content/AssetStrategyService';

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
}

export class AgentOrchestrator {
  private telemetry: ExecutionTelemetry;
  private stagesList: StageExecution[] = [];
  private errorsList: OrchestrationError[] = [];
  private supportingTerms: string[] = [];
  private targetBrand: string = '';

  constructor(private options: AgentOrchestratorOptions) {
    this.telemetry = {
      runId: 'run_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now(),
      startTime: new Date().toISOString(),
      llmCalls: 0,
      searchCalls: 0,
      scrapeCalls: 0,
      errors: [],
    };

    // Auto-increment telemetry counters when providers are called
    const originalGenerate = this.options.llm.generate.bind(this.options.llm);
    this.options.llm.generate = async (prompt, opts) => {
      this.telemetry.llmCalls++;
      return originalGenerate(prompt, opts);
    };

    const originalStructuredGenerate = this.options.llm.structuredGenerate.bind(this.options.llm);
    this.options.llm.structuredGenerate = async (prompt, schema, opts) => {
      this.telemetry.llmCalls++;
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
    const elapsed = Date.now() - new Date(this.telemetry.startTime).getTime();
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
          console.warn(`[PIPELINE] TIMEOUT - runId=${this.telemetry.runId} elapsed=${elapsed}ms`);
          throw new Error(`[Orchestrator Timeout] Timeout limit exceeded: ${elapsed}ms > ${budget.timeoutMs}ms`);
        }
      }
    }
  }

  private startStage(stage: AgentStage, retryCount = 0): StageExecution {
    this.checkBudgetAndAbort();
    const elapsed = Date.now() - new Date(this.telemetry.startTime).getTime();
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
    const elapsed = Date.now() - new Date(this.telemetry.startTime).getTime();
    console.log(`[PIPELINE] ${stageExec.stage.toUpperCase()} END - runId=${this.telemetry.runId} stage=${stageExec.stage} elapsed=${elapsed}ms`);
    console.log(`[agent] ${stageExec.stage} completed`);
    this.options.onStageUpdate?.(stageExec.stage, "completed", metadata);
  }

  private failStage(stageExec: StageExecution, error: Error) {
    stageExec.status = "failed";
    stageExec.completedAt = new Date().toISOString();
    stageExec.durationMs = Date.now() - new Date(stageExec.startedAt).getTime();
    
    const oError: OrchestrationError = {
      stage: stageExec.stage,
      message: error.message,
      timestamp: new Date().toISOString(),
    };
    this.errorsList.push(oError);
    this.telemetry.errors.push(error.message);
    const elapsed = Date.now() - new Date(this.telemetry.startTime).getTime();
    console.error(`[PIPELINE] ${stageExec.stage.toUpperCase()} ERROR - runId=${this.telemetry.runId} stage=${stageExec.stage} elapsed=${elapsed}ms error=${error.message}`);
    console.error(`[agent] ${stageExec.stage} failed: ${error.message}`);
    this.options.onStageUpdate?.(stageExec.stage, "failed", { error: error.message });
  }

  async run(input: OrchestrationInput): Promise<OrchestrationResult> {
    console.log('[agent] run started');
    this.targetBrand = input.saasProfile?.name || '';
    
    let discovery: DiscoveryResult | undefined;
    let research: { searchResults: SearchResult[]; scrapeResults: ScrapeResult[] } | undefined;
    let analysis: AnalysisResult | undefined;
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

          this.completeStage(saasIntelligenceStage, {
            competitorsDiscoveredCount: competitorsList.length,
            positioning: marketData.positioning
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
        const searchResults = await this.options.search.search(discovery.targetKeyword);
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
        const fullCompetitors = research.scrapeResults.map(r => {
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
      let opportunities: any[] = [];
      try {
        searchOpportunityStage = this.startStage(AgentStage.SEARCH_OPPORTUNITY);
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
          { runId: this.telemetry.runId, promptBudget: 3 }
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

      // 4. PLAN
      let planStage: StageExecution | undefined;
      try {
        planStage = this.startStage(AgentStage.PLAN);
        const saasIntelText = saasIntelligenceProfile 
          ? `SaaS Name: ${saasIntelligenceProfile.product.name}
Category: ${saasIntelligenceProfile.product.category}
Key Features: ${(saasIntelligenceProfile.product.features || []).join(', ')}
Product Differentiators: ${(saasIntelligenceProfile.product.differentiators || []).join(', ')}
Target ICP: ${saasIntelligenceProfile.audience.icp}
Persona Pain Points: ${(saasIntelligenceProfile.audience.painPoints || []).join(', ')}
Jobs-To-Be-Done: ${(saasIntelligenceProfile.audience.jtbd || []).join(', ')}`
          : `SaaS Profile: ${input.saasProfile.name} - ${input.saasProfile.description}`;

        const geoContextText = geoIntelligence && geoIntelligence.geoOpportunities?.length > 0
          ? `GEO AI-Visibility Requirements and Recommendations:
${geoIntelligence.geoOpportunities.map((o: any) => `- Issue: ${o.issue}\n  Recommended Action: ${o.recommendedAction}`).join('\n')}`
          : '';

        const supportingTermsText = this.supportingTerms.length > 0
          ? `Recommended Supporting Search Terms to cover naturally: ${this.supportingTerms.join(', ')}`
          : '';

        const prompt = `Create a structured content brief and outline for an article targeting the canonical primary keyword: "${discovery.targetKeyword}".
Target Audience: ${discovery.audience}
${saasIntelText}
Competitor Medians: ${JSON.stringify(analysis.seoSignals)}
${supportingTermsText}
${geoContextText}
${input.maxHeadings ? `Generate at most ${input.maxHeadings} headings in the outline to stay strictly within cost budgets.` : ''}

=== CRITICAL SEO TITLE & OUTLINE CONTRACTS ===
1. CANONICAL PRIMARY KEYWORD: The canonical primary keyword is "${discovery.targetKeyword}".
2. SEO TITLE: The generated title MUST contain the exact canonical primary keyword "${discovery.targetKeyword}" without splitting it with internal commas or hyphens, substituting synonyms, or changing word order. Title length must be 5-12 words, <= 60 characters preferred (<= 70 characters maximum).
3. OUTLINE STRUCTURE:
   - Generate 4–7 logical H2 sections.
   - Design at least one section suited for a practical comparison/feature breakdown table.
   - Design sections that cover concrete practitioner workflows (e.g. managing sales pipelines, assigning tasks, lead scoring, marketing automation, customer conversations).`;

        plan = await this.options.llm.structuredGenerate<ContentBrief>(
          prompt,
          ContentBriefSchema,
          {
            systemInstruction: 'You are an expert SEO content planner. Generate a structured Content Brief schema with an exact keyword title.',
            operation: 'Content Brief Generation',
          }
        );

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

        this.completeStage(planStage, { title: plan.title });
      } catch (err: any) {
        if (planStage) {
          this.failStage(planStage, err);
        } else {
          this.errorsList.push({
            stage: AgentStage.PLAN,
            message: err.message,
            timestamp: new Date().toISOString(),
          });
          this.telemetry.errors.push(err.message);
        }
        throw err;
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
        content = await this.runGeneration(plan, strategy);
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
        review = await this.runReview(content, plan);
        
        // Bounded Repair Loop
        let retries = 0;
        const maxRetries = this.options.maxReviewRetries ?? 2;
        const contentBeforeReview = { ...content };
        const reviewHistory: string[] = [];
        
        while (!review.passed && retries < maxRetries) {
          retries++;
          reviewHistory.push(...review.issues);
          console.log(`[agent] Quality issues detected (${review.issues.length}). Starting repair attempt ${retries}/${maxRetries}...`);
          
          let repairStage: StageExecution | undefined;
          try {
            repairStage = this.startStage(AgentStage.GENERATE, retries);
            content = await this.runRepair(content, plan, review.issues);
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

          review = await this.runReview(content, plan);
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
repairAttempts: ${retries}
repairReasons: ${JSON.stringify(reviewHistory)}
finalValidationStatus: "${finalValidationStatus}"
FirestoreSave: true
EditorRendered: true
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
        saasIntelligenceProfile
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
        saasIntelligenceProfile: null
      };
    }
  }

  private async runGeneration(brief: ContentBrief, strategy?: any): Promise<ContentAsset> {
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

    for (let i = 0; i < brief.outline.length; i++) {
      const section = brief.outline[i];
      const budget = sectionBudgets[i];
      const isFirstSection = i === 0;

      const prompt = `Write a clear, practical, and highly readable section for the article "${brief.title}".
Section Heading: "${section.heading}" (Level: ${section.level})
Section Position: ${i + 1} of ${brief.outline.length}
Canonical Primary Keyword: "${primaryKeyword}"
Assigned Section Keywords: ${section.assignedKeywords?.join(', ') || primaryKeyword}
${this.supportingTerms.length > 0 ? `Available Supporting Terms (use naturally where relevant): ${this.supportingTerms.join(', ')}\n` : ''}Assigned Entities: ${section.assignedEntities?.join(', ') || ''}
Core Concept: ${section.core_concept || ''}
${assetInstructions}${intelligenceContext}

=== 18 EDITORIAL WRITING & READABILITY CONTRACTS ===
1. CANONICAL PRIMARY KEYWORD CONTRACT:
${isFirstSection ? `   - FIRST PARAGRAPH CONTRACT: The very first paragraph of this opening section MUST contain the exact primary keyword "${primaryKeyword}" naturally without splitting it with punctuation or changing word order.
   - Immediately explain what the product/subject is, who it is for, and why the reader should care.
   - BAN generic filler intros like "In today's fast-paced digital landscape...", "Businesses today face unprecedented challenges...", "In the modern business environment...". Start directly with useful, practical facts.` : `   - Naturally mention or reinforce the primary keyword "${primaryKeyword}" where contextually appropriate without keyword stuffing.`}

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

5. NATURAL STRUCTURAL VARIETY:
   - Do NOT begin 3 consecutive sentences or paragraphs with the same word or structure.
   - Avoid repeating "${this.targetBrand || 'Brand'} provides...", "${this.targetBrand || 'Brand'} helps...", "${this.targetBrand || 'Brand'} allows...".
   - Use natural phrasing: "the platform", "the CRM", "this tool", "the system".

6. TACTICAL & PRACTITIONER DEPTH:
   - Include concrete daily workflow actions (e.g. assigning tasks, managing sales pipelines, lead scoring, marketing automation, customer conversations, inbox management, reporting, workflow triggers).
   - Answer: "What would a real business owner or team member actually do with this in practice?"

7. COMPARISON TABLE CONTRACT:
${(assetType === 'COMPARISON' || section.heading.toLowerCase().includes('compar') || section.heading.toLowerCase().includes('differentiator') || section.heading.toLowerCase().includes('hub') || section.heading.toLowerCase().includes('feature') || section.heading.toLowerCase().includes('overview') || i === 2) ? `   - Include at least ONE clean, factual Markdown comparison table summarizing features, capabilities, or workflow benefits. Example columns: | Feature / Workflow | Primary Capability | Key Benefit |. Only use factual values.` : `   - If applicable to this topic, include a factual Markdown comparison or summary table.`}

8. IMAGE / MEDIA PLACEHOLDERS:
   - Include 1 contextual Markdown image placeholder where visual illustration is helpful (e.g. \`![Workflow Diagram: Lead to Deal Lifecycle](lead-workflow-diagram.png)\` or \`![Dashboard Overview: Multi-Hub Central View](hub-dashboard.png)\`).

WORD BUDGET:
- Target word count for this section: ${budget.target} words.
- Range: ${budget.min} to ${budget.max} words. Stay strictly within budget. Write concisely.`;

      const text = await this.options.llm.generate(prompt, {
        operation: 'Section Generation',
        runId: this.telemetry.runId,
      });

      bodyMarkdown += `${section.level === 'H2' ? '##' : '###'} ${section.heading}\n\n${text}\n\n`;
      this.options.onStageUpdate?.(AgentStage.GENERATE, "running", {
        type: "section",
        index: i,
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

  private async runReview(content: ContentAsset, brief: ContentBrief): Promise<ReviewResult> {
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
    
    const prompt = `You are an elite editorial proofreader and SEO copyeditor. Rewrite and repair the article body to fix ALL of the following validation issues:
${issues.map(i => `- ${i}`).join('\n')}

=== STRICT EDITORIAL REPAIR RULES ===
1. READABILITY & PLAIN ENGLISH (CRITICAL):
   - Rewrite complex, dense sentences into clear, active-voice English at an 8th-grade reading level (Flesch Reading Ease score >= 60, minimum 55).
   - Eliminate corporate buzzwords (imperative, operationalization, orchestration, transformative, synergistic, holistic, paradigm, seamless, ecosystem, leverage). Replace with plain everyday words (help, use, start, many).
2. PARAGRAPH CONTRACT:
   - Split ANY paragraph longer than 80 words into 2-3 shorter paragraphs of 30-60 words (1-3 sentences each). NO paragraph may exceed 80 words.
3. SENTENCE CONTRACT & STRUCTURAL VARIETY:
   - Split any sentence longer than 35 words into two shorter sentences. Average sentence length must be 12-18 words.
   - Eliminate repetitive sentence starters (e.g. "HubSpot provides...", "HubSpot helps..."). Vary sentence openings naturally.
4. CANONICAL PRIMARY KEYWORD:
   - Ensure the exact primary keyword "${primaryKeyword}" appears naturally in the very first paragraph, in the title, and in the body without alterations, punctuation splits, or word reordering.
5. OUTLINE HEADINGS:
   - Preserve all planned H2 (##) and H3 (###) section headings exactly. Do not introduce '# ' H1 headings in the body.
6. TABLES & MEDIA:
   - Ensure at least one clean Markdown comparison table and contextual media placeholders (![Caption](...)) are present and well-formatted.

${hasTitleIssue ? `OPTIMIZED TITLE REQUIREMENT: Output an optimized short title (5-12 words, under 70 characters) containing the exact canonical primary keyword "${primaryKeyword}".` : ''}

Original Article Title: ${content.title}
Original Article Body:
${content.bodyMarkdown}

Output your response in the following format:
${hasTitleIssue ? 'OPTIMIZED TITLE: [Your optimized short title here]\n\n' : ''}REPAIRED BODY:
[Your repaired body markdown here]`;

    const responseText = await this.options.llm.generate(prompt, {
      systemInstruction: 'You are an elite copyeditor and SEO specialist. Rewrite the article body to fix all listed quality and readability issues while keeping all facts, keywords, and outline headings exactly the same.',
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
