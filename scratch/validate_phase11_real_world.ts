// scratch/validate_phase11_real_world.ts
import 'dotenv/config';
import { SearchOpportunityService } from '../src/lib/saas-intelligence/SearchOpportunityService';
import { SerperProvider } from '../src/lib/research/SerperProvider';
import { GeminiProvider } from '../src/lib/content/GeminiProvider';
import { SearchOpportunitySchema } from '../src/core/contracts/schemas';

async function validateRealWorld() {
  console.log('=== STARTING PHASE 11 REAL-WORLD VALIDATION ===');
  console.log('SaaS Target: ResumeCraft');
  console.log('SaaS Category: AI Resume Builder');

  const search = new SerperProvider();
  const llm = new GeminiProvider();
  const service = new SearchOpportunityService(search, llm);

  const saasProfile = {
    description: 'An AI-powered resume builder specializing in student and developer resumes with live bullet-point optimizations.',
    keyFeatures: ['AI resume generation', 'Bullet point optimizer', 'LinkedIn synchronization'],
    targetAudience: 'Students, graduates, and junior developers'
  };

  const seedKeywords = [
    'best AI resume builders',
    'AI resume builder for students',
    'Teal alternatives',
    'AI resume builder for developers'
  ];

  const startTime = Date.now();

  try {
    const opportunities = await service.analyzeOpportunities(
      'ResumeCraft',
      'AI Resume Builder',
      seedKeywords,
      ['tealhq.com', 'kickresume.com', 'novoresume.com'],
      { saasProfile }
    );

    const duration = Date.now() - startTime;
    console.log(`\nValidation completed in ${(duration / 1000).toFixed(2)}s.`);
    console.log(`Successfully generated and analyzed ${opportunities.length} opportunities.\n`);

    for (const opt of opportunities) {
      console.log(`--------------------------------------------------`);
      console.log(`Keyword: "${opt.keyword}"`);
      console.log(`Normalized: "${opt.normalizedKeyword}"`);
      console.log(`Score: ${opt.opportunityScore}/100`);
      console.log(`Intent: ${opt.intent}`);
      console.log(`Dominant Content Type: ${opt.contentType}`);
      console.log(`Recommended Asset Type: ${opt.recommendedAssetType}`);
      console.log(`Priority: ${opt.priority}`);
      console.log(`Competitor Presence Score: ${opt.competitorPresence}/100`);
      console.log(`Difficulty Score: ${opt.estimatedDifficulty}/100`);
      console.log(`Ranking Domains Found: ${opt.rankingDomains.slice(0, 4).join(', ')}`);
      console.log(`Search Features: ${opt.searchFeatures.join(', ') || 'None'}`);
      console.log(`Content Gap: ${opt.contentGap}`);
      console.log(`Explanation: ${opt.explanation}`);
      console.log(`Reasoning: ${opt.reasoning}`);

      // Perform validation check
      const valid = SearchOpportunitySchema.safeParse(opt);
      if (!valid.success) {
        console.error(`❌ Zod Schema mismatch for keyword "${opt.keyword}":`, valid.error.message);
        process.exit(1);
      }
    }

    console.log(`--------------------------------------------------`);
    console.log('\n✅ REAL-WORLD VALIDATION PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('\n❌ REAL-WORLD VALIDATION FAILED:', err.message);
    process.exit(1);
  }
}

validateRealWorld();
