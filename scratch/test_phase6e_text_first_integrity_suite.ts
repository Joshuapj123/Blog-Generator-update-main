// scratch/test_phase6e_text_first_integrity_suite.ts
import {
  EvidenceSet,
  EvidenceItem,
  SectionEvidenceMap,
  CanonicalClaim
} from '@/core/contracts/evidence';
import { ClaimGroundingEngine } from '@/lib/intelligence/ClaimGroundingEngine';
import { ClaimClassificationService } from '@/lib/intelligence/ClaimClassificationService';
import { EditorialIntegrityValidator } from '@/lib/intelligence/EditorialIntegrityValidator';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';
import { ContentRepairService } from '@/lib/content/ContentRepairService';
import { ArticleExportService } from '@/lib/export/ArticleExportService';

async function runPhase6ETestSuite() {
  console.log('========================================================================');
  console.log(' ACUTE — PHASE 6E TEXT-FIRST CONTENT INTEGRITY & QUALITY REGRESSION SUITE');
  console.log(' Offline Deterministic Fixtures | Strictly No Images | 22 Mandatory Gates');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, desc: string) {
    if (cond) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  // --- Common Test Fixtures ---
  const mobileEvidence1: EvidenceItem = {
    id: 'ev-cro-benchmark-1',
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

  const mobileEvidence2: EvidenceItem = {
    id: 'ev-inp-latency-2',
    sourceUrl: 'https://web.dev/vitals/inp',
    sourceTitle: 'Google Web Vitals Documentation',
    sourceType: 'INDUSTRY',
    evidenceType: 'TECHNICAL_SPEC',
    confidence: 'HIGH',
    claim: 'Interaction to Next Paint under 200 milliseconds represents good responsiveness.',
    entities: ['Google', 'INP'],
    topics: ['latency', 'responsiveness', 'INP'],
    citationRequired: true,
  };

  const standardEvidenceSet: EvidenceSet = {
    items: [mobileEvidence1, mobileEvidence2],
    extractedAt: '2026-10-25T00:00:00Z',
    summary: {
      totalCount: 2,
      highConfidenceCount: 2,
      businessFactCount: 0,
      competitorObservationCount: 0,
      serpObservationCount: 0,
      inferenceCount: 0,
    }
  };

  const targetKeyword = 'mobile conversion rates';

  // ==========================================================================
  // CASE 1: A relevant, substantive article passes
  // ==========================================================================
  console.log('--- TEST CASE 1: A relevant, substantive article passes ---');
  {
    const substantiveArticle = `## Understanding Mobile Checkout Usability

Mobile visitors encounter unique interface constraints compared to desktop users. Viewport limitations require streamlined layouts and focused user flows.

## Optimizing Form Ergonomics and Input Fields

Keeping checkout forms under four input fields significantly reduces friction. Every additional input field increases user cognitive overhead on small touchscreens.

## Performance Benchmark Metrics and Latency Limits

Interaction to Next Paint under 200 ms ensures immediate visual feedback on touch devices. High responsiveness prevents perceived application freezes during checkout.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(substantiveArticle, {
      evidenceSet: standardEvidenceSet,
      targetKeyword
    });

    assert(report.passed, 'Relevant, substantive article passes editorial validation');
    assert(report.criticalErrors.length === 0, 'Zero critical errors on clean substantive text');
    assert(report.canExport, 'Substantive article is approved for export');
  }

  // ==========================================================================
  // CASE 2: An article with clear topic drift is flagged
  // ==========================================================================
  console.log('\n--- TEST CASE 2: Article with clear topic drift is flagged ---');
  {
    const driftedArticle = `## Understanding Mobile Checkout Usability

Mobile users expect fast, seamless experiences during checkout transactions.

## Agency Staffing Models and Developer Retention

Engineering teams must manage developer turnover and reduce developer retention risks by restructuring hourly contractor agency retainers.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(driftedArticle, {
      evidenceSet: standardEvidenceSet,
      targetKeyword: 'mobile conversion rates'
    });

    assert(!report.passed, 'Article with staffing drift is rejected');
    assert(report.criticalErrors.some(e => e.includes('Topic Drift Alert')), 'Flags Topic Drift Alert');
    assert(report.issues.some(i => i.type === 'TOPIC_DRIFT'), 'Issue type is explicitly TOPIC_DRIFT');
  }

  // ==========================================================================
  // CASE 3: A heading that promises information absent from its section is flagged
  // ==========================================================================
  console.log('\n--- TEST CASE 3: Heading promising absent information is flagged ---');
  {
    const missingStepsArticle = `## Mobile Optimization Overview

Mobile user experience is critical for modern eCommerce sites.

## Actionable Steps and Implementation Checklist

Improving your mobile application requires commitment, thoughtful planning, and regular attention to detail.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(missingStepsArticle, {
      evidenceSet: standardEvidenceSet,
      targetKeyword
    });

    assert(!report.passed, 'Rejects section failing to deliver promised actionable checklist');
    assert(report.criticalErrors.some(e => e.includes('Unfulfilled Promise Alert')), 'Flags Unfulfilled Promise Alert');
    assert(report.issues.some(i => i.type === 'UNFULFILLED_HEADING_PROMISE'), 'Issue type is UNFULFILLED_HEADING_PROMISE');
  }

  // ==========================================================================
  // CASE 4: Generic filler is identified without rejecting all concise writing
  // ==========================================================================
  console.log('\n--- TEST CASE 4: Generic filler identified without rejecting concise writing ---');
  {
    const fillerArticle = `## Modern Interface Design

In today's fast-paced digital world, it is crucial to understand that success requires organizations to leverage modern best practices to drive meaningful outcomes.`;

    const conciseArticle = `## Touch Target Sizing

Keep buttons at minimum 48 pixels. Adequate spacing eliminates accidental taps and accelerates mobile checkout completion.`;

    const fillerReport = EditorialIntegrityValidator.validateEditorialIntegrity(fillerArticle, { targetKeyword });
    const conciseReport = EditorialIntegrityValidator.validateEditorialIntegrity(conciseArticle, { targetKeyword });

    assert(!fillerReport.passed, 'Flags generic corporate filler paragraph');
    assert(fillerReport.criticalErrors.some(e => e.includes('Generic Filler Alert')), 'Reports Generic Filler Alert');
    assert(conciseReport.passed, 'Concise, direct, substantive writing passes cleanly');
  }

  // ==========================================================================
  // CASE 5: Repeated adjacent sections are detected
  // ==========================================================================
  console.log('\n--- TEST CASE 5: Repeated adjacent sections are detected ---');
  {
    const repeatingArticle = `## Mobile Checkout Friction Points

Mobile visitors encounter unique interface constraints compared to desktop users. Viewport limitations require streamlined layouts and focused user flows.

## Addressing Checkout Bottlenecks

Mobile visitors encounter unique interface constraints compared to desktop users. Viewport limitations require streamlined layouts and focused user flows.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(repeatingArticle, { targetKeyword });

    assert(!report.passed, 'Detects conceptual repetition between adjacent sections');
    assert(report.criticalErrors.some(e => e.includes('Adjacent Section Repetition Alert') || e.includes('Boilerplate Alert')), 'Flags adjacent section repetition or boilerplate alert');
  }

  // ==========================================================================
  // CASE 6: Valid examples and implementation guidance are preserved
  // ==========================================================================
  console.log('\n--- TEST CASE 6: Valid examples and implementation guidance are preserved ---');
  {
    const tacticalArticle = `## Step-by-Step Checkout Implementation Guide

Follow these verified engineering steps to optimize checkout latency:

1. Configure input masks for credit card fields to eliminate manual formatting.
2. Enable native biometric authentication APIs for instant one-touch checkout.
3. Preload payment SDK bundles asynchronously before the cart step.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(tacticalArticle, { targetKeyword });

    assert(report.passed, 'Structured tactical implementation guidance passes with high confidence');
    assert(report.criticalErrors.length === 0, 'Zero errors on concrete step-by-step guidance');
  }

  // ==========================================================================
  // CASE 7: Unsupported factual claims remain subject to Phase 6D grounding
  // ==========================================================================
  console.log('\n--- TEST CASE 7: Unsupported factual claims remain subject to Phase 6D grounding ---');
  {
    // Scenario A: Contradiction — Evidence states 32% checkout completion, claim asserts 89%
    const claimContradicted: CanonicalClaim = {
      id: 'claim-contradicted-stat',
      sectionIndex: 0,
      sectionHeading: 'Why Mobile Checkout Rates Drop',
      sentence: 'Checkout completion jumped by 89% after removing secondary buttons.',
      claimText: 'Checkout completion jumped by 89% after removing secondary buttons.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: { raw: '89%', normalizedNumber: 89, unit: '%' },
      confidence: 0.9,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };

    const groundedContradicted = ClaimGroundingEngine.groundSingleClaim(claimContradicted, [mobileEvidence1]);
    assert(groundedContradicted.supportStatus === 'CONTRADICTED', 'Conflicting metric claim is flagged CONTRADICTED');
    assert(groundedContradicted.failureCategory === 'PROPOSITION_MISMATCH', 'Failure category is PROPOSITION_MISMATCH');
    assert(Boolean(groundedContradicted.rejectionReason?.includes('contradiction') || groundedContradicted.rejectionReason?.includes('89%')), 'Rejection reason describes the numerical contradiction');

    // Scenario B: Unsupported Quantitative Claim — Evidence is genuinely unrelated (latency evidence)
    const claimUnsupported: CanonicalClaim = {
      id: 'claim-unsupported-stat',
      sectionIndex: 0,
      sectionHeading: 'Why Mobile Checkout Rates Drop',
      sentence: 'Checkout completion jumped by 89% after removing secondary buttons.',
      claimText: 'Checkout completion jumped by 89% after removing secondary buttons.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: { raw: '89%', normalizedNumber: 89, unit: '%' },
      confidence: 0.9,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    };

    const groundedUnsupported = ClaimGroundingEngine.groundSingleClaim(claimUnsupported, [mobileEvidence2]);
    assert(groundedUnsupported.supportStatus === 'UNSUPPORTED', 'Unsupported empirical claim with unrelated evidence is flagged UNSUPPORTED');
    assert(groundedUnsupported.failureCategory === 'UNSUPPORTED_QUANTITATIVE_CLAIM', 'Failure category is UNSUPPORTED_QUANTITATIVE_CLAIM');
  }

  // ==========================================================================
  // CASE 8: Legitimate recommendations not automatically rejected for lacking citations
  // ==========================================================================
  console.log('\n--- TEST CASE 8: Legitimate recommendations are not rejected ---');
  {
    const recommendationText = 'Teams should prioritize single-column layouts on mobile viewports to prevent horizontal overflow.';
    const classification = ClaimClassificationService.classifyClaim(recommendationText, standardEvidenceSet);

    assert(classification.classification === 'RECOMMENDATION', 'Prescriptive advice is classified as RECOMMENDATION');
    assert(EditorialIntegrityValidator.isRecommendationOrAdvice(recommendationText), 'Editorial validator recognizes recommendation pattern');
  }

  // ==========================================================================
  // CASE 9: Prompt leakage is detected
  // ==========================================================================
  console.log('\n--- TEST CASE 9: Prompt leakage is detected ---');
  {
    const promptLeakedText = `## Touch Targets\n\nPrompt instruction: write in a professional tone without fluff. Touch targets must be 48px.`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(promptLeakedText, { targetKeyword });

    assert(!report.passed, 'Prompt leakage is caught');
    assert(report.criticalErrors.some(e => e.includes('Prompt Leakage Alert')), 'Flags Prompt Leakage Alert');
  }

  // ==========================================================================
  // CASE 10: Unresolved placeholders are detected
  // ==========================================================================
  console.log('\n--- TEST CASE 10: Unresolved placeholders are detected ---');
  {
    const placeholderText = `## Performance\n\nTo improve speed, [insert keyword here] must be optimized.`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(placeholderText, { targetKeyword });

    assert(!report.passed, 'Unresolved bracketed placeholder is caught');
    assert(report.criticalErrors.some(e => e.includes('Placeholder Alert')), 'Flags Placeholder Alert');
  }

  // ==========================================================================
  // CASE 11: Legitimate educational discussion of SEO, AI, and GEO is preserved
  // ==========================================================================
  console.log('\n--- TEST CASE 11: Legitimate educational discussion of SEO, AI, GEO preserved ---');
  {
    const educationalArticle = `## Search Visibility and Discovery

Generative Engine Optimization (GEO) allows content teams to structure technical information for AI search engines. Conducting keyword research ensures topics align with actual buyer search queries.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(educationalArticle, {
      evidenceSet: standardEvidenceSet,
      targetKeyword: 'generative engine optimization'
    });

    assert(report.passed, 'Educational SEO/GEO discussion is preserved without false rejection');
  }

  // ==========================================================================
  // CASE 12: Localized repair preserves valid neighboring paragraphs
  // ==========================================================================
  console.log('\n--- TEST CASE 12: Localized repair preserves valid neighboring paragraphs ---');
  {
    const p1 = 'First paragraph explains touch latency dynamics on mobile viewports.';
    const p2Bad = '[insert keyword here] Second paragraph provides concrete button dimensions.';
    const p3 = 'Third paragraph analyzes form field completion velocity.';
    const raw = `${p1}\n\n${p2Bad}\n\n${p3}`;

    const repaired = ContentRepairService.repairEditorialContamination(raw);

    assert(repaired.repairedCount > 0, 'Surgically repairs placeholder token');
    assert(repaired.repairedMarkdown.includes(p1), 'Paragraph 1 survives intact');
    assert(repaired.repairedMarkdown.includes(p3), 'Paragraph 3 survives intact');
    assert(!repaired.repairedMarkdown.includes('[insert keyword here]'), 'Placeholder stripped');
  }

  // ==========================================================================
  // CASE 13: Failed repair cannot silently produce a publishable status
  // ==========================================================================
  console.log('\n--- TEST CASE 13: Failed repair cannot silently produce publishable status ---');
  {
    const unrepairableContent = `## Topic\n\nAccording to [PhantomSource2024], mobile users convert at 99%.`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(unrepairableContent, {
      evidenceSet: standardEvidenceSet,
      targetKeyword
    });

    assert(!report.canExport, 'Unverified attribution blocks export fail-closed');
  }

  // ==========================================================================
  // CASE 14: Empty or incomplete drafts are handled correctly
  // ==========================================================================
  console.log('\n--- TEST CASE 14: Empty or hollow sections are handled correctly ---');
  {
    const hollowSectionArticle = `## Mobile Usability Overview\n\nSubstantive introductory paragraph explaining why checkout UX impacts bottom-line revenues.\n\n## Form Optimization\n\nShort.`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(hollowSectionArticle, { targetKeyword });

    assert(!report.passed, 'Hollow section with 1 word is rejected');
    assert(report.criticalErrors.some(e => e.includes('Hollow Section Alert')), 'Flags Hollow Section Alert');
  }

  // ==========================================================================
  // CASE 15: Valid Markdown remains intact
  // ==========================================================================
  console.log('\n--- TEST CASE 15: Valid Markdown remains intact through repair ---');
  {
    const validMd = `## Technical Guidance\n\n- Bullet 1\n- Bullet 2\n\n| Metric | Baseline |\n| :--- | :--- |\n| INP | 200 ms |`;
    const repaired = ContentRepairService.repairEditorialContamination(validMd);

    assert(repaired.repairedMarkdown === validMd, 'Markdown formatting, lists, and tables preserved verbatim');
  }

  // ==========================================================================
  // CASE 16: Valid HTML structure and links survive repair
  // ==========================================================================
  console.log('\n--- TEST CASE 16: Valid HTML structure and links survive repair ---');
  {
    const linkedText = `Check the [Google Web Vitals Documentation](https://web.dev/vitals/inp) for exact latency specs. [TODO: fix]`;
    const repaired = ContentRepairService.repairEditorialContamination(linkedText);

    assert(repaired.repairedMarkdown.includes('[Google Web Vitals Documentation](https://web.dev/vitals/inp)'), 'Markdown link and URL survive repair 100% intact');
    assert(!repaired.repairedMarkdown.includes('TODO'), 'TODO placeholder removed');
  }

  // ==========================================================================
  // CASE 17: HTML export continues to enforce Phase 6D/6E validation
  // ==========================================================================
  console.log('\n--- TEST CASE 17: HTML export enforces Phase 6D/6E validation ---');
  {
    const exportBlocked = ArticleExportService.validateBeforeExport({
      title: 'Guide',
      content: '<h2>Heading</h2><p>Here is our internal GEO distribution guidance.</p>'
    });

    assert(!exportBlocked.canExport, 'HTML export gate blocks publication with editorial defect');
  }

  // ==========================================================================
  // CASE 18: PDF export continues to enforce Phase 6D/6E validation
  // ==========================================================================
  console.log('\n--- TEST CASE 18: PDF export enforces Phase 6D/6E validation ---');
  {
    let threw = false;
    let errorMessage = '';
    try {
      ArticleExportService.generatePdfBuffer({
        title: 'Guide',
        content: '<h2>Heading</h2><p>Here is [insert keyword here] in prose.</p>'
      });
    } catch (e: any) {
      threw = true;
      errorMessage = e.message || '';
    }
    assert(threw, 'generatePdfBuffer fails closed on unvalidated article');
    assert(errorMessage.startsWith('Export blocked:'), 'Error begins with explicit "Export blocked:" message');
    assert(errorMessage.includes('Placeholder Alert'), 'Error identifies the integrity placeholder failure');
    assert(!errorMessage.includes('is not a function'), 'Error reflects genuine integrity failure, not missing method');
  }

  // ==========================================================================
  // CASE 19: A text-only article succeeds without images or image placeholders
  // ==========================================================================
  console.log('\n--- TEST CASE 19: Text-only article succeeds without images ---');
  {
    const pureTextArticle = `## Mobile Usability Baselines

Mobile conversion optimization relies on clear typography, accessible touch targets, and low latency interaction loops.

## Benchmark Metrics and Latency Limits

Interaction to Next Paint under 200 ms maintains fluid rendering. Reducing DOM complexity prevents render thread starvation.`;

    const report = EditorialIntegrityValidator.validateEditorialIntegrity(pureTextArticle, {
      evidenceSet: standardEvidenceSet,
      targetKeyword
    });

    assert(report.passed, 'Pure text article passes validation with zero image requirements');
    assert(report.diagnostics.imagePlaceholderCount === 0, 'Zero image placeholders detected');
  }

  // ==========================================================================
  // CASE 20: No newly introduced code path inserts images into generated articles
  // ==========================================================================
  console.log('\n--- TEST CASE 20: Images or image placeholders in text-first articles are rejected ---');
  {
    const articleWithImage = `## Usability\n\n![Checkout Chart](https://example.com/chart.png)\n\nVisual overview of checkout steps.`;
    const articleWithPlaceholder = `## Usability\n\n[Insert image here]\n\nVisual overview of checkout steps.`;

    const rep1 = EditorialIntegrityValidator.validateEditorialIntegrity(articleWithImage, { targetKeyword });
    const rep2 = EditorialIntegrityValidator.validateEditorialIntegrity(articleWithPlaceholder, { targetKeyword });

    assert(!rep1.passed, 'Rejects markdown image insertion in text-first article');
    assert(rep1.criticalErrors.some(e => e.includes('Image Prohibition Alert')), 'Reports Image Prohibition Alert for rep1');
    assert(!rep2.passed, 'Rejects image placeholder directive');
    assert(rep2.criticalErrors.some(e => e.includes('Image Prohibition Alert')), 'Reports Image Prohibition Alert for rep2');

    // Test surgical removal in ContentRepairService
    const repaired = ContentRepairService.repairEditorialContamination(articleWithImage);
    assert(!repaired.repairedMarkdown.includes('![Checkout Chart]'), 'Surgical repair strips prohibited image tag');
    assert(repaired.repairedMarkdown.includes('Visual overview of checkout steps.'), 'Surrounding prose survives');
  }

  // ==========================================================================
  // CASE 21: Repeated validation of identical inputs yields consistent results
  // ==========================================================================
  console.log('\n--- TEST CASE 21: Repeated validation is strictly deterministic ---');
  {
    const article = `## Mobile Usability Baselines\n\nMobile visitors encounter unique touch constraints. Viewport layouts must prioritize single-column navigation.`;
    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rep = EditorialIntegrityValidator.validateEditorialIntegrity(article, { targetKeyword });
      results.push(JSON.stringify(rep));
    }
    assert(results.every(r => r === results[0]), '10 consecutive validation executions produce 100% identical outputs');
  }

  // ==========================================================================
  // CASE 22: Empty evidence and ambiguous claims retain Phase 6D behavior
  // ==========================================================================
  console.log('\n--- TEST CASE 22: Empty evidence and ambiguous claims retain Phase 6D behavior ---');
  {
    const ambiguousStatement = 'The checkout experience directly shapes customer brand perception and perceived reliability.';
    const classified = ClaimClassificationService.classifyClaim(ambiguousStatement, standardEvidenceSet);
    assert(classified.classification === 'REQUIRES_REVIEW' || classified.classification === 'UNSUPPORTED', `Ambiguous claim handled safely (${classified.classification})`);

    const emptyEvGrounded = ClaimGroundingEngine.groundSingleClaim({
      id: 'claim-empty-ev-test',
      sectionIndex: 0,
      sectionHeading: 'Intro',
      sentence: 'Conversion rate reached 50%.',
      claimText: 'Conversion rate reached 50%.',
      claimType: 'QUANTITATIVE',
      quantitativeValue: { raw: '50%', normalizedNumber: 50, unit: '%' },
      confidence: 0.9,
      materiality: 'CRITICAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: []
    }, []);
    assert(emptyEvGrounded.supportStatus === 'UNSUPPORTED', 'Empty evidence set safely returns UNSUPPORTED');
  }

  // ==========================================================================
  // BOUNDARY CASE 1: Duplicate Section Headings
  // ==========================================================================
  console.log('\n--- BOUNDARY TEST 1: Duplicate Section Headings are rejected ---');
  {
    const dupHeadingArticle = `## Overview of Mobile Usability\n\nIntroductory section detailing mobile constraints.\n\n## Overview of Mobile Usability\n\nSecond section with duplicate heading.`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(dupHeadingArticle, { targetKeyword });

    assert(!report.passed, 'Rejects article with duplicate section headings');
    assert(report.criticalErrors.some(e => e.includes('Duplicate Heading Alert')), 'Reports Duplicate Heading Alert');
    assert(report.diagnostics.duplicateHeadingCount! > 0, 'duplicateHeadingCount > 0');
  }

  console.log('\n========================================================================');
  console.log(` PHASE 6E REGRESSION SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase6ETestSuite().catch(err => {
  console.error('Fatal error in Phase 6E test suite:', err);
  process.exit(1);
});
