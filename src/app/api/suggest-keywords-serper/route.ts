import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CONCURRENCY_LIMIT = 3;
const DELAY_MS = 400;

// ── Serper API response types (minimal subset we need) ───────────────────────

interface SerperOrganic {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
}

interface SerperPAA {
  question: string;
  snippet: string;
  title: string;
  link: string;
}

interface SerperRelated {
  query: string;
}

interface SerperResponse {
  organic?: SerperOrganic[];
  peopleAlsoAsk?: SerperPAA[];
  relatedSearches?: SerperRelated[];
  knowledgeGraph?: { title?: string; description?: string };
}

// ── Keyword result shape — mirrors GadsKeywordResult in the engine UI ─────────
export interface SerperKeywordResult {
  id: string;                                     // Stable UUID
  keyword: string;
  normalizedTokens: string;                       // for exact/near dedup
  source: 'organic_title' | 'paa_question' | 'related_search';
  sourceSeed?: string;                            // Tag with the seed query that produced this
  originalTitle?: string;
  position?: number;                              // organic rank if applicable
  snippet?: string;                               // supporting context
  intent: 'primary' | 'secondary' | 'long-tail';
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  competition: 'LOW' | 'MEDIUM' | 'HIGH';         // estimated from rank position
  estimatedDifficulty: number;
  avgMonthlySearches: null;
  cpcLow: null;
  cpcHigh: null;
}

// ── Heuristic helpers ────────────────────────────────────────────────────────

function competitionFromRank(pos?: number): { competition: 'LOW' | 'MEDIUM' | 'HIGH'; score: number } {
  if (!pos || pos > 7) return { competition: 'LOW', score: 0.25 };
  if (pos <= 3) return { competition: 'HIGH', score: 0.85 };
  return { competition: 'MEDIUM', score: 0.55 };
}

function detectIntent(kw: string): 'informational' | 'navigational' | 'commercial' | 'transactional' {
  const text = kw.toLowerCase();
  if (/\b(buy|purchase|price|pricing|cost|cheap|discount|coupon|deal|order|shop)\b/.test(text)) return 'transactional';
  if (/\b(best|top|vs|versus|compare|comparison|review|alternative|recommended)\b/.test(text)) return 'commercial';
  if (/\b(how|what|why|when|where|who|guide|tutorial|learn|understand|example|definition)\b/.test(text)) return 'informational';
  return 'navigational';
}

function titleToKeyword(title: string, seedQuery: string): string {
  let kw = title.split(/\s*[|—–-]\s+/).shift() ?? title;
  const words = kw.trim().split(/\s+/);
  if (words.length > 8) kw = words.slice(0, 8).join(' ');
  return kw.trim() || seedQuery;
}

function intentTier(source: SerperKeywordResult['source'], pos?: number): SerperKeywordResult['intent'] {
  if (source === 'organic_title' && pos && pos <= 2) return 'primary';
  if (source === 'paa_question') return 'long-tail';
  if (source === 'related_search') return 'long-tail';
  return 'secondary';
}

