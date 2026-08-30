import { NextResponse } from 'next/server';
import { DistributionRequestSchema, ContentAsset } from '@/core/contracts/schemas';
import { DistributionService } from '@/lib/distribution/DistributionService';
import { WebhookDistributionProvider } from '@/lib/distribution/WebhookDistributionProvider';
import { getArticleById } from '@/lib/firebase/firestore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // 1. Zod request validation
    const requestVal = DistributionRequestSchema.safeParse(payload.request);
    if (!requestVal.success) {
      return NextResponse.json({ 
        error: 'Invalid distribution request schema parameters.',
        details: requestVal.error.issues
      }, { status: 400 });
    }

    const distRequest = requestVal.data;

    // 2. Fetch the ContentAsset (Article)
    const article = await getArticleById(distRequest.contentAssetId);
    if (!article) {
      return NextResponse.json({ 
        error: `ContentAsset (Article) not found with ID: ${distRequest.contentAssetId}`
      }, { status: 404 });
    }

    // 3. Map stored Article model to ContentAsset structure
    const contentAsset: ContentAsset = {
      title: article.title,
      bodyMarkdown: article.content || 'Mock content body',
      wordCount: (article.content || '').split(/\s+/).filter(Boolean).length || 100,
      seoScore: (article as any).seoScore || 80,
      references: (article as any).references || [],
      slug: (article as any).slug || article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      assetType: (article as any).assetType || 'ARTICLE',
      targetKeyword: article.sourceKeyword || '',
      metaTitle: (article as any).metaTitle || article.title,
      metaDescription: (article as any).metaDescription || '',
      validationStatus: (article as any).validationStatus || 'READY'
    };

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

    // 5. Initialize providers and distribution service
    const webhookProvider = new WebhookDistributionProvider();
    const service = new DistributionService([webhookProvider]);

    // 6. Execute distribution request
    const results = await service.distributeAsset(
      saasProfile,
      contentAsset,
      distRequest,
      { dryRun: payload.dryRun }
    );

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('[Distribution API] Execution Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
