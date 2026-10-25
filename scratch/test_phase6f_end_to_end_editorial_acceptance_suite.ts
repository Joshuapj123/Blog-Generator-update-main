// scratch/test_phase6f_end_to_end_editorial_acceptance_suite.ts
import assert from 'assert';
import * as zlib from 'zlib';
import { EditorialIntegrityValidator, EditorialIntegrityReport } from '../src/lib/intelligence/EditorialIntegrityValidator';
import { ContentRepairService } from '../src/lib/content/ContentRepairService';
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { ClaimGroundingEngine } from '../src/lib/intelligence/ClaimGroundingEngine';
import { ClaimExtractionService } from '../src/lib/intelligence/ClaimExtractionService';
import { TopicRelevanceValidator } from '../src/lib/intelligence/TopicRelevanceValidator';
import { SectionEvidenceMapper } from '../src/lib/intelligence/SectionEvidenceMapper';
import { ArticleExportService, ExportArticleInput } from '../src/lib/export/ArticleExportService';
import { EvidenceSet, SectionEvidenceMap, EvidenceItem, CanonicalClaim } from '../src/core/contracts/evidence';

console.log('========================================================================');
console.log(' ACUTE — PHASE 6F END-TO-END EDITORIAL ACCEPTANCE & EXPORT SUITE');
console.log(' Deterministic Offline Fixtures | Zero Live Network Calls | 12 Scenarios');
console.log('========================================================================\n');

let passedCount = 0;
let failedCount = 0;

