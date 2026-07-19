import { NextResponse } from 'next/server';
import { extractKeywordViaSidecar } from '@/lib/nlp-sidecar';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { rawText, rawHtml, serpContext, masterKeywords = [] } = await req.json();

    if (!rawText) {
      return NextResponse.json({ error: 'Missing raw text for extraction' }, { status: 400 });
    }

    let referenceKeywords: string[] = [];
    let nlpCategories: any = { must_have: [], supplementary: [], contextual: [] };
    let pipelineVersion = "v1";
    let degradedFallback = false;

    const sidecarResult = await extractKeywordViaSidecar(
      rawText,
      rawHtml || '',
      serpContext,
      30,
    );

    if (sidecarResult && sidecarResult.categories) {
      referenceKeywords = sidecarResult.seo_keywords || [];
      nlpCategories = sidecarResult.categories;
      pipelineVersion = sidecarResult.pipeline_version || "v2";
      
      // Elevate explicitly provided master keywords to Must-Have
      const existingSet = new Set(nlpCategories.must_have.map((k: string) => k.toLowerCase()));
      for (const mk of masterKeywords) {
          if (!existingSet.has(mk.toLowerCase())) {
            nlpCategories.must_have.push(mk);
          }
      }
    } else {
      // Fallback: Graceful degradation using only Master Keywords
      degradedFallback = true;
      referenceKeywords = masterKeywords;
      nlpCategories.must_have = masterKeywords;
    }

    return NextResponse.json({
      referenceKeywords,
      nlpCategories,
      pipelineVersion,
      degradedFallback
    });
  } catch (error: any) {
    console.error('NLP Extract Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
