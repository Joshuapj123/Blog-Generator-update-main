// scratch/test_phase_6d_6r_compound_repair_remediation.ts
import assert from 'assert';
import {
  ParagraphSignatureValidator,
  ParagraphSignatureValidationResult
} from '../src/lib/intelligence/ParagraphSignatureValidator';
import {
  DeliverableContractValidator,
  DeliverableContractCheckResult
} from '../src/lib/intelligence/DeliverableContractValidator';
import {
  TargetedRepairEngine,
  BoundedRepairContext,
  BoundedRepairSummary,
  REPAIR_FAILURE_CODES
} from '../src/lib/content/TargetedRepairEngine';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import {
  ContentBrief,
  ContentBriefSchema,
  ContentAsset,
  ContentAssetSchema,
  OutlineNode,
  planBlockVarietyForArticle
} from '../src/lib/content/schemas';
import { ArtifactLifecycleBoundary } from '../src/lib/content/ArtifactLifecycleBoundary';
import { ArticleExportService } from '../src/lib/export/ArticleExportService';
import { DistributionService, DistributionRepository } from '../src/lib/distribution/DistributionService';
import { EvidenceSet, EvidenceItem } from '../src/core/contracts/evidence';
import { SaaSProfile, SaaSProfileSchema, DistributionRequest } from '../src/core/contracts/schemas';
import { LLMProvider } from '../src/core/contracts/providers';

interface TestResult {
  suite: string;
  scenario: number;
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

function recordTest(suite: string, scenario: number, name: string, passed: boolean, error?: string) {
  testResults.push({ suite, scenario, name, passed, error });
  if (passed) {
    console.log(`  ✓ [${suite} - SCENARIO ${scenario}] PASS: ${name}`);
  } else {
    console.error(`  ✗ [${suite} - SCENARIO ${scenario}] FAIL: ${name} -> ${error}`);
  }
}

class MockRepairLLMProvider implements LLMProvider {
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
    // Default mock response: returns compliant (2, PROSE, S-M)
    return 'Mobile teams evaluate checkouts continually. Streamlining interactive inputs resolves critical user friction before scaling acquisition marketing.';
  }

  async structuredGenerate<T>(): Promise<T> {
    throw new Error('Not implemented');
  }
}

// Paragraph definitions for exact reproduction:
// 2 sentences, 15..28 words each -> Signature: (2, PROSE, M-M)
const P_MM_1 = 'When addressing checkout friction, technical decision-makers must distinguish general UX best practices from specific hypotheses that require testing on their own website. Outdated mobile interfaces often fail to meet modern user expectations, resulting in inconsistent experiences across devices.';
const P_MM_2 = 'By treating mobile form usability as an ongoing measurement process rather than a one-time fix, technical leaders can systematically remove checkout barriers. Grounding decisions in segmented data ensures that every interface update directly addresses real user needs while protecting overall digital performance.';
const P_MM_3 = 'Selecting the appropriate UX audit approach requires balancing internal engineering bandwidth against the depth and objectivity of specialized external practitioners. While in-house reviews offer immediate convenience, external evaluations often uncover systemic conversion bottlenecks that internal teams routinely overlook.';

// Varied paragraph: 3 sentences with bands S, M, L -> (3, PROSE, S-M-L)
const P_VAR_SML = 'Design teams act quickly. Simplifying primary checkout fields removes friction points across mobile checkouts before launching marketing campaigns. When organizations ground redesigns in measured user behavior rather than untested intuition, mobile conversion velocity accelerates while protecting long-term brand credibility.';

const BASE_SAAS_PROFILE: SaaSProfile = {
  name: 'Mitran Design',
  description: 'Digital product design and mobile conversion optimization studio',
  website: 'https://mitran.design',
  targetAudience: 'Product Managers and Technical Leaders',
  keyFeatures: ['UX Audit', 'Checkout Optimization'],
  primaryCompetitors: [],
  tone: 'expert',
  customInsights: 'none'
};

