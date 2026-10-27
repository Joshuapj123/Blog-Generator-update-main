import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { getArticleByIdAdmin } from '@/lib/firebase/admin-firestore';
import { ArticleExportService, ExportArticleInput } from '@/lib/export/ArticleExportService';
import { slugify } from '@/lib/article-utils';
import { TemporaryArticleStore, isTemporaryStorageActive } from '@/lib/test-storage/TemporaryArticleStore';
import { PipelineTelemetryService } from '@/lib/observability/PipelineTelemetryService';
import { ApprovalAuthorityService } from '@/lib/approval/ApprovalAuthorityService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function resolvePersistenceBackend(): 'FIRESTORE' | 'TEMP_TEST_STORAGE' {
  if (process.env.ACUTE_PERSISTENCE_BACKEND === 'TEMP_TEST_STORAGE' || isTemporaryStorageActive()) {
    return 'TEMP_TEST_STORAGE';
  }
  return 'FIRESTORE';
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing Authorization header' },
        { status: 401 }
      );
    }

    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch || !bearerMatch[1].trim()) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid Authorization format' },
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
          { error: 'Unauthorized: Invalid user credentials' },
          { status: 401 }
        );
      }
      authenticatedUserId = decodedToken.uid;
    } catch (authErr: any) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Token verification failed',
          message: authErr?.message || 'Authentication error'
        },
        { status: 401 }
      );
    }

    // 2. Parse payload
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Bad Request: Invalid JSON body' },
        { status: 400 }
      );
    }

    const format = (body.format || 'html').toLowerCase();
    if (format !== 'html' && format !== 'pdf') {
      return NextResponse.json(
        { error: 'Bad Request: Unsupported format. Supported formats: "html", "pdf"' },
        { status: 400 }
      );
    }

    let exportInput: ExportArticleInput;
    let isCleanOfficialRelease = false;

    // 3. Resolve article by articleId with strict ownership enforcement
    if (body.articleId) {
      const articleId = String(body.articleId).trim();
      const allowDraftPreview = Boolean(body.allowDraftPreview);

      if (!allowDraftPreview) {
        // Enforce Authoritative Cryptographic Release Gate for Official Clean Export
        const releaseGateResult = await ApprovalAuthorityService.verifyReleaseEligibility({
          articleId,
          callerUid: authenticatedUserId,
          requiredDecision: 'APPROVED'
        });

        if (!releaseGateResult.isEligible) {
          return NextResponse.json(
            {
              error: `Export Blocked: ${releaseGateResult.reason}`,
              code: releaseGateResult.code
            },
            { status: releaseGateResult.httpStatus || 422 }
          );
        }

        const article = releaseGateResult.article!;
        isCleanOfficialRelease = true;

        exportInput = {
          title: article.title,
          slug: article.blueprint?.slug || slugify(article.title),
          content: article.content,
          blueprint: article.blueprint,
          sections: article.blueprint?.sections,
          targetBrand: (article as any).targetBrand || article.referenceUrl,
          validationStatus: article.validationStatus,
          validationFingerprint: article.validationFingerprint || (article as any).blueprint?.validationFingerprint,
          metaDescription: article.blueprint?.metaDescription || (article as any).metaDescription || article.blueprint?.intent,
          targetKeyword: article.sourceKeyword || (article as any).targetKeyword || article.targetKeywords?.[0],
          isDraftPreview: false,
          metadata: {
            intent: article.blueprint?.intent,
            targetKeywords: article.targetKeywords,
            publishedDate: article.persistedAt || article.createdAt
          }
        };
      } else {
        // Explicit Draft Preview requested for persisted article
        const backend = resolvePersistenceBackend();
        let rawArticle: any = null;

        if (backend === 'TEMP_TEST_STORAGE') {
          rawArticle = await TemporaryArticleStore.getArticleById(articleId, authenticatedUserId);
        } else {
          rawArticle = await getArticleByIdAdmin(articleId);
          if (rawArticle) {
            const cleanUid = authenticatedUserId.trim();
            const isOwner = rawArticle.userId === cleanUid || rawArticle.ownerId === cleanUid;
            if (!isOwner) {
              return NextResponse.json(
                { error: 'Forbidden: You do not have permission to export another user\'s article', code: 'ERR_FORBIDDEN_NOT_ARTICLE_OWNER' },
                { status: 403 }
              );
            }
          }
        }

        if (!rawArticle) {
          return NextResponse.json(
            { error: 'Not Found: Article not found or inaccessible', code: 'ERR_ARTICLE_NOT_FOUND' },
            { status: 404 }
          );
        }

        exportInput = {
          title: rawArticle.title,
          slug: rawArticle.blueprint?.slug || slugify(rawArticle.title),
          content: rawArticle.content,
          blueprint: rawArticle.blueprint,
          sections: rawArticle.blueprint?.sections,
          targetBrand: (rawArticle as any).targetBrand || rawArticle.referenceUrl,
          validationStatus: rawArticle.validationStatus,
          validationFingerprint: rawArticle.validationFingerprint || (rawArticle as any).blueprint?.validationFingerprint,
          metaDescription: rawArticle.blueprint?.metaDescription || (rawArticle as any).metaDescription || rawArticle.blueprint?.intent,
          targetKeyword: rawArticle.sourceKeyword || (rawArticle as any).targetKeyword || rawArticle.targetKeywords?.[0],
          isDraftPreview: true,
          metadata: {
            intent: rawArticle.blueprint?.intent,
            targetKeywords: rawArticle.targetKeywords,
            publishedDate: rawArticle.persistedAt || rawArticle.createdAt
          }
        };
      }
    } else {
      // Direct content export with authenticated user (strictly treated as unapproved draft preview)
      if (!body.title && !body.content && !body.bodyMarkdown) {
        return NextResponse.json(
          { error: 'Bad Request: Either "articleId" or "title" and content must be provided', code: 'ERR_INVALID_REQUEST' },
          { status: 400 }
        );
      }

      exportInput = {
        title: body.title || 'Untitled Article',
        slug: body.slug || slugify(body.title || 'article'),
        content: body.content,
        bodyMarkdown: body.bodyMarkdown,
        blueprint: body.blueprint,
        sections: body.sections,
        targetBrand: body.targetBrand,
        saasProfile: body.saasProfile,
        validationStatus: body.validationStatus,
        validationFingerprint: body.validationFingerprint,
        metaDescription: body.metaDescription || body.blueprint?.metaDescription,
        targetKeyword: body.targetKeyword,
        isDraftPreview: true,
        metadata: body.metadata
      };
    }

    // 4. Validate completeness and integrity
    if (isCleanOfficialRelease) {
      const validation = ArticleExportService.validateBeforeExport(exportInput);
      if (!validation.canExport) {
        PipelineTelemetryService.getInstance().recordEvent({
          runId: `export_${Date.now()}`,
          stage: 'EXPORT',
          eventType: 'STAGE_FAILED',
          outcome: 'REJECTED',
          failureCategory: 'EXPORT_FAILURE',
          details: {
            format,
            reason: validation.errors?.join(', ') || 'Article Completeness or Integrity Validation Failed',
          }
        });
        return NextResponse.json(
          {
            error: 'Export Blocked: Article Completeness or Integrity Validation Failed',
            criticalErrors: validation.errors,
            warnings: validation.warnings
          },
          { status: 422 }
        );
      }
    } else {
      // Draft preview: ensure content is non-empty
      const resolvedHtml = ArticleExportService.resolveCanonicalHtml(exportInput);
      if (!resolvedHtml || resolvedHtml.replace(/<[^>]*>/g, '').trim().length === 0) {
        return NextResponse.json(
          {
            error: 'Export Blocked: Article body is missing or empty',
            criticalErrors: ['Article body is empty']
          },
          { status: 422 }
        );
      }
    }

    const filenameSlug = exportInput.slug || slugify(exportInput.title || 'article');
    const classification = isCleanOfficialRelease ? 'OFFICIAL_RELEASE' : 'UNAPPROVED_DRAFT';

    // 5. Generate and return requested format
    if (format === 'pdf') {
      const pdfBytes = ArticleExportService.generatePdfBuffer(exportInput, {
        skipValidation: true,
        watermarkDraft: !isCleanOfficialRelease
      });
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filenameSlug}.pdf"`,
          'Cache-Control': 'no-store',
          'X-ACUTE-Artifact-Classification': classification
        }
      });
    }

    // Default HTML
    const html = ArticleExportService.generateStandaloneHtml(exportInput, {
      skipValidation: true,
      watermarkDraft: !isCleanOfficialRelease
    });
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameSlug}.html"`,
        'Cache-Control': 'no-store',
        'X-ACUTE-Artifact-Classification': classification
      }
    });
  } catch (err: any) {
    console.error('[API /api/export] Internal error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: err?.message || 'Failed to process export' },
      { status: 500 }
    );
  }
}