function recordTest(id: string, description: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${id}: ${description}${detail ? ` (${detail})` : ''}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${id}: ${description}${detail ? ` (${detail})` : ''}`);
    failedCount++;
  }
}

// ---------------------------------------------------------------------------
// FIXTURE DATA
// ---------------------------------------------------------------------------

const mobileEvidence1: EvidenceItem = {
  id: 'ev-baymard-cro-1',
  sourceUrl: 'https://baymard.com/blog/mobile-checkout-rate',
  sourceTitle: 'Baymard Institute Checkout Study',
  sourceType: 'COMPETITOR_ANALYSIS' as any,
  evidenceType: 'STATISTIC' as any,
  confidence: 'HIGH' as any,
  claim: 'The average mobile checkout completion rate stands at 32%, with a 68% drop-off rate.',
  entities: ['Baymard Institute', 'Mobile Checkout'],
  topics: ['conversion rate', 'drop-off', 'mobile checkout'],
  citationRequired: true,
  extractedFrom: 'The average mobile checkout completion rate stands at 32%, with a 68% drop-off rate.'
};

const mobileEvidence2: EvidenceItem = {
  id: 'ev-inp-latency-2',
  sourceUrl: 'https://web.dev/vitals/inp',
  sourceTitle: 'Google Web Vitals Documentation',
  sourceType: 'INDUSTRY' as any,
  evidenceType: 'TECHNICAL_SPEC' as any,
  confidence: 'HIGH' as any,
  claim: 'Interaction to Next Paint under 200 milliseconds represents good responsiveness.',
  entities: ['Google', 'INP'],
  topics: ['latency', 'responsiveness', 'INP'],
  citationRequired: true,
  extractedFrom: 'Interaction to Next Paint under 200 milliseconds represents good responsiveness.'
};

const mobileEvidence3: EvidenceItem = {
  id: 'ev-mdn-autofill-3',
  sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete',
  sourceTitle: 'MDN Form Autofill Guide',
  sourceType: 'INDUSTRY' as any,
  evidenceType: 'TECHNICAL_SPEC' as any,
  confidence: 'HIGH' as any,
  claim: 'Browser autofill and dedicated numeric input-mode attributes reduce mobile typing errors by up to 28%.',
  entities: ['autofill', 'input-mode', 'mobile forms', 'mdn'],
  topics: ['autofill', 'mobile forms', 'input-mode'],
  citationRequired: true,
  extractedFrom: 'Browser autofill and dedicated numeric input-mode attributes reduce mobile typing errors by up to 28%.'
};

const baseEvidenceSet: EvidenceSet = {
  items: [mobileEvidence1, mobileEvidence2, mobileEvidence3],
  extractedAt: '2026-10-25T00:00:00.00Z',
  summary: {
    totalCount: 3,
    highConfidenceCount: 3,
    businessFactCount: 0,
    competitorObservationCount: 0,
    serpObservationCount: 0,
    inferenceCount: 0
  } as any
};

const baseSaaSProfile = {
  name: 'CartFlow UX',
  url: 'https://cartflow.io',
  targetAudience: 'E-commerce Directors and Technical Leaders',
  primaryValueProp: 'Mobile checkout optimization engine',
  keyFeatures: ['Automated form optimization', 'One-tap checkout integration', 'Real-time funnel analytics']
};

// ---------------------------------------------------------------------------
// SCENARIO 1: Normal on-topic informational article with supported factual claims
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 1: Normal On-Topic Article with Supported Factual Claims ---');
{
  const sectionContent = `## Measuring Mobile Form Usability

Mobile checkout friction is a primary barrier in e-commerce workflows. According to Baymard Institute Checkout Study, the average mobile checkout completion rate stands at 32%, with a 68% drop-off rate due to complex forms. Furthermore, technical documentation shows that interaction to next paint under 200 milliseconds represents good responsiveness.

To mitigate these losses, engineering teams must streamline touch target spacing and reduce redundant input requirements.`;

  const sectionMap: SectionEvidenceMap = {
    sectionId: 'sec_01',
    heading: 'Measuring Mobile Form Usability',
    intent: 'INFORMATIONAL' as any,
    evidenceIds: ['ev-baymard-cro-1', 'ev-inp-latency-2'],
    requiredEntities: [],
    targetBusinessFacts: [],
    claimConstraints: [],
    prohibitedClaims: []
  };

  const report = EditorialIntegrityValidator.validateEditorialIntegrity(sectionContent, {
    evidenceSet: baseEvidenceSet,
    sectionEvidenceMaps: [sectionMap],
    targetKeyword: 'mobile conversion rates',
    targetBrand: 'CartFlow UX'
  });

  recordTest('SC1.1', 'On-topic article passes editorial integrity validation', report.passed);
  recordTest('SC1.2', 'Zero critical errors flagged on supported text', report.criticalErrors.length === 0);
  recordTest('SC1.3', 'Factual claims are mapped and supported', report.diagnostics.unsupportedNumericalCount === 0);

  const exportInput: ExportArticleInput = {
    title: 'How to Improve Mobile Conversion Rates Through Better UX',
    bodyMarkdown: sectionContent,
    targetBrand: 'CartFlow UX',
    saasProfile: baseSaaSProfile,
    metadata: { intent: 'Guide', targetKeywords: ['mobile conversion rates'] }
  };

  const validation = ArticleExportService.validateBeforeExport(exportInput);
  recordTest('SC1.4', 'Pre-export validation permits clean article', validation.canExport);
}

// ---------------------------------------------------------------------------
// SCENARIO 2: Technical article with legitimate recommendations & evidence
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 2: Technical Article with Legitimate Recommendations & Evidence ---');
{
  const sectionContent = `## Mobile Form Field Architecture and Tap Targets

When building mobile checkout flows, teams should adopt single-column layouts to minimize visual scanning overhead. We recommend setting minimum touch targets to 48 by 48 density-independent pixels.

Research confirms that browser autofill and dedicated numeric input-mode attributes reduce mobile typing errors by up to 28%. We strongly suggest implementing credit card autocomplete tokens across all payment fields.`;

  const sectionMap: SectionEvidenceMap = {
    sectionId: 'sec_02',
    heading: 'Mobile Form Field Architecture and Tap Targets',
    intent: 'TECHNICAL' as any,
    evidenceIds: ['ev-mdn-autofill-3'],
    requiredEntities: [],
    targetBusinessFacts: [],
    claimConstraints: [],
    prohibitedClaims: []
  };

  const report = EditorialIntegrityValidator.validateEditorialIntegrity(sectionContent, {
    evidenceSet: baseEvidenceSet,
    sectionEvidenceMaps: [sectionMap],
    targetKeyword: 'mobile conversion rates',
    targetBrand: 'CartFlow UX'
  });

  recordTest('SC2.1', 'Technical recommendations are distinguished from empirical claims', report.passed);
  recordTest('SC2.2', 'Prescriptive advice does not trigger false unsupported claim flags', report.diagnostics.unsupportedNumericalCount === 0);
  recordTest('SC2.3', 'Supported empirical claim retains evidence link', report.criticalErrors.length === 0);
}

// ---------------------------------------------------------------------------
// SCENARIO 3: Topic likely to trigger irrelevant outline gaps or section drift
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 3: Irrelevant Outline Gap & Section Drift Detection ---');
{
  const driftedCandidateGap = 'Agency Staffing Models vs Dedicated Engineering Squads';
  const driftResult = TopicRelevanceValidator.evaluateCandidateGap(driftedCandidateGap, 'mobile conversion rates');
  recordTest('SC3.1', 'TopicRelevanceValidator flags off-topic candidate gap', Boolean(driftResult));

  const driftedArticleMarkdown = `## Delivery Model & Developer Retention Matrix

Building an offshore software team requires managing developer retention and contractor burnout. Agency retainers fail when technical compensation benchmarks are ignored.`;

  const driftReport = EditorialIntegrityValidator.validateEditorialIntegrity(driftedArticleMarkdown, {
    evidenceSet: baseEvidenceSet,
    targetKeyword: 'mobile conversion rates',
    targetBrand: 'CartFlow UX'
  });

  recordTest('SC3.2', 'EditorialIntegrityValidator detects drifted section heading', !driftReport.passed);
  recordTest('SC3.3', 'Drift report flags TOPIC_DRIFT issue type', driftReport.issues.some(i => i.type === 'TOPIC_DRIFT'));
  recordTest('SC3.4', 'Critical error explicitly cites topic drift alert', driftReport.criticalErrors.some(e => e.includes('Topic Drift Alert')));
}

// ---------------------------------------------------------------------------
// SCENARIO 4: Article containing contradictory or unsupported quantitative claims
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 4: Contradictory & Unsupported Quantitative Claims ---');
{
  // A: Contradictory claim (Claim says 89% when evidence says 32%)
  const claimContradicted: CanonicalClaim = {
    id: 'claim-scenario-4a',
    sectionIndex: 0,
    sectionHeading: 'Checkout Usability',
    sentence: 'Checkout completion jumped by 89% after removing secondary buttons.',
    claimText: 'Checkout completion jumped by 89% after removing secondary buttons.',
    claimType: 'QUANTITATIVE',
    quantitativeValue: { raw: '89%', normalizedNumber: 89, unit: '%' },
    confidence: 0.9,
    materiality: 'CRITICAL',
    supportStatus: 'UNSUPPORTED',
    groundedEvidenceIds: []
  };
  const evalContradiction = ClaimGroundingEngine.groundSingleClaim(claimContradicted, [mobileEvidence1]);
  recordTest('SC4.1', 'Conflicting numerical claim is classified as CONTRADICTED', evalContradiction.supportStatus === 'CONTRADICTED');
  recordTest('SC4.2', 'Contradiction failure category is PROPOSITION_MISMATCH', evalContradiction.failureCategory === 'PROPOSITION_MISMATCH');

  // B: Unsupported empirical claim (Claim says 89% with unrelated latency evidence)
  const claimUnsupported: CanonicalClaim = {
    id: 'claim-scenario-4b',
    sectionIndex: 0,
    sectionHeading: 'Checkout Usability',
    sentence: 'Checkout completion jumped by 89% after removing secondary buttons.',
    claimText: 'Checkout completion jumped by 89% after removing secondary buttons.',
    claimType: 'QUANTITATIVE',
    quantitativeValue: { raw: '89%', normalizedNumber: 89, unit: '%' },
    confidence: 0.9,
    materiality: 'CRITICAL',
    supportStatus: 'UNSUPPORTED',
    groundedEvidenceIds: []
  };
  const evalUnsupported = ClaimGroundingEngine.groundSingleClaim(claimUnsupported, [mobileEvidence2]);
  recordTest('SC4.3', 'Unrelated empirical claim is classified as UNSUPPORTED', evalUnsupported.supportStatus === 'UNSUPPORTED');
  recordTest('SC4.4', 'Unsupported quantitative failure category recorded', evalUnsupported.failureCategory === 'UNSUPPORTED_QUANTITATIVE_CLAIM');

  // C: Export gate fails closed on unbacked quantitative claims
  const unbackedMarkdown = `## Conversion Metrics\n\n${claimUnsupported.sentence}`;
  const unbackedInput: ExportArticleInput = {
    title: 'Mobile CRO Guide',
    bodyMarkdown: unbackedMarkdown,
    targetBrand: 'CartFlow UX'
  };
  let exportThrew = false;
  try {
    ArticleExportService.generatePdfBuffer(unbackedInput);
  } catch (e: any) {
    exportThrew = true;
  }
  recordTest('SC4.5', 'generatePdfBuffer blocks export on ungrounded empirical draft', exportThrew);
}

