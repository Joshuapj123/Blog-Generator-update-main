import { LLMProvider } from '@/core/contracts/providers';
import { SaaSIntelligenceProfile, ProductSchema, AudienceSchema } from '@/core/contracts/schemas';
import { z } from 'zod';

export class SaaSProfileService {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  /**
   * Generates and normalizes raw description inputs into a structured SaaS Intelligence Profile.
   */
  async normalizeProfile(
    input: {
      name: string;
      description: string;
      website?: string;
      keyFeatures?: string[];
      targetAudience?: string;
    },
    options?: { runId?: string }
  ): Promise<Partial<SaaSIntelligenceProfile>> {
    console.log(`[SaaSProfileService] Normalizing raw profile for: ${input.name}`);

    const prompt = `You are an elite SaaS growth consultant. Extract detailed structured product and audience profiles for the SaaS product described below:
Name: ${input.name}
Description: ${input.description}
Website: ${input.website || 'Not specified'}
Provided Features: ${(input.keyFeatures || []).join(', ') || 'Not specified'}
Target Audience Hint: ${input.targetAudience || 'Not specified'}

Analyze the descriptions carefully to extract features, integrations, pricing structure model (subscription, freemium, usage-based, etc.), differentiators, pain points, ideal customer profiles, job roles, and jobs-to-be-done.`;

    const schema = z.object({
      product: ProductSchema,
      audience: AudienceSchema
    });

    const result = await this.llm.structuredGenerate<z.infer<typeof schema>>(prompt, schema, {
      operation: 'SaaS Profile Normalization',
      runId: options?.runId,
      systemInstruction: 'Extract precise, high-fidelity structured data without fabricating details. If website or integrations are unspecified, return empty lists or defaults.'
    });

    const product = result?.product || {};
    const audience = result?.audience || {};

    return {
      product: {
        category: 'SaaS',
        features: [],
        integrations: [],
        pricingInfo: '',
        differentiators: [],
        useCases: [],
        ...(product as any),
        name: input.name,
        website: input.website || (product as any).website || '',
        description: input.description
      } as any,
      audience: {
        icp: input.targetAudience || (audience as any).icp || '',
        personas: [],
        industries: [],
        jobRoles: [],
        painPoints: [],
        jtbd: [],
        ...(audience as any)
      } as any,
      market: {
        competitors: [],
        competitorProducts: [],
        alternatives: [],
        adjacentCategories: [],
        positioning: ''
      },
      opportunities: []
    };
  }
}
