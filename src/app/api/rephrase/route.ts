import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const {
      text,
      instruction,
    }: {
      text: string;
      instruction: string;
    } = await req.json();

    if (!text || !instruction) {
      return NextResponse.json({ error: 'Text and instruction are required' }, { status: 400 });
    }

    const model = google('gemini-2.5-pro');

    const result = await generateText({
      model,
      prompt: `You are an expert AI editor. Your task is to edit/rephrase the following text according to the specific user instruction.

Original text:
"""
${text}
"""

Instruction:
${instruction}

Rules:
- Respond ONLY with the modified text.
- Do NOT add conversational filler like "Here is the rephrased text:".
- Preserve Markdown formatting if present in the original text, unless the instruction implies changing it.`,
    });

    return NextResponse.json({ text: result.text.trim() });
  } catch (error: any) {
    console.error('API Route Outer Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
