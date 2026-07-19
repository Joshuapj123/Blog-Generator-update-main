import { SerpTerm, SerpEntity } from '@/types/serp';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// STOP WORDS
// ─────────────────────────────────────────────────────────────────────────────
export const STOP_WORDS = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","aren't","as","at",
  "be","because","been","before","being","below","between","both","but","by","can't","cannot","could","couldn't",
  "did","didn't","do","does","doesn't","doing","don't","down","during","each","few","for","from","further",
  "had","hadn't","has","hasn't","have","haven't","having","he","he'd","he'll","he's","her","here","here's",
  "hers","herself","him","himself","his","how","how's","i","i'd","i'll","i'm","i've","if","in","into","is",
  "isn't","it","it's","its","itself","let's","me","more","most","mustn't","my","myself","no","nor","not",
  "of","off","on","once","only","or","other","ought","our","ours","ourselves","out","over","own","same",
  "shan't","she","she'd","she'll","she's","should","shouldn't","so","some","such","than","that","that's",
  "the","their","theirs","them","themselves","then","there","there's","these","they","they'd","they'll",
  "they're","they've","this","those","through","to","too","under","until","up","very","was","wasn't","we",
  "we'd","we'll","we're","we've","were","weren't","what","what's","when","when's","where","where's","which",
  "while","who","who's","whom","why","why's","with","won't","would","wouldn't","you","you'd","you'll","you're",
  "you've","your","yours","yourself","yourselves",
  // Additional web-content noise words
  "click","read","also","use","used","using","make","like","get","one","two","three","want","need","way",
  "back","even","just","still","well","may","might","must","new","old","good","great","best","many","much",
  "time","years","year","day","days","things","thing","work","works","working","www","http","https","com","org"
]);

import { stemmer } from 'stemmer';

