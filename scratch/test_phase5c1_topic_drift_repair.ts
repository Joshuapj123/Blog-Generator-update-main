// scratch/test_phase5c1_topic_drift_repair.ts
import assert from 'assert';
import { ContentGapService } from '../src/lib/intelligence/ContentGapService';
import { TopicRelevanceValidator } from '../src/lib/intelligence/TopicRelevanceValidator';
import { OutlineNode, ContentBrief, ContentBriefSchema } from '../src/core/contracts/schemas';
import { EvidenceSet } from '../src/core/contracts/evidence';
import fs from 'fs';
import path from 'path';

console.log('=== PHASE 5C.1: TARGETED TOPIC-DRIFT REPAIR REGRESSION TEST SUITE ===\n');

let passedCases = 0;
let totalCases = 0;

function runTest(testName: string, fn: () => void) {
  totalCases++;
  try {
    fn();
    console.log(`[PASS] Case ${totalCases}: ${testName}`);
    passedCases++;
  } catch (err: any) {
    console.error(`[FAIL] Case ${totalCases}: ${testName}`);
    console.error(`       Error: ${err?.message || err}`);
  }
}

const emptyEvidenceSet: EvidenceSet = {
  items: [],
  extractedAt: new Date().toISOString(),
  summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
};

// CASE 1: ContentGapService on non-HR topic produces gaps relevant to that topic, NOT developer retention
runTest('ContentGapService on non-HR topic produces topic-grounded gaps without developer retention', () => {
  const result = ContentGapService.buildGapMatrix({
    targetKeyword: 'mobile conversion rates',
    saasProfile: {
      name: 'UXOptimizer',
      description: 'Mobile UX optimization platform',
      targetAudience: 'Product teams',
      keyFeatures: ['Frictionless 1-Click Mobile Checkout', 'Dynamic Screen Form Validation'],
      primaryCompetitors: [],
      tone: 'professional',
      customInsights: '',
    },
    competitors: [
      {
        url: 'https://competitor.com',
        title: 'Competitor Mobile CRO Guide',
        headings: ['Why Mobile CRO Matters'],
        hasTables: false,
      }
    ],
    evidenceSet: {
      items: [
        {
          id: 'ev_1',
          claim: '1-click checkout improves mobile conversion rate by 28%.',
          sourceUrl: 'https://uxoptimizer.com/benchmarks',
          sourceType: 'TARGET_SITE',
          evidenceType: 'BUSINESS_FACT',
          confidence: 'HIGH',
          citationRequired: false,
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    }
  });

  assert(result.gaps.length > 0, 'Gaps should be generated');
  
  // Verify no gap contains developer retention or agency outsourcing
  for (const gap of result.gaps) {
    assert(!/developer retention/i.test(gap.topic), `Gap topic should not mention developer retention: "${gap.topic}"`);
    assert(!/agency retainer/i.test(gap.topic), `Gap topic should not mention agency retainers: "${gap.topic}"`);
    assert(!/outsourcing/i.test(gap.topic), `Gap topic should not mention outsourcing: "${gap.topic}"`);
  }

  // Verify table gap is topic grounded
  const tableGap = result.gaps.find(g => g.recommendedTreatment === 'TABLE');
  assert(tableGap, 'Should include a comparison table gap');
  assert(tableGap.topic.includes('Mobile conversion rates') || tableGap.topic.includes('Mobile Conversion Rates'), 
    `Table gap should be grounded in target keyword, got: "${tableGap.topic}"`);
});

// CASE 2: ContentGapService when geoOpportunities has internal AI recommendations does NOT map them into content gaps for a non-SEO topic
runTest('ContentGapService excludes internal AI/GEO recommendations from reader content gaps on non-SEO topic', () => {
  const result = ContentGapService.buildGapMatrix({
    targetKeyword: 'mobile conversion rates',
    competitors: [],
    evidenceSet: emptyEvidenceSet,
    geoIntelligence: {
      overallScore: 35,
      brandMentionsCount: 0,
      totalQueriesAnalyzed: 5,
      geoOpportunities: [
        {
          issue: 'Low brand visibility in AI responses',
          recommendedAction: 'Optimize schema and entity associations for Perplexity and Gemini indexing',
          potentialImpact: 'HIGH',
        }
      ]
    }
  });

  // Verify no gap includes AI visibility or Perplexity recommendations
  for (const gap of result.gaps) {
    assert(!/ai visibility/i.test(gap.topic), `Gap topic should not leak GEO AI visibility: "${gap.topic}"`);
    assert(!/perplexity/i.test(gap.buyerQuestion || ''), `Gap buyer question should not leak Perplexity indexing: "${gap.buyerQuestion}"`);
  }
});

// CASE 3: ContentGapService on an actual SEO/GEO topic DOES permit relevant GEO content gaps
runTest('ContentGapService on legitimate SEO topic permits GEO visibility content gaps', () => {
  const result = ContentGapService.buildGapMatrix({
    targetKeyword: 'ai search optimization',
    competitors: [],
    evidenceSet: emptyEvidenceSet,
    geoIntelligence: {
      overallScore: 35,
      brandMentionsCount: 0,
      totalQueriesAnalyzed: 5,
      geoOpportunities: [
        {
          issue: 'Low citation frequency in answer engines',
          recommendedAction: 'Structure brand entities and citation anchors for generative engines',
          potentialImpact: 'HIGH',
        }
      ]
    }
  });

  const geoGap = result.gaps.find(g => g.id.startsWith('gap_geo_'));
  assert(geoGap, 'Should include GEO gap for legitimate AI search / SEO topic');
  assert(geoGap.topic.includes('AI Visibility'), `GEO gap should mention AI Visibility: "${geoGap.topic}"`);
});

// CASE 4: AgentOrchestrator PLAN prompt does NOT contain MUST COVER IN OUTLINE and instructs discarding off-topic gaps
runTest('AgentOrchestrator code does not contain "MUST COVER IN OUTLINE" imperative and grants editorial authority', () => {
  const orchestratorCode = fs.readFileSync(
    path.join(__dirname, '../src/core/orchestrator/AgentOrchestrator.ts'),
    'utf-8'
  );

  assert(!orchestratorCode.includes('MUST COVER IN OUTLINE'), 'Orchestrator code must NOT contain "MUST COVER IN OUTLINE"');
  assert(orchestratorCode.includes('=== CANDIDATE CONTENT GAPS (EDITORIAL EVALUATION REQUIRED) ==='), 'Orchestrator should include editorial gap evaluation banner');
  assert(orchestratorCode.includes('REJECT or ADAPT any gap'), 'Orchestrator should instruct rejecting or adapting off-topic gaps');
});

// CASE 5: AgentOrchestrator PLAN prompt separates internal GEO advice from outline headings for non-SEO topics
runTest('AgentOrchestrator code frames GEO context as internal publishing guidance for non-SEO topics', () => {
  const orchestratorCode = fs.readFileSync(
    path.join(__dirname, '../src/core/orchestrator/AgentOrchestrator.ts'),
    'utf-8'
  );

  assert(orchestratorCode.includes('TopicRelevanceValidator.isSeoDomainTopic(discovery.targetKeyword)'), 'Orchestrator must gate GEO prompt text on target keyword SEO domain');
  assert(orchestratorCode.includes('=== INTERNAL PUBLISHING GUIDANCE (DO NOT USE AS READER-FACING OUTLINE HEADINGS) ==='), 'Orchestrator must label GEO as internal guidance for non-SEO topics');
});

// CASE 6: TopicRelevanceValidator rejects a candidate outline containing "Delivery Model & Developer Retention Matrix" when topic is "mobile conversion rates"
runTest('TopicRelevanceValidator rejects "Delivery Model & Developer Retention Matrix" on mobile CRO topic', () => {
  const mockOutline: OutlineNode[] = [
    {
      level: 'H2',
      heading: 'Understanding Mobile Conversion Rates & Funnel Friction',
      core_concept: 'Analysis of mobile friction points.',
      assignedKeywords: ['mobile conversion rates'],
      assignedEntities: ['checkout funnel'],
      generate_table: false,
    },
    {
      level: 'H2',
      heading: 'Delivery Model & Developer Retention Matrix',
      core_concept: 'Comparing dedicated engineering teams against traditional agency retainers to maintain velocity.',
      assignedKeywords: ['developer retention'],
      assignedEntities: ['agency retainer'],
      generate_table: true,
    }
  ];

  const validation = TopicRelevanceValidator.validateOutline(
    mockOutline,
    'how to improve mobile conversion rates',
    ['mobile checkout', 'conversion funnel', 'page speed']
  );

  assert.strictEqual(validation.isValid, false, 'Validation should fail on developer retention drift');
  assert.strictEqual(validation.driftedHeadings.length, 1, 'Should identify exactly 1 drifted heading');
  assert.strictEqual(validation.driftedHeadings[0].driftVector, 'STAFFING_HR', 'Drift vector should be STAFFING_HR');
});

// CASE 7: TopicRelevanceValidator rejects candidate outline containing AI search visibility when topic is "mobile conversion rates"
runTest('TopicRelevanceValidator rejects AI search / Perplexity visibility heading on mobile CRO topic', () => {
  const mockOutline: OutlineNode[] = [
    {
      level: 'H2',
      heading: 'Enhancing Brand Visibility and AI Search Engine Recognition',
      core_concept: 'Technical schema markup and knowledge graph connections to ensure visibility in AI answers.',
      assignedKeywords: ['ai search visibility'],
      assignedEntities: ['schema markup'],
      generate_table: false,
    }
  ];

  const validation = TopicRelevanceValidator.validateOutline(
    mockOutline,
    'how to improve mobile conversion rates',
    ['mobile checkout', 'conversion funnel']
  );

  assert.strictEqual(validation.isValid, false, 'Validation should fail on meta-SEO / AI search drift');
  assert.strictEqual(validation.driftedHeadings.length, 1, 'Should identify 1 drifted heading');
  assert.strictEqual(validation.driftedHeadings[0].driftVector, 'META_SEO', 'Drift vector should be META_SEO');
});

// CASE 8: TopicRelevanceValidator ACCEPTS developer retention sections when topic is genuinely about hiring/retaining engineers
runTest('TopicRelevanceValidator ACCEPTS developer retention sections when topic is hiring or engineering workforce', () => {
  const mockOutline: OutlineNode[] = [
    {
      level: 'H2',
      heading: 'Root Causes of Senior Developer Turnover in Modern Tech Organizations',
      core_concept: 'Burnout, compensation, and workflow friction leading to developer turnover.',
      assignedKeywords: ['developer retention'],
      assignedEntities: ['engineering turnover'],
      generate_table: false,
    },
    {
      level: 'H2',
      heading: 'Delivery Model & Developer Retention Matrix',
      core_concept: 'Comparing in-house engineering squads versus agency staffing on long-term retention metrics.',
      assignedKeywords: ['developer retention', 'staffing models'],
      assignedEntities: ['retention metrics'],
      generate_table: true,
    }
  ];

  const validation = TopicRelevanceValidator.validateOutline(
    mockOutline,
    'developer retention strategies for engineering leaders',
    ['engineering turnover', 'tech hiring', 'employee retention']
  );

  assert.strictEqual(validation.isValid, true, 'Validation should accept developer retention sections for HR/staffing topic');
  assert.strictEqual(validation.driftedHeadings.length, 0, 'Zero headings should be rejected');
});

// CASE 9: TopicRelevanceValidator ACCEPTS AI search visibility sections when topic is genuinely about AI search or SEO
runTest('TopicRelevanceValidator ACCEPTS AI search visibility sections when topic is SEO / AI search optimization', () => {
  const mockOutline: OutlineNode[] = [
    {
      level: 'H2',
      heading: 'How Generative Engines and Answer Engines Crawl Knowledge Graphs',
      core_concept: 'Citations in Perplexity, Gemini, and SearchGPT.',
      assignedKeywords: ['ai search optimization'],
      assignedEntities: ['generative engines'],
      generate_table: false,
    },
    {
      level: 'H2',
      heading: 'Enhancing Brand Visibility and AI Search Engine Recognition',
      core_concept: 'Technical schema markup to maximize inclusion in AI summaries.',
      assignedKeywords: ['ai search recognition'],
      assignedEntities: ['schema markup'],
      generate_table: false,
    }
  ];

  const validation = TopicRelevanceValidator.validateOutline(
    mockOutline,
    'generative engine optimization and ai search visibility',
    ['ai search', 'perpleixty citations', 'schema markup']
  );

  assert.strictEqual(validation.isValid, true, 'Validation should accept AI search visibility sections for SEO topic');
  assert.strictEqual(validation.driftedHeadings.length, 0, 'Zero headings should be rejected');
});

// CASE 10: End-to-end PLAN outline sanitization produces 100% topic-relevant outline with ZERO drift headings
runTest('TopicRelevanceValidator.sanitizeOutline sanitizes drifted headings into 100% topic-grounded sections', () => {
  const driftedBrief: ContentBrief = ContentBriefSchema.parse({
    title: 'How to Improve Mobile Conversion Rates: A Strategic UX Guide',
    targetKeywords: ['how to improve mobile conversion rates'],
    intent: {
      primaryKeyword: 'how to improve mobile conversion rates',
      intentType: 'Commercial',
      contentType: 'Guide',
    },
    outline: [
      {
        level: 'H2',
        heading: 'Diagnosing Mobile Conversion Rate Bottlenecks',
        core_concept: 'Identifying checkout drop-offs.',
        assignedKeywords: ['mobile conversion rates'],
        assignedEntities: ['checkout funnel'],
        generate_table: false,
      },
      {
        level: 'H2',
        heading: 'Delivery Model & Developer Retention Matrix',
        core_concept: 'Dedicated teams vs traditional agency retainers.',
        assignedKeywords: ['developer retention'],
        assignedEntities: ['agency retainers'],
        generate_table: true,
      },
      {
        level: 'H2',
        heading: 'Enhancing Brand Visibility and AI Search Engine Recognition',
        core_concept: 'Getting AI models to cite mobile conversion data.',
        assignedKeywords: ['ai search visibility'],
        assignedEntities: ['schema markup'],
        generate_table: false,
      },
      {
        level: 'H2',
        heading: 'Practical Mobile UX Implementation Checklist',
        core_concept: 'Checklist for mobile UX execution.',
        assignedKeywords: ['mobile UX'],
        assignedEntities: ['checkout design'],
        generate_table: false,
      }
    ],
    wordCountBudget: {
      target: 2000,
      min: 1600,
      max: 2400,
    },
    internalLinks: [],
    competitorInsights: [],
  });

  const sanitized = TopicRelevanceValidator.sanitizeOutline(
    driftedBrief,
    'how to improve mobile conversion rates',
    ['mobile checkout', 'conversion funnel', 'page speed']
  );

  // Validate the sanitized outline
  const postValidation = TopicRelevanceValidator.validateOutline(
    sanitized.outline,
    'how to improve mobile conversion rates',
    ['mobile checkout', 'conversion funnel', 'page speed']
  );

  assert.strictEqual(postValidation.isValid, true, 'Sanitized outline must be 100% valid');
  assert.strictEqual(postValidation.driftedHeadings.length, 0, 'Sanitized outline must have zero drifted headings');

  // Verify headings no longer contain developer retention or AI search
  for (const node of sanitized.outline) {
    assert(!/developer retention/i.test(node.heading), `Heading must not contain developer retention: "${node.heading}"`);
    assert(!/ai search engine/i.test(node.heading), `Heading must not contain ai search engine: "${node.heading}"`);
    assert(!/agency retainer/i.test(node.heading), `Heading must not contain agency retainer: "${node.heading}"`);
  }

  // Verify Section 1 still preserved table intent
  assert.strictEqual(sanitized.outline[1].generate_table, true, 'Table generation flag must be preserved on replaced comparison section');
  console.log('       Sanitized Section 1:', sanitized.outline[1].heading);
  console.log('       Sanitized Section 2:', sanitized.outline[2].heading);
});

console.log(`\n=== TEST SUITE RESULT: ${passedCases} / ${totalCases} PASSED ===`);
if (passedCases === totalCases) {
  console.log('All 10 Phase 5C.1 regression test assertions PASSED.');
  process.exit(0);
} else {
  console.error(`FAILURE: Only ${passedCases} / ${totalCases} passed.`);
  process.exit(1);
}
