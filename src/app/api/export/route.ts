import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { getArticleByIdAdmin } from '@/lib/firebase/admin-firestore';
import { ArticleExportService, ExportArticleInput } from '@/lib/export/ArticleExportService';
import { slugify } from '@/lib/article-utils';
import { TemporaryArticleStore } from '@/lib/test-storage/TemporaryArticleStore';
import { PipelineTelemetryService } from '@/lib/observability/PipelineTelemetryService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function resolvePersistenceBackend(): 'FIRESTORE' | 'TEMP_TEST_STORAGE' {
  if (process.env.ACUTE_PERSISTENCE_BACKEND === 'TEMP_TEST_STORAGE') {
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

    // 3. Resolve article by articleId with strict ownership enforcement
    if (body.articleId) {
      const articleId = String(body.articleId).trim();
      const backend = resolvePersistenceBackend();

      let article: any = null;
      let rawArticle: any = null;

      if (backend === 'TEMP_TEST_STORAGE') {
        rawArticle = await TemporaryArticleStore.getArticleById(articleId, authenticatedUserId);
        article = rawArticle;
      } else {
        // Fetch raw article first to verify existence vs ownership
        rawArticle = await getArticleByIdAdmin(articleId);
        if (!rawArticle) {
          return NextResponse.json(
            { error: 'Not Found: Article does not exist' },
            { status: 404 }
          );
        }

        const cleanUid = authenticatedUserId.trim();
        const isOwner = rawArticle.userId === cleanUid || rawArticle.ownerId === cleanUid;
        if (!isOwner) {
          return NextResponse.json(
            { error: 'Forbidden: You do not have permission to export another user\'s article' },
            { status: 403 }
          );
        }
        article = rawArticle;
      }

      if (!article) {
        return NextResponse.json(
          { error: 'Not Found: Article not found or inaccessible' },
          { status: 404 }
        );
      }

      exportInput = {
        title: article.title,
        slug: article.blueprint?.slug || slugify(article.title),
        content: article.content,
        blueprint: article.blueprint,
        sections: article.blueprint?.sections,
        targetBrand: article.referenceUrl,
        validationStatus: article.validationStatus,
        validationFingerprint: article.validationFingerprint || (article as any).blueprint?.validationFingerprint,
        metadata: {
          intent: article.blueprint?.intent,
          targetKeywords: article.targetKeywords,
          publishedDate: article.persistedAt || article.createdAt
        }
      };
    } else {
      // Direct content export with authenticated user
      if (!body.title && !body.content && !body.bodyMarkdown) {
        return NextResponse.json(
          { error: 'Bad Request: Either "articleId" or "title" and content must be provided' },
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
        metadata: body.metadata
      };
    }

    // 4. Validate completeness and integrity
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

    const filenameSlug = exportInput.slug || slugify(exportInput.title || 'article');

    // 5. Generate and return requested format
    if (format === 'pdf') {
      const pdfBytes = ArticleExportService.generatePdfBuffer(exportInput, { skipValidation: true });
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filenameSlug}.pdf"`,
          'Cache-Control': 'no-store'
        }
      });
    }

    // Default HTML
    const html = ArticleExportService.generateStandaloneHtml(exportInput, { skipValidation: true });
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameSlug}.html"`,
        'Cache-Control': 'no-store'
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