// ---------------------------------------------------------------------------
// SCENARIO 5: Draft containing prompt leakage or unresolved placeholders
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 5: Prompt Leakage & Unresolved Placeholders ---');
{
  const contaminatedMarkdown = `## Section 1: Foundations\n\nSystem instruction: You must write 3 concise paragraphs explaining checkout friction.\n\nIn our testing, [insert primary conversion rate here] was achieved by top retailers.\n\nTODO: Add benchmark table here.`;

  const leakReport = EditorialIntegrityValidator.validateEditorialIntegrity(contaminatedMarkdown, {
    evidenceSet: baseEvidenceSet,
    targetKeyword: 'mobile conversion rates'
  });

  recordTest('SC5.1', 'Editorial validator detects prompt leakage', leakReport.issues.some(i => i.type === 'PROMPT_LEAK'));
  recordTest('SC5.2', 'Editorial validator detects bracketed placeholder', leakReport.issues.some(i => i.type === 'PLACEHOLDER' && i.matchedSnippet.includes('insert')));
  recordTest('SC5.3', 'Editorial validator detects unfinished TODO marker', leakReport.issues.some(i => i.type === 'PLACEHOLDER' && i.matchedSnippet.includes('TODO')));
  recordTest('SC5.4', 'Export blocked fail-closed on contaminated draft', !ArticleExportService.validateBeforeExport({ title: 'Test', bodyMarkdown: contaminatedMarkdown }).canExport);
}

