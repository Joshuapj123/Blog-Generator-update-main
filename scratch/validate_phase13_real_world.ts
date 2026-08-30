// scratch/validate_phase13_real_world.ts
import 'dotenv/config';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import { GeminiProvider } from '../src/lib/content/GeminiProvider';
import { SerperProvider } from '../src/lib/research/SerperProvider';
import { PlaywrightProvider } from '../src/lib/research/PlaywrightProvider';
import { ContentAssetSchema } from '../src/core/contracts/schemas';

async function validateRealWorld() {
  console.log('=== STARTING PHASE 13 REAL-WORLD VALIDATION ===');
  console.log('SaaS Profile: ResumeCraft');
  console.log('Keyword: "Teal alternatives"');

  const llm = new GeminiProvider();
  const search = new SerperProvider();
  const scraper = new PlaywrightProvider();

  const orchestrator = new AgentOrchestrator({
    llm,
    search,
    scraper,
    budget: {
      maxLLMCalls: 15,
      maxSearchCalls: 5,
      maxScrapeCalls: 5
    }
  });

  const saasProfile = {
    name: 'ResumeCraft',
    description: 'AI resume builder specializing in student and developer resumes, bullet-point optimizer, and LinkedIn sync.',
    website: 'https://resumecraft.io',
    targetAudience: 'Student developers and entry-level engineers',
    keyFeatures: ['Bullet points optimizer', 'LinkedIn sync', 'ATS-friendly templates'],
    primaryCompetitors: ['tealhq.com'],
    tone: 'professional',
    customInsights: 'none'
  };

  const startTime = Date.now();

  try {
    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: 'Teal alternatives',
      targetAudience: 'Student developers',
      contentType: 'Comparison'
    });

    const duration = Date.now() - startTime;
    console.log(`\nValidation completed in ${(duration / 1000).toFixed(2)}s.`);
    console.log(`Status: ${result.status}`);

    console.log('\n--- TELEMETRY ---');
    console.log(`Duration: ${result.telemetry.totalDurationMs}ms`);
    console.log(`LLM Calls: ${result.telemetry.llmCalls}`);
    console.log(`Search Calls: ${result.telemetry.searchCalls}`);
    console.log(`Scrape Calls: ${result.telemetry.scrapeCalls}`);
    console.log(`Errors Count: ${result.errors.length}`);

    if (result.content) {
      console.log('\n--- CONTENT ASSET ---');
      console.log(`Title: "${result.content.title}"`);
      console.log(`Asset Type: ${result.content.assetType}`);
      console.log(`Word Count: ${result.content.wordCount}`);
      console.log(`SEO Score: ${result.content.seoScore}`);
      console.log(`GEO Score: ${result.content.geoScore}`);
      console.log(`Quality Score: ${result.content.qualityScore}`);
      console.log(`Validation Status: ${result.content.validationStatus}`);
      console.log(`Slug: ${result.content.slug}`);

      console.log('\n--- MARKDOWN BODY SNIPPET ---');
      console.log(result.content.bodyMarkdown.substring(0, 400) + '...\n');

      // Validate Zod schema
      ContentAssetSchema.parse(result.content);
    } else {
      console.error('❌ Error: No content asset was generated!');
      process.exit(1);
    }

    console.log('✅ REAL-WORLD VALIDATION PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('❌ REAL-WORLD VALIDATION FAILED:', err.message);
    process.exit(1);
  }
}

validateRealWorld();
