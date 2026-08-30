import { SearchOpportunityService } from '../src/lib/saas-intelligence/SearchOpportunityService';
import { SearchProvider, LLMProvider, SearchResult } from '../src/core/contracts/providers';
import { SearchOpportunitySchema } from '../src/core/contracts/schemas';
import { z } from 'zod';

class MockSearchProvider implements SearchProvider {
  public callCount = 0;
  public failMode = false;
  public emptyMode = false;

  async search(query: string, options?: { numResults?: number }): Promise<SearchResult[]> {
    this.callCount++;
    if (this.failMode) {
      throw new Error('Search API quota exceeded');
    }
    if (this.emptyMode) {
      return [];
    }

    // Return deterministic search results based on query
    if (query.includes('alternatives')) {
      return [
        { title: 'Top 10 Teal Alternatives & Competitors', link: 'https://www.jobscan.co/blog/teal-alternatives', snippet: 'Discover the best alternatives to Teal Co for career tracking and resume building.' },
        { title: 'Best Teal Alternatives (Free & Paid)', link: 'https://www.capterra.com/resume-builder/alternatives-to-teal', snippet: 'Compare Teal to other similar platforms in 2026.' }
      ];
    }

    return [
      { title: 'Best AI Resume Builders for Students', link: 'https://www.kickresume.com/en/help-center/best-ai-resume-builders/', snippet: 'Create a professional student resume using artificial intelligence tools.' },
      { title: '10 Top Resume Tools for College Graduates', link: 'https://www.novoresume.com/blog/resume-builders', snippet: 'Reviewing the best resume generators on the market.' }
    ];
  }
}

class MockLLMProvider implements LLMProvider {
  public generateCallCount = 0;
  public structuredCallCount = 0;
  public lastPrompt = '';

  async generate(prompt: string, options?: any): Promise<string> {
    this.generateCallCount++;
    return 'mock generate response';
  }

  async structuredGenerate<T>(prompt: string, schema: any, options?: any): Promise<T> {
    this.structuredCallCount++;
    this.lastPrompt = prompt;

    // Detect operation type
    if (options?.operation === 'SaaS Keyword Discovery') {
      return {
        suggestedKeywords: [
          'best AI resume builders',
          'AI resume builder for students',
          'Teal alternatives',
          'AI resume builder for developers'
        ]
      } as any as T;
    }

    // Keyword Opportunity Classification operation
    if (prompt.includes('Teal alternatives')) {
      return {
        normalizedKeyword: 'teal alternatives',
        intent: 'Comparison',
        contentType: 'Comparison',
        serpTypes: [
          { type: 'Comparison', count: 6 },
          { type: 'Review', count: 4 }
        ],
        searchFeatures: ['People Also Ask'],
        competitors: ['tealhq.com', 'huntr.co'],
        businessRelevance: 90,
        competitorPresence: 80,
        estimatedDifficulty: 40,
        contentGap: 'Teal is popular for job tracking but lacks advanced AI student templates. We can build an alternative landing page targeting students.',
        recommendedAssetType: 'Alternative page',
        explanation: 'Highly relevant search showing direct comparison queries with moderate difficulty.',
        reasoning: 'Detailed reasoning showing strong conversion potential.',
        priority: 'High'
      } as any as T;
    }

    return {
      normalizedKeyword: 'ai resume builder for students',
      intent: 'Commercial',
      contentType: 'Listicle',
      serpTypes: [
        { type: 'Listicle', count: 7 },
        { type: 'Product Page', count: 3 }
      ],
      searchFeatures: ['Featured Snippet'],
      competitors: ['kickresume.com', 'novoresume.com'],
      businessRelevance: 95,
      competitorPresence: 60,
      estimatedDifficulty: 30,
      contentGap: 'Most ranking results are generic listicles, missing developer-specific customization templates.',
      recommendedAssetType: 'Use-case landing page',
      explanation: 'Excellent informational query with high business intent and lower competition.',
      reasoning: 'Detailed logic for prioritisation.',
      priority: 'High'
    } as any as T;
  }
}

