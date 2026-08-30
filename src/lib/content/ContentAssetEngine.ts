import { ContentAsset, SaaSProfile } from '@/core/contracts/schemas';
import { AssetStrategyService } from './AssetStrategyService';
import { ResearchService } from '../research/ResearchService';
import { ContentBriefBuilder } from './ContentBriefBuilder';
import { WritingService } from './WritingService';
import { QualityValidationService } from '../intelligence/QualityValidationService';
import { ContentRepairService } from './ContentRepairService';
import { SeoScoringService } from '../intelligence/SeoScoringService';
import { GeoIntelligenceService } from '../intelligence/GeoIntelligenceService';

export class ContentAssetEngine {
  constructor(
    private researchService: ResearchService,
    private briefBuilder: ContentBriefBuilder,
    private writer: WritingService,
    private qualityValidator: QualityValidationService,
    private repairer: ContentRepairService,
    private seoScoringService: SeoScoringService,
    private geoIntelligenceService: GeoIntelligenceService
  ) {}

  async executeEngine(
    saasProfile: SaaSProfile,
    opportunity: any,
    geoIntelligence?: any,
    options?: { competitorUrls?: string[]; runId?: string; maxReviewRetries?: number }
  ): Promise<ContentAsset> {
    const maxRetries = options?.maxReviewRetries ?? 2;
    const runId = options?.runId;

    console.log(`[ContentAssetEngine] Starting execution for keyword: "${opportunity.keyword}"`);

    // 1. Determine Asset Strategy
    console.log('[ContentAssetEngine] Determining asset strategy...');
    const strategy = AssetStrategyService.determineStrategy(saasProfile, opportunity, geoIntelligence);
    console.log(`[ContentAssetEngine] Strategy locked to: ${strategy.assetType}`);

    // 2. Conduct Research
    console.log('[ContentAssetEngine] Running ResearchService...');
    const research = await this.researchService.conductResearch(opportunity.keyword, {
      competitorUrls: options?.competitorUrls
    });

    // 3. Generate Outline/Brief (Injected with Strategy)
    console.log('[ContentAssetEngine] Building content brief...');
    const brief = await this.briefBuilder.buildBrief(
      opportunity.keyword,
      strategy.targetAudience,
      saasProfile,
      research.medians,
      runId,
      strategy
    );

    // 4. Generate Section Copy (Specific to strategy)
    console.log('[ContentAssetEngine] Running WritingService...');
    let asset = await this.writer.generateAsset(brief, runId, strategy);

    // 5. Run Validation Loop (SEO -> GEO -> Quality Validation)
    console.log('[ContentAssetEngine] Running validation gate...');
    const targetEntities = brief.outline.flatMap(node => node.assignedEntities || []);
    let validationReport = this.qualityValidator.validate(asset.bodyMarkdown, brief.targetKeywords, targetEntities);

    let retries = 0;
    while (!validationReport.valid && retries < maxRetries) {
      retries++;
      console.log(`[ContentAssetEngine] Quality validation failed. Running ContentRepairService attempt ${retries}/${maxRetries}...`);
      asset = await this.repairer.repairContent(asset, brief, validationReport.errors, runId);
      validationReport = this.qualityValidator.validate(asset.bodyMarkdown, brief.targetKeywords, targetEntities);
    }

    // 6. Final Scores (SEO & GEO)
    console.log('[ContentAssetEngine] Running SEO & GEO validation scoring...');
    const seoReport = this.seoScoringService.calculateScore({
      textContext: asset.bodyMarkdown,
      title: asset.title,
      headings: brief.outline.map(o => o.heading),
      liveTerms: brief.targetKeywords.map(k => ({
        term: k,
        density: 1,
        volume: 100,
        difficulty: 50,
        intent: brief.intent || 'informational',
        currentCount: asset.bodyMarkdown.toLowerCase().split(k.toLowerCase()).length - 1,
        overuseRisk: false
      })) as any,
      entities: targetEntities.map(e => ({ name: e, occurrences: 1, type: 'Entity', relevance: 50 })) as any,
      topTermsForIntent: brief.targetKeywords,
      medianWordCount: brief.wordCountBudget.target,
      medianTitleLength: 60,
      medianH2Count: brief.outline.length
    });
    
    const geoReport = await this.geoIntelligenceService.evaluateGeoVisibility(asset.bodyMarkdown, saasProfile.name);

    // 7. Quality Gate Decision
    const validationStatus = (validationReport.valid && seoReport.totalScore >= 70) ? 'READY' : 'REJECTED';

    return {
      ...asset,
      seoScore: seoReport.totalScore,
      geoScore: geoReport.brandVisibilityScore,
      qualityScore: validationReport.valid ? 95 : 75,
      validationStatus,
      entities: targetEntities,
      citations: geoReport.citationsList
    };
  }
}