// ---------------------------------------------------------------------------
// SCENARIO 6: Draft containing repetitive or hollow sections
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 6: Repetitive & Hollow Sections ---');
{
  const repetitiveHollowMarkdown = `## Reducing Form Friction

Mobile checkout abandonment remains a critical challenge for modern e-commerce retailers across global digital storefronts. Optimizing touch targets and simplifying payment inputs can systematically recover lost revenue.

## Addressing Checkout Friction

Mobile checkout abandonment remains a critical challenge for modern e-commerce retailers across global digital storefronts. When shoppers encounter multi-page checkout flows, frustration escalates rapidly.

## Advanced Implementation Guidelines

More tips coming soon.`;

  const report = EditorialIntegrityValidator.validateEditorialIntegrity(repetitiveHollowMarkdown, {
    evidenceSet: baseEvidenceSet,
    targetKeyword: 'mobile conversion rates'
  });

  recordTest('SC6.1', 'Adjacent section repetition detected via Jaccard similarity', report.issues.some(i => i.type === 'ADJACENT_SECTION_REPETITION'));
  recordTest('SC6.2', 'Hollow section under 10 words is detected', report.issues.some(i => i.type === 'HOLLOW_SECTION'));
  recordTest('SC6.3', 'Repetitive/hollow draft fails editorial validation', !report.passed);
}

// ---------------------------------------------------------------------------
// SCENARIO 7: Valid article requiring zero repairs
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 7: Valid Article Requiring Zero Repairs ---');
{
  const cleanArticleMarkdown = `## Strategic Overview of Mobile CRO

Mobile checkout abandonment directly affects annual e-commerce performance. According to Baymard Institute Checkout Study, the average mobile checkout completion rate stands at 32%, with a 68% drop-off rate due to complex multi-step forms.

## Tactical Technical Optimization

Engineering teams should enforce strict responsiveness baselines across checkout templates. Interaction to next paint under 200 milliseconds represents good responsiveness across all mobile browsers.

## Form Interaction Standards

Setting minimum touch targets to 48 by 48 pixels prevents mis-taps on compact mobile screens. Browser autofill and dedicated numeric input-mode attributes reduce mobile typing errors by up to 28%.`;

  const sectionMaps: SectionEvidenceMap[] = [
    { sectionId: 'sec_01', heading: 'Strategic Overview of Mobile CRO', intent: 'INFORMATIONAL' as any, evidenceIds: ['ev-baymard-cro-1'], requiredEntities: [], targetBusinessFacts: [], claimConstraints: [], prohibitedClaims: [] },
    { sectionId: 'sec_02', heading: 'Tactical Technical Optimization', intent: 'TECHNICAL' as any, evidenceIds: ['ev-inp-latency-2'], requiredEntities: [], targetBusinessFacts: [], claimConstraints: [], prohibitedClaims: [] },
    { sectionId: 'sec_03', heading: 'Form Interaction Standards', intent: 'BEST_PRACTICE' as any, evidenceIds: ['ev-mdn-autofill-3'], requiredEntities: [], targetBusinessFacts: [], claimConstraints: [], prohibitedClaims: [] }
  ];

  const validation = EditorialIntegrityValidator.validateEditorialIntegrity(cleanArticleMarkdown, {
    evidenceSet: baseEvidenceSet,
    sectionEvidenceMaps: sectionMaps,
    targetKeyword: 'mobile conversion rates',
    targetBrand: 'CartFlow UX'
  });

  recordTest('SC7.1', 'Clean article passes validation directly', validation.passed);
  recordTest('SC7.2', 'Zero critical errors on clean draft', validation.criticalErrors.length === 0);
  recordTest('SC7.3', 'Export validation succeeds with canExport: true', ArticleExportService.validateBeforeExport({
    title: 'Clean Mobile CRO Guide',
    bodyMarkdown: cleanArticleMarkdown,
    targetBrand: 'CartFlow UX'
  }).canExport);
}