function createValidReadyAsset(markdown: string): ContentAsset {
  const partialAsset = {
    title: 'Mastering Mobile Conversion Rates: A UX Optimization Guide',
    bodyMarkdown: markdown,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    seoScore: 92,
    qualityScore: 95,
    references: [],
    slug: 'mastering-mobile-conversion-rates-a-ux-optimization-guide',
    assetType: 'ARTICLE',
    targetKeyword: 'mobile conversion rates',
    metaTitle: 'Mastering Mobile Conversion Rates | Mitran Design',
    metaDescription: 'Complete practical guide on optimizing mobile conversion rates and checkout flows.',
    validationStatus: 'READY' as const,
    targetBrand: 'Mitran Design'
  };
  const fp = ArtifactLifecycleBoundary.computeFingerprint(partialAsset);
  return {
    ...partialAsset,
    validationFingerprint: fp,
    validatedAt: new Date().toISOString()
  };
}

async function runRegressionSuites() {
  console.log('========================================================================');
  console.log(' ACUTE PHASE 6D.6R: COMPOUND REPAIR & REMEDIATION REGRESSION SUITE');
  console.log('========================================================================\n');

  // ===========================================================================
  // SUITE A: Structural Continuity Across Boundaries
  // ===========================================================================
  console.log('--- SUITE A: Structural Continuity Across Section Boundaries ---');
  {
    // A.1 Three identical signatures across an H2 boundary must be strictly rejected
    const mdAcrossH2 = `# Mobile Optimization

## Evaluating Key Conversion Flows

${P_MM_1}

${P_MM_2}

## UX Audit Services Comparison Matrix

${P_MM_3}

Analytics teams monitor conversion rates continuously.`;

    const repA1 = ParagraphSignatureValidator.validate(mdAcrossH2);
    const passedA1 = !repA1.valid && repA1.violations.length === 1 && repA1.violations[0].canonicalSignature === '(2, PROSE, M-M)';
    recordTest('SUITE A', 1, 'Three identical (2, PROSE, M-M) signatures across H2 boundary rejected', passedA1, repA1.criticalErrors.join('; '));

    // A.2 Heading and non-prose blocks do not reset continuity
    const mdWithTableBetween = `# Mobile Optimization

## Section One

${P_MM_1}

${P_MM_2}

## Section Two

| Tool | Status |
|---|---|
| Heuristic | Active |

- Point A
- Point B

${P_MM_3}`;

    const repA2 = ParagraphSignatureValidator.validate(mdWithTableBetween);
    const passedA2 = !repA2.valid && repA2.violations.length === 1;
    recordTest('SUITE A', 2, 'Heading, table, and list blocks between paragraphs do NOT reset continuity', passedA2);

    // A.3 Correct section and paragraph identifiers are reported
    const viol = repA1.violations[0];
    const passedA3 = viol.sections.includes('Evaluating Key Conversion Flows') &&
      viol.sections.includes('UX Audit Services Comparison Matrix') &&
      viol.paragraphs.length === 3 &&
      viol.paragraphs[0].sectionHeading === 'Evaluating Key Conversion Flows' &&
      viol.paragraphs[2].sectionHeading === 'UX Audit Services Comparison Matrix';
    recordTest('SUITE A', 3, 'Violation diagnostic reports exact section names and paragraph objects across boundary', passedA3);

    // A.4 A genuine structural change resolves the repetition
    const mdResolved = `# Mobile Optimization

## Evaluating Key Conversion Flows

${P_MM_1}

${P_VAR_SML}

## UX Audit Services Comparison Matrix

${P_MM_3}`;

    const repA4 = ParagraphSignatureValidator.validate(mdResolved);
    const passedA4 = repA4.valid && repA4.violations.length === 0;
    recordTest('SUITE A', 4, 'Replacing middle paragraph with varied (3, PROSE, S-M-L) resolves repetition cleanly', passedA4);
  }

  // ===========================================================================
  // SUITE B: Comparison Deliverable Completeness
  // ===========================================================================
  console.log('\n--- SUITE B: Comparison Deliverable Completeness ---');
  {
    const heading = '## UX Audit Services Comparison Matrix';

    // B.1 Missing alternatives rejected
    const bodyMissingAlt = `
When evaluating UX audit services, teams should evaluate cost, velocity, and diagnostic depth.
While internal reviews offer convenience, external consultants provide fresh perspectives.
In conclusion, choose an in-house audit for simple checks, or external specialists for high-stakes overhauls.`;
    const resB1 = DeliverableContractValidator.validateSectionDeliverable(heading, bodyMissingAlt);
    const passedB1 = !resB1.passed && resB1.missingElements.includes('explicit alternatives');
    recordTest('SUITE B', 1, 'Comparison lacking markdown table or explicit alternatives is rejected', passedB1);

    // B.2 Missing comparison dimensions rejected
    const bodyMissingDim = `
| Dimension | In-House | External Agency |
|---|---|---|
| Option | Internal | External |

Comparing options reveals clear trade-offs between internal teams and external agencies.
Choose in-house if you prefer internal staff; choose external agencies if you need outside help.`;
    const resB2 = DeliverableContractValidator.validateSectionDeliverable(heading, bodyMissingDim);
    const passedB2 = !resB2.passed && resB2.missingElements.includes('comparison dimensions');
    recordTest('SUITE B', 2, 'Comparison lacking recognized dimensions (cost, velocity, depth, etc.) is rejected', passedB2);

    // B.3 Missing meaningful trade-offs rejected
    const bodyMissingTradeOffs = `
| Dimension | In-House Team | External Specialist |
|---|---|---|
| Direct Cost | Lower initial cash outlay | Higher upfront fee |
| Objectivity | Subject to internal bias | Completely objective |
| Velocity | Slower turnaround | Rapid turnaround |

Both options are available for teams to consider when planning their conversion optimization roadmap.
Choose an in-house audit for constrained budgets, or an external specialist for high-stakes redesigns.`;
    const resB3 = DeliverableContractValidator.validateSectionDeliverable(heading, bodyMissingTradeOffs);
    const passedB3 = !resB3.passed && resB3.missingElements.includes('meaningful trade-offs');
    recordTest('SUITE B', 3, 'Comparison lacking meaningful trade-off narrative is rejected', passedB3);

    // B.4 Missing justified conclusion rejected
    const bodyMissingConclusion = `
| Dimension | In-House Team | External Specialist |
|---|---|---|
| Direct Cost | Lower initial cash outlay | Higher upfront fee |
| Objectivity | Subject to internal bias | Completely objective |
| Velocity | Slower turnaround | Rapid turnaround |

While internal reviews offer lower cash outlay, they suffer from blind spots and slower execution velocity.
In contrast, hiring an external specialist requires a higher financial commitment, but yields rapid diagnostic depth.`;
    const resB4 = DeliverableContractValidator.validateSectionDeliverable(heading, bodyMissingConclusion);
    const passedB4 = !resB4.passed && resB4.missingElements.includes('justified conclusion');
    recordTest('SUITE B', 4, 'Comparison lacking justified conclusion / decision rule is rejected', passedB4);

    // B.5 Evidence-grounded compliant comparison accepted
    const bodyCompliant = `
| Dimension | In-House Team Review | External Specialist Audit |
|---|---|---|
| Direct Cost | Lower initial cash outlay | Higher upfront advisory fee |
| Diagnostic Depth | Routine surface-level inspection | Comprehensive heuristic and funnel teardown |
| Objectivity | Subject to institutional cognitive bias | Completely independent and objective |
| Velocity | Slower due to conflicting product roadmap tasks | Dedicated turnaround within two weeks |

When comparing an in-house review against an external specialist audit, technical leaders must evaluate crucial trade-offs between cash expenditure and diagnostic velocity.
While internal reviews avoid upfront agency fees, they often suffer from organizational blind spots and competing roadmap deadlines.
In contrast, engaging an external specialist incurs higher immediate advisory expenses, but provides rapid turnaround and uncompromised diagnostic depth.
In conclusion, choose an in-house audit when budget is severely constrained and only superficial checks are required; opt for an external specialist audit when preparing for a major product launch, high-stakes funding round, or critical checkout overhaul.`;

    const resB5 = DeliverableContractValidator.validateSectionDeliverable(heading, bodyCompliant);
    const passedB5 = resB5.passed && resB5.missingElements.length === 0;
    recordTest('SUITE B', 5, 'Fully compliant comparison with table, dimensions, trade-offs, and conclusion passes cleanly', passedB5);

    // B.6 Unsupported empirical percentage in comparison section is caught by numerical grounding
    const bodyUnsupportedStats = bodyCompliant + '\nStudies prove that 78.4% of users abandon checkout funnels due to form friction.';
    const numIssues = DeliverableContractValidator.validateNumericalGrounding(heading, bodyUnsupportedStats, undefined);
    const passedB6 = numIssues.length > 0 && numIssues.some(i => i.type === 'UNSUPPORTED_NUMERICAL' && i.matchedSnippet === '78.4%');
    recordTest('SUITE B', 6, 'Ungrounded empirical percentage (78.4%) in comparison section is caught by numerical grounding', passedB6);
  }

  // ===========================================================================
  // SUITE C: Compound Repair & Decoupled Bounded Structural Repair
  // ===========================================================================
  console.log('\n--- SUITE C: Compound Validation Repair & Orchestration Decoupling ---');
  {
    // Build defective article matching exact incident
    const brief = ContentBriefSchema.parse({
      title: 'Mastering Mobile Conversion Rates: A UX Optimization Guide',
      targetKeywords: ['mobile conversion rates', 'checkout optimization'],
      intent: {
        primaryKeyword: 'mobile conversion rates',
        intent: 'Informational',
        funnelStage: 'TOFU',
        userGoal: 'Optimize mobile checkout usability'
      },
      wordCountBudget: { min: 200, target: 400, max: 1500 },
      outline: [
        {
          heading: 'Evaluating Key Conversion Flows',
          level: 'H2',
          generate_table: false,
          assignedKeywords: ['mobile conversion rates'],
          core_concept: 'Checkout friction and form usability'
        },
        {
          heading: 'UX Audit Services Comparison Matrix',
          level: 'H2',
          generate_table: true,
          assignedKeywords: ['checkout optimization'],
          core_concept: 'Comparing audit approaches'
        }
      ]
    });
    brief.outline = planBlockVarietyForArticle(brief.outline);

    const evidenceSet: EvidenceSet = {
      items: [
        {
          id: 'ev_1',
          claim: 'Mitran Design provides UX strategy and mobile checkout interface audits.',
          evidenceType: 'BUSINESS_FACT',
          sourceType: 'TARGET_SITE',
          sourceUrl: 'https://mitran.design',
          confidence: 'HIGH',
          citationRequired: false
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: {
        totalCount: 1,
        highConfidenceCount: 1,
        businessFactCount: 1,
        competitorObservationCount: 0,
        serpObservationCount: 0,
        inferenceCount: 0
      }
    };

    // The defective article body containing both:
    // 1. Three consecutive (2, PROSE, M-M) paragraphs across the H2
    // 2. An incomplete comparison deliverable in Section 2 (no table, no conclusion)
    const defectiveMarkdown = `# Mastering Mobile Conversion Rates: A UX Optimization Guide

## Evaluating Key Conversion Flows

Mobile conversion rates require continuous diagnostic measurement across critical onboarding and checkout funnels.

${P_MM_1}

${P_MM_2}

## UX Audit Services Comparison Matrix

${P_MM_3}

Selecting audit services requires product teams to evaluate strategic alignment. Technical leaders must understand trade-offs before investing.`;

    // C.1 Initial validation identifies BOTH violations
    const initialSigReport = ParagraphSignatureValidator.validate(defectiveMarkdown);
    const initialDelivReport = DeliverableContractValidator.validateSectionDeliverable(
      '## UX Audit Services Comparison Matrix',
      defectiveMarkdown.split('## UX Audit Services Comparison Matrix')[1]
    );

    const passedC1 = !initialSigReport.valid &&
      initialSigReport.violations.length === 1 &&
      !initialDelivReport.passed &&
      initialDelivReport.missingElements.includes('explicit alternatives') &&
      initialDelivReport.missingElements.includes('justified conclusion');
    recordTest('SUITE C', 1, 'Initial validation identifies both structural repetition AND incomplete deliverable contract', passedC1);

    // C.2 TargetedRepairEngine receives the exact structural violation
    const mapping = TargetedRepairEngine.mapDiagnosticToBlockTarget(
      defectiveMarkdown,
      brief.outline,
      initialSigReport.violations[0],
      1
    );
    const passedC2 = mapping.success &&
      mapping.target.sectionHeading === 'Evaluating Key Conversion Flows' &&
      mapping.target.mode === 'PROSE' &&
      /^blk_\d+_\d+$/.test(mapping.target.blockId);
    recordTest('SUITE C', 2, 'TargetedRepairEngine maps violation to exact affected section and block ID', passedC2);

    // C.3 Targeted structural repair succeeds despite unrelated deliverable failure
    // Mock LLM returns a compliant (3, PROSE, S-M-L) paragraph to replace the middle paragraph
    const mockLLM = new MockRepairLLMProvider(async () => P_VAR_SML);

    const repairSummary: BoundedRepairSummary = await TargetedRepairEngine.executeBoundedRepair(
      defectiveMarkdown,
      {
        brief,
        targetBrand: 'Mitran Design',
        evidenceSet,
        maxAttempts: 2,
        runId: 'test_compound_run_001'
      },
      mockLLM
    );

    const passedC3 = repairSummary.status === 'repaired' &&
      repairSummary.structuralRepairSucceeded === true &&
      repairSummary.allValidatorsPassed === false && // Document still has deliverable violation!
      Array.isArray(repairSummary.unrelatedViolationsRemaining) &&
      repairSummary.unrelatedViolationsRemaining.length > 0;
    recordTest('SUITE C', 3, 'Targeted repair reports structuralRepairSucceeded: true without declaring whole document valid', passedC3);

    // C.4 Outstanding deliverable violations remain preserved in repaired markdown
    const candidateAfterTargeted = repairSummary.repairedMarkdown!;
    const sigCheckAfterTargeted = ParagraphSignatureValidator.validate(candidateAfterTargeted);
    const delivCheckAfterTargeted = DeliverableContractValidator.validateSectionDeliverable(
      '## UX Audit Services Comparison Matrix',
      candidateAfterTargeted.split('## UX Audit Services Comparison Matrix')[1]
    );

    const passedC4 = sigCheckAfterTargeted.valid === true &&
      delivCheckAfterTargeted.passed === false;
    recordTest('SUITE C', 4, 'Structural repetition is eliminated while deliverable violation is preserved for next repair stage', passedC4);

    // C.5 Simulating next repair stage providing compliant comparison deliverable
    const compliantSection2Body = `
| Dimension | In-House Team Review | External Specialist Audit |
|---|---|---|
| Direct Cost | Lower initial cash outlay | Higher upfront advisory fee |
| Diagnostic Depth | Routine surface-level inspection | Comprehensive heuristic and funnel teardown |
| Objectivity | Subject to institutional cognitive bias | Completely independent and objective |
| Velocity | Slower due to conflicting product roadmap tasks | Dedicated turnaround within two weeks |

When comparing an in-house review against an external specialist audit, technical leaders must evaluate crucial trade-offs between cash expenditure and diagnostic velocity.
While internal reviews avoid upfront agency fees, they often suffer from organizational blind spots and competing roadmap deadlines.
In contrast, engaging an external specialist incurs higher immediate advisory expenses, but provides rapid turnaround and uncompromised diagnostic depth.
In conclusion, choose an in-house audit when budget is severely constrained; opt for an external specialist audit when preparing for a major product launch or critical checkout overhaul.`;

    const fullCompliantMarkdown = `# Mastering Mobile Conversion Rates: A UX Optimization Guide

## Evaluating Key Conversion Flows

Mobile conversion rates require continuous diagnostic measurement across critical onboarding and checkout funnels.

${P_MM_1}

${P_VAR_SML}

## UX Audit Services Comparison Matrix

${compliantSection2Body}`;

    // C.6 Whole-document revalidation of fully repaired markdown
    const finalSigReport = ParagraphSignatureValidator.validate(fullCompliantMarkdown);
    const finalDelivReport = DeliverableContractValidator.validateSectionDeliverable(
      '## UX Audit Services Comparison Matrix',
      compliantSection2Body
    );

    const passedC6 = finalSigReport.valid === true &&
      finalDelivReport.passed === true &&
      finalDelivReport.missingElements.length === 0;
    recordTest('SUITE C', 6, 'Whole-document revalidation passes cleanly when both structural and deliverable fixes are applied', passedC6);

    // C.7 Genuinely compliant repaired article reaches READY state and passes boundary
    const compliantAsset = createValidReadyAsset(fullCompliantMarkdown);
    const boundaryCheck = ArtifactLifecycleBoundary.verifyPublishableArtifact(compliantAsset, {
      saasProfile: BASE_SAAS_PROFILE
    });
    const passedC7 = boundaryCheck.isEligible === true && boundaryCheck.status === 'READY';
    recordTest('SUITE C', 7, 'Compliant article crosses ArtifactLifecycleBoundary with status READY and cryptographic fingerprint', passedC7);

    // C.8 Negative Control: Failed or exhausted repairs remain blocked
    const defectiveAsset = {
      ...createValidReadyAsset(defectiveMarkdown),
      validationStatus: 'REVIEW_REQUIRED' as const
    };
    const defectiveBoundaryCheck = ArtifactLifecycleBoundary.verifyPublishableArtifact(defectiveAsset);
    const passedC8 = defectiveBoundaryCheck.isEligible === false && defectiveBoundaryCheck.status === 'REVIEW_REQUIRED';
    recordTest('SUITE C', 8, 'Negative Control: Asset with unresolved violations strictly fails closed with ERR_REVIEW_REQUIRED', passedC8);
  }

  // ===========================================================================
  // SUITE D: Security and Lifecycle Regression
  // ===========================================================================
  console.log('\n--- SUITE D: Security, Lifecycle & Publication Boundary Protections ---');
  {
    // D.1 No provenance weakening: Tampered validation fingerprint rejected
    const tamperedAsset = {
      ...createValidReadyAsset('# Valid\n\n' + P_VAR_SML),
      validationFingerprint: 'v1:0000000000000000000000000000000000000000000000000000000000000000'
    };
    const tamperedCheck = ArtifactLifecycleBoundary.verifyPublishableArtifact(tamperedAsset);
    const passedD1 = tamperedCheck.isEligible === false && tamperedCheck.status === 'STALE_FINGERPRINT';
    recordTest('SUITE D', 1, 'Cryptographic fingerprint tampering is strictly caught with STALE_FINGERPRINT', passedD1);

    // D.2 No tenant-isolation regression: Entity mismatch between asset and profile
    const validAssetBase = createValidReadyAsset('# Valid\n\n' + P_VAR_SML);
    const tenantMismatchCheck = ArtifactLifecycleBoundary.verifyPublishableArtifact(validAssetBase, {
      saasProfile: { name: 'Competitor Corp', website: 'https://competitor.com' } as SaaSProfile
    });
    const passedD2 = tenantMismatchCheck.isEligible === false && tenantMismatchCheck.status === 'BRAND_MISMATCH';
    recordTest('SUITE D', 2, 'Tenant identity mismatch strictly rejected with BRAND_MISMATCH', passedD2);

    // D.3 ArticleExportService blocks export of unapproved assets
    let exportBlocked = false;
    try {
      ArticleExportService.generateStandaloneHtml({
        title: 'Draft',
        bodyMarkdown: '## UX Audit Services Comparison Matrix\n\nEmpty content.',
        targetBrand: 'Mitran Design'
      });
    } catch (err: any) {
      exportBlocked = err.message.includes('Export blocked');
    }
    recordTest('SUITE D', 3, 'ArticleExportService strictly blocks export of deliverable contract violations', exportBlocked);

    // D.4 DistributionService refuses distribution of REJECTED or REVIEW_REQUIRED assets
    let providerCallCount = 0;
    const mockProvider = {
      channelName: 'website' as const,
      publish: async () => {
        providerCallCount++;
        return { success: true, externalId: 'test-ext-1' };
      }
    };
    const inMemoryRepo: DistributionRepository = {
      saveJob: async () => 'mock-id',
      getJobByIdempotencyKey: async () => null,
      getJobById: async () => null
    };

    const distService = new DistributionService([mockProvider as any], inMemoryRepo);
    const distReq: DistributionRequest = {
      contentAssetId: 'test-asset-1',
      channels: ['website'],
      idempotencyKey: 'idem-test-6d6r'
    };

    const reviewAsset = { ...createValidReadyAsset('# Title\n\n' + P_VAR_SML), validationStatus: 'REVIEW_REQUIRED' as const };
    const distRes = await distService.distributeAsset(BASE_SAAS_PROFILE, reviewAsset, distReq);
    const passedD4 = distRes[0].status === 'FAILED' && providerCallCount === 0;
    recordTest('SUITE D', 4, 'DistributionService strictly refuses distribution of unapproved assets with zero provider calls', passedD4);
  }

  // Summary
  console.log('\n========================================================================');
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(` SUMMARY: ${passed} / ${total} ASSERTIONS VERIFIED`);
  console.log(` FAILED: ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuites().catch(err => {
  console.error('Test execution failed with fatal error:', err);
  process.exit(1);
});
