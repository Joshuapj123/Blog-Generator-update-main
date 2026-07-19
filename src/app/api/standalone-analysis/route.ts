import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const maxDuration = 120;

// ── NLP Sidecar config ────────────────────────────────────────────────────────
// The Python sidecar (Railway) exposes /extract-seo-keywords.
// If the env var is not set we degrade to the JS fallback below.
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || '';
const NLP_SERVICE_KEY = process.env.NLP_SERVICE_KEY || '';


// ── Call Python NLP sidecar ───────────────────────────────────────────────────
async function extractKeywordViaSidecar(
  plainText: string,
  htmlText: string = '',
  serpContext?: { titles?: string[], paaQuestions?: string[], relatedSearches?: string[] },
  topN = 30,
): Promise<any | null> {
  if (!NLP_SERVICE_URL) return null;
  try {
    const supplementary_texts = [
      ...(serpContext?.titles || []),
      ...(serpContext?.paaQuestions || []),
      ...(serpContext?.relatedSearches || [])
    ];

    const baseUrl = NLP_SERVICE_URL.startsWith('http') ? NLP_SERVICE_URL : `https://${NLP_SERVICE_URL}`;
    const res = await fetch(`${baseUrl}/extract-seo-keywords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(NLP_SERVICE_KEY ? { 'x-api-key': NLP_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({ 
        plain_text: plainText, 
        html_text: htmlText, 
        supplementary_texts,
        depth: 'deep',
        top_n: topN 
      }),
      signal: AbortSignal.timeout(45_000),   // 45 s timeout — generous for cold starts
    });
    if (!res.ok) {
      console.warn(`[standalone-analysis] NLP sidecar returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[standalone-analysis] NLP sidecar unavailable, failing over to master keywords fallback.', err);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { text, referenceContext, refRawText, refRawHtml, serpContext, masterKeywords = [], nlpExtraction } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Missing text content to analyze' }, { status: 400 });
    }

    // ── Reference keyword extraction ─────────────────────────────────────────
    let referenceKeywords: string[] = [];
    let nlpCategories: any = { must_have: [], supplementary: [], contextual: [] };
    let pipelineVersion = "v1";
    let degradedFallback = false;

    // Use passed-in NLP extraction if available (persisted from extraction stage)
    if (nlpExtraction && nlpExtraction.categories) {
      referenceKeywords = nlpExtraction.referenceKeywords || nlpExtraction.seo_keywords || [];
      nlpCategories = nlpExtraction.categories || nlpCategories;
      pipelineVersion = nlpExtraction.pipelineVersion || nlpExtraction.pipeline_version || "v2";
      degradedFallback = nlpExtraction.degradedFallback || false;
      
      const existingSet = new Set(nlpCategories.must_have.map((k: string) => k.toLowerCase()));
      for (const mk of masterKeywords) {
          if (!existingSet.has(mk.toLowerCase())) {
            nlpCategories.must_have.push(mk);
          }
      }
    } else if (refRawText) {
      // Fallback if not passed in: attempt to extract now
      const sidecarResult = await extractKeywordViaSidecar(
        refRawText,
        refRawHtml || '',
        serpContext,
        30,
      );

      if (sidecarResult && sidecarResult.categories) {
        referenceKeywords = sidecarResult.seo_keywords || [];
        nlpCategories = sidecarResult.categories;
        pipelineVersion = sidecarResult.pipeline_version || "v2";
        
        const existingSet = new Set(nlpCategories.must_have.map((k: string) => k.toLowerCase()));
        for (const mk of masterKeywords) {
           if (!existingSet.has(mk.toLowerCase())) {
              nlpCategories.must_have.push(mk);
           }
        }
      } else {
        degradedFallback = true;
        referenceKeywords = masterKeywords;
        nlpCategories.must_have = masterKeywords;
      }
    }

    // ── Draft (Generated) Keyword extraction ──────────────────────────────────
    let draftNlpExtraction = null;
    if (text) {
      draftNlpExtraction = await extractKeywordViaSidecar(text, '', serpContext, 30);
    }

    const model = google('gemini-2.5-flash');

    const prompt = `You are a high-standards SEO and Copy Editor.
We are evaluating the following drafted article against the target Reference Article.

REFERENCE ARTICLE CONTEXT:
${referenceContext || 'No specific reference provided. Evaluate on general quality.'}

DRAFTED ARTICLE:
${text.slice(0, 15000)}

Your Tasks:
1. "positives": Find exact short phrases (3–10 words) in the DRAFTED ARTICLE that are strong SEO keywords, specific factual claims, or strong semantic signals. These must be exact substrings of the draft.
2. "weakCopyItems": Find generic, fluffy, AI-sounding phrases in the draft. Suggest punchier, specific improvements.
3. "semanticMatches": Find sentences or phrases in the DRAFT that functionally match the same intent or topic as the reference article. These must be exact substrings of the draft.

IMPORTANT: The phrases in "positives" and "semanticMatches" MUST be exact substrings found in the drafted article so they can be highlighted. Keep them short (3–10 words).
`;

    const result = await generateObject({
      model,
      schema: z.object({
        positives: z.array(z.string()).describe('Exact short phrases in the DRAFTED article representing strong SEO keywords or specific statements.'),
        weakCopyItems: z.array(
          z.object({
            phrase: z.string().describe('Exact generic/fluffy phrase from the draft.'),
            improvement: z.string().describe('Suggested rewrite.'),
          })
        ).describe('Phrases needing improvement.'),
        semanticMatches: z.array(z.string()).describe('Exact phrases from the draft matching the reference intent.'),
      }),
      prompt,
    });

    return NextResponse.json({
      ...result.object,
      // Include deterministically extracted reference keywords so the frontend
      // can show "reference keywords present/missing in your article" independently
      referenceKeywords,
      nlpCategories,
      pipelineVersion,
      degradedFallback,
      draftNlpExtraction
    });
  } catch (error: any) {
    console.error('Standalone Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
