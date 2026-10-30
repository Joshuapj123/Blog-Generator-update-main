import { NextResponse } from 'next/server';
import { GenerationPipelineAdapter } from '@/lib/core/GenerationPipelineAdapter';
import { getAdminAuth } from '@/lib/firebase/admin';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';
import {
  resolveAndGetAnalysisSession,
  resolveAndUpdateAnalysisSession,
  resolveAndGetArticle,
  resolveAndAcquireGenerationLease,
  resolveAndRenewGenerationLease,
  resolveAndReleaseGenerationLease
} from '@/lib/test-storage/TemporaryArticleStore';
import {
  getAnalysisSessionAdmin,
  updateAnalysisSessionStatusAdmin,
  getArticleByIdAdmin,
  acquireGenerationLeaseAdmin,
  renewGenerationLeaseAdmin,
  releaseGenerationLeaseAdmin
} from '@/lib/firebase/admin-firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
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

    const body = await req.json();
    let payload = body;
    let sessionId: string | undefined = body.sessionId;
    let activeLeaseToken: string | undefined;

    // Stage 2: Resumable generation from Analysis Session
    if (sessionId) {
      const leaseResult = await resolveAndAcquireGenerationLease(
        sessionId,
        authenticatedUserId,
        180000,
        acquireGenerationLeaseAdmin
      );

      if (!leaseResult.acquired) {
        if (leaseResult.reason === 'NOT_FOUND') {
          return NextResponse.json({
            error: 'Analysis session not found.',
            code: 'ERR_SESSION_NOT_FOUND'
          }, { status: 404 });
        }
        if (leaseResult.reason === 'FORBIDDEN') {
          return NextResponse.json({
            error: 'Analysis session not found or unauthorized.',
            code: 'ERR_SESSION_NOT_FOUND'
          }, { status: 404 });
        }
        if (leaseResult.reason === 'INCOMPLETE') {
          return NextResponse.json({
            error: 'Analysis session is incomplete or failed.',
            code: 'ERR_SESSION_INCOMPLETE'
          }, { status: 400 });
        }
        if (leaseResult.reason === 'IN_PROGRESS') {
          return NextResponse.json({
            error: 'Article generation is already in progress for this session.',
            code: 'ERR_GENERATION_IN_PROGRESS'
          }, { status: 409 });
        }
        if (leaseResult.reason === 'ALREADY_COMPLETED' && leaseResult.session?.generatedArticleId) {
          const existing = await resolveAndGetArticle(
            leaseResult.session.generatedArticleId,
            authenticatedUserId,
            getArticleByIdAdmin
          );
          if (existing) {
            console.log(`[API Route] Idempotent request for session "${sessionId}". Replaying existing article "${leaseResult.session.generatedArticleId}".`);
            const encoder = new TextEncoder();
            const replayStream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'status',
                  message: 'Article already generated from this analysis session (idempotent replay).',
                  progress: 100
                })}\n\n`));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'complete',
                  data: existing
                })}\n\n`));
                controller.close();
              }
            });
            return new Response(replayStream, {
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
              },
            });
          }
        }
        return NextResponse.json({
          error: leaseResult.errorMessage || 'Unable to acquire generation lease.',
          code: 'ERR_LEASE_ACQUISITION_FAILED'
        }, { status: 400 });
      }

      const session = leaseResult.session!;
      activeLeaseToken = leaseResult.leaseToken;

      // Construct generation payload from durable session (avoids re-crawling & re-evaluating)
      const opp = session.selectedOpportunity;
      const promisedCount = ContentEvidenceValidator.extractPromisedListicleCount(opp.keyword);
      const maxHeadings = promisedCount ? Math.max(promisedCount + 2, 7) : 7;

      payload = {
        runId: 'gen_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now(),
        title: opp.keyword,
        targetKeywords: opp.keyword,
        contentType: opp.contentType || 'Guide',
        targetAudience: session.profile.targetAudience,
        saasProfile: session.profile,
        customInsights: `SaaS Profile: ${session.profile.name} - ${session.profile.description}. key features: ${session.profile.keyFeatures?.join(', ')}.`,
        campaignMode: 'standard',
        externalLinks: [],
        maxHeadings,
        supportingTerms: opp.supportingTerms || [],
        authenticatedUserId,
        articleId: body.articleId || session.articleId,
        folder: body.folder || session.folder,
      };
    } else {
      payload.authenticatedUserId = authenticatedUserId;
    }

    console.log('[API Route] Routing request through GenerationPipelineAdapter...');
    const encoder = new TextEncoder();
    let finalArticleCaptured: any = null;

    const stream = new ReadableStream({
      async start(controller) {
        let renewalTimer: NodeJS.Timeout | null = null;
        if (sessionId && activeLeaseToken) {
          renewalTimer = setInterval(() => {
            resolveAndRenewGenerationLease(
              sessionId!,
              authenticatedUserId,
              activeLeaseToken!,
              180000,
              renewGenerationLeaseAdmin
            ).catch((e) => console.warn('[API Route] Lease renewal failed:', e));
          }, 60000);
        }

        const sendChunk = (chunk: any) => {
          if (chunk.type === 'complete' && chunk.data) {
            finalArticleCaptured = chunk.data;
          }
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          } catch (e) {
            console.warn('[API Route] Failed to enqueue chunk:', e);
          }
        };

        try {
          await GenerationPipelineAdapter.runPipeline(payload, sendChunk, req.signal);

          // If linked to an analysis session, update session status to COMPLETED with fencing check
          if (sessionId && activeLeaseToken) {
            const persistedId = finalArticleCaptured?.persistence?.articleId || finalArticleCaptured?.id || payload.articleId;
            const released = await resolveAndReleaseGenerationLease(
              sessionId,
              authenticatedUserId,
              activeLeaseToken,
              {
                generationStatus: 'COMPLETED',
                generatedArticleId: persistedId,
              },
              releaseGenerationLeaseAdmin
            );
            if (!released) {
              console.warn(`[API Route] Stale worker fenced out on completion for session "${sessionId}".`);
            }
          }
        } catch (err: any) {
          if (req.signal.aborted || err.name === 'AbortError' || err.message?.includes('aborted')) {
            console.log('[API Route] Generation cancelled by client.');
            if (sessionId && activeLeaseToken) {
              await resolveAndReleaseGenerationLease(
                sessionId,
                authenticatedUserId,
                activeLeaseToken,
                {
                  generationStatus: 'FAILED',
                  failureReason: 'Cancelled by user',
                },
                releaseGenerationLeaseAdmin
              ).catch(() => {});
            }
            return;
          }
          console.error('[API Route] GenerationPipelineAdapter failed:', err.message);

          if (sessionId && activeLeaseToken) {
            await resolveAndReleaseGenerationLease(
              sessionId,
              authenticatedUserId,
              activeLeaseToken,
              {
                generationStatus: 'FAILED',
                failureReason: err.message || 'Generation error',
              },
              releaseGenerationLeaseAdmin
            ).catch(() => {});
          }

          // Send terminal error chunk to notify client
          sendChunk({ 
            type: 'error', 
            message: 'Generation failed. No valid article could be produced.',
            reason: err.message || 'Unknown generation error'
          });
        } finally {
          if (renewalTimer) {
            clearInterval(renewalTimer);
          }
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
