import { google } from '@ai-sdk/google';
import { generateObjectWithTelemetry } from '../gemini-telemetry';
import { z } from 'zod';
import { SerpTerm, TopicClusterItem } from '@/types/serp';
import { stem } from '../serp-nlp-processing';
import { ScrapedCompetitor } from './serp_collector';

export interface KeywordEngineResult {
  terms: SerpTerm[];
  topicClusters: TopicClusterItem[];
  topTermsForIntent: string[];
}

export function isNoiseKeyword(phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase();
  if (normalized.length < 3) return true;
  
  const noisePatterns = [
    /stay\s+updated/i,
    /latest\s+insights/i,
    /don't\s+miss/i,
    /subscribe/i,
    /newsletter/i,
    /sign\s+up/i,
    /get\s+updates/i,
    /mailing\s+list/i,
    /cookie/i,
    /privacy\s+policy/i,
    /terms\s+of\s+(service|use)/i,
    /copyright/i,
    /all\s+rights\s+reserved/i,
    /powered\s+by/i,
    /contact\s+us/i,
    /about\s+us/i,
    /learn\s+more/i,
    /read\s+more/i,
    /click\s+here/i,
    /get\s+started/i,
    /free\s+trial/i,
    /try\s+for\s+free/i,
    /download\s+now/i,
    /join\s+our/i,
    /email\s+address/i,
    /marketing\s+widget/i,
    /site\s+map/i,
    /navigation/i,
    /menu/i,
    /footer/i,
    /applications\s+trends\s+marketing\s+business/i,
    /social\s+media/i,
    /follow\s+us/i,
  ];

  if (noisePatterns.some(pattern => pattern.test(normalized))) {
    return true;
  }

  const uiWords = ['home', 'blog', 'contact', 'about', 'services', 'pricing', 'careers', 'jobs', 'privacy', 'terms', 'subscribe', 'login', 'signup', 'register', 'dashboard', 'search', 'menu', 'category', 'tag'];
  const words = normalized.split(/\s+/);
  
  if (words.length <= 2 && words.every(w => uiWords.includes(w))) {
    return true;
  }

  const tagWords = ['applications', 'trends', 'marketing', 'business', 'news', 'insights', 'category', 'tags', 'archives', 'recent', 'popular', 'latest', 'posts', 'articles', 'comments'];
  const tagWordCount = words.filter(w => tagWords.includes(w)).length;
  if (words.length >= 3 && tagWordCount >= 3) {
    return true;
  }

  return false;
}

function countTermOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  try {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  } catch (e) {
    return 0;
  }
}
export async function processKeywords(
  keyword: string,
  competitors: ScrapedCompetitor[],
  options?: { runId?: string }
): Promise<KeywordEngineResult> {
  const model = google('gemini-2.5-flash');

  // Sample outlines and texts from top competitors to fit in context window
  const competitorSummaries = competitors.map((c, i) => ({
    rank: i + 1,
    title: c.title,
    headings: c.headings.slice(0, 10).map(h => `${h.tag.toUpperCase()}: ${h.text}`),
    snippet: c.text.slice(0, 800)
  }));

  const prompt = `You are a professional search intelligence and SEO keyword strategist.
We are analyzing search competitor structures for the keyword: "${keyword}".
Below is structural and snippet information from the top-ranking competitor articles:

COMPETITOR INTRO & OUTLINES:
${JSON.stringify(competitorSummaries, null, 2)}

Your task:
1. Extract the most important keywords and search queries that these competitors cover. Group them into:
   - Primary: The core target keyword and close variants.
   - Secondary: High-volume related terms.
   - Long-tail: Longer, highly specific search terms (3+ words).
   - Semantic: LSI (Latent Semantic Indexing) and contextual synonyms.
   - NLP: Named entities, technology terms, or industry concepts.
2. Group the extracted keywords into 3-5 logical "Topic Clusters" representing sub-themes.

Extract 25-45 highly relevant, unique keyword phrases. Avoid generic single nouns (e.g. "software", "guide", "article").`;

  let extractedKeywords: { term: string; category: 'basic' | 'supplementary' | 'contextual' }[] = [];
  let topicClusters: TopicClusterItem[] = [];

  try {
    const response = await generateObjectWithTelemetry('Keyword Analysis', {
      model,
      prompt,
      temperature: 0.2,
      cacheKey: 'keywords_' + keyword,
      runId: options?.runId,
      schema: z.object({
        keywords: z.array(z.object({
          term: z.string().describe('The keyword phrase.'),
          category: z.enum(['basic', 'supplementary', 'contextual']).describe('basic = primary/secondary, supplementary = long-tail/semantic, contextual = NLP concepts.')
        })),
        clusters: z.array(z.object({
          clusterName: z.string().describe('Short name of the topic cluster.'),
          keywords: z.array(z.string()).describe('Keywords belonging to this cluster.')
        }))
      })
    });

    extractedKeywords = response.object.keywords || [];
    topicClusters = response.object.clusters || [];
  } catch (e) {
    console.error('[keyword_engine] Failed to extract candidate keywords via Gemini:', e);
    // Fallback: simple token extraction from competitor texts
    const words = competitors.flatMap(c => c.text.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const uniqueWords = [...new Set(words)].slice(0, 30);
    extractedKeywords = uniqueWords.map(w => ({ term: w, category: 'basic' }));
  }

  // Deterministically verify occurrences and build Matrix / Importance Scores
  const terms: SerpTerm[] = [];
  const competitorCount = competitors.length || 1;

  for (const item of extractedKeywords) {
    const termStr = item.term.trim();
    if (!termStr || isNoiseKeyword(termStr)) continue;

    let totalMentions = 0;
    let docsWithTerm = 0;
    let weightedDocsWithTerm = 0;
    let totalWeight = 0;
    const termPlacements: ('title' | 'h1' | 'h2' | 'body')[] = [];

    // Count exact matches in each competitor with authority weighting
    competitors.forEach((comp, idx) => {
      const rank = idx + 1;
      const weight = comp.weight !== undefined ? comp.weight : Math.max(0.1, 1.1 - rank * 0.1);
      totalWeight += weight;

      const occurrences = countTermOccurrences(comp.text, termStr);
      totalMentions += occurrences;
      if (occurrences > 0) {
        docsWithTerm++;
        weightedDocsWithTerm += weight;
      }

      // Check placement in headings
      if (comp.title.toLowerCase().includes(termStr.toLowerCase())) {
        termPlacements.push('title');
      }
      if (comp.headings.some(h => h.tag === 'h1' && h.text.toLowerCase().includes(termStr.toLowerCase()))) {
        termPlacements.push('h1');
      }
      if (comp.headings.some(h => h.tag === 'h2' && h.text.toLowerCase().includes(termStr.toLowerCase()))) {
        termPlacements.push('h2');
      }
    });

    const totalWeightSum = totalWeight || 1.0;
    const competitorCoverage = docsWithTerm / competitorCount;
    const weightedCoverage = weightedDocsWithTerm / totalWeightSum;
    const docFrequency = docsWithTerm / competitorCount;

    // Calculate TF-IDF weight (simplified: term frequency ratio normalized)
    const avgCount = totalMentions / competitorCount;
    const tfidfWeight = Math.min(1.0, (avgCount * (1.0 + Math.log(competitorCount / (docsWithTerm || 1)))) / 10);

    // Compute Keyword Importance Score (0 to 100) using weightedCoverage
    // Formula: Weighted Coverage (50%) + placements weighting (30%) + category weighting (20%)
    let placementWeight = termPlacements.includes('title') ? 30 : termPlacements.includes('h2') ? 20 : 10;
    let categoryWeight = item.category === 'basic' ? 20 : item.category === 'supplementary' ? 15 : 10;
    const importance = Math.round((weightedCoverage * 50) + placementWeight + categoryWeight);

    // Dynamic suggested range targets
    const recommendedMin = Math.max(1, Math.round(avgCount * 0.7));
    const recommendedMax = Math.max(3, Math.round(recommendedMin * 2.5));

    // Sentence examples for context
    const competitorExamples: { text: string; rank: number }[] = [];
    const escapedTerm = termStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sentenceRegex = new RegExp(`([^.?!]*?\\b${escapedTerm}\\b[^.?!]*[.?!])`, 'gi');

    let rank = 1;
    for (const comp of competitors) {
      const matches = comp.text.match(sentenceRegex);
      if (matches && matches.length > 0) {
        for (const m of matches) {
          const clean = m.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
          if (clean.length > 25 && clean.length < 200) {
            competitorExamples.push({ text: clean, rank });
            if (competitorExamples.length >= 2) break;
          }
        }
      }
      if (competitorExamples.length >= 3) break;
      rank++;
    }

    terms.push({
      term: termStr,
      rootForm: stem(termStr),
      category: item.category,
      importance: Math.min(10, Math.max(1, Math.round(importance / 10))), // scale to 1-10
      currentCount: 0,
      recommendedMin,
      recommendedMax,
      competitorCoverage,
      weightedCoverage,
      docFrequency,
      tfidfWeight,
      overuseRisk: false,
      placements: [...new Set(termPlacements)].slice(0, 4) as any[],
      competitorExamples
    });
  }

  // Sort terms by weighted coverage first, then importance to prioritize top rankings
  terms.sort((a, b) => (b.weightedCoverage ?? 0) - (a.weightedCoverage ?? 0) || b.importance - a.importance);

  const topTermsForIntent = terms.slice(0, 30).map(t => t.rootForm);

  return {
    terms,
    topicClusters,
    topTermsForIntent
  };
}
