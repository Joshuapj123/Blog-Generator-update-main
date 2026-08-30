// scratch/test_phase16_authority_intelligence.ts
import { 
  AuthorityOpportunitySchema, 
  AuthorityOpportunity,
  SaaSProfile,
  ContentAsset,
  SearchOpportunity
} from '../src/core/contracts/schemas';
import { MockAuthorityProvider } from '../src/lib/authority/MockAuthorityProvider';
import { BacklinkIntelligenceService } from '../src/lib/authority/BacklinkIntelligenceService';
import { MentionIntelligenceService } from '../src/lib/authority/MentionIntelligenceService';
import { CompetitorLinkGapService } from '../src/lib/authority/CompetitorLinkGapService';
import { AuthorityScoringService } from '../src/lib/authority/AuthorityScoringService';
import { AuthorityOpportunityService, AuthorityOpportunityRepository } from '../src/lib/authority/AuthorityOpportunityService';

async function runTests() {
  console.log('=== STARTING PHASE 16 AUTHORITY ENGINE TESTS ===\n');

  // 1. Zod Schema Validation
  console.log('1. Testing Zod Schemas...');
  const testOpp: AuthorityOpportunity = {
    id: 'opp_123',
    targetContentAssetId: 'asset_rc_101',
    targetDomain: 'techcrunch.com',
    targetUrl: 'https://www.techcrunch.com/article/resumes',
    opportunityType: 'competitor_backlink_gap',
    relationshipType: 'Competitor Referrer',
    relevanceScore: 82,
    authorityScore: 90,
    topicalRelevance: 75,
    estimatedDifficulty: 60,
    competitorEvidence: ['tealhq.com'],
    mentionStatus: 'none',
    backlinkStatus: 'none',
    recommendedAction: 'OUTREACH',
    priority: 'HIGH',
    reasoning: 'Competitor has a link here.'
  };
  AuthorityOpportunitySchema.parse(testOpp);
  console.log('✅ Zod schema validation: PASSED');

  // 2. Domain Normalization
  console.log('\n2. Testing Domain Normalization...');
  const normalized1 = BacklinkIntelligenceService.normalizeDomain('https://Sub.Domain.com/path/name?query=1');
  const normalized2 = BacklinkIntelligenceService.normalizeDomain('  sub.domain.com/   ');
  const normalized3 = BacklinkIntelligenceService.normalizeDomain('http://www.domain.com');

  if (normalized1 !== 'sub.domain.com' || normalized2 !== 'sub.domain.com' || normalized3 !== 'domain.com') {
    console.error(`❌ Domain normalization failed: ${normalized1}, ${normalized2}, ${normalized3}`);
    process.exit(1);
  }
  console.log('✅ Domain normalization: PASSED');

  // 3. Competitor Link Gap & Existing-link exclusion
  console.log('\n3. Testing Competitor Link Gap & Existing Link Exclusion...');
  const mockBacklinks = [
    { url: 'https://techcrunch.com/resumes', domain: 'techcrunch.com', authority: 90, targetDomain: 'tealhq.com' },
    { url: 'https://producthunt.com/products/teal', domain: 'producthunt.com', authority: 88, targetDomain: 'tealhq.com' },
    // dev.to links to competitor, but our SaaS already has a referring domain link from dev.to
    { url: 'https://dev.to/career/teal-review', domain: 'dev.to', authority: 80, targetDomain: 'tealhq.com' }
  ];

  const ourRefs = ['dev.to', 'medium.com'];

  const gaps = CompetitorLinkGapService.findLinkGaps(mockBacklinks, ourRefs);

  // dev.to must be excluded since ourRefs has it
  const hasDevTo = gaps.some(g => g.domain === 'dev.to');
  const hasTechCrunch = gaps.some(g => g.domain === 'techcrunch.com');

  if (hasDevTo || !hasTechCrunch) {
    console.error('❌ Competitor link gap exclusion failed. Gaps: ', gaps);
    process.exit(1);
  }
  console.log('✅ Competitor Link Gap & Existing link exclusion: PASSED');

  // 4. Mention Sentiment & Unknown Sentiment Handling
  console.log('\n4. Testing Mention Sentiment Classification...');
  
  const positiveSnippet = 'This is the absolute best resume builder ever! I love it so much.';
  const neutralSnippet = 'We looked at ResumeCraft in our review.';

  const positiveSentiment = MentionIntelligenceService.classifySentiment(positiveSnippet);
  const neutralSentiment = MentionIntelligenceService.classifySentiment(neutralSnippet);

  if (positiveSentiment !== 'positive' || neutralSentiment !== 'unknown') {
    console.error(`❌ Mention sentiment mapping failed: positive=${positiveSentiment}, neutral=${neutralSentiment}`);
    process.exit(1);
  }
  console.log('✅ Sentiment & unknown sentiment handling: PASSED');

  // 5. Authority Scoring Verification
  console.log('\n5. Testing Deterministic Opportunity Scoring...');
  
  // High authority, high relevance, multiple competitors
  const highScoringOpp = AuthorityScoringService.calculateScore({
    authorityScore: 90,
    topicalRelevance: 80,
    competitorEvidenceCount: 2, // 100 points
    businessRelevance: 85,
    feasibilityScore: 70
  });

  // Low authority, low relevance
  const lowScoringOpp = AuthorityScoringService.calculateScore({
    authorityScore: 30,
    topicalRelevance: 40,
    competitorEvidenceCount: 0, // 0 points
    businessRelevance: 50,
    feasibilityScore: 40
  });

  // Verify scoring math:
  // highScore: 0.30*90 (27) + 0.25*80 (20) + 0.20*100 (20) + 0.15*85 (12.75) + 0.10*70 (7) = 86.75 -> round to 87
  if (highScoringOpp.totalScore !== 87 || highScoringOpp.priority !== 'HIGH') {
    console.error('❌ Scoring calculation failed on high score', highScoringOpp);
    process.exit(1);
  }

  // lowScore: 0.30*30 (9) + 0.25*40 (10) + 0.20*0 (0) + 0.15*50 (7.5) + 0.10*40 (4) = 30.5 -> round to 31
  if (lowScoringOpp.totalScore !== 31 || lowScoringOpp.priority !== 'LOW') {
    console.error('❌ Scoring calculation failed on low score', lowScoringOpp);
    process.exit(1);
  }
  console.log('✅ Deterministic scoring calculation: PASSED');

  // 6. Full Coordinator Service Integration
  console.log('\n6. Testing Full Coordinator Service Integration...');
  const provider = new MockAuthorityProvider();
  const savedOpps: AuthorityOpportunity[] = [];
  const mockRepo: AuthorityOpportunityRepository = {
    saveOpportunity: async (opp) => {
      savedOpps.push(opp);
      return opp.id;
    }
  };

  const coordinator = new AuthorityOpportunityService(provider, mockRepo);

  const saasProfile: any = {
    name: 'ResumeCraft',
    website: 'resumecraft.io',
    tagline: 'AI resume optimizer',
    targetAudience: 'Student developers',
    primaryCompetitors: ['tealhq.com'],
    features: ['Bullet point optimizer'],
    keywords: ['AI resume']
  };

  const asset: any = {
    id: 'asset_999',
    title: 'Top Career Resume Tips',
    slug: 'career-resume-tips',
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const searchOpp: any = {
    keyword: 'best AI builders',
    searchVolume: 1200,
    difficulty: 45,
    intent: 'Commercial',
    priority: 'High',
    serpCompetitors: ['tealhq.com']
  };

  const generatedOpps = await coordinator.analyzeOpportunities(
    saasProfile as any,
    asset as any,
    searchOpp as any
  );
  
  if (generatedOpps.length === 0 || savedOpps.length === 0) {
    console.error('❌ Coordinator service generated zero opportunities', generatedOpps);
    process.exit(1);
  }

  // Validate all generated opportunities against Zod schema
  for (const opp of generatedOpps) {
    AuthorityOpportunitySchema.parse(opp);
  }

  console.log(`✅ Coordinator service generated and verified ${generatedOpps.length} opportunities.`);

  console.log('\n🎉 ALL PHASE 16 AUTHORITY ENGINE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ TEST RUN ERROR:', err);
  process.exit(1);
});