// ---------------------------------------------------------------------------
// SCENARIO 8: Draft requiring safe localized repair
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 8: Safe Localized Repair of Contaminated Draft ---');
{
  const contaminatedInput = `## Mobile Optimization Guidelines

Simplifying mobile checkout input fields improves completion velocity.

In today's fast-paced digital world, staying ahead of the curve is crucial. [insert metrics here] ![prohibited diagram](diagram.png)

Engineering leaders should implement autofill attributes to eliminate manual keyboard input.`;

  const repairResult = ContentRepairService.repairEditorialContamination(contaminatedInput);

  recordTest('SC8.1', 'Localized repair modifies contaminated text', repairResult.repairedCount > 0);
  recordTest('SC8.2', 'Repair count increments for stripped tokens', repairResult.repairedCount >= 3);
  recordTest('SC8.3', 'Paragraph 1 survives 100% intact', repairResult.repairedMarkdown.includes('Simplifying mobile checkout input fields'));
  recordTest('SC8.4', 'Paragraph 3 survives 100% intact', repairResult.repairedMarkdown.includes('Engineering leaders should implement autofill'));
  recordTest('SC8.5', 'Prohibited markdown image is surgically removed', !repairResult.repairedMarkdown.includes('![prohibited diagram]'));
  recordTest('SC8.6', 'Bracketed placeholder is surgically removed', !repairResult.repairedMarkdown.includes('[insert metrics here]'));
  recordTest('SC8.7', 'Generic corporate fluff sentence is stripped', !repairResult.repairedMarkdown.includes("In today's fast-paced"));
}

// ---------------------------------------------------------------------------
// SCENARIO 9: Draft with unrepairable critical integrity defect
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 9: Unrepairable Critical Integrity Defect ---');
{
  const fabricatedEvidenceMarkdown = `## Fraudulent Evidence Case

According to our verified audit, enterprise conversion jumps by 400% immediately.`;

  const fabricatedSectionMap: SectionEvidenceMap = {
    sectionId: 'sec_09',
    heading: 'Fraudulent Evidence Case',
    intent: 'CASE_STUDY' as any,
    evidenceIds: ['ev_nonexistent_999'], // Fabricated ID
    requiredEntities: [],
    targetBusinessFacts: [],
    claimConstraints: [],
    prohibitedClaims: []
  };

  const integrityReport = EditorialIntegrityValidator.validateEditorialIntegrity(fabricatedEvidenceMarkdown, {
    evidenceSet: baseEvidenceSet,
    sectionEvidenceMaps: [fabricatedSectionMap],
    targetKeyword: 'mobile conversion rates'
  });

  recordTest('SC9.1', 'Fabricated evidence ID is caught by validator', !integrityReport.passed);
  recordTest('SC9.2', 'Issue type is explicitly FABRICATED_EVIDENCE_ID', integrityReport.issues.some(i => i.type === 'FABRICATED_EVIDENCE_ID'));
  recordTest('SC9.3', 'Fabricated attribution diagnostic count is recorded', integrityReport.diagnostics.fabricatedEvidenceIdCount! > 0);

  const exportCheck = ArticleExportService.validateBeforeExport({
    title: 'Fabricated Test',
    bodyMarkdown: fabricatedEvidenceMarkdown,
    targetBrand: 'CartFlow UX',
    evidenceSet: baseEvidenceSet,
    sectionEvidenceMaps: [fabricatedSectionMap]
  });
  recordTest('SC9.4', 'Export service blocks unrepairable fabricated attribution', !exportCheck.canExport);

  // SC9.5: Direct array evidenceSet correctly enforces attribution validation
  const directArrayReport = EditorialIntegrityValidator.validateEditorialIntegrity(
    '## Unverified Citation\n\nAccording to Phantom Research Group, adoption is high.',
    {
      evidenceSet: [baseEvidenceSet.items[0]] as any,
      targetKeyword: 'mobile conversion rates'
    }
  );
  recordTest('SC9.5', 'Direct array evidenceSet correctly catches unverified source citation', !directArrayReport.passed && directArrayReport.issues.some(i => i.type === 'UNVERIFIED_ATTRIBUTION'));
}

