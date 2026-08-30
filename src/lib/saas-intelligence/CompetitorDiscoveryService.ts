import { SearchProvider, LLMProvider } from '@/core/contracts/providers';
import { CompetitorSchema } from '@/core/contracts/schemas';
import { z } from 'zod';

export class CompetitorDiscoveryService {
  private searchProvider: SearchProvider;
  private llm: LLMProvider;

  constructor(searchProvider: SearchProvider, llm: LLMProvider) {
    this.searchProvider = searchProvider;
    this.llm = llm;
  }

  /**
   * Discovers competitors using search provider and classifies them.
   */
  async discoverCompetitors(
    product: { name: string; category: string; description: string },
    options?: { runId?: string }
  ): Promise<z.infer<typeof CompetitorSchema>[]> {
    console.log(`[CompetitorDiscoveryService] Performing discovery for category: "${product.category}"`);

    // 1. Execute search query to find competitor directories
    const query = `best ${product.category} software tools alternatives`;
    let searchResults: any[] = [];
    try {
      searchResults = await this.searchProvider.search(query, { numResults: 8 });
    } catch (err: any) {
      console.warn('[CompetitorDiscoveryService] Search query failed:', err.message);
    }

    const searchContext = searchResults
      .map((r, i) => `[Result ${i + 1}] Title: ${r.title}\nSnippet: ${r.snippet}\nLink: ${r.link}`)
      .join('\n\n');

    // 2. Query Gemini to parse, map, and score competitors
    const prompt = `You are a SaaS market analyst. Based on our product details and the live Google search results below, extract the top 3-5 real competitors.

Our Product: ${product.name}
Category: ${product.category}
Description: ${product.description}

Search Results context:
${searchContext || 'No live search results available.'}

RULES:
1. Identify actual competitor brands and domains mentioned in the search results or commonly known in the "${product.category}" category.
2. For each competitor, provide:
   - name (Brand name)
   - domain (domain.com format)
   - category (e.g. CRM, Project Management)
   - relevanceScore (0-100, where 100 is direct competitor, 30 is broad/fringe)
   - discoveryReason (1-sentence explanation of why they compete)`;

    const schema = z.object({
      competitors: z.array(CompetitorSchema)
    });

    const output = await this.llm.structuredGenerate<z.infer<typeof schema>>(prompt, schema, {
      operation: 'SaaS Competitor Discovery',
      runId: options?.runId,
      systemInstruction: 'Output a valid JSON list of competitors. Extract at least 3 competitors. Filter out aggregator directories like G2, Capterra, or TrustRadius.'
    });

    return output.competitors || [];
  }
}
