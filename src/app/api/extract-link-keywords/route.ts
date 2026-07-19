import { google } from '@ai-sdk/google';
import { streamObject } from 'ai';
import { z } from 'zod';
import { getArticleById, getContentPlanById, getExternalLinks } from '@/lib/firebase/firestore';
import { getPromptKeywords } from '@/lib/keyword-bank';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function filterRelevantLSI(text: string, lsiKeywords: string[]): string[] {
  const lower = text.toLowerCase();
  return lsiKeywords
    .filter(kw =>
      kw.toLowerCase().split(' ')
        .some(w => w.length > 4 && lower.includes(w))
    )
    .slice(0, 10);
}

function resolveAnchorText(keyword: string, text: string): string | null {
  const exact = text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  if (exact) return exact[0];

  const words = keyword.split(' ');
  const loosePattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.{0,15}');
  const loose = text.match(new RegExp(loosePattern, 'i'));
  if (loose) return loose[0];

  return null;
}

export async function POST(req: Request) {
  try {
    const { selectedText, documentId, keywordBank } = await req.json();

    if (!selectedText || typeof selectedText !== 'string') {
      return new Response(JSON.stringify({ error: 'selectedText is required' }), { status: 400 });
    }

    // 1. Parallel pre-fetch
    const cachePromise = getExternalLinks().then(links => {
        const hits = [];
        const lowerText = selectedText.toLowerCase();
        for (const link of links) {
            if (!link.title) continue;
            const lowerTitle = link.title.toLowerCase();
            if (lowerText.includes(lowerTitle)) {
                hits.push({ keyword: link.title, url: link.url, title: link.title });
            }
        }
        return hits;
    });

    const lsiPromise = (async () => {
        if (keywordBank) {
            return getPromptKeywords(keywordBank, 'inline');
        }
        if (!documentId) return [];
        const article = await getArticleById(documentId);
        if (article?.planId) {
            const plan = await getContentPlanById(article.planId);
            const targets = plan?.targetKeywords || [];
            const objTargets = (plan?.keywordTargets || []).map(k => k.keyword);
            return Array.from(new Set([...targets, ...objTargets, ...(article.targetKeywords || [])]));
        }
        return article?.targetKeywords || [];
    })();

    const [cacheHits, allLSI] = await Promise.all([cachePromise, lsiPromise]);
    const relevantLSI = filterRelevantLSI(selectedText, allLSI);

    const wordCount = selectedText.trim().split(/\\s+/).length;
    const maxKeywords = Math.min(5, Math.max(1, Math.floor(wordCount / 80)));

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    const send = (data: object) =>
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

    // Flush cache hits
    const sentKeywords = new Set<string>();
    if (cacheHits.length) {
      for (const hit of cacheHits) {
        const anchorText = resolveAnchorText(hit.keyword, selectedText);
        if (anchorText) {
            send({ type: 'cache', keyword: hit.keyword, anchorText, url: hit.url, title: hit.title, source: 'Cache', confidence: 'high' });
            sentKeywords.add(hit.keyword.toLowerCase());
        }
      }
    }

    const prompt = `You are an SEO content analyst. Extract linkable entities from the text below.

ENTITY TYPES TO EXTRACT (priority order):
1. Named tools, platforms, software, products     e.g. "Ahrefs", "Google Search Console"
2. Proper industry concepts or methodologies      e.g. "topical authority", "E-E-A-T"
3. Specific techniques or named frameworks        e.g. "skyscraper technique"
4. Well-known people, organisations, standards    e.g. "John Mueller", "schema.org"

DO NOT extract:
- Generic nouns: "strategy", "content", "platform", "example", "results"
- Verb phrases: "improve rankings", "boost traffic"
- Adjective-noun pairs that aren't established terms: "strong backlinks"
- Anything already hyperlinked in the text

PRIORITISATION: If any of these LSI keywords appear in or near the text,
prefer extracting them: [${relevantLSI.join(', ')}]

confidence: "high" = clearly established linkable entity | "medium" = borderline
Return at most ${maxKeywords} items. Return empty array if none qualify.

TEXT:
${selectedText}`;

    // Start streaming asynchronously
    (async () => {
        try {
            const result = await streamObject({
                model: google('gemini-2.5-flash'),
                prompt,
                temperature: 0.1,
                schema: z.object({
                    keywords: z.array(z.object({
                        keyword: z.string(),
                        type: z.enum(['tool', 'concept', 'technique', 'org']),
                        confidence: z.enum(['high', 'medium'])
                    }))
                })
            });

            for await (const partialObject of result.partialObjectStream) {
                if (partialObject.keywords) {
                    for (const kw of partialObject.keywords) {
                        if (kw?.keyword && kw?.type && kw?.confidence) {
                            const normalized = kw.keyword.toLowerCase();
                            if (!sentKeywords.has(normalized)) {
                                sentKeywords.add(normalized);
                                const anchorText = resolveAnchorText(kw.keyword, selectedText);
                                send({
                                    type: 'keyword',
                                    keyword: kw.keyword,
                                    entityType: kw.type,
                                    confidence: kw.confidence,
                                    anchorText,
                                    source: 'SERP'
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Gemini stream error:', e);
        } finally {
            send({ type: 'done' });
            writer.close();
        }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('API /extract-link-keywords Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
