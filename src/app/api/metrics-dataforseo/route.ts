import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { keywords } = await req.json();

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'keywords array is required' }, { status: 400 });
    }

    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;

    // Structure for actual DataForSEO call when credentials are ready
    if (login && password) {
      // Example DataForSEO implementation
      /*
      const post_array = [{
        "location_name": "United States",
        "language_name": "English",
        "keywords": keywords.slice(0, 100) // limit per request
      }];
      
      const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/search_volume/live', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(login + ':' + password).toString('base64'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(post_array)
      });
      const data = await response.json();
      ...
      */
    }

    // Mocking for now
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API latency

    const metricsMap: Record<string, { volume: number; kd: number; cpc: number }> = {};
    
    keywords.forEach(kw => {
      // Deterministic mock generation based on string length
      const len = kw.length;
      metricsMap[kw] = {
        volume: Math.floor(Math.random() * 5000) + (len * 100),
        kd: Math.min(100, Math.max(0, Math.floor(Math.random() * 40) + (100 - len * 2))), // Shorter keywords usually harder
        cpc: parseFloat((Math.random() * 5 + 1).toFixed(2))
      };
    });

    return NextResponse.json({ metrics: metricsMap });
  } catch (error: any) {
    console.error('DataForSEO API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
