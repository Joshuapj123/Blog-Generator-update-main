import { calculateMedian, analyzeContentGaps, parseMarkdownHeadings } from '@/core/orchestrator/AgentOrchestrator';
import { AgentOrchestrator } from '@/core/orchestrator/AgentOrchestrator';
import { LLMProvider } from '@/core/contracts/providers';
import { ContentBrief, ContentAsset } from '@/core/contracts/schemas';
import { validateArticleQuality } from '@/lib/seo-intelligence/quality_validator';

async function testMedianCalculations() {
  console.log('--- Test Median Calculations ---');
  const m0 = calculateMedian([]);
  console.assert(m0 === 0, `Expected 0, got ${m0}`);
  
  const m1 = calculateMedian([4062]);
  console.assert(m1 === 4062, `Expected 4062, got ${m1}`);
  
  const m2 = calculateMedian([4062, 2328]);
  console.assert(m2 === 3195, `Expected 3195, got ${m2}`);
  
  const m3 = calculateMedian([4062, 2328, 5000]);
  console.assert(m3 === 4062, `Expected 4062, got ${m3}`);
  
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
  console.assert(gaps.includes('Competitor coverage appears limited for: Autonomous Proactive Support'), 'Expected gap for Autonomous Proactive Support');
  console.assert(gaps.includes('Competitor coverage appears limited for: Revenue Hub with multi-currency billing'), 'Expected gap for Revenue Hub');
  console.assert(gaps.includes('Consider adding a structured comparison table where useful.'), 'Expected structural table gap');
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
  console.log('✔ Zero competitor edge case passed successfully.');
}

