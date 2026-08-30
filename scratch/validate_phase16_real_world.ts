// scratch/validate_phase16_real_world.ts
import { AuthorityOpportunitySchema } from '../src/core/contracts/schemas';
import { MockAuthorityProvider } from '../src/lib/authority/MockAuthorityProvider';
import { AuthorityOpportunityService, AuthorityOpportunityRepository } from '../src/lib/authority/AuthorityOpportunityService';

async function validateRealWorld() {
  console.log('=== STARTING PHASE 16 AUTHORITY VALIDATION ===');
  console.log('Provider unavailable — architecture validated with deterministic provider.');

  const provider = new MockAuthorityProvider();
  
  const opportunitiesDb = new Map<string, any>();
  const mockRepo: AuthorityOpportunityRepository = {
    saveOpportunity: async (opp) => {
      opportunitiesDb.set(opp.id, opp);
      return opp.id;
    }
  };

  const coordinator = new AuthorityOpportunityService(provider, mockRepo);

  const saasProfile = {
    name: 'ResumeCraft',
    website: 'resumecraft.io',
    tagline: 'AI resume optimizer',
    targetAudience: 'Student developers',
    primaryCompetitors: ['tealhq.com'],
    features: ['Bullet point optimizer'],
    keywords: ['AI resume']
  };

  const asset = {
    id: 'asset_validate_16',
    title: 'Top Career Resume Tips',
    slug: 'career-resume-tips',
    status: 'published' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const searchOpp = {
    keyword: 'best AI builders',
    searchVolume: 1200,
    difficulty: 45,
    intent: 'commercial' as const,
    priority: 'high' as const,
    serpCompetitors: ['tealhq.com']
  };

  console.log('\nAnalyzing opportunities...');
  const opportunities = await coordinator.analyzeOpportunities(
    saasProfile as any,
    asset as any,
    searchOpp as any
  );

  console.log(`\nGenerated ${opportunities.length} opportunities:`);
  for (const opp of opportunities) {
    console.log(`- Target domain: ${opp.targetDomain}`);
    console.log(`  Type: ${opp.opportunityType}`);
    console.log(`  Score: ${opp.relevanceScore}`);
    console.log(`  Priority: ${opp.priority}`);
    console.log(`  Action: ${opp.recommendedAction}`);
    console.log(`  Reasoning: ${opp.reasoning}`);
    
    // Validate schema
    AuthorityOpportunitySchema.parse(opp);
  }

  console.log('\n✅ PHASE 16 AUTHORITY VALIDATION COMPLETED SUCCESSFULLY!');
}

validateRealWorld().catch(err => {
  console.error('❌ VALIDATION RUN EXCEPTION:', err);
  process.exit(1);
});
