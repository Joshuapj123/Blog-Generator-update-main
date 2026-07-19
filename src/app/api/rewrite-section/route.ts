import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const {
      heading = '',
      body = '',
      mode = 'similar',
      articleTitle = '',
      allHeadings = [] as string[],
      selectedText = '',
    } = await req.json();

    const model = google('gemini-2.5-flash');

    const wordCount = body.split(/\\s+/).filter(Boolean).length;
    const headingContext =
      allHeadings.length > 0
        ? `\nFull article structure: ${allHeadings.join(' → ')}`
        : '';

    let modeInstruction = '';
    let isGenerate = false;

    if (mode === 'elaborate') {
      modeInstruction = selectedText 
        ? `Expand and deepen the selected text. Add more examples, data points, or explanations. Make it longer than the original selection.` 
        : `Expand and deepen this section. Add more examples, data points, and explanations. Aim for roughly 1.5–2× the original length.`;
    } else if (mode === 'shorten') {
      modeInstruction = selectedText
        ? `Condense the selected text to its core message. Be punchy and direct. Make it shorter than the original selection.`
        : `Condense this section to its core message. Be punchy and direct. Aim for roughly 50–60% of the original length.`;
    } else if (mode === 'generate') {
      isGenerate = true;
      modeInstruction = `Generate compelling new content for this section based on the heading and article title. Create original, expert-level copy with at least 200 words. Include bullet points or subpoints where appropriate. Return only the body content in Markdown.`;
    } else {
      // similar (default)
      modeInstruction = selectedText
        ? `Rewrite the selected text with fresh wording and a new angle, keeping approximately the same length. Do not add or remove significant information.`
        : `Rewrite this section with fresh wording and a new angle, keeping approximately the same length (~${wordCount} words). Do not add or remove significant information.`;
    }

    let prompt = '';

    if (isGenerate) {
      prompt = `You are an expert content writer. Generate a high-quality body section for a blog article.

Article title: "${articleTitle}"${headingContext}
Section heading: "${heading}"

Instruction: ${modeInstruction}

Rules:
- Return ONLY the body content in Markdown (no heading line)
- Use bold, bullets, or short paragraphs as appropriate for scannability
- Include a specific statistic, data point, or expert insight (E-E-A-T)
- Keep writing professional, authoritative, and engaging`;
    } else if (selectedText) {
      prompt = `You are an expert content editor. Rewrite the selected portion of the following blog section.

Article title: "${articleTitle}"${headingContext}
Section heading: "${heading}"

Full Original Context (for reference only):
${body}

Selected Text to Rewrite:
${selectedText}

Instruction: ${modeInstruction}

Rules:
- Keep Markdown formatting (bold, bullets, links if present) within the selected text.
- Do NOT rewrite or include the full context, ONLY return the rewritten selected text.
- Return ONLY the rewritten selection in Markdown, nothing else.`;
    } else {
      prompt = `You are an expert content editor. Rewrite the following blog section.

Article title: "${articleTitle}"${headingContext}
Section heading: "${heading}"

Original content (Markdown):
${body}

Instruction: ${modeInstruction}

Rules:
- Keep Markdown formatting (bold, bullets, links if present)
- Do NOT repeat or include the heading
- Return ONLY the rewritten body in Markdown, nothing else
- Preserve any YouTube embed links or internal hyperlinks`;
    }

    const result = await generateText({ model, prompt });

    return NextResponse.json({ rewritten: result.text?.trim() || '' });
  } catch (error: any) {
    console.error('[rewrite-section]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
