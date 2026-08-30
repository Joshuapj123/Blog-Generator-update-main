// scratch/test_phase13_content_assets.ts
import { AssetStrategyService } from '../src/lib/content/AssetStrategyService';
import { ContentBriefBuilder } from '../src/lib/content/ContentBriefBuilder';
import { WritingService } from '../src/lib/content/WritingService';
import { ContentAssetEngine } from '../src/lib/content/ContentAssetEngine';
import { ResearchService } from '../src/lib/research/ResearchService';
import { SearchService } from '../src/lib/research/SearchService';
import { ScrapingService } from '../src/lib/research/ScrapingService';
import { QualityValidationService } from '../src/lib/intelligence/QualityValidationService';
import { ContentRepairService } from '../src/lib/content/ContentRepairService';
import { SeoScoringService } from '../src/lib/intelligence/SeoScoringService';
import { GeoIntelligenceService } from '../src/lib/intelligence/GeoIntelligenceService';
import { LLMProvider, SearchProvider } from '../src/core/contracts/providers';
import { ContentBrief, ContentAsset, ContentBriefSchema, ContentAssetSchema, AssetStrategySchema } from '../src/core/contracts/schemas';
import { AgentOrchestrator, AgentStage } from '../src/core/orchestrator/AgentOrchestrator';

class MockLLM implements LLMProvider {
  public failMode = false;
  public mockText = 'This is mock generated copy for the section.';
  public callsCount = 0;

  async generate(prompt: string, options?: any): Promise<string> {
    this.callsCount++;
    if (this.failMode) {
      throw new Error('Mock LLM failed intentionally');
    }
    return this.mockText;
  }

  async structuredGenerate<T>(prompt: string, schema: any, options?: any): Promise<T> {
    this.callsCount++;
    if (this.failMode) {
      throw new Error('Mock LLM failed intentionally');
    }
    
    if (schema === ContentBriefSchema) {
      return {
        title: 'Mock Title',
        targetKeywords: ['mock keyword'],
        outline: [
          { heading: 'Introduction', level: 'H2', assignedKeywords: [], assignedEntities: [] },
          { heading: 'Core Details', level: 'H2', assignedKeywords: [], assignedEntities: [] }
        ],
        wordCountBudget: { min: 400, max: 800, target: 600 },
        intent: 'Informational',
        competitorInsights: []
      } as any as T;
    }

    throw new Error('Unsupported schema in mock structuredGenerate');
  }
}

class MockSearch implements SearchProvider {
  async search(query: string): Promise<any[]> {
    return [
      { title: 'Result 1', link: 'https://competitor1.com/page1', snippet: 'snippet 1' },
      { title: 'Result 2', link: 'https://competitor2.com/page2', snippet: 'snippet 2' }
    ];
  }
}

