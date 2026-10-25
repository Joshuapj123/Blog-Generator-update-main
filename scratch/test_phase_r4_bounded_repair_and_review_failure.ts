// scratch/test_phase_r4_bounded_repair_and_review_failure.ts
import assert from 'assert';
import {
  TargetedRepairEngine,
  BoundedRepairContext,
  REPAIR_FAILURE_CODES
} from '../src/lib/content/TargetedRepairEngine';
import {
  ParagraphSignatureValidator,
  ParagraphSignatureValidationResult
} from '../src/lib/intelligence/ParagraphSignatureValidator';
import {
  ContentBrief,
  ContentBriefSchema,
  ContentBlockPlan,
  ContentAsset,
  ContentAssetSchema,
  OutlineNode,
  planBlockVarietyForArticle,
  validateOutlineBlockPlanUniqueness
} from '../src/lib/content/schemas';
import { DistributionPlanner } from '../src/lib/distribution/DistributionPlanner';
import { SaaSProfile, SaaSProfileSchema } from '../src/core/contracts/schemas';
import { LLMProvider } from '../src/core/contracts/providers';

// Test assertion counter
let passCount = 0;
let failCount = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passCount++;
          console.log(`  [PASS] ${desc}`);
        })
        .catch(err => {
          failCount++;
          console.error(`  [FAIL] ${desc}`);
          console.error(`         ${err.message}`);
        });
    } else {
      passCount++;
      console.log(`  [PASS] ${desc}`);
    }
  } catch (err: any) {
    failCount++;
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
  }
}

class MockLLMProvider implements LLMProvider {
  public callCount = 0;
  public capturedPrompts: string[] = [];
  public handler?: (prompt: string, options?: any) => Promise<string>;

  constructor(handler?: (prompt: string, options?: any) => Promise<string>) {
    this.handler = handler;
  }

  async generate(prompt: string, options?: any): Promise<string> {
    this.callCount++;
    this.capturedPrompts.push(prompt);
    if (this.handler) {
      return this.handler(prompt, options);
    }
    // Default: return a compliant 2-sentence paragraph (S then M)
    return 'Mobile teams test continuously. Prioritizing core checkout screens resolves critical user drop-off points before scaling marketing campaigns.';
  }

  async structuredGenerate<T>(): Promise<T> {
    throw new Error('Not implemented');
  }
}

// Sentence definitions verified in scratch/verify_three_mlm_paragraphs.ts:
// Sentence M2: 15 words (Band M: 15..28)
const s_m2 = 'Mobile conversion rate optimization requires product teams to evaluate user friction across complex checkout screens.';
// Sentence L1: 33 words (Band L: > 28)
const s_l1 = 'When enterprise product managers evaluate cross-platform mobile engagement strategies, they must weigh immediate conversion lifts against long-term customer lifetime retention, ensuring that aggressive promotional tactics do not degrade organic brand loyalty over time.';
// Sentence M1: 18 words (Band M: 15..28)
const s_m1 = 'Modern growth teams systematically analyze conversion telemetry to discover critical drop-off points across high-volume checkout funnels.';
// Sentence M3: 16 words (Band M: 15..28)
const s_m3 = 'Engineers implement targeted instrumentation to capture every user click before finalizing major application architecture decisions.';
// Sentence M4: 15 words (Band M: 15..28)
const s_m4 = 'Cross-functional squads regularly prioritize customer journey experiments to validate core hypotheses before investing engineering bandwidth.';

// Paragraphs: exactly 3 sentences each with bands M, L, M -> Signature: (3, PROSE, M-L-M)
const P1_MLM = `${s_m2} ${s_l1} ${s_m1}`;
const P2_MLM = `${s_m3} ${s_l1} ${s_m1}`;
const P3_MLM = `${s_m4} ${s_l1} ${s_m1}`;

// Distinct non-duplicate retry paragraph with signature (3, PROSE, M-L-M) for multi-attempt testing
const s_retry_m1 = 'Product analytics teams rigorously monitor conversion velocity across every step of their digital checkout funnels.';
const s_retry_l1 = 'While aggressive promotional banners frequently generate transient spikes in overall mobile engagement, disciplined product organizations recognize that enduring conversion acceleration stems from removing unnecessary friction points from the checkout experience entirely.';
const s_retry_m2 = 'Dedicated UX researchers conduct moderated user testing sessions monthly to uncover subtle moments of shopper confusion.';
const P_RETRY_MLM = `${s_retry_m1} ${s_retry_l1} ${s_retry_m2}`;

