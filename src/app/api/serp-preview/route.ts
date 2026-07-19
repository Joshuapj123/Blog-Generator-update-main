import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export interface SerpPreviewResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export async function POST(req: Request) {
  try {
    const { keyword } = await req.json();

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
    }

    const apiKey = process.env.SERP_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'SERP_KEY environment variable is not set' }, { status: 500 });
    }

    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: keyword, num: 10 }),
    });

    if (!serperRes.ok) {
      const errText = await serperRes.text();
      console.error('Serper API error:', errText);
      return NextResponse.json({ error: `Serper API error: ${serperRes.status}` }, { status: 502 });
    }

    const data = await serperRes.json();
    
    // Extract organic results explicitly ignoring ads, PAA, related searches
    const organicResults: SerpPreviewResult[] = (data.organic ?? [])
      .slice(0, 10)
      .map((r: any) => ({
        title: r.title || '',
        link: r.link || '',
        snippet: r.snippet || '',
        position: r.position || 0
      }))
      .filter((r: SerpPreviewResult) => r.link && !r.link.includes('youtube.com'));

    return NextResponse.json({
      results: organicResults
    });

  } catch (error: any) {
    console.error('SERP Preview API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
