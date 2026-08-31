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

  const mockBrief = {
    title: 'Test Blog Post',
    targetKeywords: ['test-kw'],
    outline: [
      {
        heading: 'Introduction',
        level: 'H2',
        generate_table: false,
        core_concept: 'Test intro',
        assignedKeywords: ['test-kw'],
        assignedEntities: []
      }
    ],
    assetType: 'ARTICLE',
    wordCountBudget: { min: 1000, max: 2000, target: 1500 },
    intent: 'Informational'
  } as any as ContentBrief;

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

async function testQualityValidationAndRepair() {
  console.log('\n--- Test Quality Validation & Bounded Repair ---');
  
  const mockLlm: LLMProvider = {
    generate: async (prompt: string, options?: any) => {
      // Mock repair response
      if (options?.operation === 'Content Quality Repair') {
        return `OPTIMIZED TITLE: Optimized Short Title\n\nREPAIRED BODY:\n## Introduction\nWe designed this tool to help you write blog posts. The software is easy to use and fast. You can write your first article today with templates. It contains the primary keyword test-kw. We naturally integrated the supporting keyword here. This is a very clean sentence that helps businesses grow. All operations are direct and simple.`;
      }
      return 'Draft text content';
    },
    structuredGenerate: async () => ({}) as any
  };

  const orchestrator = new AgentOrchestrator({
    llm: mockLlm,
    search: {
      search: async () => []
    } as any,
    scraper: {
      scrape: async () => []
    } as any
  });

  // Inject supporting terms
  (orchestrator as any).supportingTerms = ['supporting keyword'];

  const brief = {
    title: 'An Extremely Long Title That Exceeds The Maximum Words Allowed For SEO Title Validation Check',
    targetKeywords: ['test-kw'],
    outline: [
      {
        heading: 'Introduction',
        level: 'H2',
        generate_table: false,
        core_concept: 'Test intro',
        assignedKeywords: ['test-kw'],
        assignedEntities: []
      }
    ],
    wordCountBudget: { min: 10, max: 100, target: 50 },
    intent: 'Informational'
  } as any as ContentBrief;

  // Let's create an asset that violates several rules:
  // - Title is too long (above 70 chars)
  // - Missing primary keyword
  // - Missing supporting terms
  // - Section is too long (e.g. 200 words, exceeds max allocation for intro which is ~50 * 1.35)
  // - Paragraph is too long (contains 200 words)
  const longParagraph = Array(200).fill('word').join(' ');
  const contentAsset: ContentAsset = {
    title: 'An Extremely Long Title That Exceeds The Maximum Words Allowed For SEO Title Validation Check',
    bodyMarkdown: `## Introduction\n\n${longParagraph}\n\nThis is another paragraph that does not contain keywords.`,
    wordCount: 220,
    seoScore: 85,
    references: [],
    outline: brief.outline,
    validationStatus: 'READY'
  } as any as ContentAsset;

  // Verify review captures all issues
  const review = await (orchestrator as any).runReview(contentAsset, brief);
  console.log('Detected validation issues count:', review.issues.length);

  // Assert that issues contains the expected violations
  console.assert(review.issues.some((i: string) => i.includes('Title is too long')), 'Expected title length warning');
  console.assert(review.issues.some((i: string) => i.includes('Total article word count is 220')), 'Expected total word count exceeds warning');
  console.assert(review.issues.some((i: string) => i.includes('Paragraph 1 is too long')), 'Expected paragraph too long warning');
  console.assert(review.issues.some((i: string) => i.includes('Missing primary keyword')), 'Expected missing primary keyword warning');
  console.assert(review.issues.some((i: string) => i.includes('Missing recommended supporting terms')), 'Expected missing supporting terms warning');
  console.assert(review.issues.some((i: string) => i.includes('Section "Introduction" is too long')), 'Expected section-level budget warning');

  // Verify repair pass executes and addresses the issues
  const repaired = await (orchestrator as any).runRepair(contentAsset, brief, review.issues);
  console.log('Repaired Title:', repaired.title);

  // Re-verify repaired asset (should be clean now)
  const secondReview = await (orchestrator as any).runReview(repaired, brief);
  console.log('Second Review Status (passed):', secondReview.passed);
  console.assert(secondReview.issues.length === 0, `Expected 0 issues after repair, got ${secondReview.issues.length}: ${secondReview.issues.join(', ')}`);

  console.log('✔ Quality validation & repair passed successfully.');
}

async function main() {
  try {
    await testMedianCalculations();
    await testContentGapDetection();
    await testZeroCompetitorsEdgeCase();
    await testHandoffToWriter();
    await testQualityValidationAndRepair();
    console.log('\n=====================================');
    console.log('ALL REGRESSION TESTS PASSED!');
    console.log('=====================================');
  } catch (err: any) {
    console.error('TEST FAIL:', err);
    process.exit(1);
  }
}

main();
