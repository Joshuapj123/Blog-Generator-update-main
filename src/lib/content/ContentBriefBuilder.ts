// src/lib/content/ContentBriefBuilder.ts
import { LLMProvider } from '@/core/contracts/providers';
import { ContentBrief, ContentBriefSchema } from '@/core/contracts/schemas';

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
GEO Visibility Recommendations: ${strategy.geoRequirements?.join('. ') || ''}` : ''}`;

    const result = await this.llmProvider.structuredGenerate<ContentBrief>(
      prompt,
      ContentBriefSchema,
      {
        systemInstruction: 'You are an expert SEO content planner. Generate a structured Content Brief schema.',
        operation: 'Content Brief Generation',
        runId
      }
    );

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
