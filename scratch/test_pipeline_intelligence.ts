import { calculateMedian, analyzeContentGaps } from '@/core/orchestrator/AgentOrchestrator';
import { AgentOrchestrator } from '@/core/orchestrator/AgentOrchestrator';
import { LLMProvider, SearchProvider, ScrapeProvider } from '@/core/contracts/providers';
import { ContentBrief, ContentAsset } from '@/core/contracts/schemas';

async function testMedianCalculations() {
  console.log('--- Test Median Calculations ---');
  
  // Empty array
  const m0 = calculateMedian([]);
  console.assert(m0 === 0, `Expected 0, got ${m0}`);
  
  // One competitor
  const m1 = calculateMedian([4062]);
  console.assert(m1 === 4062, `Expected 4062, got ${m1}`);
  
  // Two competitors
  const m2 = calculateMedian([4062, 2328]);
  console.assert(m2 === 3195, `Expected 3195, got ${m2}`);
  
  // Three competitors
  const m3 = calculateMedian([4062, 2328, 5000]);
  console.assert(m3 === 4062, `Expected 4062, got ${m3}`);
  
  // Four competitors (even count)
  const m4 = calculateMedian([1000, 2000, 3000, 4000]);
  console.assert(m4 === 2500, `Expected 2500, got ${m4}`);

  console.log('✔ Median calculations passed successfully.');
}

async function testContentGapDetection() {
  console.log('\n--- Test Content Gap Detection ---');
  
  const mockSaasProfile = {
    name: 'TestSaaS',
    description: 'A test GTM tool',
    keyFeatures: [
      'Agentic CRM Integration (unifies marketing and sales)',
      'Autonomous Proactive Support',
      'Revenue Hub with multi-currency billing'
    ]
  };

  // Competitor mentions CRM but not autonomous support or revenue hub
  const mockCompetitors = [
    {
      url: 'https://comp1.com',
      wordCount: 1500,
      h2Count: 5,
      hasTables: false,
      tableCount: 0,
      headings: [
        { tag: 'h2', text: 'What is CRM integration?' },
        { tag: 'h3', text: 'Setting up CRM details' }
      ]
    }
  ];

  const gaps = analyzeContentGaps(mockSaasProfile, mockCompetitors);
  console.log('Calculated Gaps:', gaps);

  console.assert(gaps.includes('Competitor coverage appears limited for: Autonomous Proactive Support'), 'Expected gap for Autonomous Proactive Support');
  console.assert(gaps.includes('Competitor coverage appears limited for: Revenue Hub with multi-currency billing'), 'Expected gap for Revenue Hub');
  console.assert(gaps.includes('Consider adding a structured comparison table where useful.'), 'Expected structural table gap');
  // CRM integration should not be a gap because competitor headings contain CRM
  console.assert(!gaps.some(g => g.includes('Agentic CRM')), 'Should not have gap for CRM Integration');

  console.log('✔ Content gap detection passed successfully.');
}

async function testZeroCompetitorsEdgeCase() {
  console.log('\n--- Test Zero Competitor Edge Case ---');
  const mockSaasProfile = {
    name: 'TestSaaS',
    keyFeatures: ['Billing']
  };
  const gaps = analyzeContentGaps(mockSaasProfile, []);
  console.assert(gaps.length === 0, `Expected 0 gaps for empty competitors, got ${gaps.length}`);
  
  const med = calculateMedian([]);
  console.assert(med === 0, `Expected median 0, got ${med}`);
  
  console.log('✔ Zero competitor edge case passed successfully.');
}

async function testHandoffToWriter() {
  console.log('\n--- Test Handoff to Writing Stage ---');
  
  // Set up mock providers
  const mockLlm: LLMProvider = {
    generate: async (prompt: string, options?: any) => {
      // Assert that the prompt contains the writing constraints block
      console.log('LLM generate called with options:', options?.operation);
      if (options?.operation === 'Section Generation') {
        const hasIntelligenceContext = prompt.includes('=== SEO AND GEO INTELLIGENCE WRITING CONSTRAINTS ===');
        const hasCompetitors = prompt.includes('competitor-a.com');
        const hasGaps = prompt.includes('Competitor coverage appears limited for: FeatureX');
        const hasGeo = prompt.includes('Add statistics tables');
        
        console.assert(hasIntelligenceContext, 'Prompt must contain intelligence context block');
        console.assert(hasCompetitors, 'Prompt must list competitors');
        console.assert(hasGaps, 'Prompt must list gaps');
        console.assert(hasGeo, 'Prompt must list GEO requirements');
        
        console.log('✔ Writer prompt verification succeeded.');
      }
      return 'Draft text content';
    },
    structuredGenerate: async <T>(prompt: string, schema: any, options?: any) => {
      return {} as T;
    }
  };

  const orchestrator = new AgentOrchestrator({
    llm: mockLlm,
    search: {
      search: async () => []
    } as any,
    scraper: {
      scrape: async () => []
    } as any,
    budget: { maxLLMCalls: 25, maxSearchCalls: 5 }
  });

  const mockBrief: ContentBrief = {
    title: 'Test Blog Post',
    targetKeywords: ['test-kw'],
    outline: [
      {
        heading: 'Introduction',
        level: 'H2',
        core_concept: 'Test intro',
        assignedKeywords: ['test-kw'],
        assignedEntities: []
      }
    ],
    assetType: 'ARTICLE'
  };

  const mockStrategy = {
    assetType: 'ARTICLE',
    competitorReferences: ['competitor-a.com'],
    differentiationRequirements: ['Competitor coverage appears limited for: FeatureX'],
    geoRequirements: ['Add statistics tables']
  };

  // Invoke runGeneration directly (which is private but accessible via casting or bracket notation in TS)
  const result = await (orchestrator as any).runGeneration(mockBrief, mockStrategy);
  console.assert(result.bodyMarkdown.includes('## Introduction'), 'Heading must be present');
  console.assert(result.bodyMarkdown.includes('Draft text content'), 'Section content must be present');

  console.log('✔ Handoff to writer passed successfully.');
}

async function main() {
  try {
    await testMedianCalculations();
    await testContentGapDetection();
    await testZeroCompetitorsEdgeCase();
    await testHandoffToWriter();
    console.log('\n=====================================');
    console.log('ALL REGRESSION TESTS PASSED!');
    console.log('=====================================');
  } catch (err: any) {
    console.error('TEST FAIL:', err);
    process.exit(1);
  }
}

main();
