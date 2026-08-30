// src/lib/content/ContentRepairService.ts
import { LLMProvider } from '@/core/contracts/providers';
import { ContentAsset, ContentBrief } from '@/core/contracts/schemas';

export class ContentRepairService {
  constructor(private llmProvider: LLMProvider) {}

  async repairContent(
    content: ContentAsset,
    brief: ContentBrief,
    issues: string[],
    runId?: string
  ): Promise<ContentAsset> {
    const prompt = `Repair the following article body to resolve these quality validation issues:
${issues.map(i => `- ${i}`).join('\n')}

Original Article Title: ${brief.title}
Original Article Body:
${content.bodyMarkdown}`;

    const repairedBody = await this.llmProvider.generate(prompt, {
      systemInstruction: 'You are an elite copyeditor. Rewrite the article body to fix all listed quality and readability issues while keeping all facts, keywords, and outline headings exactly the same.',
      operation: 'Content Quality Repair',
      runId,
    });

    const wordCount = repairedBody.split(/\s+/).filter(Boolean).length;

    return {
      ...content,
      bodyMarkdown: repairedBody,
      wordCount,
    };
  }
}
