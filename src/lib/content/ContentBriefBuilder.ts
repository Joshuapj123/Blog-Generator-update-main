// src/lib/content/ContentBriefBuilder.ts
import { LLMProvider } from '@/core/contracts/providers';
import { ContentBrief, ContentBriefSchema } from '@/core/contracts/schemas';
import { normalizeContentBrief } from './schemas';

export class ContentBriefBuilder {
  constructor(private llmProvider: LLMProvider) {}

  async buildBrief(
    keyword: string,
    audience: string,
    saasInfo: { name: string; description: string },
    medians: any,
    runId?: string,
    strategy?: any
  ): Promise<ContentBrief> {
    const prompt = `Create a structured content brief and outline for an asset about "${keyword}".
Asset Type: ${strategy ? strategy.assetType : 'ARTICLE'}
Target Audience: ${audience}
SaaS Profile: ${saasInfo.name} - ${saasInfo.description}
Competitor Medians: ${JSON.stringify(medians)}
${strategy ? `Primary Goal: ${strategy.primaryGoal || ''}
Recommended Structure: ${strategy.recommendedStructure?.join(', ') || ''}
Required Entities: ${strategy.requiredEntities?.join(', ') || ''}
Required Topics: ${strategy.requiredTopics?.join(', ') || ''}
Differentiation Guidelines: ${strategy.differentiationRequirements?.join('. ') || ''}
GEO Visibility Recommendations: ${strategy.geoRequirements?.join('. ') || ''}` : ''}

=== CRITICAL SCHEMA CONTRACTS ===
- intent.intentType MUST be exactly one of: Informational, Transactional, Commercial, Navigational, Comparison.
- intent.contentType MUST be exactly one of: Listicle, How-To, Guide, Review, Comparison, Other.
- outline[].level MUST be exactly: H2 or H3.
- Competitor insight URLs MUST use http:// or https://.`;

    let result: ContentBrief;
    try {
      result = await this.llmProvider.structuredGenerate<ContentBrief>(
        prompt,
        ContentBriefSchema,
        {
          systemInstruction: 'You are an expert SEO content planner. Generate a strictly compliant structured Content Brief schema matching the exact enum values.',
          operation: 'Content Brief Generation',
          runId
        }
      );
    } catch (err: any) {
      if (err?.text) {
        try {
          const raw = JSON.parse(err.text);
          const { normalized } = normalizeContentBrief(raw);
          result = ContentBriefSchema.parse(normalized);
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const { normalized } = normalizeContentBrief(result);
    result = ContentBriefSchema.parse(normalized);

    if (strategy) {
      result.assetType = strategy.assetType;
      result.audience = audience;
      result.businessObjective = strategy.primaryGoal;
      result.primaryEntities = strategy.requiredEntities;
      result.competitorGaps = strategy.differentiationRequirements;
      result.serpFeatures = strategy.requiredTopics;
      result.geoRequirements = strategy.geoRequirements;
      result.ctaStrategy = 'Sign up CTAs integrated contextually.';
    }

    return result;
  }
}