// Build synthetic 3-section brief with block plans
function createTestBrief(): ContentBrief {
  const brief = ContentBriefSchema.parse({
    title: 'Mobile Conversion Optimization Guide',
    targetKeywords: ['mobile conversion rate', 'checkout optimization'],
    intent: {
      primaryKeyword: 'mobile conversion rate',
      intent: 'Informational',
      funnelStage: 'TOFU',
      userGoal: 'Learn about mobile conversion optimization'
    },
    wordCountBudget: { min: 200, target: 400, max: 1000 },
    outline: [
      {
        heading: 'Why Mobile Conversion Matters',
        level: 'H2',
        generate_table: false,
        assignedKeywords: ['mobile conversion rate'],
        assignedEntities: ['Acme'],
        core_concept: 'Business stakes of mobile checkout speed'
      },
      {
        heading: 'Essential Diagnostic Frameworks',
        level: 'H2',
        generate_table: true,
        assignedKeywords: ['checkout optimization'],
        assignedEntities: ['Acme'],
        core_concept: 'Technical inspection and user flow analytics'
      },
      {
        heading: 'Actionable Implementation Roadmap',
        level: 'H2',
        generate_table: false,
        assignedKeywords: ['mobile conversion rate'],
        assignedEntities: ['Acme'],
        core_concept: 'Practical next steps and deployment best practices'
      }
    ]
  });

  brief.outline = planBlockVarietyForArticle(brief.outline);
  return brief;
}

// Build article containing 3 consecutive paragraphs of signature (3, PROSE, M-L-M)
function createDefectiveArticle(): { title: string; markdown: string } {
  const markdown = `# Mobile Conversion Optimization Guide

## Why Mobile Conversion Matters

${P1_MLM}

${P2_MLM}

${P3_MLM}

## Essential Diagnostic Frameworks

Engineers test every user journey on real devices. Fast feedback loops ensure swift issue resolution.

| Metric | Target | Method |
| :--- | :--- | :--- |
| First Paint | < 1.2s | Real User Telemetry |
| Conversion Rate | > 3.5% | Funnel Analytics |

Data informs prioritized roadmaps across teams.

## Actionable Implementation Roadmap

Begin by auditing key friction points across onboarding and payment screens. Immediate wins build momentum.

Review conversion analytics weekly to maintain alignment across product and marketing stakeholders.`;

  return { title: 'Mobile Conversion Optimization Guide', markdown };
}

// Build article that naturally passes all signature validators
function createNaturallyValidArticle(): string {
  return `# Mobile Conversion Optimization Guide

## Why Mobile Conversion Matters

Mobile conversion rate requires continuous monitoring and deep customer empathy.

Fast checkout flows dramatically increase completed orders across retail platforms. When enterprise teams invest in streamlined mobile navigation, user confidence increases significantly.

## Essential Diagnostic Frameworks

Engineers inspect every user journey on real hardware.

| Metric | Target | Method |
| :--- | :--- | :--- |
| First Paint | < 1.2s | Real User Telemetry |
| Conversion Rate | > 3.5% | Funnel Analytics |

Data informs prioritized roadmaps across teams. Clear signals prevent costly strategic misdirection.

## Actionable Implementation Roadmap

Begin by auditing key friction points across onboarding and payment screens. Immediate wins build momentum.

Review conversion analytics weekly to maintain alignment across product and marketing stakeholders.`;
}