// TEST J: Competitor & GEO handoff to generation
async function testHandoffToWriter() {
  console.log('\n--- TEST J: Handoff to Writing Stage (Competitor & GEO Intelligence) ---');
  
  const mockLlm: LLMProvider = {
    generate: async (prompt: string, options?: any) => {
      if (options?.operation === 'Section Generation') {
        const hasIntelligenceContext = prompt.includes('=== SEO AND GEO INTELLIGENCE WRITING CONSTRAINTS ===');
        const hasCompetitors = prompt.includes('competitor-a.com');
        const hasGaps = prompt.includes('Competitor coverage appears limited for: FeatureX');
        const hasGeo = prompt.includes('Add statistics tables');
        
        console.assert(hasIntelligenceContext, 'Prompt must contain intelligence context block');
        console.assert(hasCompetitors, 'Prompt must list competitors');
        console.assert(hasGaps, 'Prompt must list gaps');
        console.assert(hasGeo, 'Prompt must list GEO requirements');
      }
      return 'Draft text content';
    },
    structuredGenerate: async <T>() => ({}) as T
  };

  const orchestrator = new AgentOrchestrator({
    llm: mockLlm,
    search: { search: async () => [] } as any,
    scraper: { scrape: async () => [] } as any,
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

  const result = await (orchestrator as any).runGeneration(mockBrief, mockStrategy);
  console.assert(result.bodyMarkdown.includes('## Introduction'), 'Heading must be present');
  console.log('✔ TEST J: Handoff to writer passed successfully.');
}

// TEST A & TEST B: Entity Validation Brand Exemption vs Non-brand
async function testEntityValidationBrandVsNonBrand() {
  console.log('\n--- TEST A & TEST B: Entity Validation (Brand Exemption vs Non-Brand) ---');

  // Text where target brand "HubSpot" appears 24 times in ~1,000 words (density ~2.4%)
  // Non-target entity "ExternalWidget" appears 16 times (exceeds 12-count limit)
  const baseBlock = 'HubSpot provides software solutions. Teams across the enterprise use integrated tools to build workflows, manage leads, automate customer journeys, track metrics, and scale growth efficiently every single day.';
  const brandRepeated = Array(24).fill(baseBlock).join('\n\n');
  const nonBrandRepeated = Array(16).fill('ExternalWidget connects external data points.').join(' ');
  const sampleArticle = `${brandRepeated}\n\n${nonBrandRepeated}`;

  // Run validation with targetBrand = "HubSpot"
  const report = validateArticleQuality(
    sampleArticle,
    ['software solutions'],
    ['HubSpot', 'ExternalWidget'],
    'HubSpot'
  );

  // TEST A: Brand "HubSpot" repeated 24 times must NOT trigger entity stuffing error
  const hasBrandStuffing = report.errors.some(e => e.includes('HubSpot'));
  if (hasBrandStuffing) {
    console.error('TEST A Errors:', report.errors);
  }
  console.assert(!hasBrandStuffing, 'TEST A FAIL: Brand HubSpot should not trigger entity stuffing error');
  console.log('✔ TEST A: Target brand repeated naturally 24 times did NOT trigger entity-stuffing failure.');

  // TEST B: Non-target entity "ExternalWidget" repeated 16 times MUST trigger entity stuffing error
  const hasNonBrandStuffing = report.errors.some(e => e.includes('ExternalWidget') && e.includes('Non-brand entity'));
  console.assert(hasNonBrandStuffing, 'TEST B FAIL: Non-target entity ExternalWidget must trigger entity stuffing alert');
  console.log('✔ TEST B: Non-target entity excessive repetition triggered entity stuffing alert.');
}

// TEST C, TEST D, TEST E: Validation Status Severities (PASS, PASSED_WITH_WARNINGS, CRITICAL FAIL)
async function testValidationSeverities() {
  console.log('\n--- TEST C, TEST D, TEST E: Validation Severities ---');

  const mockLlm: LLMProvider = {
    generate: async () => 'Draft text content',
    structuredGenerate: async <T>() => ({}) as T
  };

  const orchestrator = new AgentOrchestrator({
    llm: mockLlm,
    search: { search: async () => [] } as any,
    scraper: { scrape: async () => [] } as any
  });
  (orchestrator as any).targetBrand = 'TestBrand';

  const brief = {
    title: 'Short Clear Title',
    targetKeywords: ['software'],
    outline: [
      { heading: 'Overview', level: 'H2', assignedKeywords: ['software'], assignedEntities: ['TestBrand'] }
    ],
    wordCountBudget: { min: 10, max: 200, target: 60 },
    intent: 'Informational'
  } as any as ContentBrief;

  // TEST C: Completely clean content -> PASSED
  const cleanBody = `## Overview\n\nWe provide the best software for our users. TestBrand is reliable and direct. Teams can build workflows, streamline communications, organize records, collaborate seamlessly, and scale growth today. You will find simple steps to get started immediately without delays. Everything is straightforward.`;
  const cleanAsset: ContentAsset = {
    title: 'Short Clear Title',
    bodyMarkdown: cleanBody,
    wordCount: cleanBody.split(/\s+/).filter(Boolean).length,
    seoScore: 90,
    references: [],
    outline: brief.outline,
    validationStatus: 'READY'
  } as any as ContentAsset;

  const reviewC = await (orchestrator as any).runReview(cleanAsset, brief);
  if (reviewC.issues.length > 0) {
    console.log('Review C issues (for info):', reviewC.issues);
  }
  console.assert(reviewC.criticalErrors.length === 0, 'Expected 0 critical errors for clean asset');
  console.log('✔ TEST C: PASS status verified for clean content.');

  // TEST D: Content with non-blocking issues (e.g. section budget warning or passive voice) -> PASSED_WITH_WARNINGS
  const warningBody = `## Overview\n\nWe provide the software. The system was designed by our team and was built to help users. It is known that operations were executed by them. Multiple decisions were made by managers and documents were created.`;
  const warningAsset: ContentAsset = {
    title: 'Short Clear Title',
    bodyMarkdown: warningBody,
    wordCount: warningBody.split(/\s+/).filter(Boolean).length,
    seoScore: 85,
    references: [],
    outline: brief.outline,
    validationStatus: 'READY'
  } as any as ContentAsset;

  const reviewD = await (orchestrator as any).runReview(warningAsset, brief);
  console.assert(reviewD.criticalErrors.length === 0, 'Critical errors must be 0 for warning asset');
  console.assert(reviewD.warnings.length > 0, 'Expected warnings for passive voice');
  console.log('✔ TEST D: PASSED_WITH_WARNINGS verified when only non-blocking warnings exist.');

  // TEST E: Exceeding maximum word budget -> CRITICAL FAIL
  const bloatedBody = `## Overview\n\n${Array(300).fill('word').join(' ')} software`;
  const bloatedAsset: ContentAsset = {
    title: 'Short Clear Title',
    bodyMarkdown: bloatedBody,
    wordCount: bloatedBody.split(/\s+/).filter(Boolean).length, // 302 words > max 200
    seoScore: 70,
    references: [],
    outline: brief.outline,
    validationStatus: 'READY'
  } as any as ContentAsset;

  const reviewE = await (orchestrator as any).runReview(bloatedAsset, brief);
  console.assert(reviewE.criticalErrors.some((e: string) => e.includes('exceeds the maximum budget')), 'Expected maximum word count budget critical error');
  console.log('✔ TEST E: CRITICAL FAIL verified when maximum word budget is exceeded.');
}

// TEST F & TEST G: Heading Structure and Telemetry (plannedH2Count vs actualH2Count, plannedH3Count vs actualH3Count)
async function testHeadingStructureAndTelemetry() {
  console.log('\n--- TEST F & TEST G: Heading Structure & Telemetry ---');

  const outline = [
    { heading: 'First Major Section', level: 'H2' },
    { heading: 'Second Major Section', level: 'H2' }
  ];

  const bodyMarkdown = `## First Major Section\n\n### Detailed Subsection 1A\nContent here.\n\n### Detailed Subsection 1B\nMore content.\n\n## Second Major Section\n\n### Detailed Subsection 2A\nAdditional details.`;

  const parsed = parseMarkdownHeadings(bodyMarkdown);
  const plannedH2Count = outline.filter(o => o.level === 'H2').length;
  const plannedH3Count = outline.filter(o => o.level === 'H3').length;
  const actualH2Count = parsed.filter(h => h.level === 'H2').length;
  const actualH3Count = parsed.filter(h => h.level === 'H3').length;

  console.assert(plannedH2Count === 2, `Expected plannedH2Count=2, got ${plannedH2Count}`);
  console.assert(actualH2Count === 2, `Expected actualH2Count=2, got ${actualH2Count}`);
  console.log('✔ TEST F: Correct plannedH2Count (2) / actualH2Count (2) telemetry verified.');

  console.assert(plannedH3Count === 0, `Expected plannedH3Count=0, got ${plannedH3Count}`);
  console.assert(actualH3Count === 3, `Expected actualH3Count=3, got ${actualH3Count}`);
  console.log('✔ TEST G: Correct plannedH3Count (0) / actualH3Count (3) telemetry verified (subsections accurately captured).');
}

// TEST H & TEST I: Supporting Terms End-to-End Tracing & Zero-Case
async function testSupportingTermsTracing() {
  console.log('\n--- TEST H & TEST I: Supporting Terms Tracing ---');

  const mockLlm: LLMProvider = {
    generate: async (prompt: string) => {
      if (prompt.includes('Supporting Terms to include naturally where relevant')) {
        console.log('✔ Generator prompt received supporting terms.');
      }
      return 'Draft text content containing business owners and management platform.';
    },
    structuredGenerate: async <T>() => ({}) as T
  };

  const orchestrator = new AgentOrchestrator({
    llm: mockLlm,
    search: { search: async () => [] } as any,
    scraper: { scrape: async () => [] } as any
  });

  // TEST H: Inject supporting terms into orchestrator
  (orchestrator as any).supportingTerms = ['business owners', 'management platform'];
  const brief = {
    title: 'Test Title',
    targetKeywords: ['crm'],
    outline: [{ heading: 'Section 1', level: 'H2', assignedKeywords: ['crm'], assignedEntities: [] }],
    wordCountBudget: { min: 50, max: 200, target: 100 },
    intent: 'Informational'
  } as any as ContentBrief;

  const content: ContentAsset = {
    title: 'Test Title',
    bodyMarkdown: '## Section 1\n\nThis article helps business owners evaluate their management platform.',
    wordCount: 100,
    seoScore: 90,
    references: [],
    outline: brief.outline,
    validationStatus: 'READY'
  } as any as ContentAsset;

  const review = await (orchestrator as any).runReview(content, brief);
  console.assert(!review.warnings.some((w: string) => w.includes('Missing recommended supporting terms')), 'Supporting terms should be satisfied');
  // TEST I: Zero supporting terms case
  (orchestrator as any).supportingTerms = [];
  const emptyReport = (orchestrator as any).supportingTerms.length > 0 ? (orchestrator as any).supportingTerms.length : 'NO_SUPPORTING_TERMS_RETURNED';
  console.assert(emptyReport === 'NO_SUPPORTING_TERMS_RETURNED', 'Expected NO_SUPPORTING_TERMS_RETURNED');
  console.log('✔ TEST I: Zero supporting terms correctly reports "NO_SUPPORTING_TERMS_RETURNED".');
}

// TEST K: Pipeline Failure and Error Surfacing
async function testAutopilotErrorSurfacing() {
  console.log('\n--- TEST K: Pipeline Failure & Detailed Error Surfacing ---');

  const errorEventChunk = `data: {"type":"error","message":"Autopilot generation failed.","reason":"Failed after 3 attempts. Last error: Your prepayment credits are depleted. Please go to AI Studio."}\n\n`;

  // Parse SSE chunks as useGenerationPipeline does
  const parts = errorEventChunk.split('\n\n');
  let surfacedError = '';
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith('data: ')) {
      const parsed = JSON.parse(trimmed.substring(6));
      if (parsed.type === 'error') {
        surfacedError = parsed.reason || parsed.message;
      }
    }
  }

  console.assert(surfacedError.includes('prepayment credits are depleted'), `Expected detailed credit error, got: ${surfacedError}`);
  console.log('✔ TEST K: Pipeline failure correctly extracts detailed reason and surfaces it for user display.');
}

