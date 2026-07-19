import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Intent types & format recommendations
// ─────────────────────────────────────────────────────────────────────────────

export type SearchIntent = 'informational' | 'navigational' | 'commercial' | 'transactional';
export type ContentFormat =
  | 'how-to guide'
  | 'listicle'
  | 'comparison'
  | 'product page'
  | 'definition'
  | 'tutorial'
  | 'review'
  | 'in-depth guide';

export interface IntentClassification {
  intent: SearchIntent;
  confidence: number;          // 0–100
  contentFormat: ContentFormat;
  reasoning: string;
  serpSignals: string[];       // what in the SERP titles triggered this classification
  formatMismatchWarning: string | null; // non-null if user's requested format mismatches
}

const IntentSchema = z.object({
  intent: z.enum(['informational', 'navigational', 'commercial', 'transactional'])
    .describe('The primary search intent for this keyword based on SERP signals'),
  confidence: z.number().min(0).max(100)
    .describe('Confidence score 0-100. Higher when SERP titles unanimously show the same format.'),
  contentFormat: z.enum([
    'how-to guide', 'listicle', 'comparison', 'product page',
    'definition', 'tutorial', 'review', 'in-depth guide',
  ]).describe('The optimal content format that matches how the SERP currently answers this query'),
  reasoning: z.string()
    .describe('One concise sentence explaining WHY this intent was classified based on the SERP evidence.'),
  serpSignals: z.array(z.string())
    .describe('2-4 specific phrases or patterns from the SERP titles that led to this classification'),
  formatMismatchWarning: z.string().nullable()
    .describe('If the user-requested format does not match the dominant SERP format, return a plain-English warning. Otherwise null.'),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/classify-intent
// Body: { keyword: string, serpTitles: string[], requestedFormat?: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const {
      keyword,
      serpTitles = [],
      requestedFormat = '',
    }: {
      keyword: string;
      serpTitles?: string[];
      requestedFormat?: string;
    } = await req.json();

    if (!keyword) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }

    const titlesBlock = serpTitles.length > 0
      ? `\nTop SERP titles currently ranking for this keyword:\n${serpTitles.map((t, i) => `  ${i + 1}. "${t}"`).join('\n')}`
      : '\n(No SERP titles available — classify based on keyword pattern alone.)';

    const requestedFormatContext = requestedFormat
      ? `\nThe user plans to write a "${requestedFormat}" for this keyword. If the dominant SERP format differs significantly, set formatMismatchWarning to a short plain-English warning.`
      : '';

    const model = google('gemini-2.5-pro');

    const result = await generateObject({
      model,
      schema: IntentSchema,
      prompt: `You are an expert SEO search intent classifier.

Classify the search intent for the keyword: "${keyword}"
${titlesBlock}
${requestedFormatContext}

Search intent definitions:
- informational: User wants to LEARN something (what is X, how does X work, X explained)
- navigational: User wants to find a SPECIFIC website or page
- commercial: User is RESEARCHING before buying (best X, X vs Y, X reviews, top X)
- transactional: User wants to BUY or DO something now (buy X, X price, X download, sign up for X)

Content format patterns:
- "how to", "guide", numbered steps → how-to guide or tutorial
- "best X", "top N", "X for beginners" → listicle or in-depth guide
- "X vs Y", "X compared to" → comparison
- "what is X", "definition of X" → definition
- "buy X", "X price", "X discount" → product page

Classify strictly based on the SERP evidence, not on keyword alone.`,
    });

    return NextResponse.json(result.object);
  } catch (err: any) {
    console.error('[classify-intent] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Intent classification failed' },
      { status: 500 },
    );
  }
}