async function runTests() {
  console.log('=== STARTING PHASE 13 CONTENT ASSETS TESTS ===\n');

  const saasProfile = {
    name: 'ResumeCraft',
    description: 'AI resume builder for student developers',
    targetAudience: 'Student developers',
    keyFeatures: ['Bullet points optimizer', 'LinkedIn sync'],
    primaryCompetitors: ['tealhq.com'],
    tone: 'professional',
    customInsights: 'custom student layouts'
  };

  // 1-6. Testing routing rules
  console.log('1-6. Testing Asset Strategy routing rules...');
  
  const rules = [
    { keyword: 'Teal vs Kickresume', intent: 'Comparison', expected: 'COMPARISON' },
    { keyword: 'Teal alternatives', intent: 'Commercial', expected: 'ALTERNATIVE' },
    { keyword: 'AI resume builder for developers', intent: 'Transactional', expected: 'USE_CASE_LANDING_PAGE' },
    { keyword: 'how to write a software engineer resume', intent: 'Informational', expected: 'GUIDE' },
    { keyword: 'what is an ATS resume builder', intent: 'Informational', expected: 'FAQ' },
    { keyword: 'resume keywords list', intent: 'Informational', expected: 'ARTICLE' }
  ];

  for (const r of rules) {
    const opp = { keyword: r.keyword, intent: r.intent, rankingDomains: [], searchFeatures: [] };
    const strategy = AssetStrategyService.determineStrategy(saasProfile, opp);
    
    if (strategy.assetType !== r.expected) {
      console.error(`❌ Routing FAILED for "${r.keyword}" (Expected ${r.expected}, got ${strategy.assetType})`);
      process.exit(1);
    }
    
    // 7. AssetStrategy Zod validation
    AssetStrategySchema.parse(strategy);
  }
  console.log('✅ Asset strategy routing and Zod validations: PASSED');

  const mockLLM = new MockLLM();
  const mockSearch = new MockSearch();
  const searchService = new SearchService(mockSearch);
  const scrapingService = new ScrapingService({ scrape: async () => [] } as any);
  const researchService = new ResearchService(searchService, scrapingService);
  const briefBuilder = new ContentBriefBuilder(mockLLM);
  const writer = new WritingService(mockLLM);
  let mockValidatorValid = true;
  const qualityValidator = {
    validate: () => ({
      valid: mockValidatorValid,
      errors: mockValidatorValid ? [] : ['Content is too thin.'],
      metrics: { fleschReadingEase: 80 }
    })
  } as any;
  const repairer = new ContentRepairService(mockLLM);
  const seoScoringService = { calculateScore: () => ({ totalScore: 85 }) } as any;
  const geoIntelligenceService = new GeoIntelligenceService();

  const engine = new ContentAssetEngine(
    researchService,
    briefBuilder,
    writer,
    qualityValidator,
    repairer,
    seoScoringService,
    geoIntelligenceService
  );

  // 8. Brief generation
  console.log('\n8. Testing Brief generation integration...');
  const brief = await briefBuilder.buildBrief(
    'Teal alternatives',
    'Developers',
    saasProfile,
    { wordCount: 800 },
    'run_123',
    { assetType: 'ALTERNATIVE', primaryGoal: 'Showcase superior alternative' } as any
  );
  if (brief.assetType !== 'ALTERNATIVE' || brief.audience !== 'Developers') {
    console.error('❌ Brief generation mapping: FAILED', brief);
    process.exit(1);
  }
  console.log('✅ Brief generation mapping: PASSED');

  // 9. Asset generation using mocked providers
  console.log('\n9. Testing Writing/Asset Generation strategy injection...');
  const asset = await writer.generateAsset(brief, 'run_123', { assetType: 'ALTERNATIVE' });
  if (asset.assetType !== 'ALTERNATIVE' || !asset.slug?.includes('mock-title')) {
    console.error('❌ Asset writing strategy injection: FAILED', asset);
    process.exit(1);
  }
  console.log('✅ Asset writing strategy injection: PASSED');

  // 10-15. Engine execution workflow (SEO, GEO, Quality validation, repair loop, quality gate rejection/success)
  console.log('\n10-15. Testing ContentAssetEngine coordinator workflow & Quality Gates...');
  const opp = { keyword: 'Teal alternatives', intent: 'Commercial', rankingDomains: ['tealhq.com'] };
  
  // Test case 1: Validator says OK, quality gate passes
  const finalAsset = await engine.executeEngine(saasProfile, opp, null, { maxReviewRetries: 1 });
  ContentAssetSchema.parse(finalAsset);
  if (finalAsset.validationStatus !== 'READY' || finalAsset.qualityScore !== 95) {
    console.error('❌ ContentAssetEngine quality gate success: FAILED', finalAsset);
    process.exit(1);
  }

  // Test case 2: Validator fails, repair loop triggered
  mockLLM.mockText = 'A very short copy.'; // trigger word count or quality errors
  // Mock validator override for testing
  const badValidator = {
    validate: () => ({ valid: false, errors: ['Content is too thin'], metrics: { fleschReadingEase: 40 } })
  } as any;
  const failingEngine = new ContentAssetEngine(
    researchService,
    briefBuilder,
    writer,
    badValidator,
    repairer,
    seoScoringService,
    geoIntelligenceService
  );
  const failedAsset = await failingEngine.executeEngine(saasProfile, opp, null, { maxReviewRetries: 1 });
  if (failedAsset.validationStatus !== 'REJECTED' || failedAsset.qualityScore !== 75) {
    console.error('❌ ContentAssetEngine quality gate rejection: FAILED', failedAsset);
    process.exit(1);
  }
  console.log('✅ ContentAssetEngine workflow & Quality Gates: PASSED');

  // 16. Empty intelligence fallback
  console.log('\n16. Testing Empty intelligence fallbacks...');
  const fallbackOpp = { keyword: 'unknown term' };
  const fallbackStrat = AssetStrategyService.determineStrategy(null, fallbackOpp);
  if (fallbackStrat.assetType !== 'ARTICLE' || fallbackStrat.estimatedWordCount !== 1200) {
    console.error('❌ Empty intelligence fallback: FAILED', fallbackStrat);
    process.exit(1);
  }
  console.log('✅ Empty intelligence fallbacks: PASSED');

  // 17. Provider failure handling
  console.log('\n17. Testing Provider failure handling...');
  mockLLM.failMode = true;
  try {
    await engine.executeEngine(saasProfile, opp);
    console.error('❌ Provider failure handling: FAILED (Expected exception, did not throw)');
    process.exit(1);
  } catch (err: any) {
    if (!err.message.includes('intentionally')) {
      console.error('❌ Provider failure handling: FAILED', err);
      process.exit(1);
    }
  }
  mockLLM.failMode = false;
  console.log('✅ Provider failure safety: PASSED');

  // 18. Budget checks & 19. Abort logic & 20. Key leak prevention
  console.log('\n18-20. Testing Telemetry constraints & Telemetries security...');
  const orchestrator = new AgentOrchestrator({
    llm: mockLLM,
    search: mockSearch,
    scraper: { scrape: async () => [] } as any,
    budget: { maxLLMCalls: 1 }
  });
  const runResult = await orchestrator.run({
    saasProfile,
    targetKeyword: 'Teal alternatives',
    targetAudience: 'Developers'
  });
  if (runResult.status !== 'failed' || !runResult.errors.some(e => e.message.includes('limit exceeded'))) {
    console.error('❌ Budget check: FAILED', runResult);
    process.exit(1);
  }

  // Security credentials check
  const serialAsset = JSON.stringify(finalAsset);
  if (serialAsset.includes('key_') || serialAsset.includes('API_') || serialAsset.includes('SECRET_')) {
    console.error('❌ Security Check: Secret credentials found in outputs!');
    process.exit(1);
  }
  console.log('✅ Telemetry budgets, Abort, and Security: PASSED');

  // 21. Orchestrator Stage Validation
  console.log('\n21. Verifying Orchestrator new stages integration...');
  const successfulOrch = new AgentOrchestrator({
    llm: mockLLM,
    search: mockSearch,
    scraper: { scrape: async () => [] } as any,
    budget: { maxLLMCalls: 100 }
  });
  const orchResult = await successfulOrch.run({
    saasProfile,
    targetKeyword: 'Teal alternatives',
    targetAudience: 'Developers'
  });
  const stagesNames = orchResult.stages.map(s => s.stage);
  if (!stagesNames.includes(AgentStage.ASSET_STRATEGY) || !stagesNames.includes(AgentStage.FINALIZE)) {
    console.error('❌ Orchestrator integration: New stages missing!', stagesNames);
    process.exit(1);
  }
  if (!orchResult.content || orchResult.content.assetType !== 'ALTERNATIVE' || orchResult.content.validationStatus !== 'READY') {
    console.error('❌ Orchestrator content asset strategy output: FAILED', orchResult.content);
    process.exit(1);
  }
  console.log('✅ Orchestrator new stages integration: PASSED');

  console.log('\n🎉 ALL PHASE 13 MOCK DIAGNOSTIC TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('Test Execution Failed:', err);
  process.exit(1);
});
