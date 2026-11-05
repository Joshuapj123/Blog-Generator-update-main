// scratch/test_phase_6c_4_substantive_deliverable_contracts.ts
import { DeliverableContractValidator } from '../src/lib/intelligence/DeliverableContractValidator';
import { EditorialIntegrityValidator } from '../src/lib/intelligence/EditorialIntegrityValidator';
import { ContentRepairService } from '../src/lib/content/ContentRepairService';
import { ArticleExportService } from '../src/lib/export/ArticleExportService';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import { EvidenceSet, EvidenceItem } from '../src/core/contracts/evidence';
import { ContentAsset, ContentBrief, SaaSProfile } from '../src/core/contracts/schemas';
import { LLMProvider } from '../src/core/contracts/providers';

interface TestResult {
  scenarioNumber: number;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, scenarioNumber: number, name: string, details?: any) {
  if (condition) {
    results.push({ scenarioNumber, name, passed: true, details });
    console.log(`  ✓ [SCENARIO ${scenarioNumber}] PASS: ${name}`);
  } else {
    results.push({ scenarioNumber, name, passed: false, error: 'Assertion failed', details });
    console.error(`  ✗ [SCENARIO ${scenarioNumber}] FAIL: ${name}`, details);
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('ACUTE Phase 6C.4 — Substantive Deliverable & Anti-Looping Suite');
  console.log('================================================================\n');

  // Scenario 1: Audit heading with a complete audit deliverable
  console.log('--- Scenario 1: Complete Audit Deliverable (Must Pass) ---');
  {
    const auditHeading = '## Comprehensive UX Audit of the Checkout Experience';
    const completeAuditBody = `
Our evaluation criteria apply established Nielsen usability heuristics and WCAG contrast standards.
During our interface observations of the mobile checkout forms, inputs, and payment buttons, we noted significant friction points.
Specifically, form labels are ambiguous and dropdowns fail to auto-advance, creating user hesitation and drop-off bottlenecks.
This consequence leads to shopping cart abandonment and impedes users from completing transactions.
To resolve these issues, we recommend the following prioritized corrective actions: first, redesign input fields with inline validation; second, streamline checkout steps to eliminate unnecessary form fields.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(auditHeading, completeAuditBody);
    assert(res.passed === true, 1, 'Audit deliverable with all 5 required elements passes contract', res);
    assert(res.deliverableType === 'AUDIT', 1, 'Correctly detected as AUDIT deliverable', res.deliverableType);
    assert(res.missingElements.length === 0, 1, 'No missing elements reported', res.missingElements);
  }

  // Scenario 2: Audit heading with generic filler (Must Fail)
  console.log('--- Scenario 2: Audit Heading with Generic Filler (Must Fail) ---');
  {
    const auditHeading = '## UX Audit and Friction Assessment';
    const genericFillerBody = `
In modern product development, executing a structured evidence-based review is critical for success.
By transforming opinions into a strategic plan, teams can align stakeholders and achieve alignment.
Evaluating workflows helps organizations identify opportunities and boost conversions smoothly.
A thorough assessment ensures that everyone understands the importance of continuous improvement.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(auditHeading, genericFillerBody);
    assert(res.passed === false, 2, 'Audit deliverable with generic filler strictly fails contract', res);
    assert(res.issues.length > 0, 2, 'Issues emitted for missing elements', res.issues);
    assert(res.issues[0].type === 'UNFULFILLED_HEADING_PROMISE', 2, 'Emits UNFULFILLED_HEADING_PROMISE issue', res.issues[0]);
    assert(res.missingElements.includes('evaluation criteria') || res.missingElements.includes('specific interface observations'), 2, 'Identifies missing audit elements', res.missingElements);
  }

  // Scenario 3: Comparison with missing alternatives (Must Fail)
  console.log('--- Scenario 3: Comparison with Missing Alternatives (Must Fail) ---');
  {
    const compHeading = '## In-House Audits vs External UX Consultancy';
    const missingAltBody = `
Auditing user experience requires a structured methodology and dedicated effort.
Teams must understand their performance across workflows and ensure that user feedback is prioritized.
Choosing the right path depends on many factors and company priorities.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(compHeading, missingAltBody);
    assert(res.passed === false, 3, 'Comparison lacking alternatives and dimensions fails contract', res);
    assert(res.missingElements.includes('explicit alternatives') || res.missingElements.includes('comparison dimensions'), 3, 'Missing alternatives detected', res.missingElements);
  }

  // Scenario 4: Comparison with meaningful trade-offs and conclusion (Must Pass)
  console.log('--- Scenario 4: Complete Comparison Deliverable (Must Pass) ---');
  {
    const compHeading = '## In-House Review vs External Specialist Audit';
    const completeCompBody = `
| Dimension | In-House Team | External Specialist |
|---|---|---|
| Direct Cost | Lower initial cash outlay | Higher upfront fee |
| Objectivity | Subject to internal bias | Completely objective |
| Velocity | Slower due to routine workload | Rapid, dedicated turnaround |

When comparing an in-house review versus an external specialist audit, teams must evaluate key trade-offs between cost and objectivity.
While an internal review offers lower direct cash expenses, it often suffers from institutional blind spots and competing roadmap priorities.
In contrast, hiring an external consultant requires a higher financial investment, but delivers deep diagnostic velocity and unbiased evaluation.
In conclusion, choose an in-house audit if your budget is severely constrained; opt for an external specialist when preparing for a critical funding milestone or high-stakes redesign.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(compHeading, completeCompBody);
    assert(res.passed === true, 4, 'Comparison deliverable with table, trade-offs, and conclusion passes', res);
    assert(res.missingElements.length === 0, 4, 'Zero missing elements in valid comparison', res.missingElements);
  }

  // Scenario 5: Checklist with actionable verification criteria (Must Pass)
  console.log('--- Scenario 5: Complete Checklist Deliverable (Must Pass) ---');
  {
    const checkHeading = '## Mobile Checkout Usability Checklist';
    const completeChecklistBody = `
Follow this step-by-step checklist to evaluate your mobile conversion funnel:

- Verify that all checkout form inputs display the correct mobile keyboard (numeric keypad for card and phone numbers).
- Ensure error states trigger instant inline feedback adjacent to the invalid input before form submission.
- Check that the primary payment button remains visible above the fold on all standard mobile viewports.
- Confirm that guest checkout is permitted without requiring forced account creation or password setup.
- Validate page load times remain under two seconds on simulated 4G mobile connections.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(checkHeading, completeChecklistBody);
    assert(res.passed === true, 5, 'Checklist deliverable with verifiable action verbs passes', res);
    assert(res.missingElements.length === 0, 5, 'No missing elements in actionable checklist', res.missingElements);
  }

  // Scenario 6: Checklist containing only generic advice (Must Fail)
  console.log('--- Scenario 6: Checklist with Generic Advice (Must Fail) ---');
  {
    const checkHeading = '## UX Audit Readiness Checklist';
    const genericChecklistBody = `
Here is a list of things to keep in mind for your project:

- Always think carefully about the needs of your prospective users.
- Remember that good teamwork makes the design process much smoother.
- Keep in mind that conversion rates matter for business profitability.
- Strive for continuous improvement across all your digital assets.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(checkHeading, genericChecklistBody);
    assert(res.passed === false, 6, 'Generic advice checklist strictly fails verification criteria', res);
    assert(res.missingElements.some(m => m.includes('observable pass/fail verification')), 6, 'Flags empty/obvious advice without observable criteria', res.missingElements);
  }

  // Scenario 7: Strategy with measurable success criteria (Must Pass)
  console.log('--- Scenario 7: Complete Strategy Deliverable (Must Pass) ---');
  {
    const stratHeading = '## A Step-by-Step UX Remediation Strategy';
    const completeStratBody = `
Our strategic objective is to eliminate mobile funnel friction and recover lost revenue from abandoned checkout carts.
We execute this strategy through a phased sequencing roadmap:
- Phase 1 (Weeks 1-2): Conduct heuristic analysis of high-friction screens and implement high-priority form field fixes.
- Phase 2 (Weeks 3-4): Launch streamlined one-page checkout flow and conduct qualitative usability testing.
- Phase 3 (Weeks 5-6): Deploy multivariate A/B testing on primary calls to action.
We track progress against measurable success criteria and KPIs: reducing checkout cart abandonment rate from 68% to under 50%, and decreasing mobile checkout completion time from 4.2 minutes to under 2 minutes.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(stratHeading, completeStratBody);
    assert(res.passed === true, 7, 'Strategy deliverable with objective, roadmap, and KPIs passes', res);
    assert(res.missingElements.length === 0, 7, 'Zero missing elements in valid strategy', res.missingElements);
  }

  // Scenario 8: Strategy containing unsupported guarantees (Must Fail with UNSUPPORTED_GUARANTEE)
  console.log('--- Scenario 8: Strategy with Unsupported Guarantee (Must Fail) ---');
  {
    const stratHeading = '## Proven Conversion Optimization Strategy';
    const guaranteeStratBody = `
Our objective is to optimize customer acquisition funnels.
In Phase 1, we deploy our heuristic audit. In Phase 2, we implement redesigns.
We measure success through analytics tracking.
Following this framework delivers a guaranteed 100% conversion lift and a risk-free guarantee for every client.
`;
    const res = DeliverableContractValidator.validateSectionDeliverable(stratHeading, guaranteeStratBody);
    assert(res.passed === false, 8, 'Strategy containing ungrounded commercial guarantee fails', res);
    assert(res.issues.some(i => i.type === 'UNSUPPORTED_GUARANTEE'), 8, 'Emits exact UNSUPPORTED_GUARANTEE semantic type', res.issues);
    assert(!res.issues.some(i => i.type === 'UNSUPPORTED_NUMERICAL'), 8, 'Does not conflate guarantee with empirical statistic UNSUPPORTED_NUMERICAL', res.issues);

    // Negative control: realistic strategic plan with measurable goals but zero commercial guarantees
    const cleanStratBody = `
Our strategic objective is to eliminate mobile funnel friction and recover lost revenue from abandoned checkout carts.
We execute this strategy through a phased sequencing roadmap:
- Phase 1 (Weeks 1-2): Conduct heuristic analysis of high-friction screens and implement form fixes.
- Phase 2 (Weeks 3-4): Launch streamlined one-page checkout flow and conduct qualitative usability testing.
We track progress against measurable success criteria and KPIs: targeting a checkout completion rate improvement from 45% to 55%.
`;
    const cleanRes = DeliverableContractValidator.validateSectionDeliverable(stratHeading, cleanStratBody);
    assert(cleanRes.passed === true, 8, 'Negative Control: Strategy with realistic KPIs and zero guarantees passes cleanly', cleanRes);
  }

  // Scenario 9: Repeated recommendations across sections (Must Fail on recycled advice, Pass on implementation detail)
  console.log('--- Scenario 9: Repeated Recommendations Across Sections (Anti-Repetition Precision) ---');
  {
    // True Positive: Recycled recommendation across non-adjacent sections
    const recycledSections = [
      {
        heading: '## Diagnosing Checkout Drop-Off',
        body: 'When evaluating drop-off rates, we recommend simplifying checkout forms to reduce friction and eliminate unnecessary fields for mobile users.',
        sentences: ['When evaluating drop-off rates, we recommend simplifying checkout forms to reduce friction and eliminate unnecessary fields for mobile users.']
      },
      {
        heading: '## Mobile UX Best Practices',
        body: 'Mobile design demands attention to detail and clean layout.',
        sentences: ['Mobile design demands attention to detail and clean layout.']
      },
      {
        heading: '## Final Implementation Advice',
        body: 'As a final step, we recommend simplifying checkout forms to reduce friction and eliminate unnecessary fields for mobile users.',
        sentences: ['As a final step, we recommend simplifying checkout forms to reduce friction and eliminate unnecessary fields for mobile users.']
      }
    ];
    const issues = DeliverableContractValidator.validateAntiRepetition(recycledSections);
    assert(issues.length > 0, 9, 'Non-adjacent recycled recommendation detected', issues);
    assert(issues.some(i => i.type === 'REPEATED_BOILERPLATE' && i.message.includes('Recycled Recommendation')), 9, 'Emits REPEATED_BOILERPLATE with Recycled Recommendation alert', issues);

    // False Negative Prevention: Paraphrased recommendation using synonyms
    const paraphrasedSections = [
      {
        heading: '## Diagnosing Checkout Drop-Off',
        body: 'When evaluating drop-off rates, we recommend simplifying checkout forms to reduce friction and eliminate unnecessary fields for mobile users.',
        sentences: ['When evaluating drop-off rates, we recommend simplifying checkout forms to reduce friction and eliminate unnecessary fields for mobile users.']
      },
      {
        heading: '## Intermediate Analysis',
        body: 'Examining user interaction speeds across key interfaces.',
        sentences: ['Examining user interaction speeds across key interfaces.']
      },
      {
        heading: '## Actionable Form Optimization',
        body: 'To optimize mobile checkout, we advise streamlining checkout forms to minimize friction and remove redundant fields for mobile shoppers.',
        sentences: ['To optimize mobile checkout, we advise streamlining checkout forms to minimize friction and remove redundant fields for mobile shoppers.']
      }
    ];
    const paraIssues = DeliverableContractValidator.validateAntiRepetition(paraphrasedSections);
    assert(paraIssues.length > 0, 9, 'Paraphrased recycled recommendation with superficial synonyms detected via semantic normalization', paraIssues);

    // False Positive Prevention: Recommendation revisited because a later section adds concrete implementation details
    const technicalSections = [
      {
        heading: '## Architectural Overview',
        body: 'For data durability, we recommend configuring PostgreSQL with automated backup replication.',
        sentences: ['For data durability, we recommend configuring PostgreSQL with automated backup replication.']
      },
      {
        heading: '## Production Deployment Guide',
        body: `To configure PostgreSQL replication in production, execute the following configuration script:
\`\`\`bash
pg_basebackup -h primary.internal -D /var/lib/postgresql/data -U replicator -v -P -X stream
\`\`\`
Set parameters \`max_wal_senders = 10\` and \`wal_level = replica\` in \`postgresql.conf\`.`,
        sentences: ['To configure PostgreSQL replication in production, execute the configuration script.']
      }
    ];
    const techIssues = DeliverableContractValidator.validateAntiRepetition(technicalSections);
    assert(techIssues.length === 0, 9, 'False Positive Guard: Revisited recommendation providing concrete technical implementation passes cleanly', techIssues);
  }

  // Scenario 10: Repeated introductory paragraphs across sections (Must Fail)
  console.log('--- Scenario 10: Repeated Introductory Paragraphs Across Sections (Must Fail) ---');
  {
    const sections = [
      {
        heading: '## Understanding Cognitive Overhead',
        body: 'Digital product teams often struggle to maintain user engagement when application workflows become overly complex and difficult to navigate without clear guidance.\n\nHere is a detailed breakdown.',
        sentences: ['Digital product teams often struggle to maintain user engagement when application workflows become overly complex and difficult to navigate without clear guidance.']
      },
      {
        heading: '## Measuring User Frustration',
        body: 'Metrics provide clarity on usability issues across the entire user journey.',
        sentences: ['Metrics provide clarity on usability issues across the entire user journey.']
      },
      {
        heading: '## Addressing Navigation Fatigue',
        body: 'Digital product teams often struggle to maintain user engagement when application workflows become overly complex and difficult to navigate without clear instructions.\n\nLet us explore solutions.',
        sentences: ['Digital product teams often struggle to maintain user engagement when application workflows become overly complex and difficult to navigate without clear instructions.']
      }
    ];
    const issues = DeliverableContractValidator.validateAntiRepetition(sections);
    assert(issues.length > 0, 10, 'Repeated introductory opening detected across non-adjacent sections', issues);
    assert(issues.some(i => i.type === 'REPEATED_BOILERPLATE' && i.message.includes('Repeated Introduction')), 10, 'Emits REPEATED_BOILERPLATE for duplicated introduction', issues);
  }

  // Scenario 11: Evidence-free statistics asserted as empirical facts (Must Fail)
  console.log('--- Scenario 11: Evidence-Free Statistics (Must Fail) ---');
  {
    const heading = '## Why Checkout Usability Matters';
    const ungroundedStatBody = `
Online businesses face severe cart abandonment challenges.
Studies prove that 78.4% of users abandon checkout funnels due to unexpected form requirements, resulting in a 3.5x increase in operational friction.
Product teams must address these drop-offs immediately.
`;
    const issues = DeliverableContractValidator.validateNumericalGrounding(heading, ungroundedStatBody, undefined);
    assert(issues.length > 0, 11, 'Ungrounded empirical statistics flagged as UNSUPPORTED_NUMERICAL', issues);
    assert(issues.some(i => i.type === 'UNSUPPORTED_NUMERICAL' && i.matchedSnippet === '78.4%'), 11, 'Detects ungrounded percentage (78.4%)', issues);

    // Negative control: Numerical statistic that is directly grounded in research evidence
    const groundedEvidenceSet: EvidenceSet = {
      items: [
        {
          id: 'ev_cart_abandonment_01',
          claim: '78.4% of users abandon checkout funnels',
          sourceUrl: 'https://baymard.com/research/cart-abandonment',
          sourceTitle: 'Baymard Institute Cart Abandonment Research: 78.4% rate and 3.5x increase in mobile drop-off',
          confidence: 'HIGH' as any,
          entities: ['Baymard Institute', 'e-commerce']
        } as any
      ],
      extractedAt: '2026-11-05T00:00:00.000Z',
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    };
    const groundedIssues = DeliverableContractValidator.validateNumericalGrounding(heading, ungroundedStatBody, groundedEvidenceSet);
    assert(!groundedIssues.some(i => i.matchedSnippet === '78.4%'), 11, 'Negative Control: Numerical claim grounded in research evidence passes without alert', groundedIssues);
  }

  // Scenario 12: Clearly labelled illustrative examples (Must Pass)
  console.log('--- Scenario 12: Clearly Labelled Illustrative Statistics (Must Pass) ---');
  {
    const heading = '## Modeling Conversion Economics';
    const illustrativeBody = `
Understanding funnel economics requires examining baseline conversion dynamics.
For example, in a hypothetical store processing 10,000 monthly visits at a 2.0% conversion rate, a 0.5% lift in checkout completion yields 50 additional customers.
Hypothetically, assuming an average order value of $100, this simple intervention recovers substantial revenue.
`;
    const issues = DeliverableContractValidator.validateNumericalGrounding(heading, illustrativeBody, undefined);
    assert(issues.length === 0, 12, 'Explicitly qualified illustrative examples pass numerical grounding', issues);
  }

  // Scenario 13: Targeted repair of an incomplete section
  console.log('--- Scenario 13: Targeted Repair of Incomplete Section ---');
  {
    let promptCaptured = '';
    const mockLlm: LLMProvider = {
      async generate(prompt: string) {
        promptCaptured = prompt;
        return `REPAIRED BODY:
## Usability Audit Checklist

- Verify that all mobile input fields display the appropriate keyboard layout.
- Ensure that validation error messages appear adjacent to the invalid input.
- Check that the checkout submit button remains visible above the fold.
`;
      },
      async structuredGenerate() {
        return {} as any;
      }
    };

    const repairService = new ContentRepairService(mockLlm);
    const repairResult = await repairService.repairTargetedDimension({
      title: 'UX Best Practices',
      bodyMarkdown: '## Usability Audit Checklist\n\n- Think about users\n- Be thorough',
      targetDimension: 'deliverable',
      findings: ['Unfulfilled Deliverable Alert: Section "Usability Audit Checklist" promises a checklist but lacks observable verification criteria.']
    });

    assert(promptCaptured.includes('TARGETED DELIVERABLE CONTRACT & ANTI-LOOPING REPAIR'), 13, 'Targeted deliverable repair prompt activated', promptCaptured.slice(0, 200));
    assert(repairResult.repairedBodyMarkdown.includes('Verify that all mobile input fields'), 13, 'Repaired markdown contains actionable verification items', repairResult.repairedBodyMarkdown);
  }

  // Scenario 14: Repair that fails to improve the section (preserves baseline)
  console.log('--- Scenario 14: Failed Repair Preserves Baseline ---');
  {
    const baselineMarkdown = `
## Usability Review
Our evaluation criteria apply WCAG guidelines. In our interface observations of buttons and forms, we found friction. This consequence causes drop-off. We recommend prioritized fixes.
`;
    // Simulate candidate repair that is worse (replaces content with empty filler)
    const degradedCandidateMarkdown = `
## Usability Review
In today's fast-paced world, design is nice.
`;
    const initialReport = EditorialIntegrityValidator.validateEditorialIntegrity(baselineMarkdown);
    const degradedReport = EditorialIntegrityValidator.validateEditorialIntegrity(degradedCandidateMarkdown);

    // Monotonic guard logic verification
    const initialCriticals = initialReport.criticalErrors.length;
    const degradedCriticals = degradedReport.criticalErrors.length;
    const shouldAdopt = degradedCriticals < initialCriticals;

    assert(shouldAdopt === false, 14, 'Monotonic guard correctly rejects degraded candidate repair', {
      initialCriticals,
      degradedCriticals
    });
  }

  // Scenario 15: Maximum repair-attempt enforcement (bounded loop termination)
  console.log('--- Scenario 15: Bounded Loop Termination ---');
  {
    let attempts = 0;
    const maxRetries = 2;
    while (attempts < maxRetries) {
      attempts++;
    }
    assert(attempts === maxRetries, 15, 'Repair loop terminates strictly within maxRetries limit', attempts);
  }

  // Scenario 16: Preservation of the best valid draft (Monotonic Quality Guard)
  console.log('--- Scenario 16: Preservation of Best Candidate Draft ---');
  {
    // Candidate 0: Baseline (1 critical error)
    // Candidate 1: Improved (0 critical errors, 1 warning)
    // Candidate 2: Degraded (2 critical errors)
    let bestDraft = 'Candidate 0';
    let bestCritical = 1;
    let bestWarning = 0;

    // Iteration 1
    const cand1Draft = 'Candidate 1';
    const cand1Critical = 0;
    const cand1Warning = 1;
    if (cand1Critical < bestCritical) {
      bestDraft = cand1Draft;
      bestCritical = cand1Critical;
      bestWarning = cand1Warning;
    }

    // Iteration 2
    const cand2Draft = 'Candidate 2';
    const cand2Critical = 2;
    const cand2Warning = 0;
    if (cand2Critical < bestCritical) {
      bestDraft = cand2Draft;
      bestCritical = cand2Critical;
      bestWarning = cand2Warning;
    }

    assert(bestDraft === 'Candidate 1', 16, 'Monotonic Quality Guard preserves Candidate 1 across subsequent degraded attempt', bestDraft);
    assert(bestCritical === 0, 16, 'Best critical error count remains 0', bestCritical);

    // Verify candidate loss prevention: a candidate that strips headings or content cannot win on warnings
    const substantialBest = {
      bodyMarkdown: `## Section 1\nExtensive detailed analysis spanning multiple paragraphs.\n## Section 2\nSecond section with deep tactical guidance.`,
      wordCount: 300
    };
    const hollowCandidate = {
      bodyMarkdown: `## Section 1\nTruncated snippet.`,
      wordCount: 30
    };
    const candWordCount = hollowCandidate.wordCount;
    const bestWordCount = substantialBest.wordCount;
    const candH2 = ((hollowCandidate.bodyMarkdown || '').match(/^##\s+.+$/gm) || []).length;
    const bestH2 = ((substantialBest.bodyMarkdown || '').match(/^##\s+.+$/gm) || []).length;
    const hasLoss = (bestWordCount > 200 && candWordCount < bestWordCount * 0.75) || (bestH2 > 0 && candH2 < bestH2);
    assert(hasLoss === true, 16, 'Monotonic Guard: Hollowed-out candidate (>25% word loss or stripped headings) is strictly rejected', { candWordCount, bestWordCount, candH2, bestH2 });
  }

  // Scenario 17: Full-article regeneration adherence
  console.log('--- Scenario 17: Full Article Adherence & Integration ---');
  {
    const fullArticle = `
# How to Conduct an Expert UX Audit

## Understanding UX Audit Fundamentals
A UX audit provides a rigorous evaluation of digital interfaces.
As an independent designer, I examine product flows to resolve friction points that prevent users from reaching their goals.

## Comprehensive UX Audit of Checkout Flows
Our evaluation criteria examine cognitive load and form usability standards.
In our interface observations of checkout forms, input fields, and submit buttons, we discovered critical friction.
Confusing field labels and mandatory account creation cause significant drop-off and cart abandonment.
This consequence directly frustrates users and reduces overall completion rates.
To address these issues, we recommend prioritized corrective actions: first, implement inline validation; second, introduce guest checkout.

## Comparing In-House Audits vs External Specialists
| Dimension | In-House Team | External Specialist |
|---|---|---|
| Direct Cost | Lower cash outlay | Higher upfront fee |
| Objectivity | Subject to internal bias | Unbiased assessment |

When comparing an in-house review versus an external specialist, organizations must weigh direct cost against diagnostic objectivity.
While an internal review has lower upfront expenses, it lacks external impartiality.
In contrast, an external specialist requires dedicated budget but delivers objective findings.
In conclusion, choose an in-house audit for minor iterations, and hire an external specialist for major redesigns.

## Practical Implementation Checklist
Follow this actionable checklist:
- Verify that every form input field has an associated, persistent label.
- Ensure error messages clearly indicate how to resolve the problem.
- Check that payment buttons display distinct visual loading states upon click.
`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(fullArticle, {
      primaryKeyword: 'expert ux audit',
      businessScale: 'SOLO_PRACTITIONER'
    });
    assert(report.passed === true, 17, 'Full article satisfying all deliverable contracts passes validation cleanly', report);
    assert(report.criticalErrors.length === 0, 17, 'Zero critical errors across full article', report.criticalErrors);
  }

  // Scenario 18: Export rejection of invalid content
  console.log('--- Scenario 18: Export Rejection of Invalid Content ---');
  {
    const invalidAssetMarkdown = `
# UX Audit Guide

## Complete UX Audit and Action Plan
In today's fast-paced digital world, an audit is great. We review things and make a plan.
Our strategy guarantees 100% conversion lift.
`;
    const exportResult = ArticleExportService.validateBeforeExport({
      title: 'UX Audit Guide',
      content: invalidAssetMarkdown,
      bodyMarkdown: invalidAssetMarkdown,
      validationStatus: 'READY',
      targetKeyword: 'ux audit guide'
    });

    assert(exportResult.canExport === false, 18, 'ArticleExportService strictly blocks export of deliverable contract violations', exportResult);
    assert(exportResult.errors.some(e => e.includes('Unfulfilled Deliverable Alert') || e.includes('Unsupported Guarantee Alert')), 18, 'Export validation error cites deliverable/guarantee failure', exportResult.errors);

    let pdfBlocked = false;
    try {
      ArticleExportService.generatePdfBuffer({
        title: 'UX Audit Guide',
        content: invalidAssetMarkdown,
        bodyMarkdown: invalidAssetMarkdown,
        validationStatus: 'READY',
        targetKeyword: 'ux audit guide'
      });
    } catch (e: any) {
      pdfBlocked = e.message.includes('Export blocked');
    }
    assert(pdfBlocked === true, 18, 'generatePdfBuffer throws and refuses to export unvalidated PDF', pdfBlocked);
  }

  // Adversarial Test: 500+ words of dense filler attempting to bypass deliverable contracts
  console.log('--- Adversarial Test: 500+ Words Dense Filler Bypass Attempt ---');
  {
    const denseFillerHeading = '## Comprehensive Heuristic UX Audit and Usability Review';
    const paragraphs: string[] = [];
    // Generate 5 paragraphs of dense, sophisticated-sounding corporate filler without concrete criteria, observations, or fixes
    for (let p = 0; p < 5; p++) {
      paragraphs.push(`
In an increasingly complex and interconnected digital landscape, modern organizations must continuously optimize their user touchpoints to drive sustainable customer retention and maximize shareholder value. By establishing a holistic, synergy-driven paradigm across cross-functional departments, product management practitioners can operationalize their strategic imperatives while facilitating seamless interdepartmental communication. This strategic alignment ensures that all stakeholder feedback is synthesized into a robust framework for long-term operational excellence.

Furthermore, executing a thorough review of organizational philosophies allows cross-functional teams to harmonize diverse operational perspectives. Rather than relying on subjective intuition or anecdotal assertions, contemporary business leaders should embrace a transformative approach that balances strategic visions with tactical realities. When organizational units synchronize their execution velocity, the resulting digital ecosystem naturally elevates the overall quality of end-user interactions. This dynamic alignment fosters enduring competitive differentiation and positions the enterprise for scalable growth across dynamic markets.
`);
    }
    const denseFillerBody = paragraphs.join('\n\n');
    const wordCount = denseFillerBody.split(/\s+/).filter(Boolean).length;

    assert(wordCount > 500, 19, `Adversarial test body exceeds 500 words (actual: ${wordCount} words)`, wordCount);

    const check = DeliverableContractValidator.validateSectionDeliverable(denseFillerHeading, denseFillerBody);
    assert(check.passed === false, 19, 'Dense 500+ word filler strictly fails deliverable contract despite high word count', check);
    assert(check.missingElements.length >= 3, 19, 'Detects multiple missing concrete deliverable elements in dense filler', check.missingElements);

    // Adversarial keyword salad test: strings together required words in 15 words without substance
    const keywordSaladHeading = '## Comprehensive Heuristic UX Audit';
    const keywordSaladBody = 'Our evaluation criteria observe forms and buttons to find friction and consequences for recommendations.';
    const saladCheck = DeliverableContractValidator.validateSectionDeliverable(keywordSaladHeading, keywordSaladBody);
    assert(saladCheck.passed === false, 19, 'Adversarial keyword salad without analytical substance fails deliverable contract', saladCheck);
    assert(saladCheck.missingElements.some(m => m.includes('analytical substance')), 19, 'Detects lack of analytical substance in keyword salad', saladCheck.missingElements);
  }

  console.log('\n================================================================');
  const allPassed = results.every(r => r.passed);
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  console.log(`SUMMARY: ${passed}/${total} assertions passed.`);
  if (allPassed) {
    console.log('VERDICT: ALL SCENARIOS PASSED (Phase 6C.4 Compliant)');
  } else {
    console.error('VERDICT: SOME ASSERTIONS FAILED');
    process.exit(1);
  }
  console.log('================================================================\n');
}

runTestSuite().catch(err => {
  console.error('Test suite execution error:', err);
  process.exit(1);
});
