// src/lib/core/GenerationPipelineAdapter.ts
import { AgentOrchestrator, AgentStage } from '@/core/orchestrator/AgentOrchestrator';
import { GeminiProvider } from '@/lib/content/GeminiProvider';
import { SerperProvider } from '@/lib/research/SerperProvider';
import { PlaywrightProvider } from '@/lib/research/PlaywrightProvider';
import { LinkQualityEngine } from '@/lib/seo-intelligence/link_quality_engine';
import { SaaSProfile, ContentAsset } from '@/core/contracts/schemas';
import { 
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '@/core/contracts/providers';

// Local Mock Providers for DRY_RUN mode
class DryRunLLMProvider implements LLMProvider {
  async generate(prompt: string, options?: any): Promise<string> {
    return "This is a dry run content generation. We write clean, active voice text. SaaS platforms grow with topical authority.";
  }

  async structuredGenerate<T>(prompt: string, schema: any, options?: any): Promise<T> {
    return {
      title: "Dry Run Outline Title",
      targetKeywords: ["dry run keyword"],
      outline: [
        {
          heading: "Introduction to Dry Run",
          level: "H2",
          assignedKeywords: ["dry run"],
          assignedEntities: ["Test"],
          core_concept: "Mock outline concept"
        }
      ],
      wordCountBudget: { min: 100, max: 500, target: 300 },
      intent: {
        primaryKeyword: "dry run keyword",
        intentType: "Informational",
        contentType: "Guide"
      },
      competitorInsights: []
    } as unknown as T;
  }
}

class DryRunSearchProvider implements SearchProvider {
  async search(query: string, options?: any): Promise<SearchResult[]> {
    return [
      { title: "Dry Run Resource", link: "https://example.com/dry-run", snippet: "Dry run search listing." }
    ];
  }
}

class DryRunScrapeProvider implements ScrapeProvider {
  async scrape(urls: string[], options?: any): Promise<ScrapeResult[]> {
    return urls.map(url => ({
      url,
      title: "Dry Run Page",
      htmlContent: "",
      textContent: "Dry run scraped mock body content.",
      success: true
    }));
  }
}

export interface LegacyPayload {
  title: string;
  targetKeywords?: string;
  referenceData?: any;
  customInsights?: string;
  campaignMode?: string;
  guestPostTargetPublication?: string;
  externalLinks?: any[];
  [key: string]: any;
}

export class GenerationPipelineAdapter {
  static async runPipeline(
    payload: LegacyPayload,
    onProgress: (chunk: any) => void,
    signal?: AbortSignal,
    options?: {
      overrideBudget?: Partial<{
        maxLLMCalls?: number;
        maxSearchCalls?: number;
        maxScrapeCalls?: number;
        timeoutMs?: number;
      }>;
      overrideMaxReviewRetries?: number;
    }
  ): Promise<any> {
    const runId = 'run_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    const startTime = Date.now();
    console.log(`[PIPELINE] REQUEST START - runId=${runId} timestamp=${new Date().toISOString()}`);

    const dryRunEnabled = process.env.ENABLE_DRY_RUN === 'true';
    const primaryKeyword = payload.targetKeywords?.split(',')[0].trim() || payload.title;
    console.log(`[PIPELINE] PAYLOAD VALIDATED - runId=${runId} elapsed=${Date.now() - startTime}ms`);

    console.log(`[Adapter] Initializing pipeline. Dry Run = ${dryRunEnabled}`);
    onProgress({ type: 'status', message: 'Initializing pipeline...', progress: 5 });

    // 1. Run Link Quality Engine (LQE) on input links
    let processedExternalLinks = payload.externalLinks || [];
    if (processedExternalLinks.length > 0) {
      try {
        console.log('[Adapter] Running pre-generation Link Quality Engine...');
        const processed = LinkQualityEngine.process(processedExternalLinks, payload.title, payload.targetKeywords || '');
        processedExternalLinks = processed.map(l => ({
          title: l.entity,
          url: l.canonicalURL
        }));
      } catch (err: any) {
        console.error('[Adapter] LQE Pre-generation Validation Failed:', err.message);
        throw new Error(`Link Quality Engine Validation Failed: ${err.message}`);
      }
    }

    // 2. Select providers based on DRY_RUN mode
    const llm: LLMProvider = dryRunEnabled ? new DryRunLLMProvider() : new GeminiProvider();
    const search: SearchProvider = dryRunEnabled ? new DryRunSearchProvider() : new SerperProvider();
    const scraper: ScrapeProvider = dryRunEnabled ? new DryRunScrapeProvider() : new PlaywrightProvider();
    console.log(`[PIPELINE] PROVIDERS INITIALIZED - runId=${runId} elapsed=${Date.now() - startTime}ms`);
    console.log(`[PIPELINE] ADAPTER START - runId=${runId} elapsed=${Date.now() - startTime}ms`);

    // 3. Build SaaSProfile and inputs
    const saasProfile: SaaSProfile = payload.saasProfile || {
      name: payload.campaignMode === 'guest_post' ? (payload.guestPostTargetPublication || 'Target Publication') : 'Our Blog',
      description: payload.customInsights || 'AI-Powered SaaS Growth and Content Platform.',
      targetAudience: 'SaaS decision makers',
      keyFeatures: [],
      primaryCompetitors: [],
      tone: 'professional',
      customInsights: payload.customInsights || ''
    };

     // 4. Configure Orchestrator with telemetry progress triggers
    const budget = {
      maxLLMCalls: options?.overrideBudget?.maxLLMCalls ?? 25,
      maxSearchCalls: options?.overrideBudget?.maxSearchCalls ?? 5,
      maxScrapeCalls: options?.overrideBudget?.maxScrapeCalls ?? 5,
      timeoutMs: options?.overrideBudget?.timeoutMs ?? 600000 // 10 minutes timeout
    };

    const orchestrator = new AgentOrchestrator({
      llm,
      search,
      scraper,
      budget,
      maxReviewRetries: options?.overrideMaxReviewRetries ?? 2,
      signal,
      onStageUpdate: (stage, status, metadata) => {
        if (stage === AgentStage.GENERATE && status === 'running' && !metadata?.repaired) {
          console.log('[PHASE10] GENERATION START');
        }
        if (stage === AgentStage.GENERATE && status === 'completed') {
          console.log('[PHASE10] GENERATION COMPLETE');
        }
        if (stage === AgentStage.REVIEW && status === 'completed') {
          console.log('[PHASE10] REVIEW COMPLETE');
        }

        if (metadata?.type === 'section') {
          onProgress(metadata);
          return;
        }
        let progress = 5;
        let msg = '';

        switch (stage) {
          case AgentStage.DISCOVER:
            progress = 10;
            msg = 'Classifying intent and discover parameters...';
            break;
          case AgentStage.RESEARCH:
            progress = 20;
            msg = 'Fetching competitor keywords and organic URLs...';
            break;
          case AgentStage.ANALYZE:
            progress = 30;
            msg = 'Evaluating SEO content gaps and competitor medians...';
            break;
          case AgentStage.SEARCH_OPPORTUNITY:
            progress = 40;
            msg = 'Identifying search opportunities and SERP landscape...';
            break;
          case AgentStage.GEO_INTELLIGENCE:
            progress = 50;
            msg = 'Evaluating GEO / AI search engine visibility and citations...';
            break;
          case AgentStage.PLAN:
            progress = 60;
            msg = 'Generating article outline blueprint...';
            if (status === 'completed' && metadata?.title) {
              onProgress({
                type: 'outline',
                data: {
                  title: metadata.title,
                  title_tag: `${metadata.title} | SEO Guide`,
                  slug: metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  section_outlines: []
                },
                progress: 60
              });
            }
            break;
          case AgentStage.GENERATE:
            progress = 70;
            msg = 'Writing section drafts concurrently...';
            break;
          case AgentStage.REVIEW:
            progress = 90;
            msg = 'Performing readability and grammar quality check...';
            break;
          case AgentStage.RETURN:
            progress = 100;
            msg = 'Finalizing content asset...';
            break;
        }

        onProgress({ type: 'status', message: `${msg} (${status})`, progress });
      }
    });

    // 5. Run Orchestration
    console.log(`[PIPELINE] ORCHESTRATOR START - runId=${runId} elapsed=${Date.now() - startTime}ms`);
    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: primaryKeyword,
      targetAudience: payload.targetAudience || 'SaaS Decision Makers',
      contentType: payload.contentType || undefined,
      competitorUrls: payload.referenceData?.url ? [payload.referenceData.url] : [],
      maxHeadings: payload.maxHeadings ?? (options?.overrideBudget?.maxLLMCalls ? 2 : undefined)
    });

    if (!result.success && result.status === 'failed') {
      throw new Error(`Orchestration execution failed: ${result.errors.map(e => e.message).join(', ')}`);
    }

    // 6. Map final ContentAsset to legacy response shape
    const finalAsset = result.content as ContentAsset;
    console.log(`[PHASE10] GENERATED MARKDOWN LENGTH: ${finalAsset?.bodyMarkdown?.length || 0}`);
    console.log('[PHASE10] CONTENT ASSET CREATED');
    console.log('[Adapter] Completed orchestration. Building response blueprint...');

    let finalArticle = this.parseMarkdownToBlueprint(finalAsset.title, finalAsset.bodyMarkdown);
    console.log('[PHASE10] ARTICLE BLUEPRINT CREATED');

    // Inject diagnostics telemetry stats
    finalArticle.diagnostics = {
      repairAttemptsUsed: result.stages.filter(s => s.stage === AgentStage.GENERATE).length - 1,
      telemetry: result.telemetry,
      structureAlignmentScore: 90,
      entityPlacementCoverage: 85,
      budgetUtilizationPercent: 100,
      conceptRepetitionScore: 0,
      compressionTriggered: false,
      compressionSavingsWords: 0,
      modelUsed: dryRunEnabled ? 'dry_run_model' : 'gemini-2.5-flash',
      generationSource: dryRunEnabled ? 'dry_run' : 'gemini',
      dryRunEnabled,
      apiProvider: dryRunEnabled ? 'mock' : 'google'
    };

    // 7. Deterministic Link Quality Engine (LQE) Post-processing
    try {
      console.log('[Adapter] Running post-generation Link Quality Engine...');
      finalArticle = LinkQualityEngine.postProcess(
        finalArticle,
        finalArticle.title,
        payload.targetKeywords || ''
      );
    } catch (err: any) {
      console.error('[Adapter] Link Quality Engine Post-processing Failed:', err.message);
      throw new Error(`Link Quality Engine Post-processing Failed: ${err.message}`);
    }

    // 8. Trigger YouTube media fetching helper if key exists
    const youtubeKey = process.env.YOUTUBE_API_KEY;
    if (youtubeKey && finalArticle.sections) {
      console.log('[Adapter] Fetching YouTube media for sections...');
      for (const section of finalArticle.sections) {
        const query = section.heading;
        const videoId = await this.fetchYouTubeVideo(query, youtubeKey);
        if (videoId) {
          section.rich_media_query = {
            type: 'youtube',
            suggested_search_query: query,
            alt_text: `YouTube video on ${query}`,
            youtube_video_id: videoId
          };
        }
      }
    }

    onProgress({ type: 'status', message: 'Generation complete', progress: 100 });
    onProgress({ type: 'complete', data: finalArticle, progress: 100 });

    console.log(`[PHASE10] FINAL CHECK - title="${finalArticle.title}" sectionCount=${finalArticle.sections?.length || 0} markdownLength=${finalAsset.bodyMarkdown?.length || 0} contentLength=${finalArticle.intro?.hook?.length || 0} hasContent=${!!finalAsset.bodyMarkdown}`);
    console.log('[PHASE10] RETURNING RESULT');
    console.log(`[PIPELINE] RETURN - runId=${runId} elapsed=${Date.now() - startTime}ms`);
    return finalArticle;
  }

  private static parseMarkdownToBlueprint(title: string, markdown: string): any {
    const lines = markdown.split('\n');
    const introParagraphs: string[] = [];
    const sections: any[] = [];
    let currentSection: any = null;
    let firstHeadingFound = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('# ')) {
        continue;
      }

      if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
        firstHeadingFound = true;
        const level = trimmed.startsWith('## ') ? 'H2' : 'H3';
        const heading = trimmed.replace(/^###?\s+/, '').trim();
        currentSection = {
          heading,
          level,
          what_it_is: '',
          why_it_works: 'This section details key execution processes and guidelines.',
          experience_or_data_point: `Factual research on ${heading}.`,
          example_brands: [],
          copy_formula: [],
          takeaway: `Takeaway for ${heading}.`,
          outbound_authority_link: undefined,
          rich_media_query: undefined
        };
        sections.push(currentSection);
      } else {
        if (!firstHeadingFound) {
          introParagraphs.push(line);
        } else if (currentSection) {
          if (!currentSection.what_it_is) {
            currentSection.what_it_is = line;
          } else {
            currentSection.what_it_is += '\n\n' + line;
          }
        }
      }
    }

    if (sections.length === 0) {
      sections.push({
        heading: 'Overview',
        level: 'H2',
        what_it_is: markdown,
        why_it_works: 'Detailed breakdown of the primary topic.',
        experience_or_data_point: 'Industry validation.',
        example_brands: [],
        copy_formula: [],
        takeaway: 'Key takeaway.',
        outbound_authority_link: undefined,
        rich_media_query: undefined
      });
    }

    return {
      title,
      title_tag: `${title} | SEO Intelligence`,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      intent: 'Informational',
      schema_markup: '',
      open_graph_tags: [],
      intro: {
        hook: introParagraphs[0] || 'In-depth exploration and analysis.',
        thesis: introParagraphs[1] || 'Key concepts and best practices.',
        business_context: introParagraphs[2] || 'A guide for strategy leaders.'
      },
      section_outlines: sections.map(s => ({ heading: s.heading, level: s.level })),
      sections,
      cta: {
        heading: 'Ready to scale your business?',
        description: 'Get in touch to see how our growth solutions can help.',
        button_text: 'Get Started'
      }
    };
  }

  private static async fetchYouTubeVideo(query: string, apiKey: string): Promise<string | null> {
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: '3',
        relevanceLanguage: 'en',
        key: apiKey,
      });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.items?.[0]?.id?.videoId ?? null;
    } catch (e) {
      console.warn('YouTube search fetch failed:', e);
      return null;
    }
  }
}
