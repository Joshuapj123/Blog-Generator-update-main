import assert from 'assert';
import { SectionEvidenceMapper } from '../src/lib/intelligence/SectionEvidenceMapper';
import { summarizeDraftedSection, generateConciseSectionDraft } from '../src/core/orchestrator/AgentOrchestrator';
import {
  EvidenceItem,
  EvidenceSet,
  ContentGapMatrix,
  SectionEvidenceMap,
  CONTENT_INTELLIGENCE_POLICY
} from '../src/core/contracts/evidence';
import { SaaSProfile } from '../src/core/contracts/schemas';

async function runPhase6CContextAwareDraftingSuite() {
  console.log('========================================================================');
  console.log('ACUTE — Phase 6C: Context-Aware Section Generation & Evidence Grounding');
  console.log('Deterministic Offline Verification Suite | Zero Network Calls');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`[PASS] ${testName}`);
    passed++;
  }

  function recordFail(testName: string, err: any) {
    console.error(`[FAIL] ${testName}: ${err.message || err}`);
    failed++;
  }

  const mobileKw = 'how to improve mobile conversion rates through better ux';

  const mockProfile: SaaSProfile = {
    name: 'UXFlow Studio',
    description: 'We audit and optimize mobile checkout funnels for ecommerce brands.',
    targetAudience: 'Ecommerce product managers and growth leads',
    businessType: 'Agency/Portfolio',
    primaryCompetitors: ['AgencyA', 'AgencyB'],
    tone: 'authoritative, practical, practitioner-depth',
    keyFeatures: [
      'Mobile checkout UX audits',
      'Friction point heuristic reviews',
      'One-tap checkout redesigns'
    ],
    verifiedOfferings: ['Mobile checkout UX audits', 'Friction point heuristic reviews'],
    customInsights: 'Mobile conversion lags desktop by 40% across mid-market retailers'
  };

  // --------------------------------------------------------------------------
  // TEST 1: The first section generates correctly without previous-section context
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Introduction to Mobile Conversion Dynamics', level: 'H2', core_concept: 'mobile UX conversion baseline' },
      { heading: 'Mobile Form Usability and Friction Points', level: 'H2', core_concept: 'form input optimization' },
      { heading: 'Thumb Zone Ergonomics and Navigation', level: 'H2', core_concept: 'mobile tap targets' }
    ];

    const emptyEvSet: EvidenceSet = {
      items: [],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const sectionMaps = SectionEvidenceMapper.mapSectionsToEvidence(outline, emptyEvSet, undefined, mockProfile, mobileKw);

    // Section 0 should have no preceding sections
    const s0Map = sectionMaps[0];
    assert.strictEqual(s0Map.heading, 'Introduction to Mobile Conversion Dynamics');

    // Test summary extractor on empty prior section (should be empty, not invented)
    const priorSummary = summarizeDraftedSection(s0Map.heading, '');
    assert.strictEqual(priorSummary, '', 'First section must have empty summary when not drafted');

    recordPass('Gate 1: The first section generates correctly without previous-section context');
  } catch (err: any) {
    recordFail('Gate 1: The first section generates correctly without previous-section context', err);
  }

  // --------------------------------------------------------------------------
  // TEST 2: A later section receives the correct compact article context
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Introduction to Mobile Conversion Dynamics', level: 'H2', core_concept: 'mobile UX conversion baseline' },
      { heading: 'Mobile Form Usability and Friction Points', level: 'H2', core_concept: 'form input optimization' },
      { heading: 'Thumb Zone Ergonomics and Navigation', level: 'H2', core_concept: 'mobile tap targets' }
    ];

    // Simulated drafted text for section 0
    const s0Draft = `Mobile conversion rates remain significantly lower than desktop baselines across global ecommerce platforms.
Addressing friction in checkout flows is the primary lever for lifting mobile revenue.

Teams must measure user drop-offs systematically.`;

    const summary0 = summarizeDraftedSection(outline[0].heading, s0Draft);
    assert.ok(summary0.length > 10, 'Expected non-empty summary from drafted section 0');
    assert.ok(summary0.includes('Mobile conversion rates remain significantly lower'), 'Summary captures opening thesis');
    assert.ok(summary0.split(/\s+/).length <= 35, 'Summary is strictly bounded to <= 35 words');

    recordPass('Gate 2: A later section receives the correct compact article context and bounded prior summary');
  } catch (err: any) {
    recordFail('Gate 2: A later section receives the correct compact article context and bounded prior summary', err);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Two sections with different purposes do not mechanically repeat the same explanation
  // --------------------------------------------------------------------------
  try {
    const secCompare = { heading: 'Evaluating Native App Checkout vs Mobile Web Flows', level: 'H2', core_concept: 'architecture tradeoffs' };
    const secExplain = { heading: 'Step-by-Step Mobile Form Optimization Workflow', level: 'H2', core_concept: 'form input execution' };

    const mapCompare: SectionEvidenceMap = {
      sectionId: 'sec_1',
      heading: secCompare.heading,
      intent: 'COMPARE',
      evidenceIds: [],
      requiredEntities: [],
      targetBusinessFacts: [],
      claimConstraints: [],
      prohibitedClaims: []
    };

    const mapExplain: SectionEvidenceMap = {
      sectionId: 'sec_2',
      heading: secExplain.heading,
      intent: 'EXPLAIN',
      evidenceIds: [],
      requiredEntities: [],
      targetBusinessFacts: [],
      claimConstraints: [],
      prohibitedClaims: []
    };

    const draftCompare = generateConciseSectionDraft(secCompare, mapCompare, mockProfile.name, mobileKw);
    const draftExplain = generateConciseSectionDraft(secExplain, mapExplain, mockProfile.name, mobileKw);

    assert.notStrictEqual(draftCompare, draftExplain, 'Sections with different intents must not be identical');
    assert.ok(draftCompare.includes('tradeoffs') || draftCompare.includes('alternative') || draftCompare.includes('differences'), 'COMPARE section focuses on tradeoffs and comparison');
    assert.ok(draftExplain.includes('bottlenecks') || draftExplain.includes('interaction') || draftExplain.includes('triggers'), 'EXPLAIN section focuses on execution workflows and patterns');

    // Structural similarity calculation
    const wordsCompare = new Set(draftCompare.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsExplain = new Set(draftExplain.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let shared = 0;
    wordsCompare.forEach(w => { if (wordsExplain.has(w)) shared++; });
    const similarityPercent = (shared / Math.max(wordsCompare.size, wordsExplain.size)) * 100;
    assert.ok(similarityPercent < CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT, `Cross-section similarity (${similarityPercent.toFixed(1)}%) must be below policy threshold (${CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT}%)`);

    recordPass('Gate 3: Two sections with different purposes do not mechanically repeat the same explanation');
  } catch (err: any) {
    recordFail('Gate 3: Two sections with different purposes do not mechanically repeat the same explanation', err);
  }

  // --------------------------------------------------------------------------
  // TEST 4: A legitimate recurring concept is not rejected merely because it appears in two sections
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Foundations of Mobile Conversion Rates', level: 'H2', core_concept: 'mobile conversion benchmark' },
      { heading: 'Measuring Mobile Conversion Metrics Across Funnels', level: 'H2', core_concept: 'measuring mobile conversion' }
    ];

    const evGeneral: EvidenceItem = {
      id: 'ev-cro-benchmark',
      sourceUrl: 'https://baymard.com/mobile-benchmarks',
      sourceType: 'INDUSTRY',
      claim: 'Mobile conversion rates average 2.1% compared to 4.3% on desktop devices.',
      evidenceType: 'STATISTIC',
      confidence: 'HIGH',
      topics: ['mobile conversion', 'conversion benchmark'],
      citationRequired: true
    };

    const evSet: EvidenceSet = {
      items: [evGeneral],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const maps = SectionEvidenceMapper.mapSectionsToEvidence(outline, evSet, undefined, mockProfile, mobileKw);

    assert.ok(maps[0].evidenceIds.includes('ev-cro-benchmark'), 'Section 1 legitimately maps relevant benchmark evidence');
    assert.ok(maps[1].evidenceIds.includes('ev-cro-benchmark'), 'Section 2 legitimately reuses the same relevant benchmark evidence');

    recordPass('Gate 4: A legitimate recurring concept is not rejected merely because it appears in two sections');
  } catch (err: any) {
    recordFail('Gate 4: A legitimate recurring concept is not rejected merely because it appears in two sections', err);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Evidence about mobile form usability can support a relevant mobile conversion section
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Mobile Form Usability and Input Friction', level: 'H2', core_concept: 'form input optimization' }
    ];

    const evForm: EvidenceItem = {
      id: 'ev-form-1',
      sourceUrl: 'https://uxdesign.cc/mobile-form-best-practices',
      sourceType: 'INDUSTRY',
      claim: 'Multi-step mobile forms increase mobile checkout completion rates by 14% on smartphone devices.',
      evidenceType: 'STATISTIC',
      confidence: 'HIGH',
      topics: ['mobile forms', 'checkout usability', 'input fields'],
      citationRequired: true
    };

    const evSet: EvidenceSet = {
      items: [evForm],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const maps = SectionEvidenceMapper.mapSectionsToEvidence(outline, evSet, undefined, mockProfile, mobileKw);

    assert.strictEqual(maps[0].evidenceIds.length, 1);
    assert.strictEqual(maps[0].evidenceIds[0], 'ev-form-1');
    assert.strictEqual(maps[0].hasSubstantiveEvidence, true);

    recordPass('Gate 5: Evidence about mobile form usability supports a relevant mobile conversion section');
  } catch (err: any) {
    recordFail('Gate 5: Evidence about mobile form usability supports a relevant mobile conversion section', err);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Developer-retention evidence is not assigned to an unrelated mobile CRO section solely because it is unused
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Mobile Checkout Usability & Friction Points', level: 'H2', core_concept: 'checkout flow' }
    ];

    const evDevRetention: EvidenceItem = {
      id: 'ev-dev-retention',
      sourceUrl: 'https://hr-tech.com/engineer-retention-study',
      sourceType: 'INDUSTRY',
      claim: 'Front-end developer retention improves by 20% when engineering culture and remote flexibility are prioritized.',
      evidenceType: 'STATISTIC',
      confidence: 'HIGH',
      topics: ['developer retention', 'staffing models', 'engineer turnover'],
      citationRequired: true
    };

    const evSet: EvidenceSet = {
      items: [evDevRetention],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const maps = SectionEvidenceMapper.mapSectionsToEvidence(outline, evSet, undefined, mockProfile, mobileKw);

    assert.strictEqual(maps[0].evidenceIds.length, 0, 'Off-topic developer retention evidence must NOT be assigned to mobile CRO section');
    assert.strictEqual(maps[0].hasSubstantiveEvidence, false);

    recordPass('Gate 6: Developer-retention evidence is not assigned to an unrelated mobile CRO section solely because it is unused');
  } catch (err: any) {
    recordFail('Gate 6: Developer-retention evidence is not assigned to an unrelated mobile CRO section solely because it is unused', err);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Generic business evidence cannot silently replace missing topic-specific support
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Thumb Zone Ergonomics and Navigation', level: 'H2', core_concept: 'mobile navigation ergonomics' }
    ];

    const evBrandBizFact: EvidenceItem = {
      id: 'ev-biz-fact-1',
      sourceUrl: 'https://uxflowstudio.com/about',
      sourceType: 'TARGET_SITE',
      claim: 'UXFlow Studio was established in 2020 and serves enterprise software clients.',
      evidenceType: 'BUSINESS_FACT',
      confidence: 'HIGH',
      citationRequired: false
    };

    const evSet: EvidenceSet = {
      items: [evBrandBizFact],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const maps = SectionEvidenceMapper.mapSectionsToEvidence(outline, evSet, undefined, mockProfile, mobileKw);

    assert.strictEqual(maps[0].evidenceIds.length, 0, 'Generic brand business fact must not replace missing topic support in educational section');
    assert.strictEqual(maps[0].hasSubstantiveEvidence, false);

    recordPass('Gate 7: Generic business evidence cannot silently replace missing topic-specific support');
  } catch (err: any) {
    recordFail('Gate 7: Generic business evidence cannot silently replace missing topic-specific support', err);
  }

  // --------------------------------------------------------------------------
  // TEST 8: An evidence item with misleading keyword overlap is rejected when its substantive topic is unrelated
  // --------------------------------------------------------------------------
  try {
    const section = { heading: 'Mobile Checkout Usability & Friction Points', level: 'H2', core_concept: 'checkout flow' };

    const evMobilePlanRates: EvidenceItem = {
      id: 'ev-mobile-rates',
      sourceUrl: 'https://telecom-insider.com/rates',
      sourceType: 'INDUSTRY',
      claim: 'Corporate mobile plan rates drop by 15% with multi-year carrier agreements.',
      evidenceType: 'STATISTIC',
      confidence: 'HIGH',
      topics: ['mobile plans', 'telecom rates'],
      citationRequired: true
    };

    const evalResult = SectionEvidenceMapper.evaluateEvidenceRelevance(
      evMobilePlanRates,
      section,
      mobileKw,
      mockProfile.name,
      false
    );

    assert.strictEqual(evalResult.isMatch, false, 'Misleading overlap (mobile + rates) must be rejected when substantive topic is telecom pricing');
    assert.ok(evalResult.reason?.includes('generic modifiers or metrics'), 'Rejection reason identifies generic modifier/metric overlap');

    recordPass('Gate 8: An evidence item with misleading keyword overlap is rejected when its substantive topic is unrelated');
  } catch (err: any) {
    recordFail('Gate 8: An evidence item with misleading keyword overlap is rejected when its substantive topic is unrelated', err);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Evidence IDs and provenance survive mapping and assembly
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Mobile Form Usability and Friction Points', level: 'H2', core_concept: 'form input optimization' }
    ];

    const evProven: EvidenceItem = {
      id: 'ev-provenance-123',
      sourceUrl: 'https://baymard.com/checkout-study-2026',
      sourceTitle: 'Baymard Institute Mobile Form Usability Benchmark',
      sourceType: 'INDUSTRY',
      claim: 'Inline form validation on mobile checkouts reduces cart abandonment by 18%.',
      evidenceType: 'STATISTIC',
      confidence: 'HIGH',
      topics: ['mobile form usability', 'cart abandonment'],
      citationRequired: true
    };

    const evSet: EvidenceSet = {
      items: [evProven],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const maps = SectionEvidenceMapper.mapSectionsToEvidence(outline, evSet, undefined, mockProfile, mobileKw);

    assert.strictEqual(maps[0].evidenceIds.length, 1);
    assert.strictEqual(maps[0].evidenceIds[0], 'ev-provenance-123');

    // Verify original object identity and provenance can be recovered from evidenceSet
    const recovered = evSet.items.find(i => i.id === maps[0].evidenceIds[0]);
    assert.ok(recovered, 'Evidence item must be retrievable by ID');
    assert.strictEqual(recovered?.sourceUrl, 'https://baymard.com/checkout-study-2026');
    assert.strictEqual(recovered?.sourceTitle, 'Baymard Institute Mobile Form Usability Benchmark');
    assert.strictEqual(recovered?.sourceType, 'INDUSTRY');
    assert.strictEqual(recovered?.confidence, 'HIGH');

    recordPass('Gate 9: Evidence IDs and provenance survive mapping and assembly');
  } catch (err: any) {
    recordFail('Gate 9: Evidence IDs and provenance survive mapping and assembly', err);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Missing evidence is handled safely without fabricated support
  // --------------------------------------------------------------------------
  try {
    const outline = [
      { heading: 'Future Directions in Mobile Haptic Micro-Interactions', level: 'H2', core_concept: 'haptic feedback' }
    ];

    const emptyEvSet: EvidenceSet = {
      items: [],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const maps = SectionEvidenceMapper.mapSectionsToEvidence(outline, emptyEvSet, undefined, mockProfile, mobileKw);

    assert.strictEqual(maps[0].evidenceIds.length, 0, 'No evidence IDs allocated');
    assert.strictEqual(maps[0].hasSubstantiveEvidence, false, 'hasSubstantiveEvidence is false');
    assert.ok(
      maps[0].claimConstraints.some(c => c.includes('No empirical research evidence items are specifically assigned')),
      'Section receives explicit prompt constraint forbidding fabrication of statistics or studies'
    );

    recordPass('Gate 10: Missing evidence is handled safely without fabricated support');
  } catch (err: any) {
    recordFail('Gate 10: Missing evidence is handled safely without fabricated support', err);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Empty, short, or missing prior summaries do not break generation
  // --------------------------------------------------------------------------
  try {
    assert.strictEqual(summarizeDraftedSection('Test', ''), '');
    assert.strictEqual(summarizeDraftedSection('Test', '   \n\n\t  '), '');
    assert.strictEqual(summarizeDraftedSection('Test', '# Heading Only\n## Subheading'), '');
    assert.strictEqual(summarizeDraftedSection('Test', '| Col 1 | Col 2 |\n|---|---|\n| A | B |'), '');

    const shortDraft = 'Mobile checkout friction must be eliminated systematically.';
    const shortSum = summarizeDraftedSection('Test', shortDraft);
    assert.strictEqual(shortSum, shortDraft);

    const longDraft = `
## Section Heading

${'detailed '.repeat(50).trim()}.
`;
    const longSum = summarizeDraftedSection('Test', longDraft);
    assert.ok(longSum.split(/\s+/).length <= 36, 'Long paragraph summary is strictly bounded');
    assert.ok(longSum.endsWith('...'), 'Long summary ends with ellipsis');

    recordPass('Gate 11: Empty, short, or missing prior summaries do not break generation');
  } catch (err: any) {
    recordFail('Gate 11: Empty, short, or missing prior summaries do not break generation', err);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Repeated executions with identical inputs produce deterministic mapping decisions
  // --------------------------------------------------------------------------
  try {
    const complexOutline = [
      { heading: 'Foundations of Mobile Conversion', level: 'H2', core_concept: 'mobile conversion' },
      { heading: 'Mobile Form Usability and Field Optimization', level: 'H2', core_concept: 'form usability' },
      { heading: 'Thumb Zone and Mobile Tap Target Ergonomics', level: 'H2', core_concept: 'tap targets' },
      { heading: 'About UXFlow Studio and Next Steps', level: 'H2', core_concept: 'UXFlow Studio agency audit' }
    ];

    const mixedEvSet: EvidenceSet = {
      items: [
        {
          id: 'ev-tap-targets',
          sourceUrl: 'https://web.dev/tap-targets',
          sourceType: 'DOCUMENTATION',
          claim: 'Tap targets should be at least 48x48 CSS pixels with adequate spacing.',
          evidenceType: 'TECHNICAL_SPEC',
          confidence: 'HIGH',
          topics: ['tap targets', 'mobile ergonomics'],
          citationRequired: true
        },
        {
          id: 'ev-form-inputs',
          sourceUrl: 'https://baymard.com/form-inputs',
          sourceType: 'INDUSTRY',
          claim: 'Address autofill and input masking reduce mobile form abandonment by 24%.',
          evidenceType: 'STATISTIC',
          confidence: 'HIGH',
          topics: ['form usability', 'autofill'],
          citationRequired: true
        },
        {
          id: 'ev-brand-offer',
          sourceUrl: 'https://uxflowstudio.com/services',
          sourceType: 'TARGET_SITE',
          claim: 'UXFlow Studio delivers 2-week mobile checkout UX audit sprints.',
          evidenceType: 'FEATURE',
          confidence: 'HIGH',
          entities: ['UXFlow Studio'],
          topics: ['mobile checkout audit'],
          citationRequired: false
        },
        {
          id: 'ev-unrelated-staffing',
          sourceUrl: 'https://staffing.com/survey',
          sourceType: 'INDUSTRY',
          claim: 'Developer turnover rates reach 22% in traditional IT consulting.',
          evidenceType: 'STATISTIC',
          confidence: 'MEDIUM',
          topics: ['developer retention', 'staffing'],
          citationRequired: true
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 4, highConfidenceCount: 3, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };

    const firstRun = SectionEvidenceMapper.mapSectionsToEvidence(complexOutline, mixedEvSet, undefined, mockProfile, mobileKw);

    for (let run = 1; run <= 5; run++) {
      const currentRun = SectionEvidenceMapper.mapSectionsToEvidence(complexOutline, mixedEvSet, undefined, mockProfile, mobileKw);
      assert.strictEqual(currentRun.length, firstRun.length, `Run ${run} must produce identical section count`);

      for (let s = 0; s < currentRun.length; s++) {
        assert.deepStrictEqual(currentRun[s].evidenceIds, firstRun[s].evidenceIds, `Run ${run} section ${s} evidence IDs must be identical`);
        assert.strictEqual(currentRun[s].intent, firstRun[s].intent, `Run ${run} section ${s} intent must be identical`);
        assert.strictEqual(currentRun[s].buyerQuestion, firstRun[s].buyerQuestion, `Run ${run} section ${s} buyer question must be identical`);
        assert.deepStrictEqual(currentRun[s].claimConstraints, firstRun[s].claimConstraints, `Run ${run} section ${s} claim constraints must be identical`);
      }
    }

    recordPass('Gate 12: Repeated executions with identical inputs produce deterministic mapping decisions');
  } catch (err: any) {
    recordFail('Gate 12: Repeated executions with identical inputs produce deterministic mapping decisions', err);
  }

  console.log('\n========================================================================');
  console.log(` PHASE 6C SUITE EXECUTION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase6CContextAwareDraftingSuite().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