// ---------------------------------------------------------------------------
// SCENARIO 10: Article with empty or incomplete research evidence
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 10: Empty or Incomplete Research Evidence ---');
{
  const claimEmpty: CanonicalClaim = {
    id: 'claim-scenario-10',
    sectionIndex: 0,
    sectionHeading: 'Checkout Usability',
    sentence: 'Mobile revenue increased by 45.2% following one-click checkout rollout.',
    claimText: 'Mobile revenue increased by 45.2% following one-click checkout rollout.',
    claimType: 'QUANTITATIVE',
    quantitativeValue: { raw: '45.2%', normalizedNumber: 45.2, unit: '%' },
    confidence: 0.9,
    materiality: 'CRITICAL',
    supportStatus: 'UNSUPPORTED',
    groundedEvidenceIds: []
  };
  const evalResult = ClaimGroundingEngine.groundSingleClaim(claimEmpty, []);

  recordTest('SC10.1', 'Empirical claim against empty evidence evaluates as UNSUPPORTED', evalResult.supportStatus === 'UNSUPPORTED');
  recordTest('SC10.2', 'Failure category denotes unsupported quantitative claim', evalResult.failureCategory === 'UNSUPPORTED_QUANTITATIVE_CLAIM');
  recordTest('SC10.3', 'Empty evidence set does not throw runtime exception', true);
}

// ---------------------------------------------------------------------------
// SCENARIO 11: Valid text-only article with no images or placeholders
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 11: Text-First Invariant (Zero Images & Placeholders) ---');
{
  const textFirstMarkdown = `## The Case for Lean Checkout UX

Speed and clarity drive mobile transactions. When forms demand minimal interaction, cognitive friction drops significantly.

## Touch Interface Diagnostics

Thumb-driven navigation requires wide, well-separated interactive buttons. Keeping essential inputs above the fold maximizes completion rates without distracting visual elements.`;

  const report = EditorialIntegrityValidator.validateEditorialIntegrity(textFirstMarkdown, {
    evidenceSet: baseEvidenceSet,
    targetKeyword: 'mobile conversion rates'
  });

  recordTest('SC11.1', 'Pure text article passes editorial validation cleanly', report.passed);
  recordTest('SC11.2', 'Zero image requirements or image placeholder errors', report.criticalErrors.length === 0);

  // Negative test: inject image tag into text-first article
  const imageContaminated = `${textFirstMarkdown}\n\n![Checkout Chart](/images/chart.png)`;
  const negReport = EditorialIntegrityValidator.validateEditorialIntegrity(imageContaminated, {
    evidenceSet: baseEvidenceSet,
    targetKeyword: 'mobile conversion rates'
  });
  recordTest('SC11.3', 'Markdown image in text-first article triggers image prohibition alert', !negReport.passed);
  recordTest('SC11.4', 'Prohibition issue type is IMAGE_PLACEHOLDER', negReport.issues.some(i => i.type === 'IMAGE_PLACEHOLDER'));
}

