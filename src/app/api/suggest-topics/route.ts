import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { siteProfile } = await req.json();

    if (!siteProfile) {
      return NextResponse.json({ error: 'Site profile is required' }, { status: 400 });
    }

    const model = google('gemini-2.5-pro');

    const result = await generateObject({
      model,
      schema: z.object({
        suggestions: z.array(
          z.object({
            title: z.string().describe('A catchy, highly clickable article title.'),
            keywords: z.string().describe('Comma-separated list of target keywords.'),
            intent: z.enum(['informational', 'commercial']).describe('Search intent.'),
            description: z.string().describe('A 1-sentence summary of the proposed article.'),
          })
        ).min(3).max(5),
      }),
      prompt: `You are an expert content strategist and SEO planner. 
Based on the following site niche/profile: "${siteProfile}"

Generate a short editorial calendar with 3 to 5 highly relevant, SEO-optimized blog post ideas.
Make sure the topics are interesting, specific, and would attract the target audience of this site.`,
    });

    return NextResponse.json(result.object);
  } catch (error: any) {
    console.error('Suggest Topics Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
