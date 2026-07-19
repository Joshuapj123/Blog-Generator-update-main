import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { rawText, mediaContext } = await req.json();

    if (!rawText) {
      return NextResponse.json({ error: 'Missing raw text for analysis' }, { status: 400 });
    }

    const model = google('gemini-2.5-pro');
    const prompt = `Analyze the following extracted content and media from a reference blog post:
          
ARTICLE CONTENT:
${(rawText || '').slice(0, 15000)}

MEDIA FOUND:
Images: ${(mediaContext?.images || []).join('\n')}
Videos: ${(mediaContext?.videos || []).join('\n')}

Identify the SEO keywords used, describe the flow and structure of the blog, categorize the types of images and video content used (e.g., infographics, screenshots, explainer videos) referencing the specific media, and list the technical or editorial factors that likely make this content successful for SEO/GEO. Finally, identify any content gaps—topics or angles this article doesn't cover that a reader would reasonably expect.`;

    const analysisResult = await generateObject({
      model,
      schema: z.object({
        seoKeywords: z.array(z.string()).describe("List of inferred target SEO keywords used in the reference."),
        contentStructure: z.string().describe("Qualitative description of the blog's pacing, hooks, formatting, and sections."),
        imageTypes: z.array(z.string()).describe("Descriptions of visual assets used (e.g., charts, photos, screenshots, videos) and their perceived purpose based on alt/captions."),
        successFactors: z.array(z.string()).describe("Technical or editorial patterns that make this content rank well structurally or topically."),
        contentGaps: z.array(z.string()).describe("Topics or angles this article doesn't cover that a reader would reasonably expect (e.g., 'No mention of pricing', 'Missing mobile guidance').")
      }),
      prompt
    });

    return NextResponse.json({ aiAnalysis: analysisResult.object });
  } catch (error: any) {
    console.error('API Route Error in analyze-reference:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
