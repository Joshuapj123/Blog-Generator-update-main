import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function extractEntitiesWithGemini(text: string, maxTokens: number = 20000): Promise<{ term: string, type: string }[]> {
  // Truncate text if needed to avoid massive context
  const truncatedText = text.slice(0, maxTokens);

  const prompt = `You are an SEO content analyst. Extract key entities and concepts from the text below.

ENTITY TYPES TO EXTRACT:
1. Named brands (brand): commercial companies or business identities e.g. "Apple", "HubSpot", "Zapier"
2. Software tools or platforms (tool): executable applications or SaaS e.g. "Ahrefs", "Google Analytics"
3. Specific products (product): items or named services offered by brands e.g. "iPhone", "Salesforce Marketing Cloud"
4. Core industry concepts (concept): conceptual methodologies or technical terms e.g. "topical authority", "E-E-A-T", "workflow automation"
5. Organizations (organization): standards bodies, groups, or non-brand entities e.g. "W3C", "WHO"

DO NOT extract:
- Generic nouns: "strategy", "content", "platform", "example", "results"
- Verb phrases: "improve rankings", "boost traffic"
- Adjective-noun pairs that aren't established terms: "strong backlinks"

Return unique items.
TEXT:
${truncatedText}`;

  try {
    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      prompt,
      temperature: 0.1,
      schema: z.object({
        keywords: z.array(z.object({
          term: z.string(),
          type: z.enum(['brand', 'tool', 'product', 'concept', 'organization'])
        }))
      })
    });
    return result.object.keywords || [];
  } catch (error) {
    console.error('Failed to extract entities with Gemini:', error);
    return [];
  }
}
