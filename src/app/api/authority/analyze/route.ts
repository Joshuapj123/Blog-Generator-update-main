import { NextResponse } from 'next/server';
import { MockAuthorityProvider } from '@/lib/authority/MockAuthorityProvider';
import { AuthorityOpportunityService } from '@/lib/authority/AuthorityOpportunityService';
import { getAuthorityOpportunities, saveAuthorityOpportunity } from '@/lib/firebase/firestore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { assetId, saasProfile } = payload;

    if (!assetId || !saasProfile) {
      return NextResponse.json({ error: 'Missing assetId or saasProfile parameter.' }, { status: 400 });
    }

    // 1. Initialize Mock Authority Provider and Service
    const provider = new MockAuthorityProvider();
    const service = new AuthorityOpportunityService(provider);

    const asset = {
      id: assetId,
      title: 'Top Developer Resumes',
      slug: 'top-developer-resumes',
      status: 'published' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const searchOpp = {
      keyword: 'best AI builders',
      searchVolume: 1200,
      difficulty: 45,
      intent: 'commercial' as const,
      priority: 'high' as const,
      serpCompetitors: ['tealhq.com']
    };

    // 2. Analyze opportunities
    const opportunities = await service.analyzeOpportunities(
      saasProfile,
      asset as any,
      searchOpp as any
    );

    // 3. Persist opportunities in firestore (handled inside the service, but let's confirm or save explicitly if needed)
    for (const opp of opportunities) {
      try {
        await saveAuthorityOpportunity(opp);
      } catch (err: any) {
        console.warn('[Authority API] Firestore save warning:', err.message);
      }
    }

    return NextResponse.json({
      opportunities
    });
  } catch (err: any) {
    console.error('[Authority API] Analysis Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
