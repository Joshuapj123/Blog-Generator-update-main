import { NextResponse } from 'next/server';
import { WebsiteIntelligenceService } from '@/lib/saas-intelligence/website-intelligence';
import { SearchOpportunityService } from '@/lib/saas-intelligence/SearchOpportunityService';
import { GeminiProvider } from '@/lib/content/GeminiProvider';
import { SerperProvider } from '@/lib/research/SerperProvider';
import { GenerationPipelineAdapter, DryRunLLMProvider, DryRunSearchProvider } from '@/lib/core/GenerationPipelineAdapter';
import { normalizeUrl } from '@/lib/research/url-verifier';
import { getAdminAuth } from '@/lib/firebase/admin';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';
import { PipelineTelemetryService } from '@/lib/observability/PipelineTelemetryService';
import { classifyPipelineFailure, sanitizeOperationalText } from '@/core/contracts/observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const requestStartTs = Date.now();
  const runId = 'run_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = body?.url;

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Require and verify Firebase ID token at API boundary
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader || !authHeader.trim()) {
      return NextResponse.json({ error: 'Unauthorized: Missing Authorization header' }, { status: 401 });
    }

    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch || !bearerMatch[1].trim()) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Authorization format' }, { status: 401 });
    }

    const idToken = bearerMatch[1].trim();
    let authenticatedUserId: string;
    try {
      const adminAuth = await getAdminAuth();
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      if (!decodedToken || !decodedToken.uid) {
        return NextResponse.json({ error: 'Unauthorized: Invalid user credentials' }, { status: 401 });
      }
      authenticatedUserId = decodedToken.uid;
    } catch (authErr: any) {
      console.error('[API Route] Token verification failed:', authErr?.message || authErr);
      return NextResponse.json({ 
        error: 'Unauthorized: Token verification failed',
        code: authErr?.code || 'AUTH_TOKEN_VERIFICATION_FAILED',
        message: authErr?.message,
        nodeVersion: process.version,
      }, { status: 401 });
    }

    const url = normalizeUrl(rawUrl);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendChunk = (chunk: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          } catch (e) {
            console.warn('[API Route] Failed to enqueue chunk:', e);
          }
        };

        try {
          // Crawling/Ingesting website content
          sendChunk({ type: 'status', message: 'Analyzing website URL and verifying safety...', progress: 5 });
          
          const intelService = new WebsiteIntelligenceService();
          const { profile, candidateKeywords } = await intelService.extractBusinessProfile(url, runId);

          // Understanding business profile
          sendChunk({ 
            type: 'status', 
            message: `Extracted business profile for: ${profile.name}. Building market positioning...`, 
            progress: 15 
          });

          // Finding search opportunities & choosing the best one
          sendChunk({ type: 'status', message: 'Analyzing keyword search opportunities...', progress: 25 });
          
          const dryRun = process.env.ENABLE_DRY_RUN === 'true';
          const llm = dryRun ? new DryRunLLMProvider() : new GeminiProvider();
          const search = dryRun ? new DryRunSearchProvider() : new SerperProvider();
          const oppService = new SearchOpportunityService(search, llm);
          
          const competitorDomains = profile.primaryCompetitors || [];
          const opportunities = await oppService.analyzeOpportunities(
            profile.name,
            (profile as any).category || 'SaaS',
            candidateKeywords,
            competitorDomains,
            {
              saasProfile: profile,
              onProgress: (completed, total, keyword) => {
                sendChunk({
                  type: 'status',
                  message: `Evaluating search opportunity ${completed}/${total}: "${keyword}"...`,
                  progress: 25 + Math.round((completed / total) * 10)
                });
              }
            }
          );

          const bestOpportunity = opportunities.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))[0];
          if (!bestOpportunity) {
            throw new Error('No target keyword opportunities could be analyzed from candidate keywords.');
          }

          // Content strategy formulation
          sendChunk({ 
            type: 'status', 
            message: `Selected best content opportunity keyword: "${bestOpportunity.keyword}" (Score: ${bestOpportunity.opportunityScore}). Triggering generation...`, 
            progress: 35 
          });

          // Hand off to existing GenerationPipelineAdapter.runPipeline
          const promisedCount = ContentEvidenceValidator.extractPromisedListicleCount(bestOpportunity.keyword);
          const maxHeadings = promisedCount ? Math.max(promisedCount + 2, 7) : 7;

          const discoveredComps = (profile.primaryCompetitors && profile.primaryCompetitors.length > 0)
            ? profile.primaryCompetitors
            : (bestOpportunity.competitors && bestOpportunity.competitors.length > 0)
            ? bestOpportunity.competitors
            : (bestOpportunity.rankingDomains || []).slice(0, 3);

          const profileWithComps = {
            ...profile,
            primaryCompetitors: discoveredComps
          };

          const payload = {
            runId,
            title: bestOpportunity.keyword,
            targetKeywords: bestOpportunity.keyword,
            contentType: bestOpportunity.contentType || 'Guide',
            targetAudience: profile.targetAudience,
            saasProfile: profileWithComps,
            customInsights: `SaaS Profile: ${profile.name} - ${profile.description}. key features: ${profile.keyFeatures?.join(', ')}.`,
            campaignMode: 'standard',
            externalLinks: [],
            maxHeadings,
            supportingTerms: bestOpportunity.supportingTerms || [],
            authenticatedUserId,
            articleId: body?.articleId || undefined,
            folder: body?.folder || undefined
          };

          await GenerationPipelineAdapter.runPipeline(payload, sendChunk, req.signal, {
            overrideMaxReviewRetries: 1,
            requestStartTs
          });
        } catch (err: any) {
          console.error('[API Route] URL Autopilot failed:', err.message);
          const sanitizedMsg = sanitizeOperationalText(err.message || 'Autopilot generation failed.');
          const failureCat = classifyPipelineFailure('CRAWL', err);
          PipelineTelemetryService.getInstance().recordEvent({
            runId,
            stage: 'CRAWL',
            eventType: 'PIPELINE_FAILED',
            outcome: 'FAILURE',
            failureCategory: failureCat,
            details: {
              sanitizedMessage: sanitizedMsg,
            }
          });
          sendChunk({ 
            type: 'error', 
            message: sanitizedMsg,
            reason: sanitizedMsg,
            failureCategory: failureCat,
            runId
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[API Route] Request Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
