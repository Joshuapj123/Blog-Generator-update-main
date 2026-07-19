import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { keywords } = await req.json();

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'keywords array is required' }, { status: 400 });
    }

    const model = google('gemini-2.5-flash');

    const result = await generateObject({
      model,
      schema: z.object({
        refined_keywords: z.array(z.object({
          id: z.string(),
          keyword: z.string().describe("The clean, targetable core keyword extracted from the title.")
        })),
        intent_map: z.array(z.object({
          id: z.string(),
          intent: z.enum(['informational', 'navigational', 'commercial', 'transactional'])
        }))
      }),
      prompt: `You are an expert SEO assistant. I am giving you a list of raw search data (organic titles, people also ask questions, related searches). 
      
Your tasks:
1. Extract Keyword: For 'organic_title' sources, extract the true root entity/keyword from the originalTitle (e.g. "10 Ways to Improve B2B SaaS SEO" -> "B2B SaaS SEO"). Do not return a full sentence. For PAA or related searches, usually the keyword is already fine, just clean it up if needed.
2. Classify Search Intent: Use the source and sourceSeed context to classify each keyword accurately as 'informational', 'navigational', 'commercial', or 'transactional'.

Input Data:
${JSON.stringify(keywords.map((k: any) => ({
  id: k.id,
  keyword: k.keyword,
  originalTitle: k.originalTitle,
  source: k.source,
  sourceSeed: k.sourceSeed
})), null, 2)}
`,
    });

    return NextResponse.json(result.object);
  } catch (error: any) {
    console.error('Refine Keywords Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
