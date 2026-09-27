import { NextResponse } from 'next/server';
import { SitemapDiscoveryService } from '@/lib/research/SitemapDiscoveryService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { domain, topic = '', targetKeyword = '' } = body;

    if (!domain || typeof domain !== 'string' || !domain.trim()) {
      return NextResponse.json({ error: 'Domain is required for internal linking discovery.' }, { status: 400 });
    }

    const result = await SitemapDiscoveryService.getInternalLinkRecommendations({
      domain: domain.trim(),
      topic: topic.trim(),
      targetKeyword: targetKeyword.trim()
    });

    if (result.error) {
      return NextResponse.json({
        domain: result.domain,
        totalDiscovered: 0,
        sitemapFound: false,
        candidates: [],
        error: result.error
      }, { status: 400 });
    }

    return NextResponse.json({
      domain: result.domain,
      totalDiscovered: result.totalDiscovered,
      sitemapFound: result.sitemapFound,
      candidates: result.candidates
    });

  } catch (err: any) {
    console.error('[API Route: internal-links] Error:', err);
    return NextResponse.json({
      error: err.message || 'Internal link discovery failed.',
      candidates: [],
      totalDiscovered: 0
    }, { status: 500 });
  }
}