// ---------------------------------------------------------------------------
// SCENARIO 12: Complete article HTML and PDF output comparison
// ---------------------------------------------------------------------------
console.log('\n--- SCENARIO 12: Complete Article HTML & PDF Output Comparison ---');
{
  const comprehensiveArticleMarkdown = `## Mobile Checkout Performance Overview

Mobile conversion rates lag desktop counterparts across enterprise commerce. According to Baymard Institute Checkout Study, the average mobile checkout completion rate stands at 32%, with a 68% drop-off rate due to complex forms.

## Core Web Vitals and Page Latency

Performance baselines govern checkout funnel drop-off. Technical diagnostics confirm that interaction to next paint under 200 milliseconds represents good responsiveness.

### Essential Usability Requirements

To systematically mitigate mobile friction, teams should adhere to the following core practices:

* Enforce minimum touch target dimensions of 48 by 48 density-independent pixels
* Provide clear visual labels above form inputs rather than disappearing hint text
* Enable browser autofill and specialized mobile numeric keyboards on payment fields

## Comparative Benchmark Summary

| Optimization Area | Baseline Friction | Recommended Implementation | Expected Conversion Impact |
| :--- | :--- | :--- | :--- |
| Form Fields | 6+ required fields | 3 essential fields with autofill | +12% completion velocity |
| Tap Targets | 32px targets | 48px spaced tap zones | -24% miss-tap frustration |
| Payment Integration | Manual card entry | One-tap digital wallets | +18% mobile conversion |

For official documentation on input attributes, review the [MDN Web Docs Form Guide](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete).`;

  const comprehensiveInput: ExportArticleInput = {
    title: 'Mastering Mobile Conversion Rates Through Systematic UX Optimization',
    slug: 'mastering-mobile-conversion-rates',
    bodyMarkdown: comprehensiveArticleMarkdown,
    targetBrand: 'CartFlow UX',
    saasProfile: baseSaaSProfile,
    metadata: {
      intent: 'Comprehensive Guide',
      author: 'ACUTE Editorial Engineering',
      targetKeywords: ['mobile conversion rates', 'checkout UX']
    }
  };

  // 1. Pre-export validation
  const exportValidation = ArticleExportService.validateBeforeExport(comprehensiveInput);
  recordTest('SC12.1', 'Comprehensive article passes pre-export validation gate', exportValidation.canExport);

  // 2. HTML Export Verification
  const standaloneHtml = ArticleExportService.generateStandaloneHtml(comprehensiveInput);
  recordTest('SC12.2', 'Standalone HTML contains valid HTML5 doctype', standaloneHtml.includes('<!DOCTYPE html>'));
  recordTest('SC12.3', 'Standalone HTML includes article title in H1', standaloneHtml.includes('Mastering Mobile Conversion Rates'));
  recordTest('SC12.4', 'Standalone HTML preserves H2 section headings', standaloneHtml.includes('Mobile Checkout Performance Overview') && standaloneHtml.includes('Core Web Vitals and Page Latency'));
  recordTest('SC12.5', 'Standalone HTML preserves H3 subheadings', standaloneHtml.includes('Essential Usability Requirements'));
  recordTest('SC12.6', 'Standalone HTML renders structured table', standaloneHtml.includes('<table') && standaloneHtml.includes('Optimization Area') && standaloneHtml.includes('Baseline Friction'));
  recordTest('SC12.7', 'Standalone HTML renders unordered list items', standaloneHtml.includes('<ul') && standaloneHtml.includes('<li'));
  recordTest('SC12.8', 'Standalone HTML preserves external hyperlink', standaloneHtml.includes('href="https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete"') && standaloneHtml.includes('MDN Web Docs Form Guide'));
  recordTest('SC12.9', 'Zero unresolved placeholders or prompt leaks in exported HTML', !standaloneHtml.includes('[insert') && !standaloneHtml.includes('System instruction:'));

  // 3. PDF Export Verification
  const pdfBuffer = ArticleExportService.generatePdfBuffer(comprehensiveInput);
  recordTest('SC12.10', 'PDF buffer generated with substantial byte size (> 8,000 bytes)', Boolean(pdfBuffer && pdfBuffer.length > 8000), `Size: ${pdfBuffer ? pdfBuffer.length : 0} bytes`);

  const pdfStringLatin1 = Buffer.from(pdfBuffer).toString('latin1');
  recordTest('SC12.11', 'Valid PDF header signature (%PDF-1.x)', pdfStringLatin1.startsWith('%PDF-1.'));

  // Decompress PDF stream objects to verify readable extracted text
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  let decompressedPdfText = '';
  while ((match = streamRegex.exec(pdfStringLatin1)) !== null) {
    try {
      const raw = Buffer.from(match[1], 'binary');
      decompressedPdfText += zlib.inflateSync(raw).toString('utf8') + '\n';
    } catch {
      decompressedPdfText += match[1] + '\n';
    }
  }

  recordTest('SC12.12', 'PDF decompressed streams contain article title', decompressedPdfText.includes('Mastering Mobile Conversion Rates'));
  recordTest('SC12.13', 'PDF decompressed streams contain H2 section heading', decompressedPdfText.includes('Mobile Checkout Performance Overview'));
  recordTest('SC12.14', 'PDF decompressed streams contain technical metric content', decompressedPdfText.includes('200 milliseconds') || decompressedPdfText.includes('32%'));
  recordTest('SC12.15', 'PDF decompressed streams contain table headers and row items', decompressedPdfText.includes('Optimization Area') && decompressedPdfText.includes('Form Fields'));
  recordTest('SC12.16', 'PDF decompressed streams contain list items', decompressedPdfText.includes('touch target') || decompressedPdfText.includes('48 by 48'));
  recordTest('SC12.17', 'Zero unresolved placeholders detected in PDF streams', !decompressedPdfText.includes('[insert') && !decompressedPdfText.includes('TODO:'));
}

