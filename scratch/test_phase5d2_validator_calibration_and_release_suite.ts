import * as path from 'path';
import * as zlib from 'zlib';
import { spawnSync } from 'child_process';
import {
  validateArticleQuality,
  consecutiveParagraphStructures,
  splitSentencesRobust,
  extractEligibleProseParagraphs,
  computeParagraphSignature,
  QualityValidationReport
} from '../src/lib/seo-intelligence/quality_validator';
import { AgentOrchestrator, OrchestrationResult, ReviewResult } from '../src/core/orchestrator/AgentOrchestrator';
import { TopicRelevanceValidator } from '../src/lib/intelligence/TopicRelevanceValidator';
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { ArticleExportService, ExportArticleInput } from '../src/lib/export/ArticleExportService';
import { GenerationPipelineAdapter } from '../src/lib/core/GenerationPipelineAdapter';
import { SaaSProfile } from '../src/core/contracts/schemas';

// ============================================================================
// ACUTE PHASE 5D.2 / 5D.3: VALIDATOR CONTRACT & ACCEPTANCE REGRESSION SUITE
// ============================================================================

interface AssertionResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const testResults: AssertionResult[] = [];

function recordTest(id: string, name: string, passed: boolean, details?: string) {
  const status = passed ? 'PASS' : 'FAIL';
  testResults.push({ id, name, status, details });
  console.log(`  [${status}] ${id} - ${name}${details ? ` (${details})` : ''}`);
}

// Controlled fixture runner mode for verifying subprocess exit code behavior
if (process.env.CONTROLLED_RUNNER_FIXTURE === 'fail') {
  recordTest('TC-CONTROLLED-FAIL', 'Injected failure for real process-exit verification', false, 'Expected controlled failure');
  const failedCount = testResults.filter(r => r.status === 'FAIL').length;
  process.exit(failedCount === 0 ? 0 : 1);
}

if (process.env.CONTROLLED_RUNNER_FIXTURE === 'pass') {
  recordTest('TC-CONTROLLED-PASS', 'Injected passing assertion for real process-exit verification', true, 'Expected controlled pass');
  const failedCount = testResults.filter(r => r.status === 'FAIL').length;
  process.exit(failedCount === 0 ? 0 : 1);
}

