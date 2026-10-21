// scratch/test_phase5c3_sanitization_and_geo_repair.ts
import assert from 'assert';
import { ContentGapService } from '../src/lib/intelligence/ContentGapService';
import { TopicRelevanceValidator } from '../src/lib/intelligence/TopicRelevanceValidator';
import { OutlineNode, ContentBrief, ContentBriefSchema } from '../src/core/contracts/schemas';
import { EvidenceSet } from '../src/core/contracts/evidence';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log(' ACUTE PHASE 5C.3: SANITIZATION INTEGRITY & GEO CLASSIFICATION REPAIR');
console.log(' Focused Regression Suite for Defect Elimination');
console.log(' Deterministic Offline Fixtures Only | Zero Network Calls');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(testName: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Case ${totalTests}: ${testName}`);
    passedTests++;
  } catch (err: any) {
    console.error(`[FAIL] Case ${totalTests}: ${testName}`);
    console.error(`       Error: ${err?.message || err}`);
    failedTests++;
  }
}

const emptyEvidenceSet: EvidenceSet = {
  items: [],
  extractedAt: new Date().toISOString(),
  summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
};

function createTestBrief(data: Parameters<typeof ContentBriefSchema.parse>[0]): ContentBrief {
  return ContentBriefSchema.parse(data);
}

// ============================================================================
// TASK A: ELIMINATE DUPLICATE REPLACEMENT HEADINGS IN SANITIZATION
// ============================================================================

// Case 1: Exactly 1 drifted heading replacement
runTest('Task A.1: Exactly 1 drifted heading replaced with unique topic-grounded section', () => {
  const brief = createTestBrief({
    title: 'How to Improve Mobile Conversion Rates',
    targetKeywords: ['how to improve mobile conversion rates'],
    intent: { primaryKeyword: 'how to improve mobile conversion rates', intentType: 'Commercial', contentType: 'Guide' },
    outline: [
      { heading: 'Diagnosing Mobile Conversion Rate Bottlenecks', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Delivery Model & Developer Retention Matrix', level: 'H2', generate_table: true, assignedKeywords: [], assignedEntities: [] }, // Drift
      { heading: 'Mobile Form Usability & Dynamic Validation', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
    ],
    wordCountBudget: { target: 2000, min: 1600, max: 2400 },
    internalLinks: [],
    competitorInsights: [],
  });

  const report = TopicRelevanceValidator.sanitizeOutlineWithReport(brief, 'how to improve mobile conversion rates');
  assert.strictEqual(report.sanitizationApplied, true);
  assert.strictEqual(report.sanitizedHeadingsCount, 1);
  assert.strictEqual(report.brief.outline.length, 3);
  assert.strictEqual(report.brief.outline[0].heading, 'Diagnosing Mobile Conversion Rate Bottlenecks');
  assert.strictEqual(report.brief.outline[1].heading, 'How to improve mobile conversion rates Evaluation & Comparison Criteria');
  assert.strictEqual(report.brief.outline[1].generate_table, true, 'Table flag preserved');
  assert.strictEqual(report.brief.outline[2].heading, 'Mobile Form Usability & Dynamic Validation');
  assert(ContentBriefSchema.safeParse(report.brief).success, 'Schema valid');
});

// Case 2: Exactly 3 drifted headings replacement
runTest('Task A.2: Exactly 3 drifted headings replaced with 3 distinct unique sections', () => {
  const brief = createTestBrief({
    title: 'How to Improve Mobile Conversion Rates',
    targetKeywords: ['how to improve mobile conversion rates'],
    intent: { primaryKeyword: 'how to improve mobile conversion rates', intentType: 'Commercial', contentType: 'Guide' },
    outline: [
      { heading: 'Delivery Model & Developer Retention Matrix', level: 'H2', generate_table: true, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Enhancing Brand Visibility and AI Search Engine Recognition', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Agency Staffing Models vs Dedicated Engineering Squads', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
    ],
    wordCountBudget: { target: 2000, min: 1600, max: 2400 },
    internalLinks: [],
    competitorInsights: [],
  });

  const report = TopicRelevanceValidator.sanitizeOutlineWithReport(brief, 'how to improve mobile conversion rates');
  assert.strictEqual(report.sanitizedHeadingsCount, 3);
  const headings = report.brief.outline.map(n => n.heading);
  const uniqueHeadings = new Set(headings);
  assert.strictEqual(uniqueHeadings.size, 3, 'All 3 replacement headings must be strictly unique');
});

// Case 3: Exactly 4 drifted headings replacement (Previously duplicated headings 0 and 3)
runTest('Task A.3: Exactly 4 drifted headings replaced with 4 distinct unique sections (No Modulo Duplication)', () => {
  const brief = createTestBrief({
    title: 'How to Improve Mobile Conversion Rates',
    targetKeywords: ['how to improve mobile conversion rates'],
    intent: { primaryKeyword: 'how to improve mobile conversion rates', intentType: 'Commercial', contentType: 'Guide' },
    outline: [
      { heading: 'Delivery Model & Developer Retention Matrix', level: 'H2', generate_table: true, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Enhancing Brand Visibility and AI Search Engine Recognition', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Agency Staffing Models vs Dedicated Engineering Squads', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Developer Burnout and Hourly Contractors', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
    ],
    wordCountBudget: { target: 2000, min: 1600, max: 2400 },
    internalLinks: [],
    competitorInsights: [],
  });

  const report = TopicRelevanceValidator.sanitizeOutlineWithReport(brief, 'how to improve mobile conversion rates');
  assert.strictEqual(report.sanitizedHeadingsCount, 4);
  const headings = report.brief.outline.map(n => n.heading);
  const uniqueHeadings = new Set(headings);
  assert.strictEqual(uniqueHeadings.size, 4, 'All 4 replacement headings must be strictly unique (no modulo repetition)');
  assert.notStrictEqual(headings[0], headings[3], 'Heading 0 and Heading 3 must NOT be identical');
});

// Case 4: More than 4 drifted headings (5 drifted headings)
runTest('Task A.4: 5 drifted headings replaced with 5 distinct unique sections from facet pool', () => {
  const brief = createTestBrief({
    title: 'How to Improve Mobile Conversion Rates',
    targetKeywords: ['how to improve mobile conversion rates'],
    intent: { primaryKeyword: 'how to improve mobile conversion rates', intentType: 'Commercial', contentType: 'Guide' },
    outline: [
      { heading: 'Delivery Model & Developer Retention Matrix', level: 'H2', generate_table: true, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Enhancing Brand Visibility and AI Search Engine Recognition', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Agency Staffing Models vs Dedicated Engineering Squads', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Developer Burnout and Hourly Contractors', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Traditional Agency Retainer Contract Pitfalls', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
    ],
    wordCountBudget: { target: 2000, min: 1600, max: 2400 },
    internalLinks: [],
    competitorInsights: [],
  });

  const report = TopicRelevanceValidator.sanitizeOutlineWithReport(brief, 'how to improve mobile conversion rates');
  assert.strictEqual(report.sanitizedHeadingsCount, 5);
  const headings = report.brief.outline.map(n => n.heading);
  const uniqueHeadings = new Set(headings);
  assert.strictEqual(uniqueHeadings.size, 5, 'All 5 replacement headings must be strictly unique');
});

// Case 5: Collision with heading already present in outline
runTest('Task A.5: Sanitization avoids colliding with headings already present in the outline', () => {
  const brief = createTestBrief({
    title: 'How to Improve Mobile Conversion Rates',
    targetKeywords: ['how to improve mobile conversion rates'],
    intent: { primaryKeyword: 'how to improve mobile conversion rates', intentType: 'Commercial', contentType: 'Guide' },
    outline: [
      // Outline already contains the 3rd template heading:
      { heading: 'Strategic Best Practices and Common Pitfalls to Avoid', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Delivery Model & Developer Retention Matrix', level: 'H2', generate_table: true, assignedKeywords: [], assignedEntities: [] }, // Drift
      { heading: 'Enhancing Brand Visibility and AI Search Engine Recognition', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] }, // Drift
      { heading: 'Agency Staffing Models vs Dedicated Engineering Squads', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] }, // Drift
    ],
    wordCountBudget: { target: 2000, min: 1600, max: 2400 },
    internalLinks: [],
    competitorInsights: [],
  });

  const report = TopicRelevanceValidator.sanitizeOutlineWithReport(brief, 'how to improve mobile conversion rates');
  assert.strictEqual(report.sanitizedHeadingsCount, 3);
  const headings = report.brief.outline.map(n => n.heading);
  const uniqueHeadings = new Set(headings);
  assert.strictEqual(uniqueHeadings.size, 4, 'All 4 outline headings must be unique, skipping the pre-existing heading');
  
  // Verify "Strategic Best Practices and Common Pitfalls to Avoid" appears exactly once
  const occurrences = headings.filter(h => h.toLowerCase() === 'strategic best practices and common pitfalls to avoid').length;
  assert.strictEqual(occurrences, 1, 'Pre-existing heading must not be duplicated by replacement');
});

// ============================================================================
// TASK B: TIGHTEN GEO-DOMAIN CLASSIFICATION
// ============================================================================

// Case 6: Non-SEO technical keywords NOT classified as SEO
runTest('Task B.1: Generic technical words (schema, visibility, ranking) do NOT trigger isSeoDomainTopic', () => {
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('database schema design'), false, 'database schema design is NOT SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('supply chain visibility'), false, 'supply chain visibility is NOT SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('chess ranking algorithms'), false, 'chess ranking algorithms is NOT SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('postgresql index optimization'), false, 'postgresql index optimization is NOT SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('warehouse inventory management'), false, 'warehouse inventory is NOT SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('how to improve mobile conversion rates'), false, 'mobile CRO is NOT SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('crm data hygiene best practices'), false, 'crm hygiene is NOT SEO');
});

// Case 7: Legitimate SEO keywords ARE classified as SEO
runTest('Task B.2: Legitimate search terminology correctly triggers isSeoDomainTopic', () => {
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('schema markup for search results'), true, 'schema markup is SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('generative engine optimization and ai search visibility'), true, 'GEO is SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('how to improve google search rankings'), true, 'search rankings is SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('technical seo and xml sitemaps'), true, 'seo and sitemaps is SEO');
  assert.strictEqual(TopicRelevanceValidator.isSeoDomainTopic('ai search optimization'), true, 'ai search is SEO');
});

// Case 8: ContentGapService does NOT emit reader GEO gaps for database schema or supply chain
runTest('Task B.3: ContentGapService excludes reader GEO gaps on technical non-SEO topics', () => {
  const schemaResult = ContentGapService.buildGapMatrix({
    targetKeyword: 'database schema design',
    competitors: [],
    evidenceSet: emptyEvidenceSet,
    geoIntelligence: {
      geoOpportunities: [
        { issue: 'Low brand visibility in AI responses', recommendedAction: 'Add schema markup for search engines' }
      ]
    }
  });

  const hasGeoGap1 = schemaResult.gaps.some(g => g.id.startsWith('gap_geo_'));
  assert.strictEqual(hasGeoGap1, false, 'database schema design must NOT receive reader-facing GEO gaps');

  const supplyChainResult = ContentGapService.buildGapMatrix({
    targetKeyword: 'supply chain visibility',
    competitors: [],
    evidenceSet: emptyEvidenceSet,
    geoIntelligence: {
      geoOpportunities: [
        { issue: 'Low brand visibility in AI responses', recommendedAction: 'Optimize citation anchors' }
      ]
    }
  });

  const hasGeoGap2 = supplyChainResult.gaps.some(g => g.id.startsWith('gap_geo_'));
  assert.strictEqual(hasGeoGap2, false, 'supply chain visibility must NOT receive reader-facing GEO gaps');
});

// Case 9: ContentGapService DOES emit reader GEO gaps for genuine SEO topics
runTest('Task B.4: ContentGapService DOES emit reader GEO gaps on legitimate SEO topic', () => {
  const seoResult = ContentGapService.buildGapMatrix({
    targetKeyword: 'generative engine optimization and ai search visibility',
    competitors: [],
    evidenceSet: emptyEvidenceSet,
    geoIntelligence: {
      geoOpportunities: [
        { issue: 'Low brand visibility in AI responses', recommendedAction: 'Optimize entity graphs for generative engines' }
      ]
    }
  });

  const geoGap = seoResult.gaps.find(g => g.id.startsWith('gap_geo_'));
  assert(geoGap, 'Legitimate SEO topic must receive GEO content gap');
  assert(geoGap.topic.includes('AI Visibility'), 'GEO gap topic must describe AI Visibility');
});

// ============================================================================
// TASK C: OBSERVABLE RECOVERY AND SANITIZATION TELEMETRY
// ============================================================================

// Case 10: Sanitization telemetry records exact count and sets sanitizationApplied
runTest('Task C.1: sanitizeOutlineWithReport produces observable diagnostic metadata', () => {
  const brief = createTestBrief({
    title: 'Mobile CRO Guide',
    targetKeywords: ['how to improve mobile conversion rates'],
    intent: { primaryKeyword: 'how to improve mobile conversion rates', intentType: 'Commercial', contentType: 'Guide' },
    outline: [
      { heading: 'Diagnosing Mobile Conversion Rate Bottlenecks', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Delivery Model & Developer Retention Matrix', level: 'H2', generate_table: true, assignedKeywords: [], assignedEntities: [] },
    ],
    wordCountBudget: { target: 2000, min: 1600, max: 2400 },
    internalLinks: [],
    competitorInsights: [],
  });

  const report = TopicRelevanceValidator.sanitizeOutlineWithReport(brief, 'how to improve mobile conversion rates');
  assert.strictEqual(report.sanitizationApplied, true);
  assert.strictEqual(report.sanitizedHeadingsCount, 1);
  assert.strictEqual(report.replacedHeadings.length, 1);
  assert.strictEqual(report.replacedHeadings[0].original, 'Delivery Model & Developer Retention Matrix');
  assert(report.replacedHeadings[0].reason.length > 0, 'Reason recorded');
});

// ============================================================================
// TASK D: LEXICAL OVERLAP FALSE POSITIVE ELIMINATION
// ============================================================================

// Case 11: "Mobile Device Physical Hardware Repair Rates" is REJECTED on mobile CRO
runTest('Task D.1: Rejection of physical hardware/repair heading despite matching "mobile" and "rates"', () => {
  const heading = 'Mobile Device Physical Hardware Repair Rates';
  const concept = 'Screen and battery repair pricing.';
  const res = TopicRelevanceValidator.evaluateHeading(
    heading,
    'how to improve mobile conversion rates',
    ['mobile checkout', 'conversion funnel'],
    concept
  );

  assert(res !== null, 'Hardware repair heading must be rejected');
  assert.strictEqual(res.driftVector, 'UNRELATED');
  assert(res.reason.includes('hardware') || res.reason.includes('repair'), `Reason should explain hardware repair drift: "${res.reason}"`);
});

// Case 12: Legitimate mobile CRO headings continue to be APPROVED
runTest('Task D.2: Legitimate Mobile CRO headings pass without false rejections', () => {
  const validHeadings = [
    { h: 'Diagnosing Mobile Conversion Rate Bottlenecks', c: 'Funnel analytics' },
    { h: 'Frictionless 1-Click Mobile Checkout Optimization', c: 'Payment friction' },
    { h: 'Mobile Form Usability & Dynamic Validation', c: 'Form drop-offs' },
    { h: 'Page Speed & Core Web Vitals for Mobile Shoppers', c: 'LCP optimization' },
    { h: 'Mobile Navigation & Micro-Interactions', c: 'Thumb-zone navigation' },
    { h: 'A/B Testing Framework for Mobile Funnel Experimentation', c: 'Hypothesis testing' },
  ];

  for (const item of validHeadings) {
    const res = TopicRelevanceValidator.evaluateHeading(
      item.h,
      'how to improve mobile conversion rates',
      ['mobile checkout', 'conversion funnel', 'page speed'],
      item.c
    );
    assert.strictEqual(res, null, `Valid heading "${item.h}" must be approved`);
  }
});

// Case 13: Legitimate synonymous heading with supporting terms is APPROVED
runTest('Task D.3: Legitimate synonymous heading with supporting terms is approved', () => {
  const heading = 'Optimizing Smartphone Checkout Flow to Boost Completed Transactions';
  const concept = 'Touchscreen payment optimization.';
  const res = TopicRelevanceValidator.evaluateHeading(
    heading,
    'how to improve mobile conversion rates',
    ['smartphone checkout', 'transaction completion'],
    concept
  );

  assert.strictEqual(res, null, 'Synonymous heading with supporting terms must be approved');
});

// ============================================================================
// SUMMARY & EXIT
// ============================================================================

console.log('\n========================================================================');
console.log(` PHASE 5C.3 SUITE EXECUTION SUMMARY: ${passedTests} / ${totalTests} ASSERTIONS VERIFIED`);
console.log('========================================================================\n');

if (failedTests > 0) {
  console.error(`FAILED: ${failedTests} assertions failed.`);
  process.exit(1);
} else {
  console.log('ALL PHASE 5C.3 REGRESSION ASSERTIONS EXECUTED AND PASSED CLEANLY.');
  process.exit(0);
}
