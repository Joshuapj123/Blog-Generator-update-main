// scratch/validate_phase12_real_world.ts
import 'dotenv/config';
import { GeoVisibilityService } from '../src/lib/intelligence/GeoVisibilityService';
import { GeminiVisibilityProvider } from '../src/lib/intelligence/AIVisibilityProvider';
import { GeminiProvider } from '../src/lib/content/GeminiProvider';
import { GEOVisibilityResultSchema, GEOOpportunitySchema } from '../src/core/contracts/schemas';

async function validateRealWorld() {
  console.log('=== STARTING PHASE 12 REAL-WORLD VALIDATION ===');
  console.log('SaaS: ResumeCraft');
  console.log('Domain: resumecraft.io');

  const llm = new GeminiProvider();
  const geminiProvider = new GeminiVisibilityProvider(llm);
  const service = new GeoVisibilityService([geminiProvider]);

  const opportunities = [
    { keyword: 'AI resume builder for students', opportunityScore: 91, intent: 'Commercial', contentType: 'Listicle' },
    { keyword: 'Teal alternatives', opportunityScore: 80, intent: 'Comparison', contentType: 'Comparison' },
    { keyword: 'AI resume builder for software engineers', opportunityScore: 85, intent: 'Commercial', contentType: 'Listicle' }
  ];

  const startTime = Date.now();

  try {
    // Run analysis with budget limit of 3 prompts to conserve tokens
    const result = await service.analyzeVisibility(
      'ResumeCraft',
      'resumecraft.io',
      opportunities,
      ['tealhq.com', 'kickresume.com', 'novoresume.com'],
      { promptBudget: 3 }
    );

    const duration = Date.now() - startTime;
    console.log(`\nValidation completed in ${(duration / 1000).toFixed(2)}s.`);
    console.log(`Calculated GEO score: ${result.geoScore}/100\n`);

    console.log('--- METRICS ---');
    console.log(`Mention Rate: ${result.metrics.mentionRate}%`);
    console.log(`Citation Rate: ${result.metrics.citationRate}%`);
    console.log(`Competitive Visibility: ${result.metrics.competitiveVisibility}%`);
    console.log(`Avg Position Score: ${result.metrics.mentionPositionScore}%`);
    console.log(`Entity Coverage Score: ${result.metrics.entityCoverageScore}%`);

    console.log('\n--- VISIBILITY RESULTS ---');
    for (const r of result.visibilityResults) {
      console.log(`\nPrompt: "${r.prompt}"`);
      console.log(`Brand Mentioned: ${r.brandMentioned}`);
      console.log(`Competitors Mentioned: ${r.competitorsMentioned.join(', ') || 'None'}`);
      console.log(`Citations Count: ${r.citations.length}`);
      if (r.citations.length > 0) {
        console.log(`Unique Domains Cited: ${r.citations.map((c: any) => c.domain).slice(0, 4).join(', ')}`);
      }
      console.log(`Success: ${r.answerMetadata.success} (Latency: ${r.answerMetadata.latency}ms)`);
      
      // Validate schema
      GEOVisibilityResultSchema.parse(r);
    }

    console.log('\n--- GEO RECOMMENDATIONS ---');
    for (const opp of result.geoOpportunities) {
      console.log(`\nIssue: ${opp.issue}`);
      console.log(`Evidence: ${opp.evidence}`);
      console.log(`Impact: ${opp.impact} (Priority: ${opp.priority})`);
      console.log(`Recommended Action: ${opp.recommendedAction}`);

      // Validate schema
      GEOOpportunitySchema.parse(opp);
    }

    console.log('\n✅ REAL-WORLD VALIDATION PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('\n❌ REAL-WORLD VALIDATION FAILED:', err.message);
    process.exit(1);
  }
}

validateRealWorld();
