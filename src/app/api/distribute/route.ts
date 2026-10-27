import { NextResponse } from 'next/server';
import { DistributionRequestSchema } from '@/core/contracts/schemas';
import { getAdminAuth } from '@/lib/firebase/admin';
import { ApprovalAuthorityService } from '@/lib/approval/ApprovalAuthorityService';
import { DistributionService, DistributionRepository } from '@/lib/distribution/DistributionService';
import { WebhookDistributionProvider } from '@/lib/distribution/WebhookDistributionProvider';
import { TemporaryArticleStore, isTemporaryStorageActive } from '@/lib/test-storage/TemporaryArticleStore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // 1. Authenticate Request via Firebase Bearer JWT
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing Authorization header', code: 'ERR_UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch || !bearerMatch[1].trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid Authorization format', code: 'ERR_UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const idToken = bearerMatch[1].trim();
    let authenticatedUserId: string;

    try {
      const adminAuth = await getAdminAuth();
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      if (!decodedToken || !decodedToken.uid) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid user credentials', code: 'ERR_UNAUTHORIZED' },
          { status: 401 }
        );
      }
      authenticatedUserId = decodedToken.uid;
    } catch (authErr: any) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Token verification failed',
          code: 'ERR_UNAUTHORIZED',
          message: authErr?.message || 'Authentication error'
        },
        { status: 401 }
      );
    }

    // 2. Parse request payload
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Bad Request: Invalid JSON body', code: 'ERR_INVALID_JSON' },
        { status: 400 }
      );
    }

    // 3. Zod request validation
    const requestVal = DistributionRequestSchema.safeParse(payload.request);
    if (!requestVal.success) {
      return NextResponse.json(
        {
          error: 'Invalid distribution request schema parameters.',
          code: 'ERR_INVALID_SCHEMA',
          details: requestVal.error.issues
        },
        { status: 400 }
      );
    }

    const distRequest = requestVal.data;

    // 4. Default SaaS profile fallback
    const saasProfile = payload.saasProfile || {
      name: 'ResumeCraft',
      description: 'AI resume builder specializing in student and developer resumes, bullet-point optimizer, and LinkedIn sync.',
      website: 'https://resumecraft.io',
      targetAudience: 'Student developers and entry-level engineers',
      keyFeatures: ['Bullet points optimizer', 'LinkedIn sync', 'ATS-friendly templates'],
      primaryCompetitors: ['tealhq.com'],
      tone: 'professional',
      customInsights: 'none'
    };

    // 5. Claim Dispatch Operation: Authoritative Release Gate + Lease Locking + Fencing Generation
    const claimResult = await ApprovalAuthorityService.claimDispatchOperation({
      articleId: distRequest.contentAssetId,
      callerUid: authenticatedUserId,
      clientOperationKey: distRequest.idempotencyKey,
      channels: distRequest.channels,
      requiredDecision: 'APPROVED'
    });

    if (!claimResult.success) {
      return NextResponse.json(
        {
          error: claimResult.error,
          code: claimResult.code
        },
        { status: claimResult.httpStatus || 422 }
      );
    }

    if (claimResult.status === 'DEDUPLICATED') {
      return NextResponse.json({
        results: claimResult.results,
        deduplicated: true
      }, { status: 200 });
    }

    const { generation, attemptId, providerIdempotencyKeys, contentAsset } = claimResult;

    // 6. Transition state to DISPATCHING under fencing generation
    await ApprovalAuthorityService.recordDispatchState({
      articleId: distRequest.contentAssetId,
      generation,
      attemptId,
      state: 'DISPATCHING'
    });

    // 7. Initialize providers and distribution service
    const isTestMode = isTemporaryStorageActive();
    const repo: DistributionRepository | undefined = isTestMode
      ? {
          saveJob: TemporaryArticleStore.saveDistributionJob.bind(TemporaryArticleStore),
          getJobByIdempotencyKey: TemporaryArticleStore.getDistributionJobByIdempotencyKey.bind(TemporaryArticleStore),
          getJobById: TemporaryArticleStore.getDistributionJobById.bind(TemporaryArticleStore)
        }
      : undefined;

    const webhookProvider = new WebhookDistributionProvider();
    const service = new DistributionService([webhookProvider], repo);

    // 8. Execute distribution request outside of any database transaction
    let results: any;
    try {
      results = await service.distributeAsset(
        saasProfile,
        contentAsset,
        distRequest,
        {
          dryRun: payload.dryRun,
          providerIdempotencyKeys,
          generation,
          attemptId
        } as any
      );
    } catch (dispatchErr: any) {
      console.error('[Distribution API] Provider dispatch failure:', dispatchErr.message);
      await ApprovalAuthorityService.recordDispatchResult({
        articleId: distRequest.contentAssetId,
        generation,
        attemptId,
        error: dispatchErr.message,
        status: 'FAILED',
        expectedApprovalId: claimResult.approvalRecord.approvalId
      });
      return NextResponse.json(
        { error: dispatchErr.message, code: 'ERR_DISTRIBUTION_FAILED' },
        { status: 500 }
      );
    }

    // 9. Finalize dispatch results, verify against in-flight revocations, and clear lease
    const recordResult = await ApprovalAuthorityService.recordDispatchResult({
      articleId: distRequest.contentAssetId,
      generation,
      attemptId,
      results,
      expectedApprovalId: claimResult.approvalRecord.approvalId
    });

    return NextResponse.json({
      results,
      dispatchStatus: recordResult.finalStatus
    }, { status: 200 });
  } catch (err: any) {
    console.error('[Distribution API] Execution Error:', err.message);
    return NextResponse.json(
      { error: err.message, code: 'ERR_INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
