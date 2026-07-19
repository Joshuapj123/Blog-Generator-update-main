import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { SectionBlock } from '@/types/article';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { sections, serpTerms = [] } = await req.json();

    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: 'Sections array is required' }, { status: 400 });
    }

    const model = google('gemini-2.5-pro');

    const competitorTermsText = serpTerms.length > 0
      ? `\nCORE COMPETITOR TERMS (MUST COVER): ${serpTerms.filter((t: any) => t.category === 'basic' || t.importance >= 8).map((t: any) => t.term).join(', ')}`
      : '';

    const result = await generateObject({
      model,
      schema: z.object({
        flags: z.array(
          z.object({
            sectionIndex: z.number().describe('The index of the section containing the weak copy.'),
            originalPhrase: z.string().describe('The exact phrase or sentence that is too generic or the heading if identifying a coverage gap.'),
            reason: z.string().describe('Why this sounds like AI fluff or why it represents a semantic coverage gap compared to competitors.'),
            improvementSuggestion: z.string().describe('A punchier, more specific rewrite or advice on how to integrate missing semantic terms.'),
          })
        ),
      }),
      prompt: `You are an aggressive, high-standards copy editor and SEO content strategist. Your goal is to detect "weak copy" — text that sounds like generic AI boilerplate, fluffy corporate speak, or lacks specific substance.
${competitorTermsText}

Review the following blog post sections (provided as JSON) and return a list of exactly where the copy is weak.

Identify phrases that:
- Use cliché transition phrases ("In today's fast-paced digital world...")
- Are overly verbose without adding meaning
- Lack concrete examples or specific details
- **SEMANTIC COVERAGE GAPS**: Identify sections that are "thin" because they fail to mention high-importance competitor terms listed above. If a section is meant to cover a topic but misses these terms, flag it as a coverage gap.

Sections Data:
${JSON.stringify(
  sections.map((sec: SectionBlock, i: number) => ({
    index: i,
    heading: sec.heading,
    what_it_is: sec.what_it_is,
    why_it_works: sec.why_it_works,
  })),
  null,
  2
)}

Return the flags. If a section is good and has high density of unique insights, do not flag it.`,
    });

    return NextResponse.json(result.object);
  } catch (error: any) {
    console.error('Weak Copy Detect Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
