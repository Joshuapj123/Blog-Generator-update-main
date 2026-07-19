import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { term, context, tone = 'professional' } = await req.json();

    if (!term) {
      return NextResponse.json({ error: 'Missing term' }, { status: 400 });
    }

    const prompt = `You are an expert SEO copywriter. 
Your task is to write ONE seamless, natural sentence that incorporates the exact phrase: "${term}".
The sentence must fit perfectly within the following existing context of an article.
Do not hallucinate facts unrelated to the context. 
Tone: ${tone}

Existing Context:
"""
${context || 'No specific context provided. Write a high-quality standalone sentence for an authoritative blog.'}
"""

Requirements:
- Output ONLY the single sentence. No explanations, no quotation marks around it.
- The sentence should flow logically as an addition to the provided context.
- Use the exact term "${term}".
`;

    const result = await generateText({
      model: google('gemini-2.5-flash'), // fast model for single sentence
      prompt,
      temperature: 0.7,
    });

    return NextResponse.json({ text: result.text.trim() });
  } catch (error: any) {
    console.error('API /suggest-sentence Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