// ---------------------------------------------------------------------------
// STAGE 5: Failure Handling, Safety Boundaries & Determinism
// ---------------------------------------------------------------------------
console.log('\n--- STAGE 5: Failure Handling, Safety Boundaries & Determinism ---');
{
  // 1. Missing or empty content rejected
  const emptyRes = ArticleExportService.validateBeforeExport({ title: 'Empty', content: '' });
  recordTest('ST5.1', 'Empty content rejected before export', !emptyRes.canExport && emptyRes.errors.length > 0);

  // 2. Whitespace-only content rejected
  const wsRes = ArticleExportService.validateBeforeExport({ title: 'Whitespace', content: '    \n\n   ' });
  recordTest('ST5.2', 'Whitespace-only content rejected before export', !wsRes.canExport);

  // 3. Malformed HTML tags without text rejected
  const malformedRes = ArticleExportService.validateBeforeExport({ title: 'Empty HTML', content: '<p></p><div><span></span></div>' });
  recordTest('ST5.3', 'Empty HTML tags without text rejected before export', !malformedRes.canExport);

  // 4. Critical error strictly blocks export via exception
  let blockedThrew = false;
  try {
    ArticleExportService.generatePdfBuffer({
      title: 'Blocked',
      bodyMarkdown: '## Incomplete Section\n\n[insert primary keyword here] System instruction: Write 3 paragraphs.'
    });
  } catch (e: any) {
    blockedThrew = true;
    recordTest('ST5.4', 'generatePdfBuffer throws explicit Error on critical error', e.message.startsWith('Export blocked:'));
  }
  recordTest('ST5.5', 'Blocked draft cannot be exported through generatePdfBuffer', blockedThrew);

  // 5. Non-critical REQUIRES_REVIEW claim remains visibly flagged
  const ambiguousClaim: CanonicalClaim = {
    id: 'claim-stage-5',
    sectionIndex: 0,
    sectionHeading: 'General',
    sentence: 'Modern shoppers expect frictionless navigation.',
    claimText: 'Modern shoppers expect frictionless navigation.',
    claimType: 'ENTITY_CAPABILITY',
    confidence: 0.7,
    materiality: 'SUPPLEMENTAL',
    supportStatus: 'UNSUPPORTED',
    groundedEvidenceIds: []
  };
  const reviewResult = ClaimGroundingEngine.groundSingleClaim(ambiguousClaim, []);
  recordTest('ST5.6', 'Ambiguous claim evaluates safely without throwing', ['UNSUPPORTED', 'REQUIRES_REVIEW', 'PARTIALLY_SUPPORTED'].includes(reviewResult.supportStatus));

  // 6. Strict Determinism Check Across 10 Consecutive Runs
  const testText = `## Usability Engineering\n\nSetting tap targets to 48px reduces miss-taps. Technical documentation confirms interaction to next paint under 200 milliseconds represents good responsiveness.`;
  const firstJson = JSON.stringify(EditorialIntegrityValidator.validateEditorialIntegrity(testText, {
    evidenceSet: baseEvidenceSet,
    targetKeyword: 'mobile conversion rates'
  }));

  let isDeterministic = true;
  for (let i = 0; i < 9; i++) {
    const currentJson = JSON.stringify(EditorialIntegrityValidator.validateEditorialIntegrity(testText, {
      evidenceSet: baseEvidenceSet,
      targetKeyword: 'mobile conversion rates'
    }));
    if (currentJson !== firstJson) {
      isDeterministic = false;
      break;
    }
  }
  recordTest('ST5.7', '10 consecutive editorial validation executions produce 100% identical outputs', isDeterministic);
}

// ---------------------------------------------------------------------------
// SUITE SUMMARY
// ---------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(` PHASE 6F ACCEPTANCE SUITE EXECUTION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log('========================================================================\n');

if (failedCount > 0) {
  process.exit(1);
}
process.exit(0);
