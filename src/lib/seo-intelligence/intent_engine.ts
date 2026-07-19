import { google } from '@ai-sdk/google';
import { generateObjectWithTelemetry } from '../gemini-telemetry';
import { z } from 'zod';
import { IntentBlueprint } from '@/types/serp';
import { ScrapedCompetitor } from './serp_collector';

export async function processIntent(
  keyword: string,
  competitors: ScrapedCompetitor[],
  options?: { runId?: string }
): Promise<{ intentBlueprint: IntentBlueprint }> {
  const model = google('gemini-2.5-flash');

  const titlesAndHeadings = competitors.map((c, i) => {
    const rank = i + 1;
    const weight = c.weight !== undefined ? c.weight : parseFloat(Math.max(0.1, 1.1 - rank * 0.1).toFixed(1));
    return {
      rank,
      weight,
      title: c.title,
      topHeadings: c.headings.slice(0, 5).map(h => h.text)
    };
  });

  const prompt = `You are a search intent intelligence tool.
Analyze the competitor search results for the target keyword: "${keyword}".
Determine the dominant intent, compute the confidence percentage breakdown for all intent types (mixed intent), and generate a comprehensive Intent Blueprint.

COMPETITOR META (with ranking position and authority weight):
${JSON.stringify(titlesAndHeadings, null, 2)}

Your task:
1. Classify the dominant search intent as exactly one of: 'informational', 'commercial', 'transactional', or 'comparison'.
2. Provide a confidence score (0 to 100) for the dominant intent.
3. Compute a mixed intent confidence breakdown percentages (0-100) for all four intent types: informational, commercial, transactional, comparison. These percentages must sum to 100.
4. Outline recommendations for format (e.g. Listicle, Guide, Review), target tone, and specific layout structure.
5. Recommend 3-5 critical structural outline sections based on intent.

Intent definitions:
- informational: user wants to learn (e.g. guide, tutorial, explanation)
- commercial: user wants to compare options or find lists of software/brands
- transactional: user is ready to buy or configure (e.g. pricing, setup steps, signup CTAs)
- comparison: user wants to compare two specific things (e.g. X vs Y, pros/cons, alternatives)`;

  try {
    const response = await generateObjectWithTelemetry('Intent Analysis', {
      model,
      prompt,
      temperature: 0.1,
      cacheKey: 'intent_' + keyword,
      runId: options?.runId,
      schema: z.object({
        intent: z.enum(['informational', 'commercial', 'transactional', 'comparison']),
        confidenceScore: z.number().min(0).max(100),
        intentConfidence: z.object({
          informational: z.number().min(0).max(100).describe('Percentage confidence that search intent is informational.'),
          commercial: z.number().min(0).max(100).describe('Percentage confidence that search intent is commercial.'),
          transactional: z.number().min(0).max(100).describe('Percentage confidence that search intent is transactional.'),
          comparison: z.number().min(0).max(100).describe('Percentage confidence that search intent is comparison.')
        }).describe('Mixed search intent confidence breakdown, must sum to 100.'),
        formatRecommendation: z.string(),
        toneGuidelines: z.string(),
        structureGuidelines: z.string(),
        recommendedOutlineSections: z.array(z.object({
          heading: z.string().describe('Section heading.'),
          level: z.enum(['H2', 'H3']).describe('Structural level.'),
          purpose: z.string().describe('Purpose of this section in satisfying intent.')
        }))
      })
    });

    return {
      intentBlueprint: response.object
    };
  } catch (e) {
    console.error('[intent_engine] Failed to extract intent blueprint via Gemini:', e);
    // Safe default fallback
    return {
      intentBlueprint: {
        intent: 'informational',
        confidenceScore: 80,
        formatRecommendation: 'Guide',
        toneGuidelines: 'Professional, educational, and authoritative.',
        structureGuidelines: 'Start with definitions, explain core features, and provide best practices.',
        recommendedOutlineSections: [
          { heading: `What is ${keyword}?`, level: 'H2', purpose: 'Define the concept.' },
          { heading: `Benefits of ${keyword}`, level: 'H2', purpose: 'Establish value.' }
        ],
        intentConfidence: {
          informational: 80,
          commercial: 10,
          transactional: 5,
          comparison: 5
        }
      }
    };
  }
}
