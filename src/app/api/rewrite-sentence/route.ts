import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { sentence, term, context } = await req.json();

    if (!sentence || !term) {
      return NextResponse.json({ error: 'Missing sentence or term' }, { status: 400 });
    }

    const prompt = `You are an expert SEO copywriter. 
Take the following competitor sentence, which uses the target term "${term}".
Your goal is to rewrite this fact/information into ONE completely original sentence so it passes plagiarism checks, while keeping the term "${term}".
Make it match the tone and flow of the provided existing context of the user's article.

Competitor Sentence:
"${sentence}"

User's Existing Article Context:
"""
${context || 'No specific context provided. Write in a neutral, authoritative blog tone.'}
"""

Requirements:
- Output ONLY the single rewritten sentence. No explanations, no quotation marks.
- The sentence must include the exact phrase "${term}".
- Ensure the meaning remains accurate but the phrasing is uniquely original.
`;

    const result = await generateText({
      model: google('gemini-2.5-flash'), // fast model
      prompt,
      temperature: 0.8,
    });

    return NextResponse.json({ text: result.text.trim() });
  } catch (error: any) {
    console.error('API /rewrite-sentence Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
