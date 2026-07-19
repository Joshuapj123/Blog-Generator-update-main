import { SerpAnalysisResult } from '@/types/serp';
import { getCachedSerp, saveCachedSerp } from '@/lib/firebase/firestore';
import { collectSerpUrlsAndPaa, scrapeCompetitors, calculateMedians } from '@/lib/seo-intelligence/serp_collector';
import { processKeywords } from '@/lib/seo-intelligence/keyword_engine';
import { processEntities } from '@/lib/seo-intelligence/entity_engine';
import { processIntent } from '@/lib/seo-intelligence/intent_engine';
import { processContentGaps } from '@/lib/seo-intelligence/content_gap_engine';
import { processFeaturedSnippets } from '@/lib/seo-intelligence/featured_snippet_detector';
import { getTelemetryStats, logPipelineCheckpoint } from '@/lib/gemini-telemetry';

function sseMsg(type: string, payload: Record<string, unknown>) {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

export const runtime = 'nodejs';
export const maxDuration = 300; // Allow 5 mins for 10 URL extractions and gap analysis

export async function POST(request: Request) {
  const { keyword, locale = 'en-US' } = await request.json().catch(() => ({ keyword: '', locale: 'en-US' }));

  if (!keyword) {
    return new Response(JSON.stringify({ error: 'Keyword is required for SERP extraction' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const source: UnderlyingSource = {
    async start(controller) {
      const emit = (type: string, payload: Record<string, unknown> = {}) => {
        try {
          controller.enqueue(encoder.encode(sseMsg(type, payload)));
        } catch (e) {
          console.warn('[serp-extract] Failed to enqueue SSE message:', e);
        }
      };

      try {
        emit('stage', { stage: 0, label: 'Checking cache…', percent: 5 });
        const cached = await getCachedSerp(keyword, locale).catch(() => null);
        if (cached && cached.data) {
          const rawDate = cached.updatedAt;
          const updatedAt = (rawDate && typeof rawDate.toDate === 'function')
            ? rawDate.toDate()
            : rawDate
            ? new Date(rawDate)
            : new Date();
          const cacheAgeMs = Date.now() - updatedAt.getTime();
          const cacheAgeHours = cacheAgeMs / (1000 * 60 * 60);

          if (cacheAgeHours <= 24) {
            console.log(`[serp-extract] Cache Hit for "${keyword}". Age: ${cacheAgeHours.toFixed(2)} hours.`);
            emit('done', {
              data: {
                ...cached.data,
                cached: true,
                cacheAge: parseFloat(cacheAgeHours.toFixed(2))
              },
              percent: 100,
              cached: true
            });
            controller.close();
            return;
          } else {
            console.log(`[serp-extract] Cache expired for "${keyword}". Age: ${cacheAgeHours.toFixed(2)} hours. Re-scraping.`);
          }
        }
      } catch (e) {
        console.warn('Cache error:', e);
      }

      const runId = 'run_serp_' + encodeURIComponent(keyword).slice(0, 15) + '_' + Date.now();

      try {
        // Stage 1: URL & PAA Collection
        emit('stage', { stage: 1, label: 'Collecting top 10 organic SERP results & PAA queries…', percent: 10 });
        const { urls, paa: initialPaa } = await collectSerpUrlsAndPaa(keyword);
        console.log(`[serp-extract] Resolved competitor URLs:`, urls);

        // Stage 2: Competitor Scrape
        const competitors = await scrapeCompetitors(urls, emit, { runId });
        console.log(`[serp-extract] Successfully scraped ${competitors.length} competitors.`);

        if (competitors.length === 0) {
          throw new Error('Could not scrape any competitor pages.');
        }

        // Calculate Medians
        const { medianWordCount, medianTitleLength, medianH2Count, medianLexicalDiversity } = calculateMedians(competitors);

        // Stage 3: Keyword Matrix & Scoring
        emit('stage', { stage: 3, label: 'Generating Master Keyword List & Frequency Matrix…', percent: 70 });
        const { terms, topicClusters, topTermsForIntent } = await processKeywords(keyword, competitors, { runId });
        logPipelineCheckpoint('keyword_extraction', keyword, keyword, true);

        // Stage 4: Entity Extraction
        emit('stage', { stage: 4, label: 'Running Entity Coverage & Relationship analysis…', percent: 80 });
        const { entities, entityRelationships, recommendedEntityConnections } = await processEntities(keyword, competitors, { runId });

        // Stage 5: Intent Blueprint
        emit('stage', { stage: 5, label: 'Determining dominant Search Intent & structure guidelines…', percent: 85 });
        const { intentBlueprint } = await processIntent(keyword, competitors, { runId });

        // Stage 6: Featured Snippet Detection
        emit('stage', { stage: 6, label: 'Detecting featured snippet opportunities…', percent: 90 });
        const { featuredSnippetBlueprint } = await processFeaturedSnippets(keyword, competitors, { runId });

        // Stage 7: Content Gap, Heading Frequency, and Tables
        emit('stage', { stage: 7, label: 'Comparing competitor structures & clustering user questions…', percent: 95 });
        const { contentGapReport, headingFrequency, tableDetection, paaQuestions } = await processContentGaps(
          keyword,
          competitors,
          initialPaa,
          { runId }
        );

        const competitorTitles = competitors.map(c => c.title);

        const competitorWeights = competitors.map((c, i) => {
          return {
            rank: i + 1,
            url: c.url,
            title: c.title,
            weight: c.weight
          };
        });

        // Compute extraction metrics from competitors & auditLogs
        const auditLogs = (competitors as any).auditLogs || [];
        const readabilitySuccessRate = competitors.length > 0
          ? (competitors.filter(c => c.readabilitySuccess).length / competitors.length) * 100
          : 0;
        const fallbackUsageRate = competitors.length > 0
          ? (competitors.filter(c => c.fallbackUsed).length / competitors.length) * 100
          : 0;

        const qualityDistribution = { high: 0, medium: 0, low: 0 };
        competitors.forEach(c => {
          if (c.quality === 'high') qualityDistribution.high++;
          else if (c.quality === 'medium') qualityDistribution.medium++;
          else if (c.quality === 'low') qualityDistribution.low++;
        });

        const rejectedCompetitorCount = auditLogs.filter((log: any) => log.rejected).length;
        const averageExtractedWordCount = competitors.length > 0
          ? competitors.reduce((sum, c) => sum + c.wordCount, 0) / competitors.length
          : 0;

        const extractionConfidenceMetrics = {
          readabilitySuccessRate,
          fallbackUsageRate,
          qualityDistribution,
          rejectedCompetitorCount,
          averageExtractedWordCount,
          auditLogs
        };

        const telemetryStats = getTelemetryStats(runId);
        const result: SerpAnalysisResult & { telemetry?: any } = {
          keyword,
          locale,
          terms,
          entities,
          medianWordCount,
          medianTitleLength,
          medianH2Count,
          medianLexicalDiversity,
          analyzedCompetitors: competitors.length,
          topTermsForIntent,
          competitorTitles,
          contentGapReport,
          headingFrequency,
          tableDetection,
          paaQuestions,
          topicClusters,
          intentBlueprint,
          featuredSnippetBlueprint,
          entityRelationships,
          recommendedEntityConnections,
          competitorWeights,
          extractionConfidenceMetrics,
          telemetry: telemetryStats
        };

        try {
          await saveCachedSerp(keyword, locale, result);
        } catch (e) {
          console.warn('Failed to save to cache:', e);
        }

        emit('done', { data: result, percent: 100 });
      } catch (error: any) {
        console.error('[serp-extract] error:', error);
        emit('error', { message: error?.message || 'Unknown error occurred during SERP analysis' });
      } finally {
        controller.close();
      }
    }
  };

  const stream = new ReadableStream(source);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
