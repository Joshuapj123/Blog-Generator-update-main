import { LLMProvider } from '@/core/contracts/providers';
import { AudienceSchema, MarketSchema } from '@/core/contracts/schemas';
import { z } from 'zod';

export class MarketIntelligenceService {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  /**
   * Derives positioning, personas, pain points, and Jobs-to-be-Done (JTBD)
   * from SaaS profile descriptions.
   */
  async extractMarketIntelligence(
    product: { name: string; description: string; features: string[] },
    options?: { runId?: string }
  ): Promise<{ audience: z.infer<typeof AudienceSchema>; positioning: string }> {
    console.log(`[MarketIntelligenceService] Extracting market intelligence for: ${product.name}`);

    const prompt = `You are an expert SaaS product marketer. Based on the product profile, extract the Target Audience details and the Positioning Strategy:

Product Name: ${product.name}
Description: ${product.description}
Key Features: ${product.features.join(', ') || 'Not specified'}

Tasks:
1. Define the Ideal Customer Profile (ICP).
2. Detail 2-3 specific User Personas.
3. List target Industries.
4. List target Job Roles.
5. Identify top 4-5 Pain Points addressed.
6. Detail 3-4 Jobs-To-Be-Done (JTBD) using the "When I..., I want to..., so I can..." framework.
7. Outline a 1-sentence product positioning statement.`;

    const schema = z.object({
      audience: AudienceSchema,
      positioning: z.string().describe('1-sentence product positioning statement')
    });

    const result = await this.llm.structuredGenerate<z.infer<typeof schema>>(prompt, schema, {
      operation: 'SaaS Market Intelligence Extraction',
      runId: options?.runId,
      systemInstruction: 'Output a valid structured JSON representation containing audience details and positioning statement.'
    });

    return result;
  }
}
