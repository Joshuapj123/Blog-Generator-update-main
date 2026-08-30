// src/lib/content/WritingService.ts
import { LLMProvider } from '@/core/contracts/providers';
import { ContentBrief, ContentAsset } from '@/core/contracts/schemas';

export class WritingService {
  constructor(private llmProvider: LLMProvider) {}

  async generateAsset(brief: ContentBrief, runId?: string, strategy?: any): Promise<ContentAsset> {
    let bodyMarkdown = `# ${brief.title}\n\n`;
    const assetType = strategy?.assetType || brief.assetType || 'ARTICLE';

    let assetInstructions = '';
    if (assetType === 'COMPARISON') {
      assetInstructions = `
Asset Type: COMPARISON
Guidelines: Compare competing solutions objectively. Highlight feature matrices, comparison criteria, clear strengths and weaknesses, objective differentiators, and use-case recommendations. Avoid biased claims and focus on factual, feature-based contrast.`;
    } else if (assetType === 'ALTERNATIVE') {
      assetInstructions = `
Asset Type: ALTERNATIVE
Guidelines: Focus on listing and detailing alternative tools. Outline comparison criteria, who each alternative is best for, key features, pricing highlights, and switching considerations. Show how our product serves as a modern, superior alternative.`;
    } else if (assetType === 'USE_CASE_LANDING_PAGE') {
      assetInstructions = `
Asset Type: USE-CASE LANDING PAGE
Guidelines: Address the target audience persona directly. Emphasize the core problem, detail our product's solution workflow, showcase main benefits, present proof points, and integrate contextual, action-oriented CTAs.`;
    } else if (assetType === 'GUIDE') {
      assetInstructions = `
Asset Type: GUIDE
Guidelines: Maintain an actionable, step-by-step tutorial structure. Provide clear instructions, practical examples, common mistakes to avoid, and structured FAQ sections where appropriate.`;
    } else if (assetType === 'FAQ') {
      assetInstructions = `
Asset Type: FAQ
Guidelines: Write direct questions followed by concise, structured, and factual answers. Expose key concepts and avoid unnecessary introductory fluff.`;
    } else {
      assetInstructions = `
Asset Type: ARTICLE
Guidelines: Maintain an educational structure, write in an active voice, and provide clear definitions, industry examples, and practical recommendations.`;
    }

    for (const section of brief.outline) {
      const prompt = `Write a comprehensive section for the asset "${brief.title}".
Section Heading: "${section.heading}" (Level: ${section.level})
Keywords to include: ${section.assignedKeywords?.join(', ') || ''}
Entities to include: ${section.assignedEntities?.join(', ') || ''}
Core Concept: ${section.core_concept || ''}
${assetInstructions}

Additional Constraints:
- Do NOT fabricate statistics, pricing, customer reviews, or features that cannot be verified.
- Focus on demonstrating value through clear, concrete examples.`;

      const text = await this.llmProvider.generate(prompt, {
        operation: 'Section Generation',
        runId,
      });

      bodyMarkdown += `${section.level === 'H2' ? '##' : '###'} ${section.heading}\n\n${text}\n\n`;
    }

    const wordCount = bodyMarkdown.split(/\s+/).filter(Boolean).length;

    return {
      title: brief.title,
      bodyMarkdown,
      wordCount,
      seoScore: 85,
      references: [],
      generatedAt: new Date().toISOString(),
      slug: brief.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      assetType,
      targetKeyword: brief.targetKeywords?.[0] || '',
      metaTitle: `${brief.title} | SEO Growth`,
      metaDescription: `Discover key insights and best practices about ${brief.targetKeywords?.[0] || 'SaaS growth'}.`,
      outline: brief.outline,
      validationStatus: 'READY'
    };
  }
}
