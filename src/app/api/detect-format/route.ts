import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { SERP_CONFIG } from '@/config/serp-strategy';

export const maxDuration = 30;
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { top10 } = await req.json();

    if (!top10 || !Array.isArray(top10) || top10.length === 0) {
      return NextResponse.json({ error: 'Top 10 results required' }, { status: 400 });
    }

    const model = google('gemini-2.5-flash');

    const prompt = `Analyze the following top 10 search engine results for a given keyword:
${top10.map((r: any, i: number) => `${i + 1}. Title: "${r.title}"\nSnippet: "${r.snippet}"\n`).join('\n')}

Based on these results, determine the dominant content format that best satisfies the search intent.
Classify it into exactly one of these formats: "Listicle", "How-To", "Guide", "Review", "Comparison", "Landing Page".
If there is no clear dominant format or the results are highly mixed, return a lower confidence score.`;

    try {
      const result = await generateObject({
        model,
        schema: z.object({
          format: z.enum(["Listicle", "How-To", "Guide", "Review", "Comparison", "Landing Page"]),
          confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
        }),
        prompt,
      });

      const { format, confidence } = result.object;
      const split = confidence < SERP_CONFIG.FORMAT_CONFIDENCE_THRESHOLD;

      return NextResponse.json({ format, confidence, split });
    } catch (llmError) {
      console.error('LLM format detection failed:', llmError);
      // Fallback silently if LLM fails
      return NextResponse.json({ format: null, confidence: 0, split: true });
    }

  } catch (error: any) {
    console.error('API Route Error in detect-format:', error);
    // Outer fallback to ensure non-blocking
    return NextResponse.json({ format: null, confidence: 0, split: true });
  }
}