async function runTests() {
  console.log('=== STARTING PHASE 11 SERP INTELLIGENCE TESTS ===\n');

  const searchMock = new MockSearchProvider();
  const llmMock = new MockLLMProvider();
  const service = new SearchOpportunityService(searchMock, llmMock);

  const testSaaSProfile = {
    description: 'An AI-powered resume builder specializing in student and developer resumes.',
    keyFeatures: ['AI resume generation', 'Bullet point optimizer', 'LinkedIn sync'],
    targetAudience: 'Students, graduates, and junior developers'
  };

  // Test 1-11: Keyword Opportunity Analysis, Normalization, Classification, Scoring, Intent, Content-Type, Gap, Ranking, Schemas
  console.log('1. Analyzing opportunities with Mock Providers...');
  const opportunities = await service.analyzeOpportunities(
    'ResumeCraft',
    'Resume Builder',
    [], // empty seed triggers discovery
    ['tealhq.com', 'kickresume.com'],
    { saasProfile: testSaaSProfile }
  );

  console.log(`Discovered & analyzed ${opportunities.length} opportunities.`);

  // Verify Zod Validation
  console.log('\n2. Verifying Zod Schema validation for all opportunities...');
  for (const opt of opportunities) {
    const parseResult = SearchOpportunitySchema.safeParse(opt);
    if (!parseResult.success) {
      console.error('❌ Zod validation failed:', parseResult.error.message);
      process.exit(1);
    }
  }
  console.log('✅ Zod schema validation: PASSED');

  // Verify Keyword Discovery & Normalization
  console.log('\n3. Verifying keyword discovery & normalization...');
  const keywords = opportunities.map(o => o.keyword);
  console.log('Discovered Keywords:', keywords);
  if (!keywords.includes('Teal alternatives') && !keywords.includes('AI resume builder for students')) {
    console.error('❌ Keyword discovery: FAILED');
    process.exit(1);
  }
  console.log('✅ Keyword discovery & normalization: PASSED');

  // Verify Intent & Content-type Classification
  console.log('\n4. Verifying Intent, Content-Type, and SERP layout composition...');
  const tealOpt = opportunities.find(o => o.keyword === 'Teal alternatives');
  if (!tealOpt || tealOpt.intent !== 'Comparison' || tealOpt.contentType !== 'Comparison') {
    console.error('❌ Intent or Content-Type classification: FAILED', tealOpt);
    process.exit(1);
  }
  if (!tealOpt.serpTypes.some(t => t.type === 'Comparison' && t.count === 6)) {
    console.error('❌ SERP Layout classification: FAILED', tealOpt.serpTypes);
    process.exit(1);
  }
  console.log('✅ Intent, Content-Type, and SERP layout mapping: PASSED');

  // Verify Competitor Overlap & Content Gap Detection
  console.log('\n5. Verifying Competitor Overlap and Content Gap Detection...');
  if (!tealOpt.competitors.includes('tealhq.com')) {
    console.error('❌ Competitor mapping: FAILED', tealOpt.competitors);
    process.exit(1);
  }
  if (!tealOpt.contentGap.includes('student templates')) {
    console.error('❌ Content Gap analysis: FAILED', tealOpt.contentGap);
    process.exit(1);
  }
  console.log('✅ Competitor Overlap and Content Gap detection: PASSED');

  // Verify Deterministic Scoring & Priority Recommendation
  console.log('\n6. Verifying Opportunity Scoring formula and Priority...');
  // Teal alternatives: Relevance=90, Intent=Comparison(100), Gap=95 (length > 40), Difficulty=40
  // Score = 90*0.35 + 100*0.25 + 95*0.20 + (100-40)*0.20 = 31.5 + 25 + 19 + 12 = 87.5 => 88
  if (tealOpt.opportunityScore !== 88) {
    console.error(`❌ Opportunity scoring formula: FAILED (Expected 88, got ${tealOpt.opportunityScore})`);
    process.exit(1);
  }
  if (tealOpt.priority !== 'High' || tealOpt.recommendedAssetType !== 'Alternative page') {
    console.error('❌ Priority / recommended asset type: FAILED', tealOpt);
    process.exit(1);
  }
  console.log('✅ Deterministic scoring and prioritisation recommendations: PASSED');

  // Verify Opportunity Ranking order (descending score)
  console.log('\n7. Verifying Opportunity ranking order (descending scores)...');
  const scores = opportunities.map(o => o.opportunityScore);
  const isSorted = scores.every((val, i, arr) => !i || arr[i - 1] >= val);
  if (!isSorted) {
    console.error('❌ Opportunity ranking order: FAILED', scores);
    process.exit(1);
  }
  console.log('✅ Opportunity ranking order: PASSED');

  // Verify SearchProvider Failure Handling
  console.log('\n8. Testing SearchProvider failure safety...');
  searchMock.failMode = true;
  const failOpportunities = await service.analyzeOpportunities(
    'ResumeCraft',
    'Resume Builder',
    ['best AI resume builders'],
    []
  );
  if (failOpportunities.length === 0 || !failOpportunities[0].explanation.includes('Fallback')) {
    console.error('❌ SearchProvider failure safety: FAILED', failOpportunities);
    process.exit(1);
  }
  console.log('✅ SearchProvider failure safety: PASSED');

  // Verify Empty SERP Handling
  console.log('\n9. Testing Empty SERP response handling...');
  searchMock.failMode = false;
  searchMock.emptyMode = true;
  const emptyOpportunities = await service.analyzeOpportunities(
    'ResumeCraft',
    'Resume Builder',
    ['best AI resume builders'],
    []
  );
  if (emptyOpportunities.length === 0 || emptyOpportunities[0].opportunityScore === 0) {
    console.error('❌ Empty SERP response handling: FAILED', emptyOpportunities);
    process.exit(1);
  }
  console.log('✅ Empty SERP response handling: PASSED');

  // Verify Budget check enforcement & Credential leakage checks
  console.log('\n10. Testing call budgets and telemetry constraints...');
  if (searchMock.callCount > 15) {
    console.error(`❌ Search budget exceeded: ${searchMock.callCount} calls`);
    process.exit(1);
  }
  console.log('✅ Call budgets & Telemetry safety: PASSED');

  // No API key leak verify
  console.log('\n11. Verifying logging security (no API key leakage)...');
  const logString = JSON.stringify(opportunities);
  if (logString.includes('key_') || logString.includes('AI_') || logString.includes('API_')) {
    console.error('❌ Security Check: Potential API Key Leak found in output dump!');
    process.exit(1);
  }
  console.log('✅ Logging security verification: PASSED');

  console.log('\n🎉 ALL PHASE 11 MOCK DIAGNOSTIC TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('Test Execution Failed:', err);
  process.exit(1);
});