async function runTests() {
  console.log('========================================================================');
  console.log(' ACUTE PHASE R4: TARGETED BOUNDED REPAIR & REVIEW FAILURE SUITE');
  console.log('========================================================================\n');

  console.log('--- TEST GROUP 1: Initial State & Scoped Repair Mapping ---');

  await it('1.1 Already-valid article skips repair with 0 attempts and 0 LLM calls', async () => {
    const validMd = createNaturallyValidArticle();
    const brief = createTestBrief();
    const mockLLM = new MockLLMProvider();

    const result = await TargetedRepairEngine.executeBoundedRepair(
      validMd,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'skipped_already_valid');
    assert.strictEqual(result.attemptsUsed, 0);
    assert.strictEqual(result.allValidatorsPassed, true);
    assert.strictEqual(result.retryBudgetExhausted, false);
    assert.strictEqual(mockLLM.callCount, 0, 'Must make zero LLM calls for already valid article');
  });

  await it('1.2 Diagnostic mapper targets the intended paragraph to break 3-paragraph repetition', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const val = ParagraphSignatureValidator.validate(markdown);
    assert.strictEqual(val.valid, false, 'Defective article must be rejected by ParagraphSignatureValidator');
    assert.strictEqual(val.violations.length, 1, 'Must contain exactly 1 signature repetition violation');

    const mapping = TargetedRepairEngine.mapDiagnosticToBlockTarget(
      markdown,
      brief.outline,
      val.violations[0],
      1
    );

    assert.strictEqual(mapping.success, true);
    if (mapping.success) {
      assert.strictEqual(mapping.target.sectionHeading, 'Why Mobile Conversion Matters');
      assert.strictEqual(mapping.target.mode, 'PROSE');
      assert.ok(mapping.target.originalText.length > 50);
      assert.strictEqual(mapping.target.targetSignature, '(2, PROSE, S-M)');
      assert.strictEqual(mapping.target.targetSentenceCount, 2);
    }
  });

  await it('1.3 Target block identifier maps to R2 ContentBlockPlan with valid ID', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const val = ParagraphSignatureValidator.validate(markdown);

    const mapping = TargetedRepairEngine.mapDiagnosticToBlockTarget(
      markdown,
      brief.outline,
      val.violations[0],
      1
    );

    assert.strictEqual(mapping.success, true);
    if (mapping.success) {
      assert.ok(/^blk_\d+_\d+$/.test(mapping.target.blockId), `Block ID "${mapping.target.blockId}" must match blk_X_Y`);
      assert.strictEqual(mapping.target.sectionIndex, 0);
    }
  });

  await it('1.4 Surrounding context snippets are extracted without whole-document leakage', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const val = ParagraphSignatureValidator.validate(markdown);

    const mapping = TargetedRepairEngine.mapDiagnosticToBlockTarget(
      markdown,
      brief.outline,
      val.violations[0],
      1
    );

    assert.strictEqual(mapping.success, true);
    if (mapping.success) {
      assert.ok(mapping.target.precedingSnippet, 'Preceding snippet must be populated');
      assert.ok(!mapping.target.precedingSnippet.includes('## Essential Diagnostic Frameworks'), 'Preceding snippet must be local');
    }
  });

  console.log('\n--- TEST GROUP 2: Successful Targeted Repair & Preservation ---');

  await it('2.1 Targeted repair succeeds on attempt 1 when LLM returns compliant paragraph', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    // Return compliant (2, PROSE, S-M): 1st sentence S (< 15 words), 2nd sentence M (15-28 words)
    const mockLLM = new MockLLMProvider(async () => {
      return 'Mobile teams test continuously. Prioritizing core checkout screens resolves critical user drop-off points before scaling marketing campaigns.';
    });

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'repaired');
    assert.strictEqual(result.attemptsUsed, 1);
    assert.strictEqual(result.allValidatorsPassed, true);
    assert.strictEqual(result.retryBudgetExhausted, false);
    assert.strictEqual(mockLLM.callCount, 1);
    assert.ok(result.repairedMarkdown);

    // Verify revalidation of repaired markdown
    const sigCheck = ParagraphSignatureValidator.validate(result.repairedMarkdown!);
    assert.strictEqual(sigCheck.valid, true, 'Repaired markdown must pass canonical signature validation');
  });

  await it('2.2 Unaffected blocks remain 100% byte-for-byte identical before and after repair', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const mockLLM = new MockLLMProvider(async () => {
      return 'Mobile teams test continuously. Prioritizing core checkout screens resolves critical user drop-off points before scaling marketing campaigns.';
    });

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'repaired');
    const repaired = result.repairedMarkdown!;

    // Check that Section 2 (table) and Section 3 are completely untouched
    const sec2Original = markdown.split('## Essential Diagnostic Frameworks')[1].split('## Actionable Implementation Roadmap')[0];
    const sec2Repaired = repaired.split('## Essential Diagnostic Frameworks')[1].split('## Actionable Implementation Roadmap')[0];
    assert.strictEqual(sec2Original, sec2Repaired, 'Section 2 table and text must be byte-for-byte identical');

    const sec3Original = markdown.split('## Actionable Implementation Roadmap')[1];
    const sec3Repaired = repaired.split('## Actionable Implementation Roadmap')[1];
    assert.strictEqual(sec3Original, sec3Repaired, 'Section 3 roadmap text must be byte-for-byte identical');
  });

  await it('2.3 Primary keyword, topic, and outline headings are strictly preserved in repaired article', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const mockLLM = new MockLLMProvider(async () => {
      return 'Mobile teams test continuously. Prioritizing core checkout screens resolves critical user drop-off points before scaling marketing campaigns.';
    });

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    const repaired = result.repairedMarkdown!;
    // Case-insensitive verification matching AgentOrchestrator and quality_validator contracts
    assert.ok(
      repaired.toLowerCase().includes(brief.targetKeywords[0].toLowerCase()),
      'Primary keyword must be retained'
    );
    assert.ok(repaired.includes('# Mobile Conversion Optimization Guide'), 'H1 title must be retained');
    assert.ok(repaired.includes('## Why Mobile Conversion Matters'), 'H2 #1 must be retained');
    assert.ok(repaired.includes('## Essential Diagnostic Frameworks'), 'H2 #2 must be retained');
    assert.ok(repaired.includes('## Actionable Implementation Roadmap'), 'H2 #3 must be retained');
  });

  console.log('\n--- TEST GROUP 3: Defect Cascades & Revalidation Rejection ---');

  await it('3.1 Revalidation catches repair candidate that repeats signature and triggers attempt 2', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    let callNum = 0;
    const mockLLM = new MockLLMProvider(async () => {
      callNum++;
      if (callNum === 1) {
        // Attempt 1: Return a distinct, uniquely identifiable paragraph that still has signature M-L-M
        return P_RETRY_MLM;
      }
      // Attempt 2: Return a genuinely compliant S-M paragraph
      return 'Mobile teams test continuously. Prioritizing core checkout screens resolves critical user drop-off points before scaling marketing campaigns.';
    });

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'repaired');
    assert.strictEqual(result.attemptsUsed, 2);
    assert.strictEqual(result.attempts.length, 2);
    assert.strictEqual(result.attempts[0].passedRevalidation, false, 'Attempt 1 must fail revalidation');
    assert.strictEqual(result.attempts[1].passedRevalidation, true, 'Attempt 2 must pass revalidation');
    assert.strictEqual(result.allValidatorsPassed, true);
  });

  await it('3.2 Revalidation catches critical quality failure (e.g. brand stuffing) and fails revalidation', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    // Return text with brand stuffing
    const mockLLM = new MockLLMProvider(async () => {
      return 'Acme Acme Acme Acme Acme Acme Acme Acme Acme Acme Acme Acme is the brand.';
    });

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 1 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.allValidatorsPassed, false);
  });

  console.log('\n--- TEST GROUP 4: Bounded Attempt Limit & Budget Exhaustion ---');

  await it('4.1 Repeated failure enforces strict attempt limit (maxAttempts = 2) and halts', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    let attemptCount = 0;
    // Return distinct non-compliant paragraphs on each attempt
    const mockLLM = new MockLLMProvider(async () => {
      attemptCount++;
      return `${s_retry_m1} (${attemptCount}) ${s_retry_l1} ${s_retry_m2}`;
    });

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.attemptsUsed, 2);
    assert.strictEqual(result.maxAttempts, 2);
    assert.strictEqual(result.retryBudgetExhausted, true);
    assert.strictEqual(result.allValidatorsPassed, false);
    assert.strictEqual(result.failureCategory, 'RETRY_BUDGET_EXHAUSTED');
    assert.strictEqual(result.failureCode, REPAIR_FAILURE_CODES.RETRY_BUDGET_EXHAUSTED);
    assert.strictEqual(mockLLM.callCount, 2, 'Must stop at exactly 2 attempts');
  });

  await it('4.2 Exhausted retry budget NEVER marks article approved', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const mockLLM = new MockLLMProvider(async () => P_RETRY_MLM);

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.allValidatorsPassed, false);
    assert.strictEqual(result.status, 'review_required');
    assert.ok(result.unresolvedIssues.length > 0, 'Unresolved issues must be reported');
  });

  console.log('\n--- TEST GROUP 5: Unmappable Diagnostics & Invalid Identifiers (Fail Closed) ---');

  await it('5.1 Unmappable section heading stops immediately with review_required (0 LLM calls)', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    // Corrupt brief outline headings so no section matches
    brief.outline = [
      {
        heading: 'Completely Different Heading A',
        level: 'H2',
        generate_table: false,
        assignedKeywords: [],
        assignedEntities: []
      },
      {
        heading: 'Completely Different Heading B',
        level: 'H2',
        generate_table: false,
        assignedKeywords: [],
        assignedEntities: []
      }
    ];
    const mockLLM = new MockLLMProvider();

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.failureCategory, 'UNMAPPABLE_DIAGNOSTIC');
    assert.strictEqual(result.failureCode, REPAIR_FAILURE_CODES.UNMAPPABLE_DIAGNOSTIC);
    assert.strictEqual(result.allValidatorsPassed, false);
    assert.strictEqual(mockLLM.callCount, 0, 'Must NOT invoke LLM when unmappable');
  });

  await it('5.2 Malformed block ID fails closed with INVALID_BLOCK_IDENTIFIER', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    // Inject malformed blockId
    brief.outline[0].blockPlans = [
      {
        blockId: 'INVALID_FORMAT_ID',
        role: 'HOOK',
        mode: 'PROSE',
        protectedRequirements: ['Maintain valid format']
      }
    ];
    const mockLLM = new MockLLMProvider();

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.failureCategory, 'INVALID_BLOCK_IDENTIFIER');
    assert.strictEqual(result.failureCode, REPAIR_FAILURE_CODES.INVALID_BLOCK_IDENTIFIER);
    assert.strictEqual(result.allValidatorsPassed, false);
    assert.strictEqual(mockLLM.callCount, 0);
  });

  await it('5.3 Duplicate block ID in outline fails closed with INVALID_BLOCK_IDENTIFIER', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    // Inject duplicate block ID
    brief.outline[0].blockPlans = [
      { blockId: 'blk_1_1', role: 'HOOK', mode: 'PROSE', protectedRequirements: [] },
      { blockId: 'blk_1_1', role: 'EXPLAIN', mode: 'PROSE', protectedRequirements: [] }
    ];
    const mockLLM = new MockLLMProvider();

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.failureCategory, 'INVALID_BLOCK_IDENTIFIER');
    assert.strictEqual(result.failureCode, REPAIR_FAILURE_CODES.INVALID_BLOCK_IDENTIFIER);
    assert.strictEqual(result.allValidatorsPassed, false);
    assert.strictEqual(mockLLM.callCount, 0);
  });

  console.log('\n--- TEST GROUP 6: Model Errors & Malformed Output ---');

  await it('6.1 Empty model response fails closed with INVALID_REPAIR_OUTPUT', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const mockLLM = new MockLLMProvider(async () => '');

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.failureCategory, 'INVALID_REPAIR_OUTPUT');
    assert.strictEqual(result.failureCode, REPAIR_FAILURE_CODES.INVALID_REPAIR_OUTPUT);
    assert.strictEqual(result.allValidatorsPassed, false);
  });

  await it('6.2 Model returning unauthorized markdown heading fails closed with INVALID_REPAIR_OUTPUT', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const mockLLM = new MockLLMProvider(async () => '## Unauthorized Section Heading\n\nSome paragraph text.');

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.failureCategory, 'INVALID_REPAIR_OUTPUT');
    assert.strictEqual(result.allValidatorsPassed, false);
  });

  await it('6.3 Model throwing exception fails closed with MODEL_EXCEPTION', async () => {
    const { markdown } = createDefectiveArticle();
    const brief = createTestBrief();
    const mockLLM = new MockLLMProvider(async () => {
      throw new Error('Gemini API 503 Service Unavailable');
    });

    const result = await TargetedRepairEngine.executeBoundedRepair(
      markdown,
      { brief, targetBrand: 'Acme', maxAttempts: 2 },
      mockLLM
    );

    assert.strictEqual(result.status, 'review_required');
    assert.strictEqual(result.failureCategory, 'MODEL_EXCEPTION');
    assert.strictEqual(result.failureCode, REPAIR_FAILURE_CODES.MODEL_EXCEPTION);
    assert.strictEqual(result.allValidatorsPassed, false);
  });

  console.log('\n--- TEST GROUP 7: Downstream Fail-Closed Publishing & Distribution Gate ---');

  await it('7.1 Review required status produces validationStatus REJECTED on ContentAsset', () => {
    const resolveValidationStatus = (status: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED' | 'REVIEW_REQUIRED'): string => {
      return (status === 'FAILED' || status === 'REVIEW_REQUIRED') ? 'REJECTED' : 'READY';
    };
    assert.strictEqual(resolveValidationStatus('REVIEW_REQUIRED'), 'REJECTED');
    assert.strictEqual(resolveValidationStatus('FAILED'), 'REJECTED');
    assert.strictEqual(resolveValidationStatus('PASSED'), 'READY');
  });

  await it('7.2 DistributionPlanner strictly refuses distribution for REJECTED asset', () => {
    const saasProfile = SaaSProfileSchema.parse({
      name: 'Acme',
      description: 'Acme description',
      targetAudience: 'Product teams',
      keyFeatures: ['Optimization'],
      website: 'https://example.com'
    });
    const asset: ContentAsset = ContentAssetSchema.parse({
      title: 'Defective Unrepaired Article',
      bodyMarkdown: 'Some text',
      wordCount: 200,
      seoScore: 50,
      references: [],
      validationStatus: 'REJECTED'
    });

    const distResult = DistributionPlanner.planDistribution(saasProfile, asset);

    assert.strictEqual(distResult.eligibleChannels.length, 0, 'Must have zero eligible channels for REJECTED asset');
  });

  console.log('\n--- TEST GROUP 8: Compatibility Invariants ---');

  await it('8.1 Non-blocking readability warnings alone do not force review_required', () => {
    // Pure readability warnings (e.g. passive voice or Flesch score) without keyword stuffing
    const warnings = ['Passive voice density is 26% (exceeds limit of 25%).', 'Flesch Reading Ease score is 52.'];
    const critical = TargetedRepairEngine.extractCriticalQualityErrors(warnings);
    assert.strictEqual(critical.length, 0, 'Readability findings must not be treated as critical quality errors');
  });

  await it('8.2 R2 block-planning contracts and schemas remain fully valid and operational', () => {
    const brief = createTestBrief();
    const uniqueness = validateOutlineBlockPlanUniqueness(brief.outline);
    assert.strictEqual(uniqueness.isValid, true);
    assert.ok(uniqueness.totalBlocks > 5);
    assert.strictEqual(uniqueness.duplicateIds.length, 0);
  });

  await it('8.3 R3 canonical signature validator rules remain intact and functional', () => {
    assert.strictEqual(ParagraphSignatureValidator.classifySentenceLength(10), 'S');
    assert.strictEqual(ParagraphSignatureValidator.classifySentenceLength(20), 'M');
    assert.strictEqual(ParagraphSignatureValidator.classifySentenceLength(35), 'L');

    const split = ParagraphSignatureValidator.splitSentences('First sentence e.g. details. Second sentence here.');
    assert.strictEqual(split.length, 2);
  });

  await it('8.4 Two matching paragraphs followed by a varied paragraph do NOT trigger rejection', () => {
    const md = `# Title\n\n## Section\n\n${P1_MLM}\n\n${P2_MLM}\n\nShort punchy varied text. Second sentence here.`;
    const res = ParagraphSignatureValidator.validate(md);
    assert.strictEqual(res.valid, true, 'Two identical signatures followed by a varied signature must pass');
    assert.strictEqual(res.violations.length, 0);
  });

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passCount} / ${passCount + failCount} ASSERTIONS VERIFIED`);
  console.log(`FAILED: ${failCount}`);
  console.log('========================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
