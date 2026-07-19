import { google } from '@ai-sdk/google';
import { generateObjectWithTelemetry } from '../gemini-telemetry';
import { z } from 'zod';
import { FeaturedSnippetBlueprint } from '@/types/serp';
import { ScrapedCompetitor } from './serp_collector';

export async function processFeaturedSnippets(
  keyword: string,
  competitors: ScrapedCompetitor[],
  options?: { runId?: string }
): Promise<{ featuredSnippetBlueprint: FeaturedSnippetBlueprint }> {
  const model = google('gemini-2.5-flash');

  // Sample texts to look for snippets
  const competitorSamples = competitors.map((c, i) => {
    const rank = i + 1;
    const weight = Math.max(0.1, 1.1 - rank * 0.1).toFixed(1);
    return {
      rank,
      weight: parseFloat(weight),
      title: c.title,
      textSample: c.text.slice(0, 1000)
    };
  });

  const prompt = `You are a search engine optimization expert specializing in Google Featured Snippets.
We want to analyze the SERP results for the keyword: "${keyword}" and design a content blueprint to win the featured snippet.

COMPETITOR SAMPLES (with ranking position and authority weight):
${JSON.stringify(competitorSamples, null, 2)}

Your task:
1. Determine if this query commonly triggers a Featured Snippet.
2. Classify the snippet type: 'definition' (paragraph text answering "what is"), 'list' (ordered/unordered list), 'table' (comparisons/data), 'howto' (steps/workflow), or 'none'.
3. Extract an example of a featured snippet or core summary from top competitors (high weight).
4. Provide a recommended optimized snippet structure (e.g. exactly how to write the 40-60 word definition or how to list the items) for our article to target and win the snippet.
5. Provide specific layout/style directives for content generation.`;

  try {
    const response = await generateObjectWithTelemetry('Featured Snippet', {
      model,
      prompt,
      temperature: 0.1,
      cacheKey: 'snippet_' + keyword,
      runId: options?.runId,
      schema: z.object({
        hasFeaturedSnippet: z.boolean().describe('True if the query commonly triggers a featured snippet.'),
        snippetType: z.enum(['definition', 'list', 'table', 'howto', 'none']).describe('The structural type of the featured snippet.'),
        targetQuery: z.string().describe('The search query or trigger question.'),
        extractedSnippetText: z.string().describe('Extracted representative snippet or summary from top competitors.'),
        optimizedSnippetRecommendation: z.string().describe('Our optimized 40-60 word definition or clear list/table blueprint to beat competitors.'),
        generationDirectives: z.string().describe('Directives for our writer (e.g. "Place this H2 definition first, keep it exactly 50 words, use bolding").')
      })
    });

    return {
      featuredSnippetBlueprint: response.object
    };
  } catch (e) {
    console.error('[featured_snippet_detector] Failed to detect featured snippet:', e);
    return {
      featuredSnippetBlueprint: {
        hasFeaturedSnippet: false,
        snippetType: 'none',
        targetQuery: keyword,
        extractedSnippetText: '',
        optimizedSnippetRecommendation: '',
        generationDirectives: ''
      }
    };
  }
}
