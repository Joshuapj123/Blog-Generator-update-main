import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { text, term } = await req.json();

    if (!text || !term) {
      return NextResponse.json({ error: 'Text and term are required' }, { status: 400 });
    }

    const model = google('gemini-2.5-pro');

    const result = await generateText({
      model,
      prompt: `You are an expert SEO editor. The user wants to naturally integrate the keyword "${term}" into the provided text.
Find one specific sentence or small paragraph in the text where this term can be seamlessly injected. 

Provide your response strictly in raw valid JSON format (do not use markdown blocks). Your JSON must have exactly three keys:
1. "originalSnippet": The exact string of the sentence/paragraph from the text you are replacing. This must be an EXACT substring of the provided text so that a string replace function will work without failure. Focus on finding 1-3 sentences.
2. "rewrittenSnippet": The originalSnippet rewritten to naturally include the keyword "${term}".
3. "advice": A brief string providing placement advice (e.g. "Inserted '${term}' in the Introduction where you discussed X").

If the text is too short or it is completely impossible to insert the term naturally without ruining the text, you may fall back to an empty originalSnippet and rewrittenSnippet, and just provide advice on where they could manually add a new section.

Original text:
"""
${text}
"""
`,
    });

    try {
        let jsonStr = result.text.trim();
        // Fallback for models ignoring json-only instruction
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        const parsed = JSON.parse(jsonStr);
        return NextResponse.json(parsed);
    } catch (e: any) {
        console.error("Failed to parse JSON from AI: ", result.text);
        return NextResponse.json({ error: "Failed to parse AI response into JSON" }, { status: 500 });
    }

  } catch (error: any) {
    console.error('API Route Outer Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
