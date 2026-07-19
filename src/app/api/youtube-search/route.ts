import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 503 });
    }

    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: '5',
      relevanceLanguage: 'en',
      key: apiKey,
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`YouTube API error ${res.status}: ${errText}`);
    }

    const data = await res.json();

    const results = (data.items || [])
      .filter((item: any) => item.id?.videoId)
      .map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet?.title || 'Unknown title',
        description: item.snippet?.description?.slice(0, 100) || '',
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          '',
        channelTitle: item.snippet?.channelTitle || '',
      }));

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('[youtube-search]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
