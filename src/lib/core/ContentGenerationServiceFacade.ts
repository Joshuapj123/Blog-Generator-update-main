// src/lib/core/ContentGenerationServiceFacade.ts
import { ResearchService } from '../research/ResearchService';
import { ContentBriefBuilder } from '../content/ContentBriefBuilder';
import { WritingService } from '../content/WritingService';
import { QualityValidationService } from '../intelligence/QualityValidationService';
import { ContentRepairService } from '../content/ContentRepairService';
import { ContentAsset, SaaSProfile } from '@/core/contracts/schemas';

export class ContentGenerationServiceFacade {
  constructor(
    private researchService: ResearchService,
    private briefBuilder: ContentBriefBuilder,
    private writer: WritingService,
    private validator: QualityValidationService,
    private repairer: ContentRepairService
  ) {}

  async executePipeline(
    keyword: string,
    audience: string,
    saasProfile: SaaSProfile,
    options?: { competitorUrls?: string[]; runId?: string; maxReviewRetries?: number }
  ): Promise<ContentAsset> {
    const maxRetries = options?.maxReviewRetries ?? 2;
    const runId = options?.runId;

    // 1. ResearchService
    console.log('[facade] Running ResearchService...');
    const research = await this.researchService.conductResearch(keyword, {
      competitorUrls: options?.competitorUrls
    });

    // 2. ContentBriefBuilder
    console.log('[facade] Running ContentBriefBuilder...');
    const brief = await this.briefBuilder.buildBrief(
      keyword,
      audience,
      saasProfile,
      research.medians,
      runId
    );

    // 3. WritingService
    console.log('[facade] Running WritingService...');
    let asset = await this.writer.generateAsset(brief, runId);

    // 4. QualityValidationService
    console.log('[facade] Running QualityValidationService...');
    const targetEntities = brief.outline.flatMap(node => node.assignedEntities || []);
    let validationReport = this.validator.validate(asset.bodyMarkdown, brief.targetKeywords, targetEntities);

    // 5. ContentRepairService (Bounded Repair Loop)
    let retries = 0;
    while (!validationReport.valid && retries < maxRetries) {
      retries++;
      console.log(`[facade] Quality validation failed. Running ContentRepairService attempt ${retries}/${maxRetries}...`);
      
      asset = await this.repairer.repairContent(asset, brief, validationReport.errors, runId);
      
      validationReport = this.validator.validate(asset.bodyMarkdown, brief.targetKeywords, targetEntities);
    }

    console.log(`[facade] Pipeline complete. Flesch Reading Ease: ${validationReport.metrics.fleschReadingEase}`);
    return {
      ...asset,
      seoScore: validationReport.valid ? 90 : 70 // adjust score based on final quality check
    };
  }
}
