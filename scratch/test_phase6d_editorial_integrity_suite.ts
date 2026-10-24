// scratch/test_phase6d_editorial_integrity_suite.ts
import {
  EvidenceSet,
  EvidenceItem,
  SectionEvidenceMap,
  CanonicalClaim
} from '@/core/contracts/evidence';
import { ContentBrief } from '@/core/contracts/schemas';
import { ClaimGroundingEngine } from '@/lib/intelligence/ClaimGroundingEngine';
import { ClaimClassificationService } from '@/lib/intelligence/ClaimClassificationService';
import { EditorialIntegrityValidator } from '@/lib/intelligence/EditorialIntegrityValidator';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';
import { ContentRepairService } from '@/lib/content/ContentRepairService';
import { ArticleExportService } from '@/lib/export/ArticleExportService';

async function runPhase6DTestSuite() {
  console.log('========================================================================');
  console.log(' ACUTE — PHASE 6D EDITORIAL INTEGRITY & CLAIM GROUNDING REGRESSION SUITE');
  console.log(' Offline Fixtures | Zero Live External Calls | 15 Required Gates');
  console.log('========================================================================\n');

  let passedAssertions = 0;
  let failedAssertions = 0;

  function assert(cond: boolean, desc: string) {
    if (cond) {
      console.log(`  [PASS] ${desc}`);
      passedAssertions++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failedAssertions++;
    }
  }

  // --- Common Test Fixtures ---
  const validEvidenceItem1: EvidenceItem = {
    id: 'ev-mobile-conv-1',
    sourceUrl: 'https://baymard.com/blog/mobile-checkout-benchmark-2024',
    sourceTitle: 'Baymard Institute Mobile Checkout Report 2024',
    sourceType: 'INDUSTRY',
    evidenceType: 'STATISTIC',
    confidence: 'HIGH',
    claim: 'The average mobile checkout completion rate stands at 32%, with a 68% drop-off rate.',
    entities: ['Baymard Institute', 'Mobile Checkout'],
    topics: ['conversion rate', 'drop-off', 'mobile checkout'],
    citationRequired: true,
  };

  const validEvidenceItem2: EvidenceItem = {
    id: 'ev-perf-latency-2',
    sourceUrl: 'https://web.dev/vitals/inp',
    sourceTitle: 'Google Web Vitals Documentation',
    sourceType: 'INDUSTRY',
    evidenceType: 'TECHNICAL_SPEC',
    confidence: 'HIGH',
    claim: 'Interaction to Next Paint (INP) under 200 milliseconds represents good responsiveness.',
    entities: ['Google', 'INP'],
    topics: ['latency', 'responsiveness', 'INP'],
    citationRequired: true,
  };

  const unrelatedHREvidenceItem: EvidenceItem = {
    id: 'ev-hr-salary-brasov',
    sourceUrl: 'https://romaniatech.org/salaries',
    sourceTitle: 'Romania Tech Compensation Survey',
    sourceType: 'INDUSTRY',
    evidenceType: 'STATISTIC',
    confidence: 'HIGH',
    claim: 'Senior backend engineers in Brasov earn an average of €4,500 monthly.',
    entities: ['Brasov', 'Romania Tech'],
    topics: ['compensation', 'salaries', 'hiring'],
    citationRequired: false,
  };

  const standardEvidenceSet: EvidenceSet = {
    items: [validEvidenceItem1, validEvidenceItem2, unrelatedHREvidenceItem],
    extractedAt: '2026-10-24T12:00:00Z',
    summary: {
      totalCount: 3,
      highConfidenceCount: 3,
      businessFactCount: 0,
      competitorObservationCount: 0,
      serpObservationCount: 0,
      inferenceCount: 0,
    }
  };

  const standardBrief: any = {
    title: 'How to Improve Mobile Conversion Rates',
    slug: 'how-to-improve-mobile-conversion-rates',
    primaryKeyword: 'mobile conversion rate',
    targetKeywords: ['mobile conversion rate', 'mobile checkout UX'],
    sections: [
      {
        heading: 'Why Mobile Checkout Rates Drop',
        level: 'H2',
        description: 'Analysis of mobile checkout friction points and abandonment drivers',
        userIntent: 'Understand checkout friction',
        requiredElements: ['data points', 'tactical steps']
      },
      {
        heading: 'Optimizing Touch Targets and Viewport Layouts',
        level: 'H2',
        description: 'Technical guidance on responsive viewport ergonomics',
        userIntent: 'Implement responsive UX',
        requiredElements: ['specifications', 'recommendations']
      }
    ]
  };

  // ==========================================================================
  // CASE 1: A factual claim supported by valid evidence is preserved
  // ==========================================================================
  console.log('--- TEST CASE 1: Supported factual claim is preserved with provenance ---');
  {
    const claim: CanonicalClaim = {
      id: 'claim-supported-1',
      sectionIndex: 0,
      sectionHeading: 'Why Mobile Checkout Rates Drop',
      sentence: 'The average mobile checkout completion rate stands at 32%.',
      claimText: 'The average mobile checkout completion rate stands at 32%.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: {
        raw: '32%',
        normalizedNumber: 32,
        unit: '%',
        tolerance: 0.05
      },
      confidence: 0.95,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };

    const secMap: SectionEvidenceMap = {
      sectionId: 'sec-0',
      heading: 'Why Mobile Checkout Rates Drop',
      intent: 'EXPLAIN',
      evidenceIds: ['ev-mobile-conv-1'],
      requiredEntities: [],
      targetBusinessFacts: [],
      claimConstraints: [],
      prohibitedClaims: []
    };

    const grounded = ClaimGroundingEngine.groundSingleClaim(
      claim,
      standardEvidenceSet.items,
      secMap
    );

    assert(grounded.supportStatus === 'SUPPORTED', 'Status is SUPPORTED for valid matching evidence');
    assert(grounded.groundedEvidenceIds.includes('ev-mobile-conv-1'), 'Preserves valid evidence ID provenance');
    assert(!grounded.rejectionReason, 'No rejection reason recorded for supported claim');
  }

  // ==========================================================================
  // CASE 2: A claim with unrelated evidence is flagged
  // ==========================================================================
  console.log('\n--- TEST CASE 2: Claim with unrelated evidence is flagged ---');
  {
    const claim: CanonicalClaim = {
      id: 'claim-unrelated-evidence',
      sectionIndex: 0,
      sectionHeading: 'Why Mobile Checkout Rates Drop',
      sentence: 'Mobile touch targets must span at least 48 pixels to minimize accidental taps.',
      claimText: 'Mobile touch targets must span at least 48 pixels to minimize accidental taps.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: {
        raw: '48',
        normalizedNumber: 48,
        unit: 'pixels'
      },
      confidence: 0.9,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };

    // Unrelated evidence assigned (salary/HR evidence for touch targets)
    const secMap: SectionEvidenceMap = {
      sectionId: 'sec-0',
      heading: 'Why Mobile Checkout Rates Drop',
      intent: 'EXPLAIN',
      evidenceIds: ['ev-hr-salary-brasov'],
      requiredEntities: [],
      targetBusinessFacts: [],
      claimConstraints: [],
      prohibitedClaims: []
    };

    const grounded = ClaimGroundingEngine.groundSingleClaim(
      claim,
      [unrelatedHREvidenceItem],
      secMap
    );

    assert(grounded.supportStatus === 'UNSUPPORTED', 'Status is UNSUPPORTED when assigned evidence is on an unrelated topic');
    assert(Boolean(grounded.rejectionReason), 'Rejection reason is recorded');
    assert(grounded.failureCategory === 'UNSUPPORTED_QUANTITATIVE_CLAIM' || grounded.failureCategory === 'PROPOSITION_MISMATCH', 'Failure category denotes unsupported/mismatched claim');
  }

  // ==========================================================================
  // CASE 3: A numerical claim with no supporting evidence is not marked verified
  // ==========================================================================
  console.log('\n--- TEST CASE 3: Numerical claim with no supporting evidence is not marked verified ---');
  {
    const claim: CanonicalClaim = {
      id: 'claim-unbacked-stat',
      sectionIndex: 0,
      sectionHeading: 'Why Mobile Checkout Rates Drop',
      sentence: 'Checkout completion jumped by 84% after simplifying navigation.',
      claimText: 'Checkout completion jumped by 84% after simplifying navigation.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: {
        raw: '84%',
        normalizedNumber: 84,
        unit: '%'
      },
      confidence: 0.9,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };

    const grounded = ClaimGroundingEngine.groundSingleClaim(
      claim,
      [validEvidenceItem2, unrelatedHREvidenceItem]
    );

    assert(grounded.supportStatus !== 'SUPPORTED', 'Claim with unsupported 84% is strictly NOT marked SUPPORTED');
    assert(grounded.supportStatus === 'UNSUPPORTED', 'Claim is classified as UNSUPPORTED');
    assert(grounded.failureCategory === 'UNSUPPORTED_QUANTITATIVE_CLAIM', 'Failure category is UNSUPPORTED_QUANTITATIVE_CLAIM');
  }

  // ==========================================================================
  // CASE 4: A fabricated evidence ID is rejected
  // ==========================================================================
  console.log('\n--- TEST CASE 4: Fabricated evidence ID is rejected ---');
  {
    const claim: CanonicalClaim = {
      id: 'claim-fake-id',
      sectionIndex: 0,
      sectionHeading: 'Why Mobile Checkout Rates Drop',
      sentence: 'Mobile page load speeds directly impact bounce rates.',
      claimText: 'Mobile page load speeds directly impact bounce rates.',
      claimType: 'GENERAL_FACT',
      confidence: 0.9,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: ['ev-fabricated-ghost-id-999']
    };

    const grounded = ClaimGroundingEngine.groundSingleClaim(
      claim,
      standardEvidenceSet.items
    );

    assert(grounded.supportStatus === 'UNSUPPORTED', 'Claim with fabricated evidence ID is UNSUPPORTED');
    assert(grounded.failureCategory === 'FABRICATED_EVIDENCE_ID', 'Failure category is explicitly FABRICATED_EVIDENCE_ID');
    assert(grounded.rejectionReason!.includes('ev-fabricated-ghost-id-999'), 'Rejection reason names the fabricated ID');

    // Also test EditorialIntegrityValidator detects fabricated IDs in text or section map
    const secMapWithFakeId: SectionEvidenceMap = {
      sectionId: 'sec-test',
      heading: 'Test Heading',
      intent: 'EXPLAIN',
      evidenceIds: ['ev-fabricated-ghost-id-999'],
      requiredEntities: [],
      targetBusinessFacts: [],
      claimConstraints: [],
      prohibitedClaims: []
    };

    const integrityReport = EditorialIntegrityValidator.validateEditorialIntegrity(
      'Some markdown body content.',
      {
        evidenceSet: standardEvidenceSet,
        sectionEvidenceMaps: [secMapWithFakeId]
      }
    );
    assert(!integrityReport.passed, 'Editorial integrity fails when section map references fabricated ID');
    assert(integrityReport.criticalErrors.some(e => e.includes('ev-fabricated-ghost-id-999')), 'Error message cites the fabricated ID');
  }

  // ==========================================================================
  // CASE 5: A nonexistent cited source cannot pass validation
  // ==========================================================================
  console.log('\n--- TEST CASE 5: Nonexistent cited source fails validation ---');
  {
    const markdownWithFakeSource = `## Why Mobile Checkout Rates Drop\n\nAccording to a 2024 study by PhantomResearchGroup, mobile users abandon carts 4x faster when forms lack autofill.`;

    const integrityReport = EditorialIntegrityValidator.validateEditorialIntegrity(
      markdownWithFakeSource,
      { evidenceSet: standardEvidenceSet }
    );

    assert(!integrityReport.passed, 'Validation rejects nonexistent cited source');
    assert(!integrityReport.canExport, 'Article with nonexistent cited source cannot be exported');
    assert(integrityReport.criticalErrors.some(e => e.includes('PhantomResearchGroup')), 'Error message specifies the fabricated source name');
    assert(integrityReport.diagnostics.fabricatedAttributionCount > 0, 'Fabricated attribution diagnostic count is incremented');
  }

  // ==========================================================================
  // CASE 6: Claim conflicting with explicit source value is flagged
  // ==========================================================================
  console.log('\n--- TEST CASE 6: Conflicting source value is flagged ---');
  {
    // Evidence states 68% drop-off rate (in ev-mobile-conv-1)
    // Claim asserts 15% drop-off rate for the same mobile checkout metric
    const conflictingClaim: CanonicalClaim = {
      id: 'claim-conflict-val',
      sectionIndex: 0,
      sectionHeading: 'Why Mobile Checkout Rates Drop',
      sentence: 'The average mobile checkout drop-off rate is only 15% in retail checkouts.',
      claimText: 'The average mobile checkout drop-off rate is only 15% in retail checkouts.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: {
        raw: '15%',
        normalizedNumber: 15,
        unit: '%'
      },
      confidence: 0.95,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };

    const grounded = ClaimGroundingEngine.groundSingleClaim(
      conflictingClaim,
      [validEvidenceItem1]
    );

    assert(grounded.supportStatus === 'CONTRADICTED' || grounded.supportStatus === 'OVERSTATED', `Status is ${grounded.supportStatus} (conflicting metric flagged)`);
    assert(Boolean(grounded.contradictionEvidenceId === 'ev-mobile-conv-1'), 'Contradiction evidence ID matches the conflicting evidence item');
    assert(Boolean(grounded.rejectionReason?.includes('15%') || grounded.rejectionReason?.includes('68%')), 'Rejection reason describes the numerical conflict');
  }

  // ==========================================================================
  // CASE 7: Legitimate recommendations are not treated as empirical research claims
  // ==========================================================================
  console.log('\n--- TEST CASE 7: Legitimate recommendations are distinguished from empirical claims ---');
  {
    const recommendationSentence = 'Teams should prioritize reducing form fields on mobile viewports to streamline user flow.';
    const classification = ClaimClassificationService.classifyClaim(recommendationSentence, standardEvidenceSet);

    assert(classification.classification === 'RECOMMENDATION', `Classification is RECOMMENDATION (got ${classification.classification})`);
    assert(EditorialIntegrityValidator.isRecommendationOrAdvice(recommendationSentence), 'Editorial validator classifies as recommendation/advice');

    // Validation of an advisory section without empirical stats must pass
    const advisoryMarkdown = `## Optimizing Touch Targets and Viewport Layouts\n\nTeams should prioritize reducing form fields on mobile viewports to streamline user flow. We recommend testing button tap targets with real users on small devices.`;
    const integrityReport = EditorialIntegrityValidator.validateEditorialIntegrity(advisoryMarkdown, {
      evidenceSet: standardEvidenceSet
    });

    assert(integrityReport.passed, 'Legitimate prescriptive advice passes editorial integrity without requiring empirical citations');
    assert(integrityReport.criticalErrors.length === 0, 'Zero critical errors for ordinary recommendations');
  }

  // ==========================================================================
  // CASE 8: Valid cross-section evidence reuse remains supported
  // ==========================================================================
  console.log('\n--- TEST CASE 8: Valid cross-section evidence reuse remains supported ---');
  {
    // Section 0 uses ev-perf-latency-2
    const secMap0: SectionEvidenceMap = {
      sectionId: 'sec-0',
      heading: 'Introduction',
      intent: 'EXPLAIN',
      evidenceIds: ['ev-perf-latency-2'],
      requiredEntities: [],
      targetBusinessFacts: [],
      claimConstraints: [],
      prohibitedClaims: []
    };

    // Section 1 also references INP responsiveness benchmark from ev-perf-latency-2
    const secMap1: SectionEvidenceMap = {
      sectionId: 'sec-1',
      heading: 'Technical Latency Requirements',
      intent: 'PROVE',
      evidenceIds: ['ev-perf-latency-2'],
      requiredEntities: [],
      targetBusinessFacts: [],
      claimConstraints: [],
      prohibitedClaims: []
    };

    const claimSec1: CanonicalClaim = {
      id: 'claim-cross-section',
      sectionIndex: 1,
      sectionHeading: 'Technical Latency Requirements',
      sentence: 'Interaction to Next Paint under 200 ms ensures responsive feedback.',
      claimText: 'Interaction to Next Paint under 200 ms ensures responsive feedback.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: {
        raw: '200 ms',
        normalizedNumber: 200,
        unit: 'ms'
      },
      confidence: 0.95,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };

    const grounded = ClaimGroundingEngine.groundSingleClaim(
      claimSec1,
      standardEvidenceSet.items,
      secMap1
    );

    assert(grounded.supportStatus === 'SUPPORTED', 'Cross-section claim is supported');
    assert(grounded.groundedEvidenceIds.includes('ev-perf-latency-2'), 'Evidence ID provenance maintained across sections');
  }

  // ==========================================================================
  // CASE 9: A prompt instruction accidentally copied into article prose is detected
  // ==========================================================================
  console.log('\n--- TEST CASE 9: Prompt instruction copied into article prose is detected ---');
  {
    const leakedMarkdown1 = `## Technical Latency Requirements\n\nSystem instruction: Write in a professional tone. Ensure the word count is 1500 words. Fast sites perform better.`;
    const leakedMarkdown2 = `## Mobile Design\n\n[Note to writer: include three practical tips here]. Good design aids conversions.`;

    const report1 = EditorialIntegrityValidator.validateEditorialIntegrity(leakedMarkdown1);
    const report2 = EditorialIntegrityValidator.validateEditorialIntegrity(leakedMarkdown2);

    assert(!report1.passed, 'Detects "System instruction:" prompt leak');
    assert(report1.criticalErrors.some(e => e.includes('Prompt Leakage Alert')), 'Reports Prompt Leakage Alert for report1');
    assert(report1.diagnostics.promptLeakCount > 0, 'promptLeakCount > 0');

    assert(!report2.passed, 'Detects "[Note to writer: ...]" prompt leak');
    assert(report2.criticalErrors.some(e => e.includes('Prompt Leakage Alert')), 'Reports Prompt Leakage Alert for report2');
  }

  // ==========================================================================
  // CASE 10: Internal GEO distribution guidance is not accepted as reader-facing content
  // ==========================================================================
  console.log('\n--- TEST CASE 10: Internal GEO distribution guidance is rejected ---');
  {
    const geoScaffoldingMarkdown = `## Search Visibility\n\nAccording to internal GEO distribution guidance, this section targets high-intent queries with gap importance: high.`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(geoScaffoldingMarkdown);

    assert(!report.passed, 'Rejects internal GEO distribution guidance and gap metadata');
    assert(report.criticalErrors.some(e => e.includes('Internal Scaffolding Alert')), 'Critical error reports Internal Scaffolding Alert');
    assert(report.diagnostics.scaffoldingCount > 0, 'scaffoldingCount > 0');
  }

  // ==========================================================================
  // CASE 11: Normal educational discussion of SEO, AI, keywords, or research is not falsely rejected
  // ==========================================================================
  console.log('\n--- TEST CASE 11: Normal educational discussion of SEO, AI, and research is preserved ---');
  {
    const legitimateEducationalMarkdown = `## Understanding Modern Search Discovery\n\nGenerative Engine Optimization (GEO) is the practice of optimizing digital assets for AI-powered search engines. Conducting keyword research helps content teams understand user intent and structure comprehensive answers. Using AI tools for data analysis can accelerate competitive research while maintaining human editorial oversight.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(legitimateEducationalMarkdown, {
      evidenceSet: standardEvidenceSet
    });

    assert(report.passed, 'Educational text discussing GEO, keyword research, and AI search passes cleanly');
    assert(report.criticalErrors.length === 0, 'Zero critical errors on legitimate educational language');
    assert(report.diagnostics.promptLeakCount === 0, 'Zero prompt leaks flagged');
    assert(report.diagnostics.scaffoldingCount === 0, 'Zero scaffolding leaks flagged');
  }

  // ==========================================================================
  // CASE 12: A placeholder or unfinished template instruction is detected
  // ==========================================================================
  console.log('\n--- TEST CASE 12: Incomplete placeholder / template variable is detected ---');
  {
    const placeholderMd1 = `## Checkout Flow\n\nTo maximize completion, [insert keyword here] must be configured properly.`;
    const placeholderMd2 = `## Contact Options\n\nFor more details, contact {{company_name}} support.`;

    const report1 = EditorialIntegrityValidator.validateEditorialIntegrity(placeholderMd1);
    const report2 = EditorialIntegrityValidator.validateEditorialIntegrity(placeholderMd2);

    assert(!report1.passed, 'Detects bracketed placeholder "[insert keyword here]"');
    assert(report1.criticalErrors.some(e => e.includes('Placeholder Alert')), 'Reports Placeholder Alert for report1');

    assert(!report2.passed, 'Detects template variable "{{company_name}}"');
    assert(report2.criticalErrors.some(e => e.includes('Placeholder Alert')), 'Reports Placeholder Alert for report2');
  }

  // ==========================================================================
  // CASE 13: Valid neighboring paragraphs survive a localized repair
  // ==========================================================================
  console.log('\n--- TEST CASE 13: Valid neighboring paragraphs survive localized repair ---');
  {
    const p1 = 'First paragraph provides valuable context regarding mobile checkout dynamics.';
    const p2Bad = '[Note to writer: insert statistic here] Second paragraph discusses touch target spacing.';
    const p3 = 'Third paragraph outlines concrete responsive styling rules for mobile devices.';

    const fullText = `${p1}\n\n${p2Bad}\n\n${p3}`;

    const repairResult = ContentRepairService.repairEditorialContamination(fullText);

    assert(repairResult.repairedCount > 0, 'Surgical repair detects and fixes contaminated token');
    assert(repairResult.repairedMarkdown.includes(p1), 'Paragraph 1 survives 100% intact');
    assert(repairResult.repairedMarkdown.includes(p3), 'Paragraph 3 survives 100% intact');
    assert(!repairResult.repairedMarkdown.includes('[Note to writer: insert statistic here]'), 'Prompt leak stripped from Paragraph 2');
    assert(repairResult.repairedMarkdown.includes('Second paragraph discusses touch target spacing.'), 'Valid prose in Paragraph 2 survives');
  }

  // ==========================================================================
  // CASE 14: An unrepairable blocking defect prevents export
  // ==========================================================================
  console.log('\n--- TEST CASE 14: Unrepairable blocking defect prevents export ---');
  {
    const articleWithBlockingDefect = {
      title: 'Mobile Conversion Optimization Guide',
      content: '<h2>Introduction</h2><p>Here is our internal GEO distribution guidance with gap importance: high. [insert keyword here]</p>'
    };

    const exportValidation = ArticleExportService.validateBeforeExport(articleWithBlockingDefect);

    assert(!exportValidation.canExport, 'ArticleExportService.validateBeforeExport returns canExport: false');
    assert(exportValidation.errors.length > 0, 'Blocking errors are recorded');
    assert(exportValidation.errors.some(e => e.includes('Placeholder') || e.includes('Scaffolding') || e.includes('Incomplete')), 'Error identifies the blocking editorial defect');

    // Test client download throws or returns failure
    const clientDownload = ArticleExportService.downloadHtmlClient(articleWithBlockingDefect);
    assert(!clientDownload.success, 'downloadHtmlClient fails closed when validation fails');
  }

  // ==========================================================================
  // CASE 15: Repeated validation of identical inputs produces deterministic results
  // ==========================================================================
  console.log('\n--- TEST CASE 15: Repeated validation is strictly deterministic ---');
  {
    const sampleArticle = `## Understanding Mobile Usability\n\nGenerative Engine Optimization (GEO) improves content discoverability in AI search engines. Teams should test layouts on small viewports.\n\n## Touch Target Specifications\n\nInteraction to Next Paint under 200 ms ensures responsive feedback.`;

    const reports: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rep = EditorialIntegrityValidator.validateEditorialIntegrity(sampleArticle, {
        evidenceSet: standardEvidenceSet
      });
      reports.push(JSON.stringify(rep));
    }

    const allIdentical = reports.every(r => r === reports[0]);
    assert(allIdentical, '10 consecutive runs produce 100% identical JSON reports');
  }

  // --- BOUNDARY CASES ---
  console.log('\n--- BOUNDARY TESTS: Missing evidence, empty content, and ambiguous claims ---');
  {
    // Boundary 1: Empty content fails closed
    const emptyRep = EditorialIntegrityValidator.validateEditorialIntegrity('');
    assert(!emptyRep.passed && !emptyRep.canExport, 'Empty content fails closed');

    // Boundary 2: Ambiguous claim with partial overlap triggers REQUIRES_REVIEW
    const ambiguousStatement = 'The checkout experience influences overall customer trust and perceived reliability.';
    const classified = ClaimClassificationService.classifyClaim(ambiguousStatement, standardEvidenceSet);
    assert(classified.classification === 'REQUIRES_REVIEW' || classified.classification === 'UNSUPPORTED', `Ambiguous statement handled with safe status (${classified.classification})`);

    // Boundary 3: Empty evidence set handles quantitative claim safely
    const quantClaim: CanonicalClaim = {
      id: 'claim-empty-ev',
      sectionIndex: 0,
      sectionHeading: 'Intro',
      sentence: 'Conversion rate is 50%.',
      claimText: 'Conversion rate is 50%.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: { raw: '50%', normalizedNumber: 50, unit: '%' },
      confidence: 0.9,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };
    const emptyGrounded = ClaimGroundingEngine.groundSingleClaim(quantClaim, []);
    assert(emptyGrounded.supportStatus === 'UNSUPPORTED', 'Empty evidence set safely returns UNSUPPORTED for quantitative claim');
  }

  console.log('\n========================================================================');
  console.log(` PHASE 6D REGRESSION SUITE RESULTS: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('========================================================================\n');

  if (failedAssertions > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase6DTestSuite().catch(err => {
  console.error('Fatal error running Phase 6D test suite:', err);
  process.exit(1);
});