// ─────────────────────────────────────────────────────────────────────────────
// PORTER STEMMER (using production-standard npm package)
// ─────────────────────────────────────────────────────────────────────────────
export function stem(word: string): string {
  return stemmer(word);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS / DOM ARTIFACT GUARD
// Rejects tokens that are HTML class names, element IDs, or concatenated
// camelCase identifiers leaking from Elementor/page-builder pages.
//
// Rules (any failure → discard):
//  1. Max 25 chars  — no real SEO keyword exceeds this (longest: "internationalization" = 20)
//  2. No run of 3+ digits — ID suffixes like "9770972", "21662"
//  3. Digit ratio ≤ 25%  — avoids "elementor21662" but keeps "h264", "mp3"
//  4. No run of 5+ consonants — camelCase artifacts collapse into consonant clusters
//     (e.g. "elementskitpricingpricewraperhastag" has "ktprc", "gwrphstg", etc.)
// ─────────────────────────────────────────────────────────────────────────────
function isNaturalWord(word: string): boolean {
  if (word.length > 25) return false;
  if (/\d{3,}/.test(word)) return false;
  const digitRatio = (word.match(/\d/g) ?? []).length / word.length;
  if (digitRatio > 0.25) return false;
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(word)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKENIZER — produces stemmed unigrams + raw surface form for bigrams/trigrams
// ─────────────────────────────────────────────────────────────────────────────
function tokenize(text: string): { raw: string[], stemmed: string[] } {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && isNaturalWord(w));

  const stemmed = raw.map(stem);
  return { raw, stemmed };
}

function extractNgrams(tokens: string[], n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n).join(' ');
    // Filter grams that start/end with stop words
    const parts = gram.split(' ');
    if (STOP_WORDS.has(parts[0]) || STOP_WORDS.has(parts[parts.length - 1])) continue;
    result.push(gram);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TF-IDF COMPUTATION
// Implements: TF = 1 + log(raw_tf) [sublinear scaling]
//             IDF = log((N+1) / (df+1)) + 1  [smoothed]
//             score = mean(TF * IDF across documents)
// ─────────────────────────────────────────────────────────────────────────────
export interface TermStats {
  tfidfScore: number;       // normalized mean TF-IDF across all competitor docs
  docFrequency: number;     // 0–1 fraction of competitors containing this term
  medianRawFreq: number;    // median raw occurrence count (for recommendedMin/Max)
  counts: number[];         // per-competitor raw counts
  rootForm: string;         // stemmed root for draft matching
}

export function computeSerpTermFrequencies(
  competitorTexts: string[]
): Record<string, TermStats> {
  const N = competitorTexts.length;
  if (N === 0) return {};

  // Per-document tokenization
  const docTokenData = competitorTexts.map(text => tokenize(text));

  // Collect all candidate terms: unigrams + bigrams + trigrams
  const allCandidates: Record<string, number[]> = {};

  docTokenData.forEach(({ raw, stemmed }, docIdx) => {
    // Unigrams (use stemmed form as key)
    const uniFreq: Record<string, number> = {};
    stemmed.forEach(s => { uniFreq[s] = (uniFreq[s] || 0) + 1; });

    // Bigrams + Trigrams (use raw surface form as key — more human-readable for UI)
    const bigrams = extractNgrams(raw, 2);
    const trigrams = extractNgrams(raw, 3);
    const ngramFreq: Record<string, number> = {};
    [...bigrams, ...trigrams].forEach(g => { ngramFreq[g] = (ngramFreq[g] || 0) + 1; });

    // Merge into global table
    [...Object.entries(uniFreq), ...Object.entries(ngramFreq)].forEach(([term, freq]) => {
      if (!allCandidates[term]) allCandidates[term] = new Array(N).fill(0);
      allCandidates[term][docIdx] = freq;
    });
  });

  // Compute TF-IDF per term
  const results: Record<string, TermStats> = {};

  for (const [term, rawCounts] of Object.entries(allCandidates)) {
    const df = rawCounts.filter(c => c > 0).length;
    if (df === 0) continue;

    const docFrequency = df / N;
    const idf = Math.log((N + 1) / (df + 1)) + 1; // smoothed IDF

    // Per-document TF (normalized by document length to avoid length bias)
    const totalTokensPerDoc = docTokenData.map(d => d.raw.length || 1);
    const tfidfPerDoc = rawCounts.map((cnt, i) => {
      if (cnt === 0) return 0;
      const tf = 1 + Math.log(cnt / totalTokensPerDoc[i] * 100 + 1); // sublinear scaled
      return tf * idf;
    });

    const meanTfidf = tfidfPerDoc.reduce((a, b) => a + b, 0) / N;

    // Median raw freq (for recommendedMin/Max calculation)
    const sorted = [...rawCounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // Single-word terms: root is their stem. Multi-word: stem each word
    const rootForm = term.includes(' ')
      ? term.split(' ').map(stem).join(' ')
      : stem(term);

    results[term] = {
      tfidfScore: meanTfidf,
      docFrequency,
      medianRawFreq: median,
      counts: rawCounts,
      rootForm,
    };
  }

  // Normalize tfidfScore to 0–1
  const maxScore = Math.max(...Object.values(results).map(v => v.tfidfScore), 1);
  for (const stats of Object.values(results)) {
    stats.tfidfScore = parseFloat((stats.tfidfScore / maxScore).toFixed(4));
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC CATEGORY HINT
// Pre-classifies terms using DF + TF-IDF thresholds before the AI sees them.
// The AI can override with better context; this provides a grounded baseline.
// ─────────────────────────────────────────────────────────────────────────────
function getCategoryHint(stats: TermStats): 'basic' | 'supplementary' | 'contextual' {
  if (stats.docFrequency >= 0.7 || stats.tfidfScore >= 0.65) return 'basic';
  if (stats.docFrequency >= 0.35 || stats.tfidfScore >= 0.35) return 'supplementary';
  return 'contextual';
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ENRICHMENT (Gemini-2.5-pro)
// Now receives pre-classified, TF-IDF ranked, n-gram-enriched term list.
// ─────────────────────────────────────────────────────────────────────────────
export async function enrichTermsWithAi(
  targetKeyword: string,
  termFrequencies: Record<string, TermStats>,
  competitorCount: number,
  competitorTexts: string[] = []    // ← used for deterministic entity coverage
): Promise<{ terms: SerpTerm[]; entities: SerpEntity[]; topTermsForIntent: string[] }> {
  const model = google('gemini-2.5-pro');

  // Sort by blended score: 60% TF-IDF + 40% DF (mirrors the doc exactly)
  const sortedEntries = Object.entries(termFrequencies)
    .map(([term, stats]) => ({
      term,
      stats,
      blendedScore: 0.6 * stats.tfidfScore + 0.4 * stats.docFrequency,
      categoryHint: getCategoryHint(stats),
    }))
    .sort((a, b) => b.blendedScore - a.blendedScore);

  // Top 30 stems for intent scoring (Jaccard I-score)
  const topTermsForIntent = sortedEntries
    .slice(0, 30)
    .map(e => e.stats.rootForm);

  // Top 60 terms sent to Gemini — include DF hint so AI has grounded data
  const topTermsList = sortedEntries
    .slice(0, 60)
    .map(e =>
      `${e.term} | TF-IDF: ${e.stats.tfidfScore} | DF: ${Math.round(e.stats.docFrequency * 100)}% | Hint: ${e.categoryHint}`
    )
    .join('\n');

  const prompt = `You are an expert SEO analyst. Below are NLP terms extracted from the top-ranking competitor pages for the keyword: "${targetKeyword}".

Each term shows: surface form | TF-IDF weight (0-1) | DocFrequency (% of competitors containing it) | Deterministic hint.

Terms:
${topTermsList}

TASK:
1. Confirm or override the category hint using your semantic understanding:
   - basic: must-have core concepts (override hint only if semantically wrong)
   - supplementary: important supporting concepts
   - contextual: long-tail, niche, or enrichment terms
2. Assign importance score 1–10 based on semantic centrality to "${targetKeyword}".
3. Suggest ideal placements (title, h1, h2, body).
4. Extract key Named Entities (brands, tools, concepts, places) visible in these terms and their broader context.

IMPORTANT: Return the same term surface forms exactly as given. Do not invent new terms.`;

  try {
    const enrichment = await generateObject({
      model,
      schema: z.object({
        terms: z.array(z.object({
          term: z.string(),
          category: z.enum(['basic', 'supplementary', 'contextual']),
          importance: z.number().min(1).max(10),
          placements: z.array(z.enum(['title', 'h1', 'h2', 'body']))
        })),
        entities: z.array(z.object({
          entityName: z.string(),
          entityType: z.string(),
          relatedTerms: z.array(z.string()),
          missingContext: z.string(),
          competitorExamples: z.array(z.string())
        }))
      }),
      prompt
    });

    const finalTerms: SerpTerm[] = enrichment.object.terms.map(aiTerm => {
      const stats = termFrequencies[aiTerm.term] || {
        tfidfScore: 0.1,
        docFrequency: 0,
        medianRawFreq: 1,
        counts: new Array(competitorCount).fill(0),
        rootForm: stem(aiTerm.term),
      };

      const nonZeroCounts = stats.counts.filter(c => c > 0).length;
      const coverage = competitorCount > 0 ? nonZeroCounts / competitorCount : 0;
      const median = stats.medianRawFreq;

      return {
        term: aiTerm.term,
        rootForm: stats.rootForm,
        category: aiTerm.category,
        importance: aiTerm.importance,
        currentCount: 0,
        recommendedMin: Math.max(1, Math.floor(median * 0.5)),
        recommendedMax: Math.max(2, Math.ceil(median * 1.5)),
        competitorCoverage: parseFloat(coverage.toFixed(2)),
        docFrequency: stats.docFrequency,
        tfidfWeight: stats.tfidfScore,
        overuseRisk: false,
        placements: aiTerm.placements,
      };
    });

    // Attach entity coverage via deterministic string-match across competitor texts.
    // This replaces the DF-approximation with real occurrence counting (GAP 1 fix).
    const cleanedCompetitors = competitorTexts.map(t => t.toLowerCase());
    const finalEntities = enrichment.object.entities.map(e => {
      const searchText = e.entityName.toLowerCase();
      const docsWithEntity = cleanedCompetitors.filter(t => t.includes(searchText)).length;
      const coverage = competitorCount > 0
        ? parseFloat((docsWithEntity / competitorCount).toFixed(2))
        : 0.3; // fallback if we have no texts

      return { ...e, competitorCoverage: coverage };
    });

    // GAP 2 fix: entity upgrade rule — entities with ≥50% competitor coverage
    // that the AI classified as 'contextual' are deterministically promoted to 'supplementary'.
    // This mirrors the Python classify_terms() upgrade logic from the spec.
    const highSpreadEntityNames = new Set(
      finalEntities
        .filter(e => e.competitorCoverage >= 0.5)
        .map(e => e.entityName.toLowerCase())
    );

    const upgradedTerms = finalTerms.map(term => {
      if (
        highSpreadEntityNames.has(term.term.toLowerCase()) &&
        term.category === 'contextual'
      ) {
        return { ...term, category: 'supplementary' as const };
      }
      return term;
    });

    return { terms: upgradedTerms, entities: finalEntities, topTermsForIntent };

  } catch (error) {
    console.error('AI Enrichment Error:', error);

    // Graceful fallback: use deterministic hints directly
    const fallbackTerms: SerpTerm[] = sortedEntries.slice(0, 30).map(e => {
      const median = e.stats.medianRawFreq;
      return {
        term: e.term,
        rootForm: e.stats.rootForm,
        category: e.categoryHint,
        importance: Math.round(e.blendedScore * 10),
        currentCount: 0,
        recommendedMin: Math.max(1, Math.floor(median * 0.5)),
        recommendedMax: Math.max(2, Math.ceil(median * 1.5)),
        competitorCoverage: e.stats.docFrequency,
        docFrequency: e.stats.docFrequency,
        tfidfWeight: e.stats.tfidfScore,
        overuseRisk: false,
        placements: ['body' as const],
      };
    });

    return { terms: fallbackTerms, entities: [], topTermsForIntent };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT LSI KEYWORDS (For a single document)
// ─────────────────────────────────────────────────────────────────────────────
export interface LsiKeyword {
  term: string;
  score: number;
}

export function extractLsiKeywords(text: string, options: { topN: number, excludeTerms?: string[], minScore?: number }): LsiKeyword[] {
  const stats = computeSerpTermFrequencies([text]);
  const excludeSet = new Set((options.excludeTerms || []).map(t => t.toLowerCase()));
  
  const results = Object.entries(stats)
    .filter(([term, stat]) => !excludeSet.has(term) && stat.tfidfScore >= (options.minScore || 0))
    .sort((a, b) => b[1].tfidfScore - a[1].tfidfScore)
    .slice(0, options.topN)
    .map(([term, stat]) => ({ term, score: stat.tfidfScore }));
    
  return results;
}