function normalizeKeywordForDedup(kw: string): string {
  let normalized = kw.toLowerCase();
  // Strip punctuation
  normalized = normalized.replace(/[^\w\s]/g, '');
  // Strip 4-digit years (e.g. 2024, 2025)
  normalized = normalized.replace(/\b20\d{2}\b/g, '');
  
  let tokens = normalized.split(/\s+/).filter(Boolean);
  
  // Stop words
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  tokens = tokens.filter(t => !stopWords.has(t));
  
  // Light stemming
  tokens = tokens.map(t => {
    if (t.endsWith('ing')) return t.slice(0, -3);
    if (t.endsWith('ers')) return t.slice(0, -3);
    if (t.endsWith('er')) return t.slice(0, -2);
    if (t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
    return t;
  });
  
  return tokens.sort().join(' ');
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let queries: string[] = [];

    // Fallback logic for backward compatibility
    if (body.query && typeof body.query === 'string') {
      queries = [body.query];
    } else if (Array.isArray(body.queries)) {
      queries = body.queries;
    }

    if (queries.length === 0) {
      return NextResponse.json({ error: 'queries array is required' }, { status: 400 });
    }

    const apiKey = process.env.SERP_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'SERP_KEY environment variable is not set' }, { status: 500 });
    }

    // ── Call Serper in chunked batches ───────────────────────────────────────
    const results: { query: string; data: SerperResponse }[] = [];
    
    for (let i = 0; i < queries.length; i += CONCURRENCY_LIMIT) {
      const batch = queries.slice(i, i + CONCURRENCY_LIMIT);
      
      const fetchPromises = batch.map(async (query) => {
        const serperRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: query, num: 10 }),
        });

        if (!serperRes.ok) {
          throw new Error(`Serper API error: ${serperRes.status}`);
        }

        const data: SerperResponse = await serperRes.json();
        return { query, data };
      });

      const batchResults = await Promise.all(fetchPromises);
      results.push(...batchResults);
      
      // Delay before next batch if there are more queries
      if (i + CONCURRENCY_LIMIT < queries.length) {
        await delay(DELAY_MS);
      }
    }

    // Merge strategy: map normalized tokens to SerperKeywordResult
    const keywordMap = new Map<string, SerperKeywordResult>();

    for (const { query: seedQuery, data } of results) {
      const add = (kw: Omit<SerperKeywordResult, 'normalizedTokens'>) => {
        const normalizedTokens = normalizeKeywordForDedup(kw.keyword);
        if (!normalizedTokens) return; // Ignore if empty after stripping

        const existing = keywordMap.get(normalizedTokens);
        if (existing) {
          // If duplicate, keep the one with higher organic rank (lower position number)
          const isOrganic = kw.source === 'organic_title';
          const existingIsOrganic = existing.source === 'organic_title';

          if (isOrganic) {
            if (!existingIsOrganic || (kw.position && existing.position && kw.position < existing.position)) {
              keywordMap.set(normalizedTokens, { ...kw, id: existing.id, normalizedTokens });
            }
          }
        } else {
          keywordMap.set(normalizedTokens, { ...kw, normalizedTokens });
        }
      };

      // 1. Organic titles
      (data.organic ?? []).slice(0, 7).forEach((item) => {
        const keyword = titleToKeyword(item.title, seedQuery);
        const { competition, score } = competitionFromRank(item.position);
        add({
          id: crypto.randomUUID(),
          keyword,
          originalTitle: item.title,
          source: 'organic_title',
          sourceSeed: seedQuery,
          position: item.position,
          snippet: item.snippet,
          intent: intentTier('organic_title', item.position),
          searchIntent: detectIntent(keyword),
          competition,
          estimatedDifficulty: score,
          avgMonthlySearches: null,
          cpcLow: null,
          cpcHigh: null,
        });
      });

      // 2. PAA
      (data.peopleAlsoAsk ?? []).slice(0, 5).forEach((item) => {
        add({
          id: crypto.randomUUID(),
          keyword: item.question,
          source: 'paa_question',
          sourceSeed: seedQuery,
          snippet: item.snippet,
          intent: 'long-tail',
          searchIntent: 'informational',
          competition: 'LOW',
          estimatedDifficulty: 0.2,
          avgMonthlySearches: null,
          cpcLow: null,
          cpcHigh: null,
        });
      });

      // 3. Related searches
      (data.relatedSearches ?? []).slice(0, 6).forEach((item) => {
        const { competition, score } = competitionFromRank(undefined);
        add({
          id: crypto.randomUUID(),
          keyword: item.query,
          source: 'related_search',
          sourceSeed: seedQuery,
          intent: intentTier('related_search'),
          searchIntent: detectIntent(item.query),
          competition,
          estimatedDifficulty: score,
          avgMonthlySearches: null,
          cpcLow: null,
          cpcHigh: null,
        });
      });
    }

    const finalKeywords = Array.from(keywordMap.values());

    return NextResponse.json({
      mode: 'serper',
      queries,
      keywords: finalKeywords,
      credits: queries.length, // Serper charges 1 credit per search
    });

  } catch (error: any) {
    console.error('Serper Keyword API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