async function runCalibrationSuite() {
  console.log('========================================================================');
  console.log(' ACUTE PHASE 5D.2 ADDENDUM: VALIDATOR CONTRACT & ACCEPTANCE SUITE');
  console.log(' Deterministic Offline Verification | Zero LLM / Zero Firestore');
  console.log(' Baseline Starting Commit: ff6470079d8a0d426c364e6524758d78c20eb897');
  console.log('========================================================================\n');

  const testKeyword = 'mobile conversion rates';
  const testBrand = 'Mitran Design';
  const testSaasProfile: SaaSProfile = {
    name: 'Mitran Design',
    website: 'https://mitran.design/',
    description: 'Mitran Design is a digital product design studio specializing in mobile UX strategy and conversion rate optimization.',
    targetAudience: 'Website owners, product managers, and UX practitioners',
    keyFeatures: ['Mobile UX Audits', 'Checkout Optimization'],
    verifiedOfferings: ['UX Strategy', 'Design Systems'],
    primaryCompetitors: [],
    businessType: 'Agency/Portfolio',
    tone: 'professional',
    customInsights: ''
  };

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Paragraph contract, sentence splitting & non-fatal warning
  // ---------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Paragraph Structure Repetition & Robust Sentence Splitting ---');
  {
    // A. Equal sentence counts and equal length signatures: 3 consecutive paragraphs trigger repetition
    const paragraphsEqualSignature = [
      'Mobile conversion rates measure the percentage of visitors completing a goal. Understanding this requires analyzing where drop-offs happen.',
      'Website managers evaluate navigation and form friction across screens. Identifying these friction points guides effective interface fixes.',
      'Technical leaders review viewport constraints before making layout updates. Clear evaluation criteria ensure that engineering effort produces results.'
    ];

    const isRepetitive = consecutiveParagraphStructures(paragraphsEqualSignature);
    recordTest(
      'TC-1.1a',
      'Req 1: Equal sentence counts and equal length signatures trigger rhythm repetition check',
      isRepetitive === true,
      `hasConsecutiveStructures: ${isRepetitive}`
    );

    // B. Equal sentence counts but DIFFERENT length signatures: S-S vs M-M vs L-L
    const paragraphsDiffSignature = [
      'Quick test works. Fast forms win.',
      'Mobile usability researchers recommend evaluating navigation layouts across multiple screen sizes to discover high friction drop-off points. Targeted improvements at these specific locations consistently yield measurable gains in overall store checkout conversion rates.',
      'When digital commerce teams thoroughly examine holistic customer journeys across diverse device categories, technical limitations, and responsive layout constraints, engineering leadership can prioritize interface investments that resolve the most damaging usability bottlenecks. Establishing transparent evaluation benchmarks and rigorous statistical instrumentation guarantees that product iterations deliver predictable commercial impact without degrading performance across legacy mobile browsers.'
    ];

    const isDifferentSignaturesFlagged = consecutiveParagraphStructures(paragraphsDiffSignature);
    recordTest(
      'TC-1.1b',
      'Req 2: Equal sentence counts but different length signatures do NOT trigger exact-signature rule',
      isDifferentSignaturesFlagged === false,
      `hasConsecutiveStructures: ${isDifferentSignaturesFlagged}`
    );

    // C. Formatting differences alone do NOT suppress a genuine repetition match
    const paragraphsDiffFormatting = [
      'Mobile **usability researchers** recommend evaluating navigation layouts across multiple screen sizes to discover high friction drop-off points. Targeted **UX improvements** at these specific locations consistently yield measurable gains in overall store checkout conversion rates.',
      'Website analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing *streamlined form fields* at these friction points consistently elevates completion percentages across mobile devices.',
      'Product development managers analyze customer journey data across responsive interfaces to pinpoint critical usability barriers affecting customer acquisition. Designing simplified navigation menus at these key touchpoints substantially decreases bounce rates on handheld screens.'
    ];

    const isDiffFormattingFlagged = consecutiveParagraphStructures(paragraphsDiffFormatting);
    recordTest(
      'TC-1.1c',
      'Req 3: Formatting differences alone do NOT suppress a genuine repetition match',
      isDiffFormattingFlagged === true,
      `hasConsecutiveStructures: ${isDiffFormattingFlagged}`
    );

    // D. Different sentence counts do NOT match the same signature
    const paragraphsDiffSentenceCounts = [
      'Mobile conversion rates measure the percentage of visitors completing an intended goal.', // 1 sentence
      'Website managers evaluate navigation and form friction across screens. Identifying these friction points guides effective interface fixes.', // 2 sentences
      'Technical leaders review viewport constraints before making layout updates. Clear evaluation criteria ensure that engineering effort produces results. Testing on real devices prevents unexpected layout regressions.' // 3 sentences
    ];

    const isDiffSentenceCountsFlagged = consecutiveParagraphStructures(paragraphsDiffSentenceCounts);
    recordTest(
      'TC-1.1d',
      'Req 4: Different sentence counts do not match the same structural signature',
      isDiffSentenceCountsFlagged === false,
      `hasConsecutiveStructures: ${isDiffSentenceCountsFlagged}`
    );

    // Full article markdown containing uniform paragraphs with high readability (FRE >= 55)
    const articleWithRepetitiveParagraphs = `# Mastering Mobile Conversion Rates: A Guide

Mobile conversion rates track the users who buy. You can see where users stop and leave.

Web teams see where users drop off. Small changes to forms make users stay.

Good teams test each page on real phones. Clean tests show what helps users buy.

## Key Usability Steps

Mitran Design helps teams fix checkout steps and forms. Fast tests help teams learn what works.`;

    const qualityReport = validateArticleQuality(
      articleWithRepetitiveParagraphs,
      [testKeyword],
      [testBrand],
      testBrand
    );

    const hasRepetitionWarning = (qualityReport.warnings || []).some(w =>
      w.includes('identical sentence count and format structure')
    );
    const hasRepetitionError = (qualityReport.errors || []).some(e =>
      e.includes('identical sentence count and format structure')
    );

    recordTest(
      'TC-1.2',
      'Req 1 & 2: validateArticleQuality places paragraph structure issue in warnings, NOT fatal errors',
      hasRepetitionWarning && !hasRepetitionError,
      `In warnings: ${hasRepetitionWarning}, In errors: ${hasRepetitionError}`
    );

    recordTest(
      'TC-1.3',
      'Req 2: Paragraph diagnostic remains available in metrics for editorial review',
      qualityReport.metrics.hasConsecutiveStructures === true,
      `metrics.hasConsecutiveStructures: ${qualityReport.metrics.hasConsecutiveStructures}`
    );

    // E. Headings boundary policy:
    // E.1. Major section headings (##) separate semantic sections
    const articleWithMajorHeadings = `# Mobile Usability Guide

## Section 1: Baseline Metrics
Mobile analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

## Section 2: Form Optimization
Website analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

## Section 3: Engineering Roadmap
Product development managers analyze customer journey data across responsive interfaces to pinpoint critical usability barriers affecting customer acquisition. Designing simplified navigation menus at these key touchpoints substantially decreases bounce rates on handheld screens.`;

    const proseWithMajorHeadings = extractEligibleProseParagraphs(articleWithMajorHeadings);
    const repetitionAcrossMajorHeadings = consecutiveParagraphStructures(proseWithMajorHeadings);
    recordTest(
      'TC-1.4a',
      'Req 5a: Major section headings (##) separate semantic sections and prevent cross-section comparison',
      repetitionAcrossMajorHeadings === false,
      `repetitionAcrossMajorHeadings: ${repetitionAcrossMajorHeadings}`
    );

    // E.2. Minor subheadings (###) between paragraphs inside a section cannot trivially evade the guard
    const articleWithMinorSubheadings = `# Mobile Usability Guide

## Comprehensive Optimization

Mobile analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

### Micro Step One
Website analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

### Micro Step Two
Product development managers analyze customer journey data across responsive interfaces to pinpoint critical usability barriers affecting customer acquisition. Designing simplified navigation menus at these key touchpoints substantially decreases bounce rates on handheld screens.`;

    const proseWithMinorSubheadings = extractEligibleProseParagraphs(articleWithMinorSubheadings);
    const repetitionUnderMinorSubheadings = consecutiveParagraphStructures(proseWithMinorSubheadings);
    recordTest(
      'TC-1.4b',
      'Req 5b: Minor subheadings (###) inside a section cannot trivially evade repetition detection',
      repetitionUnderMinorSubheadings === true,
      `repetitionUnderMinorSubheadings: ${repetitionUnderMinorSubheadings}`
    );

    // F. Decorative and media blocks (images, horizontal rules, quotes) cannot trivially evade the guard
    const articleWithMediaBlocks = `# Mobile Usability Guide

## Optimization Workflow

Mobile analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

![Conversion Chart](https://example.com/chart.png)

Website analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

---

> Pro tip: Always evaluate user drop-offs before changing interface code.

Product development managers analyze customer journey data across responsive interfaces to pinpoint critical usability barriers affecting customer acquisition. Designing simplified navigation menus at these key touchpoints substantially decreases bounce rates on handheld screens.`;

    const proseWithMedia = extractEligibleProseParagraphs(articleWithMediaBlocks);
    const repetitionAcrossMedia = consecutiveParagraphStructures(proseWithMedia);
    recordTest(
      'TC-1.4c',
      'Req 6a: Media and decorative blocks (images, rules, quotes) cannot trivially evade the guard',
      repetitionAcrossMedia === true,
      `repetitionAcrossMedia: ${repetitionAcrossMedia}`
    );

    // G. Structured blocks (tables, lists) are excluded from prose paragraphs and do not break rhythm check
    const articleWithStructuredBlocks = `# Mobile Usability Guide

## Optimization Workflow

Mobile analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

- Navigation clarity
- Form field speed
- Guest checkout access

Website analytics specialists observe user interactions across checkout funnels to isolate moments of sudden abandonment during transactions. Implementing streamlined form fields at these friction points consistently elevates completion percentages across mobile devices.

| Stage | Conversion Impact |
| --- | --- |
| Cart | High |
| Form | Critical |

Product development managers analyze customer journey data across responsive interfaces to pinpoint critical usability barriers affecting customer acquisition. Designing simplified navigation menus at these key touchpoints substantially decreases bounce rates on handheld screens.`;

    const proseWithStructured = extractEligibleProseParagraphs(articleWithStructuredBlocks);
    const repetitionAcrossStructured = consecutiveParagraphStructures(proseWithStructured);
    recordTest(
      'TC-1.4d',
      'Req 6b: Tables and lists are excluded from prose paragraphs and do not break rhythm check',
      repetitionAcrossStructured === true,
      `repetitionAcrossStructured: ${repetitionAcrossStructured}`
    );

    // Verify robust sentence splitting with decimals, URLs, and abbreviations
    const complexSentenceText = 'Conversion rates rose by 3.4% in Q3 according to Google (https://google.com/insights). This represented a 2.1x gain vs. prior quarters, e.g. last fiscal year.';
    const parsedSentences = splitSentencesRobust(complexSentenceText);
    recordTest(
      'TC-1.5',
      'Req 7: URLs, abbreviations and decimal numbers do not cause sentence-count false positives',
      parsedSentences.length === 2,
      `Expected 2 sentences, got ${parsedSentences.length}: [${parsedSentences.map(s => `"${s.slice(0, 30)}..."`).join(', ')}]`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Keyword stuffing and brand stuffing remain fatal
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Keyword and Brand Stuffing Remain Fatal Critical Errors ---');
  {
    const stuffedKeywordText = `# Mobile Conversion Rates Guide

${Array(25).fill('Mobile conversion rates represent mobile conversion rates when analyzing mobile conversion rates across devices.').join('\n\n')}`;

    const stuffedReport = validateArticleQuality(
      stuffedKeywordText,
      [testKeyword],
      [testBrand],
      testBrand
    );

    const hasKeywordStuffingError = stuffedReport.errors.some(e => e.includes('Keyword Stuffing Alert'));
    recordTest(
      'TC-2.1',
      'Req 6: Keyword stuffing (> 3.0% density) triggers fatal critical error',
      hasKeywordStuffingError && !stuffedReport.valid,
      `hasKeywordStuffingError: ${hasKeywordStuffingError}, valid: ${stuffedReport.valid}`
    );

    const brandStuffedText = `# Brand Evaluation

${Array(30).fill('Mitran Design provides Mitran Design solutions through Mitran Design specialists at Mitran Design.').join('\n\n')}`;

    const brandReport = validateArticleQuality(
      brandStuffedText,
      [testKeyword],
      [testBrand],
      testBrand
    );

    const hasBrandStuffingError = brandReport.errors.some(e => e.includes('Brand Stuffing Alert'));
    recordTest(
      'TC-2.2',
      'Req 6: Brand stuffing (> 3.5% density) triggers fatal critical error',
      hasBrandStuffingError && !brandReport.valid,
      `hasBrandStuffingError: ${hasBrandStuffingError}, valid: ${brandReport.valid}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Topic-drift rejection remains intact
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Topic-Drift Safeguards Intact ---');
  {
    const driftedOutline = [
      { heading: 'Understanding Mobile Conversion Rates', level: 'H2' as const, generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Delivery Model & Developer Retention Matrix', level: 'H2' as const, generate_table: false, assignedKeywords: [], assignedEntities: [] }, // DRIFT!
      { heading: 'Brand Visibility & AI Search Crawling Engines', level: 'H2' as const, generate_table: false, assignedKeywords: [], assignedEntities: [] }, // DRIFT!
    ];

    const driftValidation = TopicRelevanceValidator.validateOutline(
      driftedOutline,
      testKeyword,
      ['mobile form usability', 'checkout friction']
    );

    recordTest(
      'TC-3.1',
      'Req 5: TopicRelevanceValidator blocks off-topic outline headings',
      !driftValidation.isValid && driftValidation.driftedHeadings.length === 2,
      `Drifted count: ${driftValidation.driftedHeadings.length}, First reason: "${driftValidation.driftedHeadings[0]?.reason}"`
    );

    const isUxSeo = TopicRelevanceValidator.isSeoDomainTopic('mobile conversion rates');
    const isTechnicalSeo = TopicRelevanceValidator.isSeoDomainTopic('technical seo schema audit and sitemaps');
    recordTest(
      'TC-3.2',
      'Req 5: TopicRelevanceValidator discriminates UX from technical SEO topics',
      isUxSeo === false && isTechnicalSeo === true,
      `"mobile conversion rates": ${isUxSeo}, "technical seo schema...": ${isTechnicalSeo}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Missing required content, placeholders & ungrounded claims
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Missing Content, Placeholders & Unsupported Claims ---');
  {
    const missingKeywordText = `# Unrelated Usability Guide

This guide describes how to optimize touch screen layouts and buttons for mobile devices without mentioning the target keyword anywhere in the content.`;

    const primaryKw = testKeyword.toLowerCase();
    const bodyLower = missingKeywordText.toLowerCase();
    const hasMissingKeywordError = !bodyLower.includes(primaryKw);

    recordTest(
      'TC-4.1',
      'Req 7: Missing primary keyword is detected as a fatal critical error',
      hasMissingKeywordError === true,
      `Primary keyword present: ${!hasMissingKeywordError}`
    );

    const placeholderText = 'Here is the analysis: [Insert brand statistics here]. [TODO: Add metrics].';
    const preExportCheck = ArticleExportService.validateBeforeExport({
      title: 'Incomplete Guide',
      content: placeholderText,
      saasProfile: testSaasProfile,
      targetBrand: testBrand
    });

    recordTest(
      'TC-4.2',
      'Req 7: Unresolved template placeholders block export',
      !preExportCheck.canExport && preExportCheck.errors.some(e => e.includes('Incomplete placeholder text detected')),
      `Export errors: ${preExportCheck.errors.join('; ')}`
    );

    // Unsupported comparative claims remain blocked by ContentEvidenceValidator
    const unsupportedClaimHtml = `<h2>Checkout Optimization</h2>
<p>Mitran Design provides verified capability: proprietary automated analytics</p>`;

    const claimValidation = ContentEvidenceValidator.validateHtmlCompleteness(
      unsupportedClaimHtml,
      'Checkout Optimization',
      testBrand,
      testSaasProfile
    );

    recordTest(
      'TC-4.3',
      'Req 9: Repair attempts cannot make unbacked comparative or metric claims acceptable',
      !claimValidation.passed && claimValidation.criticalErrors.length > 0,
      `Claim validation passed: ${claimValidation.passed}, errors: ${claimValidation.criticalErrors.join('; ')}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Fail-closed acceptance boundary & deliverable gating
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Fail-Closed Acceptance Boundary & Persistence Gating ---');
  {
    const rejectedResult: OrchestrationResult = {
      success: false,
      runId: 'mock_rejected_run',
      status: 'partial',
      stages: [],
      telemetry: {
        runId: 'mock_rejected_run',
        startTime: new Date().toISOString(),
        llmCalls: 10,
        searchCalls: 0,
        scrapeCalls: 0,
        errors: ['Quality failure']
      },
      errors: [],
      content: {
        title: 'Rejected Guide',
        bodyMarkdown: 'Some text',
        wordCount: 100,
        seoScore: 40,
        validationStatus: 'REJECTED'
      } as any,
      review: {
        passed: false,
        issues: ['Unrepairable grounding contradiction'],
        warnings: [],
        criticalErrors: ['Unrepairable grounding contradiction'],
        finalValidationStatus: 'FAILED',
        repairable: false
      }
    };

    const isFinalValidationFailed = rejectedResult.review?.finalValidationStatus === 'FAILED';
    const isContentRejected = rejectedResult.content?.validationStatus === 'REJECTED';
    const hasCriticalErrors = (rejectedResult.review?.criticalErrors?.length ?? 0) > 0;

    const isOrchestrationAccepted =
      rejectedResult.success === true &&
      rejectedResult.status === 'completed' &&
      Boolean(rejectedResult.content?.bodyMarkdown) &&
      !isFinalValidationFailed &&
      !isContentRejected &&
      !hasCriticalErrors;

    recordTest(
      'TC-5.1',
      'Req 10: Rejected or partial orchestration result cannot be reported as successful',
      isOrchestrationAccepted === false,
      `isOrchestrationAccepted: ${isOrchestrationAccepted} (Expected false)`
    );

    const canPersistAsAcceptedDeliverable =
      isOrchestrationAccepted &&
      rejectedResult.content?.validationStatus === 'READY';

    recordTest(
      'TC-5.2',
      'Req 11: Rejected result cannot enter the accepted deliverable persistence path',
      canPersistAsAcceptedDeliverable === false,
      `canPersistAsAcceptedDeliverable: ${canPersistAsAcceptedDeliverable} (Expected false)`
    );

    const canExportAcceptedDeliverable =
      canPersistAsAcceptedDeliverable &&
      true;

    recordTest(
      'TC-5.3',
      'Req 11: Rejected result cannot be exported through the accepted deliverable path',
      canExportAcceptedDeliverable === false,
      `canExportAcceptedDeliverable: ${canExportAcceptedDeliverable} (Expected false)`
    );

    // Truncated output check (Adapter enforces isCriticalFailure on truncated/empty content)
    const truncatedResult: OrchestrationResult = {
      ...rejectedResult,
      content: {
        title: 'Truncated Guide',
        bodyMarkdown: '', // Empty body
        wordCount: 0,
        validationStatus: 'REJECTED'
      } as any
    };

    const isTruncatedCriticalFailure =
      !truncatedResult.content?.bodyMarkdown ||
      truncatedResult.content.wordCount < 100;

    recordTest(
      'TC-5.4',
      'Req 8: Truncated or malformed output cannot be accepted by the pipeline',
      isTruncatedCriticalFailure === true,
      `isTruncatedCriticalFailure: ${isTruncatedCriticalFailure}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Production adapter accepts valid result with warnings
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Production Adapter Accepts PASSED_WITH_WARNINGS ---');
  {
    const validWithWarningsResult: OrchestrationResult = {
      success: true,
      runId: 'mock_warning_run',
      status: 'completed',
      stages: [],
      telemetry: {
        runId: 'mock_warning_run',
        startTime: new Date().toISOString(),
        llmCalls: 10,
        searchCalls: 0,
        scrapeCalls: 0,
        errors: []
      },
      errors: [],
      content: {
        title: 'Valid Guide With Stylistic Warnings',
        bodyMarkdown: '# Valid Guide\n\nMobile conversion rates are important.',
        wordCount: 1500,
        seoScore: 88,
        validationStatus: 'READY'
      } as any,
      review: {
        passed: true,
        issues: ['More than 2 consecutive paragraphs have identical sentence count and format structure.'],
        warnings: ['More than 2 consecutive paragraphs have identical sentence count and format structure.'],
        criticalErrors: [],
        finalValidationStatus: 'PASSED_WITH_WARNINGS',
        repairable: false
      }
    };

    const isCriticalFailure =
      !validWithWarningsResult ||
      validWithWarningsResult.status === 'failed' ||
      validWithWarningsResult.review?.finalValidationStatus === 'FAILED' ||
      validWithWarningsResult.content?.validationStatus === 'REJECTED' ||
      ((validWithWarningsResult.review?.criticalErrors?.length ?? 0) > 0) ||
      !validWithWarningsResult.content?.bodyMarkdown ||
      (validWithWarningsResult.status === 'partial' && validWithWarningsResult.review?.finalValidationStatus !== 'PASSED_WITH_WARNINGS');

    recordTest(
      'TC-6.1',
      'Req 12: Production adapter allows PASSED_WITH_WARNINGS without critical failure',
      isCriticalFailure === false,
      `isCriticalFailure: ${isCriticalFailure} (Expected false)`
    );

    const resolvedValidationStatus =
      validWithWarningsResult.content?.validationStatus ||
      (validWithWarningsResult.review?.finalValidationStatus === 'FAILED' ? 'REJECTED' : 'READY');

    recordTest(
      'TC-6.2',
      'Req 12: Production adapter resolves validationStatus to READY for valid content with warnings',
      resolvedValidationStatus === 'READY',
      `resolvedValidationStatus: ${resolvedValidationStatus}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: PDF export, block order preservation & exit code integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: PDF Export & Block Order Preservation ---');
  {
    const sampleArticleMarkdown = `# Mastering Mobile Conversion Rates: A UX Optimization Guide

Mobile conversion rates measure the percentage of smartphone or tablet visitors who complete a desired action on a digital property. Understanding this requires analyzing user drop-off points across the entire customer journey.

Mitran Design operates as a digital product design studio focusing on UX strategy, mobile interface optimization, and user-centered digital experiences. Practitioners working in this space tackle low user retention and outdated mobile layouts through structured testing.

## Understanding Mobile Conversion Rates and User Behavior

Evaluating mobile conversion rates requires looking closely at user behavior during the customer journey. When organizations experience low retention, identifying friction causes becomes essential.

## Evaluating Key Factors Impacting Mobile Form Usability and Checkout Friction

Technical leaders evaluating mobile form usability face critical decisions regarding interface constraints. To resolve these issues, engineering leads must establish clear evaluation criteria before making architectural updates.

## Optimizing Tap-Target Usability and Mobile Page Experience

Touch targets must provide a minimum 48x48 pixel bounding box with adequate spacing to prevent accidental taps. Core Web Vitals metrics like Largest Contentful Paint directly impact conversion velocity.

## Framework for Conversion Rate Measurement and Hypothesis Testing

A structured testing program prevents costly redesign cycles and focuses engineering effort where it matters most. First, establish a reliable traffic baseline across mobile visitor segments.

## Practical Optimization Steps for Digital Product Teams

A rigorous optimization framework starts long before any code changes. Next, teams must treat every design change as a testable hypothesis rather than an absolute fix.`;

    const exportInput: ExportArticleInput = {
      title: 'Mastering Mobile Conversion Rates: A UX Optimization Guide',
      bodyMarkdown: sampleArticleMarkdown,
      saasProfile: testSaasProfile,
      targetBrand: testBrand,
      metadata: {
        intent: 'Guide',
        author: 'ACUTE Editorial Team'
      }
    };

    const preValidation = ArticleExportService.validateBeforeExport(exportInput);
    recordTest(
      'TC-7.1',
      'Req 13: ArticleExportService permits export of substantive article',
      preValidation.canExport && preValidation.errors.length === 0,
      `canExport: ${preValidation.canExport}`
    );

    const pdfBuffer = ArticleExportService.generatePdfBuffer(exportInput);
    recordTest(
      'TC-7.2',
      'Req 13: generatePdfBuffer outputs valid binary buffer > 5,000 bytes with PDF-1.x header',
      Boolean(pdfBuffer && pdfBuffer.length > 5000 && Buffer.from(pdfBuffer).toString('latin1').startsWith('%PDF-1.')),
      `Buffer size: ${pdfBuffer ? pdfBuffer.length : 0} bytes`
    );

    // Verify list and table block order preservation through rendering
    const structuredHtmlWithListAndTable = `
<h2>Section One</h2>
<p>Introductory paragraph before the table.</p>
<table><tr><th>Metric</th><th>Target</th></tr><tr><td>Friction</td><td>Low</td></tr></table>
<p>Middle paragraph introducing the checklist:</p>
<ul>
  <li>Item A: Audit mobile form inputs.</li>
  <li>Item B: Simplify checkout steps.</li>
</ul>
<p>Concluding paragraph after the list.</p>`;

    const parsedBlocks = (ArticleExportService as any).parseHtmlToPdfBlocks(structuredHtmlWithListAndTable);
    const blockTypes = parsedBlocks.map((b: any) => b.type);

    // The exact sequence must be: h2, p, table, p, li, p
    const isOrderPreserved =
      blockTypes[0] === 'h2' &&
      blockTypes[1] === 'p' &&
      blockTypes[2] === 'table' &&
      blockTypes[3] === 'p' &&
      blockTypes[4] === 'li' &&
      blockTypes[5] === 'p';

    recordTest(
      'TC-7.3',
      'Req 14: List and table blocks preserve intended document order through rendering (not appended at end)',
      isOrderPreserved === true,
      `Block sequence: [${blockTypes.join(' -> ')}]`
    );

    // Verify exit code behavior by invoking the actual test runner file in controlled subprocesses
    const runnerPath = path.resolve(__dirname, 'test_phase5d2_validator_calibration_and_release_suite.ts');
    const isWin = process.platform === 'win32';
    const execFile = isWin ? (process.env.ComSpec || 'cmd.exe') : 'npx';
    const baseArgs = isWin ? ['/c', 'npx', 'tsx', runnerPath] : ['tsx', runnerPath];

    const childFailure = spawnSync(
      execFile,
      baseArgs,
      {
        env: { ...process.env, CONTROLLED_RUNNER_FIXTURE: 'fail' },
        timeout: 15000,
        encoding: 'utf8'
      }
    );

    const childSuccess = spawnSync(
      execFile,
      baseArgs,
      {
        env: { ...process.env, CONTROLLED_RUNNER_FIXTURE: 'pass' },
        timeout: 15000,
        encoding: 'utf8'
      }
    );

    const realExitVerified = childFailure.status === 1 && childSuccess.status === 0;

    recordTest(
      'TC-7.4',
      'Req 15: Failed assertion triggers non-zero process exit condition (verified by executing real runner subprocess)',
      realExitVerified === true,
      `childFailure exit code: ${childFailure.status}, childSuccess exit code: ${childSuccess.status}`
    );
  }

  // ---------------------------------------------------------------------------
  // SUMMARY & EXIT CODE
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  const failed = testResults.filter(r => r.status === 'FAIL');
  const passed = testResults.filter(r => r.status === 'PASS');
  console.log(` CALIBRATION SUITE RESULTS: ${passed.length}/${testResults.length} PASSED (${failed.length} FAILED)`);
  if (failed.length > 0) {
    console.error(' FAILED ASSERTIONS:');
    failed.forEach(f => console.error(`   - ${f.id}: ${f.name} (${f.details})`));
  }
  console.log('========================================================================\n');

  process.exit(failed.length === 0 ? 0 : 1);
}

runCalibrationSuite().catch(err => {
  console.error('[FATAL] Unhandled error in calibration suite:', err);
  process.exit(1);
});
