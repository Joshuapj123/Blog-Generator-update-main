import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/intent-alignment
// Checks whether the first 500 words of a generated article actually satisfy
// the classified search intent for the target keyword.
//
// Body: {
//   keyword: string,
//   intent: 'informational' | 'navigational' | 'commercial' | 'transactional',
//   articleOpening: string,   // first ~500 words (plain text)
//   contentFormat: string,    // e.g. "how-to guide"
// }
// ─────────────────────────────────────────────────────────────────────────────

const AlignmentSchema = z.object({
  score: z.number().min(0).max(100)
    .describe('Intent alignment score 0–100. 90+ = excellent, 70–89 = acceptable, < 70 = needs improvement.'),
  verdict: z.enum(['excellent', 'acceptable', 'needs_improvement'])
    .describe('Human-readable verdict tier based on the score.'),
  misalignments: z.array(z.string()).max(4)
    .describe('Up to 4 specific, actionable misalignments found in the article opening. Each must be a concrete sentence, not a generic tip. Empty array if score >= 85.'),
  strengths: z.array(z.string()).max(3)
    .describe('1–3 specific things the article opening does well for this intent. Concrete examples from the text.'),
  topFix: z.string().nullable()
    .describe('The single highest-impact fix the writer can make right now to improve alignment. Null if score >= 85.'),
});

export type IntentAlignmentResult = {
  score: number;
  verdict: 'excellent' | 'acceptable' | 'needs_improvement';
  misalignments: string[];
  strengths: string[];
  topFix: string | null;
};

export async function POST(req: Request) {
  try {
    const {
      keyword,
      intent,
      articleOpening,
      contentFormat = '',
    }: {
      keyword: string;
      intent: string;
      articleOpening: string;
      contentFormat?: string;
    } = await req.json();

    if (!keyword || !intent || !articleOpening) {
      return NextResponse.json(
        { error: 'keyword, intent, and articleOpening are required' },
        { status: 400 },
      );
    }

    // Truncate to first 600 words to keep the prompt cost low
    const truncatedOpening = articleOpening.split(/\s+/).slice(0, 600).join(' ');

    const model = google('gemini-2.5-pro');

    const intentDescriptions: Record<string, string> = {
      informational:
        'User wants to LEARN. Article should deliver a clear answer, definition, or explanation early — ideally in the first paragraph.',
      navigational:
        'User wants to reach a specific resource. Article should immediately provide the link or direct path.',
      commercial:
        'User is RESEARCHING before buying. Article should compare options, list pros/cons, give verdicts.',
      transactional:
        'User wants to ACT NOW. Article should present clear options, CTAs, pricing, or steps to complete the action.',
    };

    const intentDesc = intentDescriptions[intent] ?? intent;

    const result = await generateObject({
      model,
      schema: AlignmentSchema,
      prompt: `You are an expert SEO content alignment analyst.

KEYWORD: "${keyword}"
CLASSIFIED SEARCH INTENT: ${intent.toUpperCase()}
INTENT DEFINITION: ${intentDesc}
RECOMMENDED CONTENT FORMAT: ${contentFormat || 'not specified'}

ARTICLE OPENING (first ~500 words):
"""
${truncatedOpening}
"""

Task: Evaluate how well the article opening satisfies the classified search intent for the keyword.

Scoring rubric:
- 90–100: Opening immediately satisfies the intent. For informational queries, a direct answer appears in paragraph 1. For commercial, options/comparison starts within the first 2 sections.
- 70–89: Generally aligned but missing 1–2 key intent signals (e.g. no direct answer paragraph for informational, no comparison table intro for commercial).
- 50–69: Partially aligned. Article is on-topic but doesn't follow the expected format pattern for this intent type.
- < 50: Misaligned. Wrong content format, wrong angle, or answer buried too deep for the classified intent.

Be specific and concrete. Reference actual phrases from the article opening in your strengths and misalignments.`,
    });

    return NextResponse.json(result.object);
  } catch (err: any) {
    console.error('[intent-alignment] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Alignment check failed' },
      { status: 500 },
    );
  }
}
