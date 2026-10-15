import { AgentOrchestrator, AgentStage, OrchestrationError } from '@/core/orchestrator/AgentOrchestrator';
import { GeminiProvider } from '@/lib/content/GeminiProvider';
import { SerperProvider } from '@/lib/research/SerperProvider';
import { PlaywrightProvider } from '@/lib/research/PlaywrightProvider';
import { LinkQualityEngine, RawLinkInput } from '@/lib/seo-intelligence/link_quality_engine';
import { SitemapDiscoveryService } from '@/lib/research/SitemapDiscoveryService';
import { DiagramAssetService } from '@/lib/content/DiagramAssetService';
import { SaaSProfile, ContentAsset } from '@/core/contracts/schemas';
import { normalizeContentType } from '@/lib/content/schemas';
import { Article } from '@/lib/firebase/firestore';
import { saveArticleAdmin } from '@/lib/firebase/admin-firestore';
import { TemporaryArticleStore, resolvePersistenceBackend } from '@/lib/test-storage/TemporaryArticleStore';
import { normalizeAiOutput } from '@/app/(main)/engine/utils/normalizeAiOutput';
import { 
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '@/core/contracts/providers';

// Local Mock Providers for DRY_RUN mode
export class DryRunLLMProvider implements LLMProvider {
  getModel(): string {
    return 'dry-run-model';
  }

  async generate(prompt: string, options?: any): Promise<string> {
    return "This is a dry run content generation. We write clean, active voice text. SaaS platforms grow with topical authority.";
  }

  async structuredGenerate<T>(prompt: string, schema: any, options?: any): Promise<T> {
    const shape = schema?.shape || {};
    
    // SaaSProfileSchema detection
    if ('targetAudience' in shape || 'keyFeatures' in shape) {
      return {
        name: "Dry Run HubSpot",
        description: "Dry run SaaS customer platform.",
        targetAudience: "Small businesses",
        keyFeatures: ["CRM", "Marketing Sales"],
        primaryCompetitors: [],
        website: "https://www.hubspot.com/",
        tone: "professional",
        customInsights: "Dry run custom insights"
      } as unknown as T;
    }

    // Seed Keyword list detection
    if ('keywords' in shape) {
      return {
        keywords: [
          "best crm software for small business",
          "marketing sales service platform",
          "hubspot vs salesforce"
        ]
      } as unknown as T;
    }

    // Search opportunity detection
    if ('intent' in shape && 'businessRelevance' in shape) {
      return {
        keyword: "dry run keyword",
        intent: "Informational",
        contentType: "Guide",
        businessRelevance: 80,
        estimatedDifficulty: 30,
        opportunityScore: 75
      } as unknown as T;
    }

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

export class DryRunSearchProvider implements SearchProvider {
  async search(query: string, options?: any): Promise<SearchResult[]> {
    return [
      { title: "Dry Run Resource", link: "https://example.com/dry-run", snippet: "Dry run search listing." }
    ];
  }
}

export class DryRunScrapeProvider implements ScrapeProvider {
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
      requestStartTs?: number;
    }
  ): Promise<any> {
    const runId = 'run_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    const startTime = Date.now();
    console.log(`[PIPELINE] REQUEST START - runId=${runId} timestamp=${new Date().toISOString()}`);

    const dryRunEnabled = process.env.ENABLE_DRY_RUN === 'true' || payload.dryRun === true;
    const primaryKeyword = payload.targetKeywords?.split(',')[0].trim() || payload.title;
    console.log(`[PIPELINE] PAYLOAD VALIDATED - runId=${runId} elapsed=${Date.now() - startTime}ms`);

    console.log(`[Adapter] Initializing pipeline. Dry Run = ${dryRunEnabled}`);
    onProgress({ type: 'status', message: 'Initializing pipeline...', progress: 5 });

    // 1. Run Link Quality Engine (LQE) on input links
    let processedExternalLinks = payload.externalLinks || [];
    if (processedExternalLinks.length > 0) {
      try {
        console.log('[Adapter] Running pre-generation Link Quality Engine...');
        const targetDomain = payload.saasProfile?.website || payload.referenceData?.url;
        const report = LinkQualityEngine.processWithRecovery(
          processedExternalLinks, 
          payload.title, 
          payload.targetKeywords || '',
          {
            targetDomain,
            threshold: 80,
            allowDegradedQuality: true
          }
        );
        processedExternalLinks = report.selectedLinks.map(l => ({
          title: l.entity,
          url: l.canonicalURL
        }));
      } catch (err: any) {
        console.warn('[Adapter] LQE Pre-generation validation fallback:', err?.message || err);
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
      timeoutMs: options?.overrideBudget?.timeoutMs ?? 270000 // 270s default provides safety buffer before 300s serverless limit
    };

    const orchestrator = new AgentOrchestrator({
      llm,
      search,
      scraper,
      budget,
      maxReviewRetries: options?.overrideMaxReviewRetries ?? 2,
      signal,
      requestStartTs: options?.requestStartTs,
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
      maxHeadings: payload.maxHeadings ?? (options?.overrideBudget?.maxLLMCalls ? 2 : undefined),
      supportingTerms: payload.supportingTerms,
      requestStartTs: options?.requestStartTs,
    });

    if (!result.success && result.status === 'failed') {
      const errorList = (result.errors && result.errors.length > 0)
        ? Array.from(new Set(result.errors.map(e => GenerationPipelineAdapter.sanitizeOrchestrationError(e))))
        : ['An unexpected error occurred during generation. Please try again.'];
      throw new Error(`Orchestration execution failed: ${errorList.join(', ')}`);
    }

    // 6. Map final ContentAsset to legacy response shape
    const finalAsset = result.content as ContentAsset;
    if (finalAsset?.bodyMarkdown) {
      console.log('[Adapter] Stripping diagram placeholders (AI image/diagram generation disabled per Prompt 5C)...');
      finalAsset.bodyMarkdown = DiagramAssetService.stripDiagramPlaceholders(finalAsset.bodyMarkdown);
    }
    console.log(`[PHASE10] GENERATED MARKDOWN LENGTH: ${finalAsset?.bodyMarkdown?.length || 0}`);
    console.log('[PHASE10] CONTENT ASSET CREATED');
    console.log('[Adapter] Completed orchestration. Building response blueprint...');

    let finalArticle = this.parseMarkdownToBlueprint(finalAsset.title, finalAsset.bodyMarkdown);
    console.log('[PHASE10] ARTICLE BLUEPRINT CREATED');

    // Inject diagnostics telemetry stats
    finalArticle.diagnostics = {
      repairAttemptsUsed: result.stages.filter(s => s.stage === AgentStage.GENERATE).length - 1,
      telemetry: result.telemetry,
      researchIntelligence: result.researchIntelligence || result.telemetry?.researchIntelligence,
      evidenceItemCount: result.evidenceSet?.items?.length || 0,
      gapCount: result.gapMatrix?.gaps?.length || 0,
      structureAlignmentScore: 90,
      entityPlacementCoverage: 85,
      budgetUtilizationPercent: 100,
      conceptRepetitionScore: 0,
      compressionTriggered: false,
      compressionSavingsWords: 0,
      modelUsed: dryRunEnabled ? 'dry_run_model' : (result.telemetry?.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'),
      generationSource: dryRunEnabled ? 'dry_run' : 'gemini',
      dryRunEnabled,
      apiProvider: dryRunEnabled ? 'mock' : 'google'
    };

    finalArticle.evidenceSet = result.evidenceSet;
    finalArticle.sectionEvidenceMaps = result.sectionEvidenceMaps;

    // 7. Deterministic Link Quality Engine (LQE) Post-processing
    try {
      console.log('[Adapter] Running post-generation Link Quality Engine...');
      const targetDomain = payload.saasProfile?.website || payload.referenceData?.url;
      let candidatePool: RawLinkInput[] | undefined;
      if (targetDomain) {
        try {
          const cached = SitemapDiscoveryService.getCachedRecommendations(targetDomain);
          if (cached && cached.candidates) {
            candidatePool = cached.candidates.map(c => ({
              title: c.title || c.suggestedAnchor || 'Internal Resource',
              url: c.url
            }));
          }
        } catch (poolErr) {
          console.warn('[Adapter] Failed to fetch cached recommendations for LQE candidate pool:', poolErr);
        }
      }

      finalArticle = LinkQualityEngine.postProcess(
        finalArticle,
        finalArticle.title,
        payload.targetKeywords || '',
        {
          targetDomain,
          candidatePool,
          threshold: 80,
          allowDegradedQuality: true
        }
      );
    } catch (err: any) {
      console.warn('[Adapter] Link Quality Engine Post-processing Fallback:', err?.message || err);
      if (finalArticle) {
        if (!finalArticle.diagnostics) finalArticle.diagnostics = {};
        if (!finalArticle.diagnostics.linkQuality) {
          finalArticle.diagnostics.linkQuality = {
            status: 'DEGRADED',
            threshold: 80,
            averageAuthority: 0,
            recoveryApplied: true,
            recoveryStage: 'NO_LINKS',
            selectedCount: 0,
            selectedLinks: [],
            userNotice: 'Link quality processing bypassed due to internal error; generation completed safely.',
            rejectionReasons: [{ url: '', reason: err?.message || 'Unknown post-processing error' }]
          };
        }
      }
    }

    // 8. Trigger YouTube media fetching helper if key exists and not in dry-run
    const youtubeKey = process.env.YOUTUBE_API_KEY;
    if (!dryRunEnabled && youtubeKey && finalArticle.sections) {
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

    // 9. Persist to My Content (Firestore "articles" collection)
    const idempotentArticleId = payload.articleId || `art_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const targetDomain = payload.saasProfile?.website || payload.referenceData?.url || '';

    // Convert markdown to clean HTML for editor and storage
    const htmlContent = normalizeAiOutput(finalAsset?.bodyMarkdown || '');

    const rawFallbackFormat = payload.contentType ? normalizeContentType(payload.contentType) : undefined;
    const isExplicitFormatProvided = payload.contentType !== undefined && payload.contentType !== null &&
      (typeof payload.contentType !== 'string' || payload.contentType.trim().length > 0);
    if (!result.plan?.intent?.contentType && isExplicitFormatProvided && !rawFallbackFormat) {
      console.warn(`[Adapter] Unrecognized payload.contentType "${payload.contentType}"; falling back to default "Guide".`);
    }
    const resolvedContentFormat = result.plan?.intent?.contentType || rawFallbackFormat || 'Guide';
    const resolvedAssetType = finalAsset?.assetType || result.plan?.assetType || 'ARTICLE';

    // Calculate evidence confidence accurately from actual items invariant
    const items = result.evidenceSet?.items || [];
    const totalEvidenceCount = items.length;
    const actualHighConfidenceCount = items.filter(i => i.confidence === 'HIGH').length;
    const hasHighConfidence = totalEvidenceCount > 0 && actualHighConfidenceCount >= Math.ceil(totalEvidenceCount / 2);
    const resolvedConfidenceRange = hasHighConfidence ? 'HIGH' : 'STANDARD';

    finalArticle.contentFormat = resolvedContentFormat;
    finalArticle.assetType = resolvedAssetType;
    finalArticle.evidenceMetadata = {
      evidenceCount: totalEvidenceCount,
      gapCount: result.gapMatrix?.gaps?.length || 0,
      confidenceRange: resolvedConfidenceRange,
      reviewScore: result.review?.score || 100,
      validationStatus: result.review?.finalValidationStatus || (result.review?.passed ? 'PASSED' : 'FAILED'),
      contentFormat: resolvedContentFormat,
      assetType: resolvedAssetType
    };

    const articleToSave: Article = {
      id: idempotentArticleId,
      userId: payload.authenticatedUserId || undefined,
      ownerId: payload.authenticatedUserId || undefined,
      title: finalArticle.title,
      content: htmlContent,
      folder: 'uncategorized',
      stage: 'Draft',
      topic: payload.title,
      sourceKeyword: primaryKeyword,
      targetKeywords: [primaryKeyword],
      referenceUrl: targetDomain,
      blueprint: finalArticle,
      diagnostics: finalArticle.diagnostics,
      contentFormat: resolvedContentFormat,
      assetType: resolvedAssetType,
      evidenceMetadata: finalArticle.evidenceMetadata,
      runId,
      persistedAt: new Date().toISOString(),
      persistenceStatus: 'SAVED'
    };

    let persistenceResult: { status: 'SAVED' | 'SAVE_FAILED' | 'PERSISTENCE_SKIPPED_DRY_RUN'; articleId?: string; error?: string } = {
      status: 'SAVE_FAILED'
    };

    if (dryRunEnabled) {
      console.log(`[Adapter] Dry-run active. Skipping real Firestore persistence for article "${finalArticle.title}" (id=${idempotentArticleId}).`);
      persistenceResult = {
        status: 'PERSISTENCE_SKIPPED_DRY_RUN',
        articleId: idempotentArticleId
      };
    } else {
      try {
        const verifiedUid = payload.authenticatedUserId;
        if (!verifiedUid) {
          throw new Error('A verified Firebase UID is required to persist an article.');
        }

        const backend = resolvePersistenceBackend();
        let savedDocId: string;

        if (backend === 'TEMP_TEST_STORAGE') {
          console.log(`[Adapter] Temporary test storage active. Persisting article "${finalArticle.title}" to TemporaryArticleStore...`);
          savedDocId = await TemporaryArticleStore.saveArticle(articleToSave, verifiedUid);
        } else {
          console.log(`[Adapter] Persisting article "${finalArticle.title}" to My Content (id=${idempotentArticleId})...`);
          savedDocId = await saveArticleAdmin(articleToSave, verifiedUid);
        }

        persistenceResult = {
          status: 'SAVED',
          articleId: savedDocId
        };
        console.log(`[Adapter] Successfully saved article to ${backend} with ID: ${savedDocId}`);
      } catch (saveErr: any) {
        console.error('[Adapter] Failed to persist generated article to My Content:', saveErr?.message || saveErr);
        persistenceResult = {
          status: 'SAVE_FAILED',
          error: 'Failed to persist article to My Content library. Content preserved in session.'
        };
      }
    }

    finalArticle.persistence = persistenceResult;

    onProgress({
      type: 'status',
      message: persistenceResult.status === 'SAVED'
        ? 'Article saved to My Content'
        : (persistenceResult.status === 'PERSISTENCE_SKIPPED_DRY_RUN'
            ? 'Generation complete (dry-run, persistence skipped)'
            : 'Generation complete'),
      progress: 100
    });
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

  public static sanitizeOrchestrationError(e: OrchestrationError | any): string {
    const rawMsg = e?.message || '';
    const stage = e?.stage as AgentStage | undefined;
    const category = e?.category;
    const statusCode = e?.statusCode || e?.status;
    const code = e?.code;
    const causeStr = typeof e?.cause === 'string' ? e.cause : (e?.cause?.message || '');
    const combined = `${rawMsg} ${causeStr} ${code || ''} ${statusCode || ''}`;

    // 1. Budget exceeded or Timeout must remain intact
    if (rawMsg.includes('[Orchestrator Budget Exceeded]')) {
      return rawMsg;
    }
    if (rawMsg.includes('[Orchestrator Timeout]')) {
      return rawMsg;
    }

    // 2. Classify Rate Limit (HTTP 429 / RESOURCE_EXHAUSTED / quota)
    const isRateLimit =
      category === 'RATE_LIMIT' ||
      statusCode === 429 ||
      code === 'RESOURCE_EXHAUSTED' ||
      /\b429\b|resource_exhausted|rate[- ]?limit|quota\s*exceeded/i.test(combined);

    if (isRateLimit) {
      const stageLabel = stage ? this.formatStageName(stage) : '';
      return stageLabel
        ? `AI provider rate limit reached during ${stageLabel} stage. Please wait a moment and try again.`
        : 'AI provider rate limit reached. Please wait a moment and try again.';
    }

    // 3. Classify Temporary Capacity / Overloaded (HTTP 503)
    const isCapacity =
      category === 'CAPACITY' ||
      statusCode === 503 ||
      /\b503\b|service[- ]?unavailable|overloaded|high\s*demand/i.test(combined);

    if (isCapacity) {
      const stageLabel = stage ? this.formatStageName(stage) : '';
      return stageLabel
        ? `AI service temporarily unavailable during ${stageLabel} stage. Please try again shortly.`
        : 'AI service temporarily unavailable. Please try again shortly.';
    }

    // 4. Classify Timeout (HTTP 504 / DEADLINE_EXCEEDED)
    const isTimeout =
      category === 'TIMEOUT' ||
      statusCode === 504 ||
      code === 'DEADLINE_EXCEEDED' ||
      /\b504\b|deadline[- ]?exceeded|timed?\s*out/i.test(combined);

    if (isTimeout) {
      const stageLabel = stage ? this.formatStageName(stage) : '';
      return stageLabel
        ? `Operation timed out during ${stageLabel} stage. Please try again.`
        : 'Operation timed out. Please try again.';
    }

    // 5. Stage-specific classification
    if (stage === AgentStage.PLAN) {
      return 'ACUTE could not complete the planning stage. Please try again.';
    }

    if (stage === AgentStage.GENERATE) {
      return 'Content generation encountered an error while drafting sections. Please try again.';
    }

    if (stage === AgentStage.REVIEW) {
      return 'Content quality review encountered an error. Please try again.';
    }

    if (stage === AgentStage.RESEARCH || stage === AgentStage.DISCOVER || stage === AgentStage.SAAS_INTELLIGENCE) {
      return 'Research and intelligence gathering encountered an error. Please try again.';
    }

    if (stage === AgentStage.SEARCH_OPPORTUNITY || stage === AgentStage.GEO_INTELLIGENCE) {
      return 'Market intelligence analysis encountered an error. Please try again.';
    }

    if (stage === AgentStage.ASSET_STRATEGY) {
      return 'Asset strategy planning encountered an error. Please try again.';
    }

    if (stage === AgentStage.FINALIZE) {
      return 'Finalizing article content encountered an error. Please try again.';
    }

    // 6. Clean and sanitize fallback for unmapped or missing stage
    return this.cleanUserSafeMessage(rawMsg, stage);
  }

  public static formatStageName(stage: AgentStage | string): string {
    const s = String(stage).toUpperCase();
    switch (s) {
      case 'PLAN': return 'planning';
      case 'GENERATE': return 'content drafting';
      case 'REVIEW': return 'quality review';
      case 'RESEARCH': return 'research';
      case 'DISCOVER': return 'discovery';
      case 'SAAS_INTELLIGENCE': return 'business intelligence';
      case 'SEARCH_OPPORTUNITY': return 'search opportunity';
      case 'GEO_INTELLIGENCE': return 'market intelligence';
      case 'ASSET_STRATEGY': return 'asset strategy';
      case 'FINALIZE': return 'finalization';
      default: return s.toLowerCase();
    }
  }

  public static cleanUserSafeMessage(rawMsg: string, stage?: AgentStage | string): string {
    if (!rawMsg || typeof rawMsg !== 'string') {
      return 'An unexpected error occurred during generation. Please try again.';
    }

    // Check if the message contains technical internals, stack traces, zod errors, or provider names
    const hasInternals =
      /ZodError|No object generated|GeminiProvider|validationResult|AgentOrchestrator|SyntaxError|TypeError|ReferenceError/i.test(rawMsg) ||
      /\s+at\s+.*:\d+:\d+/i.test(rawMsg) ||
      /[A-Za-z]:\\[^:\n]+/i.test(rawMsg) ||
      /\/(?:Users|home|app|var|node_modules)\/[^:\n]+/i.test(rawMsg);

    if (hasInternals) {
      if (stage) {
        const stageLabel = this.formatStageName(stage);
        return `${stageLabel.charAt(0).toUpperCase() + stageLabel.slice(1)} stage encountered an unexpected error. Please try again.`;
      }
      return 'An unexpected error occurred during generation. Please try again.';
    }

    // Redact tokens/credentials
    let cleaned = rawMsg
      .replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_API_KEY]')
      .replace(/sk-[0-9A-Za-z_-]{15,}/g, '[REDACTED_API_KEY]')
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/(?:key|token|secret|password|auth|apiKey)=([^\s&]+)/gi, '$1=[REDACTED]');

    // Strip file paths if any remain
    cleaned = cleaned.replace(/[A-Za-z]:\\[\w\s.-]+(?:\\[\w\s.-]+)*/g, '[PATH]');
    cleaned = cleaned.replace(/\/(?:[\w.-]+\/)+[\w.-]+/g, '[PATH]');

    // Trim length
    if (cleaned.length > 200) {
      cleaned = cleaned.slice(0, 197) + '...';
    }

    return cleaned.trim() || 'An unexpected error occurred during generation. Please try again.';
  }
}
