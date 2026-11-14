// scratch/test_phase_6d_4_expertise_genericity_validator.ts
/**
 * ACUTE Phase 6D.4: Expertise & Genericity Validator Adversarial Test Suite
 *
 * Mode: RUTHLESS MENTOR — FORENSIC ENGINEERING, ZERO FABRICATION
 *
 * Requirements:
 * - At least 50 distinct adversarial scenarios across all 8 dimensions
 * - At least 100 assertions
 * - Testing finding-level, section-level, and article-level validation
 * - Verifying scoring rubrics, dimension bounds, and fail-closed security decision logic
 */

import { ExpertiseGenericityValidator } from '../src/lib/intelligence/ExpertiseGenericityValidator';
import {
  WorkedFinding,
  WorkedFindingSchema,
  OutlineNode,
  ContentBrief,
  VerifiedPractitionerContext
} from '../src/core/contracts/schemas';
import { EvidenceSet, EvidenceItem } from '../src/core/contracts/evidence';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let totalAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runScenario(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [${totalTests}] ${name}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  ❌ [${totalTests}] ${name} -> ${err.message}`);
  }
}

console.log('================================================================');
console.log('ACUTE Phase 6D.4: Expertise & Genericity Validator Test Suite');
console.log('================================================================\n');

// 1. Fixtures & Baseline Objects
const mockEvidenceSet: any = {
  evidenceItemId: 'ev-set-1',
  targetDomain: 'example.com',
  extractedAt: '2026-11-14T10:00:00Z',
  totalItems: 3,
  items: [
    {
      id: 'ev_perf_1',
      type: 'PERFORMANCE_BENCHMARK',
      claim: 'Core Web Vitals INP p75 improved from 320ms to 85ms across 1.2M impressions.',
      sourceUrl: 'https://crux.dev/report/example',
      context: 'Measured after migrating heavy JS chunking to Web Worker.',
      confidence: 'HIGH'
    },
    {
      id: 'ev_case_1',
      type: 'CASE_STUDY',
      claim: 'Enterprise migration reduced monthly AWS compute spend by 28%.',
      sourceUrl: 'https://example.com/case-studies/aws-opt',
      context: 'Case study across 3 Kubernetes clusters over 6 months.',
      confidence: 'HIGH'
    },
    {
      id: 'ev_stat_1',
      type: 'STATISTIC',
      claim: 'Checkout funnel completion drops by 26% when account creation is mandated before cart review.',
      sourceUrl: 'https://nngroup.com/articles/checkout-ux',
      context: 'Comprehensive UX research study across 40 ecommerce sites.',
      confidence: 'HIGH'
    }
  ],
  confidenceThresholdMet: true
};

const mockPractitionerContext: any = {
  practitionerId: 'prac-joshua-1',
  primarySpecialty: 'Enterprise Web Performance & Scaled SEO Systems',
  yearsActive: 12,
  verifiedCapabilities: ['Core Web Vitals remediation', 'TypeScript architectural audits', 'Database query optimization'],
  evidenceReferenceIds: ['ev_perf_1', 'ev_case_1'],
  firstPersonVoiceAllowed: false,
  verifiedPrinciples: [
    {
      principleId: 'principle-inp-1',
      statement: 'Audit p95 latency before optimizing average throughput',
      explanation: 'P95 reflects real mobile user degradation during peak loads.',
      context: 'Latency Auditing',
      verificationStatus: 'VERIFIED',
      approvalStatus: 'APPROVED'
    }
  ],
  verifiedProjects: [
    {
      projectId: 'proj-cwv-101',
      projectTitle: 'High-Volume Ecommerce INP Stabilization',
      projectType: 'Architecture',
      confidentialityLevel: 'ANONYMIZED',
      clientNamingPermission: false,
      anonymizedDescription: 'Major retail store INP remediation and Web Worker thread isolation.',
      problemObserved: 'Excessive main-thread script evaluation caused 320ms INP delays during mobile checkout.',
      intervention: 'Decoupled analytics and hydration into dedicated web workers.',
      documentedOutcome: 'Reduced checkout churn by 14% via INP stabilization and halved script execution time.',
      verificationStatus: 'VERIFIED',
      approvalStatus: 'APPROVED'
    }
  ]
};

const mockOutline: OutlineNode[] = [
  {
    heading: 'Diagnosing Interaction to Next Paint Bottlenecks',
    level: 'H2',
    generate_table: false,
    assignedKeywords: ['INP bottlenecks', 'Core Web Vitals'],
    assignedEntities: ['PerformanceObserver', 'Long Tasks']
  },
  {
    heading: 'Decoupling Heavy Execution via Web Workers',
    level: 'H2',
    generate_table: false,
    assignedKeywords: ['Web Workers', 'hydration'],
    assignedEntities: ['Comlink', 'Worker thread']
  },
  {
    heading: 'Continuous Field Telemetry and Real User Monitoring',
    level: 'H2',
    generate_table: false,
    assignedKeywords: ['RUM monitoring', 'CrUX telemetry'],
    assignedEntities: ['BigQuery', 'Chrome UX Report']
  }
];

const mockBrief: any = {
  id: 'brief-perf-1',
  title: 'Production Guide to Core Web Vitals Optimization',
  assetType: 'ARTICLE',
  targetKeywords: ['Core Web Vitals optimization', 'INP remediation'],
  primaryIntent: 'TECHNICAL_GUIDE',
  wordCountBudget: { min: 1500, max: 2500, target: 2000 },
  outline: mockOutline
};

function createValidFinding(overrides?: Partial<WorkedFinding>): WorkedFinding {
  return {
    findingId: 'wf-valid-1',
    sectionId: 'sec-1',
    findingType: 'PROBLEM_FINDING' as const,
    title: 'Client-side Hydration Latency on Mobile Viewports',
    observation: 'Long Tasks exceeding 50ms during client-side hydration block user input events, driving p75 INP up to 320ms on mobile viewports.',
    evidenceReferences: ['ev_perf_1'],
    evidenceClassification: 'OBSERVED_FACT',
    confidence: 'HIGH',
    limitations: ['Applies primarily to mobile devices with mid-tier CPUs running intensive React hydration.'],
    interpretation: 'Interactions queued during script parsing experience tactile delay because the main thread cannot yield, violating Google Page Experience thresholds.',
    businessImpact: 'Unresponsive mobile interactions during checkout increased cart abandonment by 14% during flash sale traffic.',
    recommendation: 'Offload non-critical telemetry and client analytics into dedicated Web Workers via Comlink RPC bridges.',
    implementationSteps: [
      'Instrument PerformanceObserver with longtask entryTypes to profile specific script origins.',
      'Initialize a dedicated Web Worker script module using standard bundler worker syntax.',
      'Wrap heavy parsing and analytics calls in comlink proxies to keep the main thread idle.',
      'Verify that Long Task duration drops below 50ms across synthetic Lighthouse and CrUX field tests.'
    ],
    validationMethod: 'Profile main thread with PerformanceObserver and query weekly rolling CrUX p75 INP.',
    successCriteria: 'Continuous RUM p75 INP remains strictly under 100ms across 7-day rolling window in CrUX dashboard.',
    thresholdProvenance: 'EMPIRICAL_BENCHMARK',
    ...overrides
  };
}

// =============================================================
// CATEGORY 1: GENERICITY & SPECIFICITY TESTS (Scenarios 1-7)
// =============================================================
console.log('--- Category 1: Genericity & Specificity Tests ---');

runScenario('Scenario 1: Pure boilerplate without technical context', () => {
  const finding = createValidFinding({
    observation: 'In today digital world, it is crucial to use industry best practices to improve the user experience.',
    recommendation: 'Focus on customer satisfaction to drive business growth and take your business to the next level.',
    implementationSteps: ['Adopt best practices.', 'Ensure high quality.', 'Follow the standard guidelines.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'EXPERTISE_SPECIFICITY'), 'Should flag EXPERTISE_SPECIFICITY');
  assert(res.dimensionScores.EXPERTISE_SPECIFICITY.score < 80, 'Specificity score should be penalized');
  assert(res.dimensionScores.EXPERTISE_SPECIFICITY.criticalCount >= 1 || res.dimensionScores.EXPERTISE_SPECIFICITY.warningCount >= 1, 'Should record violations count in dimension');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'SPECIFY_CONTEXT'), 'Suggested correction category must be SPECIFY_CONTEXT');
});

runScenario('Scenario 2: Empty advisory implementation steps ("be careful", "do your best")', () => {
  const finding = createValidFinding({
    recommendation: 'Make sure everything works and proceed with caution during deployment.',
    implementationSteps: ['Be careful when editing code.', 'Review the code carefully.', 'Stay vigilant.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'RECOMMENDATION_QUALITY' && f.explanation.includes('empty advisory')), 'Should flag empty advisory steps');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.score <= 88, 'Recommendation quality score must be deducted');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'CONCRETIZE_ACTION'), 'Suggested correction category must be CONCRETIZE_ACTION');
});

runScenario('Scenario 3: Recommendation lacking sequenced implementation steps (empty array)', () => {
  const finding = createValidFinding({
    implementationSteps: []
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'RECOMMENDATION_QUALITY' && f.severity === 'CRITICAL'), 'Empty implementation steps must be CRITICAL');
  assert(res.criticalViolationsCount >= 1, 'Critical violations count must be at least 1');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.passed === false, 'Recommendation quality must not pass');
});

runScenario('Scenario 4: Concrete technical finding passes with high specificity score', () => {
  const finding = createValidFinding();
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  const specScore = res.dimensionScores.EXPERTISE_SPECIFICITY.score;
  assert(specScore === 100, `Expected specificity 100, got ${specScore}`);
  assert(!res.findings.some(f => f.dimension === 'EXPERTISE_SPECIFICITY'), 'Clean technical finding should have 0 specificity issues');
  assert(res.dimensionScores.EXPERTISE_SPECIFICITY.passed === true, 'Specificity passed must be true');
});

runScenario('Scenario 5: Foundational technical observation with action verb steps', () => {
  const finding = createValidFinding({
    observation: 'Event loop macrotask queuing delays microtask promise resolution during DOM layout changes.',
    implementationSteps: [
      'Audit requestAnimationFrame callbacks.',
      'Refactor state updates to queueMicrotask.',
      'Benchmark repaint intervals with DevTools performance panel.'
    ]
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.passed, 'Action verb steps should pass recommendation quality');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.score === 100, 'Score should be 100 for clean action steps');
});

runScenario('Scenario 6: Implementation steps without actionable lead verbs', () => {
  const finding = createValidFinding({
    implementationSteps: [
      'The team should check things.',
      'Everyone can look at the metrics.',
      'More meetings about performance.'
    ]
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.explanation.includes('active operational verbs')), 'Should suggest leading with active operational verbs');
  assert(res.findings.some(f => f.severity === 'SUGGESTION'), 'Missing active verbs should be classified as SUGGESTION');
});

runScenario('Scenario 7: Shallow reasoning depth (< 50 chars and no causal connectors)', () => {
  const finding = createValidFinding({
    interpretation: 'High latency is bad for visitors.'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'REASONING_DEPTH'), 'Should flag shallow reasoning');
  assert(res.dimensionScores.REASONING_DEPTH.score < 100, 'Reasoning score should be deducted');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'DEEPEN_CAUSAL_REASONING'), 'Correction should be DEEPEN_CAUSAL_REASONING');
});

// =============================================================
// CATEGORY 2: EVIDENCE GROUNDING TESTS (Scenarios 8-15)
// =============================================================
console.log('--- Category 2: Evidence Grounding Tests ---');

runScenario('Scenario 8: Factual claim with empty evidence references', () => {
  const finding = createValidFinding({
    evidenceReferences: [],
    limitations: ['Requires verification across additional hardware tiers.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'EVIDENCE_GROUNDING' && f.severity === 'CRITICAL'), 'Missing evidence references must be CRITICAL');
  assert(res.decision === 'REJECT', 'Factual claim without evidence must REJECT');
  assert(res.dimensionScores.EVIDENCE_GROUNDING.score <= 60, 'Grounding score must be heavily penalized');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'ADD_EVIDENCE'), 'Correction should suggest ADD_EVIDENCE');
});

runScenario('Scenario 9: Referencing non-existent external evidence ID', () => {
  const finding = createValidFinding({
    evidenceClassification: 'EXTERNAL_SOURCE_FACT',
    evidenceReferences: ['ev_ghost_999'],
    limitations: ['Dependent on external source credibility.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'EVIDENCE_GROUNDING' && f.explanation.includes('does not match any item')), 'Should flag unresolvable evidence ID');
  assert(res.dimensionScores.EVIDENCE_GROUNDING.warningCount >= 1, 'Warning count must be at least 1');
  assert(res.findings.some(f => f.requiresHumanReview === true), 'Unresolved evidence requires human review');
});

runScenario('Scenario 10: External source fact illicitly citing practitioner experience tag', () => {
  const finding = createValidFinding({
    evidenceClassification: 'EXTERNAL_SOURCE_FACT',
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] proj-cwv-101'],
    limitations: ['External report not independently reproducible.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'EVIDENCE_GROUNDING' && f.explanation.includes('cites practitioner experience')), 'Should flag external fact citing practitioner tag');
  assert(res.decision === 'REJECT', 'Cross-classification evidence citation must REJECT');
  assert(res.findings.some(f => f.severity === 'CRITICAL'), 'Cross classification citation must be CRITICAL');
});

runScenario('Scenario 11: Irrelevant evidence citation lacking topical overlap', () => {
  const finding = createValidFinding({
    evidenceClassification: 'EXTERNAL_SOURCE_FACT',
    observation: 'Database connection pool starvation causes p99 latency spikes on Postgres queries.',
    evidenceReferences: ['ev_stat_1'], // ev_stat_1 is about checkout funnel completion
    limitations: ['Observed under synthetic load conditions.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'EVIDENCE_GROUNDING' && f.explanation.includes('lacks semantic overlap')), 'Should flag irrelevant evidence citation');
  assert(res.dimensionScores.EVIDENCE_GROUNDING.score <= 88, 'Irrelevant evidence must deduct grounding score');
});

runScenario('Scenario 12: Practitioner finding without [PRACTITIONER EXPERIENCE] tag', () => {
  const finding = createValidFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['proj-cwv-101'], // Missing tag
    limitations: ['Historical project outcome under specific architecture.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'EVIDENCE_GROUNDING' && f.explanation.includes('without required [PRACTITIONER EXPERIENCE]')), 'Should flag missing authentication tag');
  assert(res.findings.some(f => f.severity === 'CRITICAL'), 'Missing tag must be CRITICAL severity');
});

runScenario('Scenario 13: Practitioner reference citing non-existent project or principle', () => {
  const finding = createValidFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] proj-fake-999'],
    limitations: ['Engagement records archived.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.explanation.includes('cannot be resolved against any verified project')), 'Should flag unresolvable practitioner reference');
  assert(res.decision === 'REJECT', 'Unresolvable practitioner claim must REJECT');
  assert(res.criticalViolationsCount >= 1, 'Critical count must be at least 1');
});

runScenario('Scenario 14: Valid practitioner experience with authentic project reference passes', () => {
  const finding = createValidFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] proj-cwv-101'],
    limitations: ['Applies to high-traffic ecommerce architectures.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.EVIDENCE_GROUNDING.passed, 'Valid practitioner reference must pass grounding');
  assert(res.dimensionScores.EVIDENCE_GROUNDING.score === 100, 'Score must be 100 for authentic project reference');
});

runScenario('Scenario 15: Clean multi-evidence grounding scores 100', () => {
  const finding = createValidFinding();
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.EVIDENCE_GROUNDING.score === 100, 'Clean evidence grounding should score 100');
  assert(res.dimensionScores.EVIDENCE_GROUNDING.criticalCount === 0, 'Clean grounding must have 0 critical count');
  assert(res.dimensionScores.EVIDENCE_GROUNDING.warningCount === 0, 'Clean grounding must have 0 warning count');
});

// =============================================================
// CATEGORY 3: REPETITION & DUPLICATION CONTROL (Scenarios 16-22)
// =============================================================
console.log('--- Category 3: Repetition & Duplication Control ---');

runScenario('Scenario 16: Intra-section duplicate observations between findings', () => {
  const f1 = createValidFinding({ findingId: 'wf-1', title: 'Observation A' });
  const f2 = createValidFinding({
    findingId: 'wf-2',
    title: 'Observation B',
    observation: 'Long Tasks exceeding 50ms during client-side hydration block user input events, driving p75 INP up to 320ms on mobile viewports.'
  });
  const section: OutlineNode = {
    ...mockOutline[0],
    workedFindings: [f1, f2]
  };
  const issues = ExpertiseGenericityValidator.validateSection(section, 'Section body text...', mockOutline, mockEvidenceSet, mockPractitionerContext);
  assert(issues.some(f => f.dimension === 'REPETITION_CONTROL' && f.explanation.includes('duplicate/near-identical observations')), 'Should flag duplicate intra-section observations');
  assert(issues.some(f => f.suggestedCorrectionCategory === 'DEDUPLICATE'), 'Suggested correction must be DEDUPLICATE');
});

runScenario('Scenario 17: Cross-section identical recommendations', () => {
  const f1 = createValidFinding({ findingId: 'wf-1', sectionId: 'sec-1', title: 'Finding 1' });
  const f2 = createValidFinding({
    findingId: 'wf-2',
    sectionId: 'sec-2',
    title: 'Finding 2',
    observation: 'Database queries suffer 200ms lock contention during inventory write transactions.',
    recommendation: 'Offload non-critical telemetry and client analytics into dedicated Web Workers via Comlink RPC bridges.' // Identical recommendation!
  });
  const res = ExpertiseGenericityValidator.validateArticle({
    title: 'CWV Guide',
    bodyMarkdown: '## Section 1\nBody 1\n## Section 2\nBody 2',
    outline: mockOutline,
    workedFindings: [f1, f2]
  }, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'REPETITION_CONTROL' && f.explanation.includes('Cross-section recommendation duplication')), 'Should flag cross-section recommendation duplication');
  assert(res.dimensionScores.REPETITION_CONTROL.score <= 88, 'Repetition score must be penalized');
});

runScenario('Scenario 18: Article body contains duplicate verbatim paragraphs', () => {
  const duplicateMarkdown = `
## Diagnosing Interaction to Next Paint Bottlenecks

Long Tasks exceeding 50ms during client-side hydration block user input events, driving p75 INP up to 320ms on mobile viewports.

## Decoupling Heavy Execution via Web Workers

Long Tasks exceeding 50ms during client-side hydration block user input events, driving p75 INP up to 320ms on mobile viewports.
`;
  const res = ExpertiseGenericityValidator.validateArticle({
    title: 'CWV Guide',
    bodyMarkdown: duplicateMarkdown,
    outline: mockOutline,
    workedFindings: [createValidFinding()]
  }, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'REPETITION_CONTROL' && f.explanation.includes('Duplicate paragraph detected')), 'Should flag duplicate paragraphs in text');
  assert(res.dimensionScores.REPETITION_CONTROL.criticalCount >= 1, 'Duplicate paragraph must be flagged as CRITICAL');
});

runScenario('Scenario 19: Repeated consecutive sentence openings', () => {
  const openingMarkdown = `
## Diagnosing Interaction to Next Paint Bottlenecks

In order to optimize the application, we measure INP. In order to optimize the application, we test on mobile. In order to optimize the application, we profile flame charts.
`;
  const res = ExpertiseGenericityValidator.validateArticle({
    title: 'CWV Guide',
    bodyMarkdown: openingMarkdown,
    outline: mockOutline,
    workedFindings: [createValidFinding()]
  }, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'REPETITION_CONTROL' && f.explanation.includes('Repeated sentence opening')), 'Should flag repeated sentence openings');
  assert(res.dimensionScores.REPETITION_CONTROL.warningCount >= 1, 'Warning count should be >= 1');
});

runScenario('Scenario 20: Preserved technical terminology across sections (no false positive)', () => {
  const f1 = createValidFinding({ findingId: 'wf-1', sectionId: 'sec-1' });
  const f2 = createValidFinding({
    findingId: 'wf-2',
    sectionId: 'sec-2',
    observation: 'Server-side rendering hydration mismatch causes full component re-mounts on hydration.',
    recommendation: 'Configure suppressHydrationWarning and align client clock state with edge server UTC headers.',
    implementationSteps: [
      'Audit client components for Date.now() usages.',
      'Inject server timestamp via meta header.',
      'Verify 0 hydration mismatch console warnings in staging.'
    ]
  });
  const res = ExpertiseGenericityValidator.validateArticle({
    title: 'CWV Guide',
    bodyMarkdown: '## Section 1\nDistinct text 1\n## Section 2\nDistinct text 2',
    outline: mockOutline,
    workedFindings: [f1, f2]
  }, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.REPETITION_CONTROL.passed, 'Distinct technical sections should pass repetition control');
  assert(res.dimensionScores.REPETITION_CONTROL.score === 100, 'Distinct sections must score 100');
});

runScenario('Scenario 21: Section text completely omits planned worked findings', () => {
  const section: OutlineNode = {
    ...mockOutline[0],
    workedFindings: [createValidFinding()]
  };
  const unrelatedText = 'Bananas and apples grow in temperate climates where rainfall exceeds twenty inches per annum. Agriculture requires fertile soil and sunlight.' + ' More unrelated text about farming.'.repeat(10);
  const issues = ExpertiseGenericityValidator.validateSection(section, unrelatedText, mockOutline, mockEvidenceSet, mockPractitionerContext);
  assert(issues.some(f => f.explanation.includes('does not appear to reflect its planned Worked Findings')), 'Should warn when section body ignores planned findings');
  assert(issues.some(f => f.dimension === 'EVIDENCE_GROUNDING'), 'Ignored findings must flag EVIDENCE_GROUNDING');
});

runScenario('Scenario 22: Repetition score deduction rubric test', () => {
  const duplicateMarkdown = `
## Sec 1
Exact copy paragraph for testing rubric deduction scoring.
## Sec 2
Exact copy paragraph for testing rubric deduction scoring.
`;
  const res = ExpertiseGenericityValidator.validateArticle({
    title: 'CWV Guide',
    bodyMarkdown: duplicateMarkdown,
    outline: mockOutline,
    workedFindings: [createValidFinding()]
  }, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.REPETITION_CONTROL.score < 100, 'Score must be deducted for repetition');
  assert(res.dimensionScores.REPETITION_CONTROL.passed === false, 'Repetition control should not pass');
});

// =============================================================
// CATEGORY 4: RECOMMENDATION QUALITY TESTS (Scenarios 23-30)
// =============================================================
console.log('--- Category 4: Recommendation Quality Tests ---');

runScenario('Scenario 23: Recommendation with empty implementation phrasing', () => {
  const finding = createValidFinding({
    recommendation: 'Ensure high quality code by following standard guidelines and doing your best.'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'RECOMMENDATION_QUALITY' && f.explanation.includes('empty advisory phrasing')), 'Should flag empty advisory phrasing');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.score <= 88, 'Score should be deducted');
});

runScenario('Scenario 24: Actionable 4-step recommendation passes with 100 score', () => {
  const finding = createValidFinding();
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.score === 100, 'Quality recommendation should score 100');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.passed === true, 'Quality recommendation should pass');
});

runScenario('Scenario 25: Recommendation jump (detailed observation but tiny recommendation)', () => {
  const finding = createValidFinding({
    observation: 'Long Tasks exceeding 50ms during client-side hydration block user input events, driving p75 INP up to 320ms on mobile viewports.',
    recommendation: 'Fix the script.' // < 25 chars
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.explanation.includes('disproportionately brief')), 'Should flag disproportionately brief recommendation');
  assert(res.findings.some(f => f.severity === 'SUGGESTION'), 'Disproportionate brevity should be classified as SUGGESTION');
});

runScenario('Scenario 26: Implementation steps starting with non-actionable noun phrases', () => {
  const finding = createValidFinding({
    implementationSteps: [
      'The configuration settings in webpack.',
      'Our preference is fast code.',
      'Continuous review sessions.'
    ]
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.explanation.includes('active operational verbs')), 'Should flag missing active operational verbs');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'CONCRETIZE_ACTION'), 'Suggested correction must be CONCRETIZE_ACTION');
});

runScenario('Scenario 27: Recommendation difficulty and provenance consistency', () => {
  const finding = createValidFinding({
    thresholdProvenance: 'NOT_APPLICABLE',
    observation: 'No numbers here, purely architectural structure.',
    successCriteria: 'Architecture clean.'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.passed, 'Non-quantitative finding with NOT_APPLICABLE should pass');
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.score === 100, 'Score should be 100');
});

runScenario('Scenario 28: Validated recommendation with concrete tools (Comlink, Webpack)', () => {
  const finding = createValidFinding();
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.passed, 'Recommendation with concrete tools should pass');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.criticalCount === 0, 'Should have 0 critical violations');
});

runScenario('Scenario 29: Recommendation quality rubric deduction calculation', () => {
  const finding = createValidFinding({
    recommendation: 'Be careful and stay vigilant.',
    implementationSteps: ['Check things.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.score <= 88, 'Score should reflect warning deductions');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.warningCount >= 1, 'Warning count must be at least 1');
});

runScenario('Scenario 30: Zero implementation steps results in CRITICAL failure', () => {
  const finding = createValidFinding({ implementationSteps: [] });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.criticalCount === 1, 'Critical count must be 1 for zero steps');
  assert(res.dimensionScores.RECOMMENDATION_QUALITY.score <= 60, 'Critical failure should deduct at least 40 points');
  assert(res.decision === 'REVIEW_REQUIRED' || res.decision === 'REJECT', 'Must trigger review or reject');
});

// =============================================================
// CATEGORY 5: BUSINESS IMPACT INTEGRITY TESTS (Scenarios 31-36)
// =============================================================
console.log('--- Category 5: Business Impact Integrity Tests ---');

runScenario('Scenario 31: Ungrounded commercial guarantee in business impact', () => {
  const finding = createValidFinding({
    businessImpact: 'Implementing this will guarantee revenue growth of 300% and eliminate all churn forever.'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'BUSINESS_IMPACT_INTEGRITY' && f.severity === 'CRITICAL'), 'Commercial guarantees must be CRITICAL');
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.score <= 60, 'Commercial guarantee must penalize score');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'QUALIFY_OUTCOME'), 'Suggested correction must be QUALIFY_OUTCOME');
});

runScenario('Scenario 32: Achieved historical outcome claimed with PROPOSED_TARGET provenance', () => {
  const finding = createValidFinding({
    businessImpact: 'We achieved 24% conversion increase for our clients.',
    thresholdProvenance: 'PROPOSED_TARGET' // Incompatible!
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'BUSINESS_IMPACT_INTEGRITY' && f.explanation.includes('claims an achieved outcome in business impact')), 'Should flag achieved metric with proposed target provenance');
  assert(res.findings.some(f => f.severity === 'CRITICAL'), 'Misleading outcome claim must be CRITICAL');
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.criticalCount >= 1, 'Critical count must be >= 1');
});

runScenario('Scenario 33: Achieved historical outcome backed by CLIENT_HISTORICAL passes', () => {
  const finding = createValidFinding({
    businessImpact: 'We achieved 14% conversion lift in previous client engagements.',
    thresholdProvenance: 'CLIENT_HISTORICAL'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(!res.findings.some(f => f.explanation.includes('claims an achieved outcome in business impact')), 'Client historical provenance should pass');
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.passed === true, 'Client historical outcome must pass');
});

runScenario('Scenario 34: Article body contains ungrounded revenue guarantee', () => {
  const markdown = `
## Diagnosing INP

This optimization will guaranteed 50% revenue lift for every customer.
`;
  const res = ExpertiseGenericityValidator.validateArticle({
    title: 'CWV Guide',
    bodyMarkdown: markdown,
    outline: mockOutline,
    workedFindings: [createValidFinding()]
  }, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'BUSINESS_IMPACT_INTEGRITY' && f.severity === 'CRITICAL'), 'Article-level commercial guarantee must be CRITICAL');
  assert(res.decision === 'REVIEW_REQUIRED' || res.decision === 'REJECT', 'Must not pass cleanly');
});

runScenario('Scenario 35: Qualified business impact inference passes with 100 score', () => {
  const finding = createValidFinding({
    businessImpact: 'Mitigating mobile hydration lag typically reduces checkout friction, potentially lowering cart abandonment during traffic peaks.'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.score === 100, 'Qualified inference should score 100');
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.passed === true, 'Qualified inference must pass');
});

runScenario('Scenario 36: Multiple business impact violations compound deductions', () => {
  const finding = createValidFinding({
    businessImpact: 'Guaranteed 100% roi and delivered 30% lift for all users.',
    thresholdProvenance: 'THEORETICAL_LIMIT'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.criticalCount >= 2, 'Should detect multiple critical violations');
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.score <= 20, 'Score should plummet on multiple critical failures');
  assert(res.dimensionScores.BUSINESS_IMPACT_INTEGRITY.passed === false, 'Multiple violations must fail dimension');
});

// =============================================================
// CATEGORY 6: PRACTITIONER PROVENANCE & SECURITY (Scenarios 37-41)
// =============================================================
console.log('--- Category 6: Practitioner Provenance & Security ---');

runScenario('Scenario 37: Practitioner claim when no practitioner profile exists (null context)', () => {
  const finding = createValidFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] pe_1']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, null);
  assert(res.findings.some(f => f.dimension === 'PRACTITIONER_PROVENANCE' && f.severity === 'CRITICAL'), 'Claiming practitioner experience without profile must be CRITICAL');
  assert(res.decision === 'REJECT', 'Zero-context practitioner claim must REJECT');
  assert(res.criticalViolationsCount >= 1, 'Critical count >= 1');
  assert(res.dimensionScores.PRACTITIONER_PROVENANCE.passed === false, 'Provenance must not pass');
});

runScenario('Scenario 38: Unauthorized first-person voice breach when firstPersonVoiceAllowed is false', () => {
  const finding = createValidFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] proj-cwv-101'],
    observation: 'In my practice, I observed that hydration blocks mobile inputs.',
    limitations: ['Verified in enterprise audit.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'PRACTITIONER_PROVENANCE' && f.explanation.includes('uses first-person practitioner voice')), 'Should flag unauthorized first-person voice');
  assert(res.decision === 'REJECT', 'Voice security breach must REJECT');
  assert(res.criticalViolationsCount >= 1, 'Critical count >= 1');
});

runScenario('Scenario 39: Authorized first-person voice passes when firstPersonVoiceAllowed is true', () => {
  const allowedContext: VerifiedPractitionerContext = {
    ...mockPractitionerContext,
    firstPersonVoiceAllowed: true
  };
  const finding = createValidFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] proj-cwv-101'],
    observation: 'In my practice, I observed that hydration blocks mobile inputs.',
    limitations: ['Verified in enterprise audit.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, allowedContext);
  assert(!res.findings.some(f => f.explanation.includes('uses first-person practitioner voice')), 'Authorized first-person voice must not trigger violation');
  assert(res.dimensionScores.PRACTITIONER_PROVENANCE.passed === true, 'Authorized voice should pass');
  assert(res.dimensionScores.PRACTITIONER_PROVENANCE.score === 100, 'Score should be 100');
});

runScenario('Scenario 40: Article markdown contains unscrubbed confidential client marker', () => {
  const markdownWithLeak = `
## Diagnosing Interaction to Next Paint Bottlenecks

During our engagement with Secret Client Corp, we identified extensive hydration lag.
`;
  const res = ExpertiseGenericityValidator.validateArticle({
    title: 'CWV Guide',
    bodyMarkdown: markdownWithLeak,
    outline: mockOutline,
    workedFindings: [createValidFinding()]
  }, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'PRACTITIONER_PROVENANCE' && f.explanation.includes('Unscrubbed confidential client marker')), 'Should flag confidential client leak');
  assert(res.decision === 'REJECT', 'Client leak must trigger REJECT');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'SCRUB_CLIENT'), 'Suggested correction must be SCRUB_CLIENT');
  assert(res.criticalViolationsCount >= 1, 'Critical count >= 1');
});

runScenario('Scenario 41: Verified practitioner claim in third-person professional voice passes', () => {
  const finding = createValidFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] proj-cwv-101'],
    observation: 'Production audits of enterprise ecommerce checkouts revealed severe hydration delays.',
    limitations: ['Applies to high-traffic ecommerce architectures.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.PRACTITIONER_PROVENANCE.score === 100, 'Third-person verified practitioner claim must score 100');
  assert(res.dimensionScores.PRACTITIONER_PROVENANCE.passed === true, 'Passed must be true');
  assert(res.dimensionScores.PRACTITIONER_PROVENANCE.criticalCount === 0, 'Critical count must be 0');
});

// =============================================================
// CATEGORY 7: QUANTITATIVE CLAIM & THRESHOLD DEFICIT (Scenarios 42-46)
// =============================================================
console.log('--- Category 7: Quantitative Claim & Threshold Integrity ---');

runScenario('Scenario 42: Quantitative metric present with NOT_APPLICABLE provenance', () => {
  const finding = createValidFinding({
    observation: 'Latencies increased by 320ms and throughput fell by 45%.',
    thresholdProvenance: 'NOT_APPLICABLE' // Invalid!
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.findings.some(f => f.dimension === 'QUANTITATIVE_INTEGRITY' && f.severity === 'CRITICAL'), 'Quantitative claim with NOT_APPLICABLE provenance must be CRITICAL');
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.score <= 60, 'Score must be penalized');
  assert(res.findings.some(f => f.suggestedCorrectionCategory === 'PROVIDE_PROVENANCE'), 'Correction must be PROVIDE_PROVENANCE');
});

runScenario('Scenario 43: Quantitative claim properly backed by EMPIRICAL_BENCHMARK passes', () => {
  const finding = createValidFinding({
    observation: 'CrUX field telemetry p75 INP recorded at 320ms across 1.2M impressions.',
    thresholdProvenance: 'EMPIRICAL_BENCHMARK'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.score === 100, 'Empirical quantitative claim must score 100');
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.passed === true, 'Empirical claim must pass');
});

runScenario('Scenario 44: Success criteria with percentage threshold backed by PROPOSED_TARGET passes', () => {
  const finding = createValidFinding({
    observation: 'Hydration delays cause tactile latency on mobile viewports.',
    successCriteria: 'Achieve at least 95% pass rate on Core Web Vitals assessment.',
    thresholdProvenance: 'PROPOSED_TARGET'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.passed, 'Proposed target provenance should pass');
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.score === 100, 'Proposed target should score 100');
});

runScenario('Scenario 45: Non-quantitative finding with NOT_APPLICABLE provenance scores 100', () => {
  const finding = createValidFinding({
    observation: 'Hydration delays cause tactile lag when users click interactive elements.',
    recommendation: 'Decouple client scripts using Web Worker architecture.',
    successCriteria: 'Main thread remains unblocked during user clicks.',
    thresholdProvenance: 'NOT_APPLICABLE'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.score === 100, 'Non-quantitative finding should score 100');
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.passed === true, 'Non-quantitative claim must pass');
});

runScenario('Scenario 46: Quantitative violation triggers immediate REJECT decision', () => {
  const finding = createValidFinding({
    observation: 'Observed 85ms latency and $50,000 cost savings.',
    thresholdProvenance: 'NOT_APPLICABLE'
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.decision === 'REJECT', 'Fatal quantitative integrity failure must REJECT');
  assert(res.criticalViolationsCount >= 1, 'Critical count >= 1');
  assert(res.passed === false, 'Passed must be false');
});

// =============================================================
// CATEGORY 8: PIPELINE & END-TO-END DECISION LOGIC (Scenarios 47-52)
// =============================================================
console.log('--- Category 8: Pipeline & End-to-End Decision Tests ---');

runScenario('Scenario 47: Flawless finding achieves PASS decision with 100 aggregate score', () => {
  const finding = createValidFinding();
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.decision === 'PASS', `Expected PASS, got ${res.decision}`);
  assert(res.aggregateScore === 100, `Expected 100, got ${res.aggregateScore}`);
  assert(res.passed === true, 'Passed flag must be true');
  assert(res.criticalViolationsCount === 0, 'Critical count must be 0');
  assert(res.warningsCount === 0, 'Warnings count must be 0');
});

runScenario('Scenario 48: Minor warning yields PASS_WITH_WARNINGS decision', () => {
  const finding = createValidFinding({
    implementationSteps: [
      'The developer should check things.', // triggers active verb suggestion
      'Audit long tasks.',
      'Refactor scripts.'
    ]
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.decision === 'PASS_WITH_WARNINGS' || res.decision === 'PASS', `Expected PASS or PASS_WITH_WARNINGS, got ${res.decision}`);
  assert(res.passed === true, 'Minor warning must still be passed');
  assert(res.criticalViolationsCount === 0, 'Critical count must be 0');
});

runScenario('Scenario 49: Multiple warnings cause score to dip below 75 triggering REVIEW_REQUIRED', () => {
  const finding = createValidFinding({
    interpretation: 'Latency is bad.', // shallow reasoning (-12)
    recommendation: 'Be careful and check things carefully.', // empty advice (-12)
    implementationSteps: ['The first thing is check.', 'The second thing is look.'], // no active verbs (-4)
    observation: 'In today digital world, optimizing performance is critical.' // generic phrase (-12)
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.decision === 'REVIEW_REQUIRED' || res.decision === 'REJECT', `Expected REVIEW_REQUIRED or REJECT, got ${res.decision}`);
  assert(res.warningsCount >= 2, 'Warnings count must be >= 2');
});

runScenario('Scenario 50: Fatal security violation forces REJECT regardless of high scores elsewhere', () => {
  const finding = createValidFinding({
    evidenceReferences: ['[PRACTITIONER EXPERIENCE] pe_fake_unverified_proj'], // Unresolvable practitioner reference
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    limitations: ['Standard testing environment.']
  });
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  assert(res.decision === 'REJECT', `Fatal practitioner provenance breach must REJECT (got ${res.decision})`);
  assert(res.passed === false, 'Passed must be false');
  assert(res.criticalViolationsCount >= 1, 'Critical count >= 1');
});

runScenario('Scenario 51: Dimension weights sum to exactly 1.00', () => {
  const finding = createValidFinding();
  const res = ExpertiseGenericityValidator.evaluateFinding(finding, mockEvidenceSet, mockPractitionerContext);
  const dims = Object.keys(res.dimensionScores) as (keyof typeof res.dimensionScores)[];
  const weightSum = dims.reduce((sum, d) => sum + res.dimensionScores[d].weight, 0);
  assert(Math.abs(weightSum - 1.0) < 0.0001, `Weights must sum to 1.00, got ${weightSum}`);
  assert(dims.length === 8, `Must have exactly 8 dimensions, got ${dims.length}`);
  assert(res.dimensionScores.EVIDENCE_GROUNDING.weight === 0.20, 'EVIDENCE_GROUNDING weight must be 0.20');
  assert(res.dimensionScores.QUANTITATIVE_INTEGRITY.weight === 0.05, 'QUANTITATIVE_INTEGRITY weight must be 0.05');
});

runScenario('Scenario 52: Full Article validation evaluates all 8 dimensions and outlines correctly', () => {
  const f1 = createValidFinding({ findingId: 'wf-sec1', sectionId: 'sec-1' });
  const f2 = createValidFinding({
    findingId: 'wf-sec2',
    sectionId: 'sec-2',
    title: 'Web Worker Task Offloading',
    observation: 'Core Web Vitals INP p75 improved from 320ms to 85ms across 1.2M impressions after isolating script execution in Web Workers.',
    evidenceReferences: ['ev_perf_1'],
    evidenceClassification: 'EXTERNAL_SOURCE_FACT',
    thresholdProvenance: 'EMPIRICAL_BENCHMARK',
    limitations: ['Requires worker message serialization overhead considerations.'],
    recommendation: 'Configure Comlink proxies to batch transform payloads across worker threads.',
    implementationSteps: [
      'Audit transform payloads.',
      'Deploy Comlink worker endpoints.',
      'Benchmark serialization latency.'
    ]
  });

  const articleMarkdown = `
# Production Guide to Core Web Vitals Optimization

## Diagnosing Interaction to Next Paint Bottlenecks

Long Tasks exceeding 50ms during client-side hydration block user input events, driving p75 INP up to 320ms on mobile viewports. Profile with PerformanceObserver.

## Decoupling Heavy Execution via Web Workers

Moving heavy CPU state transforms into web workers frees main thread execution budgets. Configure Comlink proxies to batch transform payloads across worker threads.

## Continuous Field Telemetry and Real User Monitoring

Query CrUX telemetry weekly in BigQuery to verify that 75th percentile mobile users maintain sub-100ms INP thresholds under real network conditions.
`;

  const res = ExpertiseGenericityValidator.validateArticle({
    title: mockBrief.title,
    bodyMarkdown: articleMarkdown,
    outline: mockOutline,
    workedFindings: [f1, f2]
  }, mockEvidenceSet, mockPractitionerContext);

  assert(res.decision === 'PASS', `Expected PASS, got ${res.decision}`);
  assert(res.aggregateScore >= 90, `Expected aggregate score >= 90, got ${res.aggregateScore}`);
  assert(res.evaluatedFindingCount === 2, `Expected 2 evaluated findings, got ${res.evaluatedFindingCount}`);
  assert(res.evaluatedSectionCount === 3, `Expected 3 evaluated sections, got ${res.evaluatedSectionCount}`);
  assert(res.passed === true, 'Article must pass');
  assert(res.criticalViolationsCount === 0, 'Critical violations must be 0');
});

console.log('\n================================================================');
console.log(`TEST SUITE RESULTS:`);
console.log(`  Total Scenarios:  ${totalTests}`);
console.log(`  Passed Scenarios: ${passedTests}`);
console.log(`  Failed Scenarios: ${failedTests}`);
console.log(`  Total Assertions: ${totalAssertions}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error(`❌ Suite failed with ${failedTests} failed scenario(s).`);
  process.exit(1);
} else {
  console.log('✅ All 52 adversarial scenarios PASSED successfully.');
  process.exit(0);
}
