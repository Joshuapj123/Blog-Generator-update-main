import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const KeywordSchema = z.object({
  keyword: z.string().describe('The keyword phrase to target'),
  intent: z.enum(['primary', 'secondary', 'long-tail']).describe('The SEO role of this keyword'),
  category: z.enum(['core', 'expansion', 'long-tail', 'competitor']).describe('How this keyword was derived'),
  searchIntent: z.enum(['informational', 'navigational', 'commercial', 'transactional']).describe('The user search intent behind this keyword'),
  rationale: z.string().describe('One sentence on why this keyword is valuable for this article'),
});

export async function POST(req: Request) {
  try {
    const { title } = await req.json();

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const model = google('gemini-2.5-pro');

    const result = await generateObject({
      model,
      schema: z.object({
        keywords: z.array(KeywordSchema).min(5).max(12).describe('A diverse set of keywords covering primary, secondary, and long-tail opportunities'),
      }),
      prompt: `You are a senior SEO strategist. Given the blog post title: "${title}", generate a strategic keyword set using three techniques:

1. **Competitor Blog Analysis** — What keywords do top-ranking competitor articles on this topic consistently target?
2. **Semantic Expansion** — What related terms, synonyms, and conceptually adjacent phrases should be included?
3. **Search Intent Mapping** — For each keyword, identify whether the searcher wants information, comparison, or to purchase/sign up.

Return exactly:
- 1 primary keyword (the exact best-fit phrase for the entire article)
- 3-5 secondary keywords (supporting phrases for H2/H3 sections)
- 3-5 long-tail keywords (specific question phrases, low-competition opportunities)
- 1-2 competitor-derived keywords (phrases competitor articles rank for that we should also target)

Focus on realistic, rankable keywords — not obvious vanity phrases. Prioritize specificity and intent alignment.`,
    });

    return NextResponse.json({
      mode: 'ai',
      keywords: result.object.keywords,
    });

  } catch (error: any) {
    console.error('Keyword Suggestion API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