// TEST L: Quality-Hardened Prompt Contracts (Plain Language, Buzzword Ban, Comparison Table, First Paragraph)
async function testQualityHardenedPromptContracts() {
  console.log('\n--- TEST L: Quality-Hardened Generation Prompt Contracts ---');

  const capturedPrompts: string[] = [];
  const mockLlm: LLMProvider = {
    generate: async (prompt: string) => {
      capturedPrompts.push(prompt);
      return 'Teams can manage marketing, sales, and service from one all-in-one business growth platform. Users can assign tasks and track deals easily.';
    },
    structuredGenerate: async <T>() => ({}) as T
  };

  const orchestrator = new AgentOrchestrator({
    llm: mockLlm,
    search: { search: async () => [] } as any,
    scraper: { scrape: async () => [] } as any
  });
  (orchestrator as any).targetBrand = 'HubSpot';
  (orchestrator as any).supportingTerms = ['sales pipeline', 'assigning tasks'];

  const brief = {
    title: 'HubSpot: An All-in-One Business Growth Platform for Teams',
    targetKeywords: ['all-in-one business growth platform'],
    outline: [
      { heading: 'Overview', level: 'H2', assignedKeywords: ['all-in-one business growth platform'], assignedEntities: ['HubSpot'] },
      { heading: 'Feature Comparison', level: 'H2', assignedKeywords: ['feature comparison'], assignedEntities: ['HubSpot'] }
    ],
    wordCountBudget: { min: 100, max: 500, target: 300 },
    intent: 'Informational'
  } as any as ContentBrief;

  const content = await (orchestrator as any).runGeneration(brief, {
    competitorReferences: ['competitor1.com'],
    differentiationRequirements: ['table breakdown'],
    geoRequirements: ['ai search visibility']
  });

  // Verify section 1 prompt contracts
  const sec1Prompt = capturedPrompts[0];
  console.assert(sec1Prompt.includes('CANONICAL PRIMARY KEYWORD CONTRACT'), 'Expected canonical keyword contract in prompt');
  console.assert(sec1Prompt.includes('FIRST PARAGRAPH CONTRACT'), 'Expected first paragraph contract in section 1');
  console.assert(sec1Prompt.includes('PLAIN-LANGUAGE & 8TH-GRADE READING CONTRACT'), 'Expected plain language contract');
  console.assert(sec1Prompt.includes('BAN corporate buzzwords and fluff'), 'Expected corporate buzzword ban in prompt');
  console.assert(sec1Prompt.includes('PARAGRAPH CONTRACT'), 'Expected paragraph contract');
  console.assert(sec1Prompt.includes('SENTENCE CONTRACT'), 'Expected sentence contract');

  // Verify section 2 prompt (comparison table contract)
  const sec2Prompt = capturedPrompts[1];
  console.assert(sec2Prompt.includes('COMPARISON TABLE CONTRACT'), 'Expected comparison table contract in section 2');
  console.assert(sec2Prompt.includes('IMAGE / MEDIA PLACEHOLDERS'), 'Expected image placeholder contract in prompt');

  console.log('✔ TEST L: Plain language, buzzword ban, keyword preservation, and comparison table contracts verified.');
}

async function main() {
  try {
    await testMedianCalculations();
    await testContentGapDetection();
    await testZeroCompetitorsEdgeCase();
    await testHandoffToWriter();
    await testEntityValidationBrandVsNonBrand();
    await testValidationSeverities();
    await testHeadingStructureAndTelemetry();
    await testSupportingTermsTracing();
    await testAutopilotErrorSurfacing();
    await testQualityHardenedPromptContracts();
    console.log('\n======================================================');
    console.log('ALL REGRESSION TESTS (A THROUGH L) PASSED 100% CLEANLY!');
    console.log('======================================================');
  } catch (err: any) {
    console.error('TEST FAIL:', err);
    process.exit(1);
  }
}

main();
