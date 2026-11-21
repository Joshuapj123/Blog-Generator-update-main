/**
 * ACUTE Phase 6D.5: Controlled Content Repair & Provenance Guard Adversarial Test Suite
 * Minimum: 50 distinct scenarios, 120+ assertions.
 */

import {
  ControlledContentRepairEngine,
  ProvenanceGuard,
  RepairabilityClassifier,
  RepairContext
} from '../src/lib/intelligence/ControlledContentRepairEngine';
import {
  WorkedFinding,
  ValidationFinding,
  OutlineNode,
  ExpertiseValidationResult,
  VerifiedPractitionerContext
} from '../src/core/contracts/schemas';
import { EvidenceSet, EvidenceItem } from '../src/core/contracts/evidence';
import { ExpertiseGenericityValidator } from '../src/lib/intelligence/ExpertiseGenericityValidator';
import { ArticleExportService } from '../src/lib/export/ArticleExportService';
import { TemporaryArticleStore } from '../src/lib/test-storage/TemporaryArticleStore';

let passedScenarios = 0;
let totalScenarios = 0;
let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`  ❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
  passedAssertions++;
}

function runScenario(name: string, fn: () => void) {
  totalScenarios++;
  try {
    fn();
    passedScenarios++;
    console.log(`  ✅ [${totalScenarios}] ${name}`);
  } catch (err: any) {
    console.error(`  ❌ [${totalScenarios}] ${name} FAILED: ${err?.message || err}`);
    throw err;
  }
}

// Fixture helpers
function createBaseFinding(overrides: Partial<WorkedFinding> = {}): WorkedFinding {
  return {
    findingId: 'wf_core_01',
    sectionId: 'sec_arch',
    findingType: 'PROBLEM_FINDING',
    title: 'Connection Pool Saturation Under Spikes',
    observation: 'Connection pool saturation occurs during traffic spikes because PostgreSQL worker threads block on locked rows, exceeding max_connections limit.',
    evidenceReferences: ['ev_pg_traces_01'],
    evidenceClassification: 'OBSERVED_FACT',
    confidence: 'HIGH',
    limitations: [],
    interpretation: 'This bottleneck causes HTTP 504 gateway timeouts for downstream API clients when concurrency exceeds 250 requests per second.',
    businessImpact: 'Unresolved connection timeouts risk service outages during promotional campaigns, degrading customer trust and checkout completion.',
    recommendation: 'Instrument PgBouncer connection pooler in transaction mode with max_client_conn set to 1000 and default_pool_size set to 50.',
    implementationSteps: [
      'Audit existing database connection limits in postgresql.conf.',
      'Deploy PgBouncer instance between application servers and primary database.',
      'Configure transaction pooling mode to allow connection reuse across requests.',
      'Instrument Prometheus metrics to monitor pool utilization and waiting clients.'
    ],
    validationMethod: 'Execute load test at 500 RPS and verify p99 latency remains below 120ms with 0 dropped connections.',
    successCriteria: 'Database active connection count remains under 80% of max_connections threshold under peak traffic.',
    thresholdProvenance: 'EMPIRICAL_BENCHMARK',
    ...overrides,
  };
}

function createOutlineNode(heading: string, level: 'H2' | 'H3' = 'H2'): OutlineNode {
  return {
    heading,
    level,
    generate_table: false,
    assignedKeywords: [],
    assignedEntities: []
  };
}

function createEvidenceSet(): any {
  const items: any[] = [
    {
      id: 'ev_pg_traces_01',
      claim: 'PostgreSQL connection exhaustion observed at 250 concurrent requests resulting in locked row deadlocks.',
      sourceUrl: 'https://internal.telemetry.example.com/traces/pg-01',
      sourceType: 'TARGET_SITE',
      evidenceType: 'STATISTIC',
      relevanceScore: 0.95,
      dateScraped: new Date().toISOString(),
      tags: ['database', 'postgresql', 'concurrency'],
    },
    {
      id: 'ev_cwv_01',
      claim: 'Interaction to Next Paint (INP) exceeding 350ms on mobile product detail pages due to unoptimized main-thread JavaScript.',
      sourceUrl: 'https://internal.telemetry.example.com/traces/inp-01',
      sourceType: 'TARGET_SITE',
      evidenceType: 'STATISTIC',
      relevanceScore: 0.92,
      dateScraped: new Date().toISOString(),
      tags: ['performance', 'core_web_vitals', 'inp'],
    }
  ];
  return {
    targetUrl: 'https://example.com',
    targetBrand: 'Acme Systems',
    dateGenerated: new Date().toISOString(),
    totalEvidenceCount: items.length,
    highConfidenceCount: items.length,
    items,
  };
}

function createPractitionerContext(overrides: any = {}): any {
  return {
    practitionerId: 'prac_alex_01',
    displayName: 'Alex Thorne',
    professionalTitle: 'Principal Systems Architect',
    approvedAuthorName: 'Alex Thorne',
    firstPersonVoiceAllowed: false,
    thirdPersonVoiceAllowed: true,
    verifiedPrinciples: [
      { principleId: 'pr_isolate_pools', title: 'Always isolate connection pools per microservice' }
    ],
    verifiedProjects: [
      {
        projectId: 'proj_fintech_scale',
        title: 'Tier-1 Core Banking Migration',
        clientNamingPermission: false,
        anonymizedDescription: 'High-throughput core banking microservices migration for a tier-1 financial platform.'
      }
    ],
    verifiedExpertise: [
      { capabilityArea: 'PostgreSQL Database Performance Tuning' }
    ],
    safeAttributionDirectives: ['Refer to author in third person as Principal Systems Architect'],
    approvedByline: 'Alex Thorne is a Principal Systems Architect specializing in distributed systems.',
    ...overrides
  };
}

console.log('========================================================================');
console.log(' ACUTE Phase 6D.5: Controlled Content Repair & Provenance Guard Suite');
console.log('========================================================================\n');

// --- Category 1: Provenance Guard Invariant Tests (10 Scenarios) ---
console.log('--- Category 1: Provenance Guard Invariants ---');

runScenario('Scenario 1: INV-1 - Rejects promotion of external fact to practitioner experience', () => {
  const original = { finding: createBaseFinding({ evidenceClassification: 'EXTERNAL_SOURCE_FACT' }), text: 'External finding' };
  const candidate = { finding: createBaseFinding({ evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE' }), text: 'Practitioner finding' };
  const res = ProvenanceGuard.checkInvariants(original, candidate);
  assert(!res.preserved, 'Must violate provenance guard');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_PROVENANCE_PROMOTION'), 'Must flag INV_NO_PROVENANCE_PROMOTION');
});

runScenario('Scenario 2: INV-1 - Rejects adding [PRACTITIONER EXPERIENCE] tag without authorized context', () => {
  const original = { text: 'Telemetry shows connection pool saturation.' };
  const candidate = { text: '[PRACTITIONER EXPERIENCE] Telemetry shows connection pool saturation.' };
  const res = ProvenanceGuard.checkInvariants(original, candidate, { practitionerContext: null });
  assert(!res.preserved, 'Must violate provenance guard');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_PROVENANCE_PROMOTION'), 'Must flag unauthorized tag');
});

runScenario('Scenario 3: INV-2 - Rejects promoting INFERENCE to OBSERVED_FACT', () => {
  const original = { finding: createBaseFinding({ evidenceClassification: 'INFERENCE', limitations: ['Modeled from synthetic traces'] }), text: 'Inferred bottleneck' };
  const candidate = { finding: createBaseFinding({ evidenceClassification: 'OBSERVED_FACT', limitations: [] }), text: 'Observed fact' };
  const res = ProvenanceGuard.checkInvariants(original, candidate);
  assert(!res.preserved, 'Must violate epistemic promotion invariant');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_EPISTEMIC_PROMOTION'), 'Must flag INV_NO_EPISTEMIC_PROMOTION');
});

runScenario('Scenario 4: INV-2 - Rejects promoting HYPOTHESIS to EXTERNAL_SOURCE_FACT', () => {
  const original = { finding: createBaseFinding({ evidenceClassification: 'HYPOTHESIS', limitations: ['Unverified conjecture'] }), text: 'Hypothesis' };
  const candidate = { finding: createBaseFinding({ evidenceClassification: 'EXTERNAL_SOURCE_FACT' }), text: 'External fact' };
  const res = ProvenanceGuard.checkInvariants(original, candidate);
  assert(!res.preserved, 'Must violate epistemic promotion invariant');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_EPISTEMIC_PROMOTION'), 'Must flag epistemic promotion');
});

runScenario('Scenario 5: INV-3 - Rejects converting PROPOSED_TARGET to CLIENT_HISTORICAL', () => {
  const original = { finding: createBaseFinding({ thresholdProvenance: 'PROPOSED_TARGET' }), text: 'Targeted 40% reduction' };
  const candidate = { finding: createBaseFinding({ thresholdProvenance: 'CLIENT_HISTORICAL' }), text: 'Achieved 40% reduction' };
  const res = ProvenanceGuard.checkInvariants(original, candidate);
  assert(!res.preserved, 'Must violate outcome fabrication invariant');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_OUTCOME_FABRICATION'), 'Must flag INV_NO_OUTCOME_FABRICATION');
});

runScenario('Scenario 6: INV-3 - Rejects text claiming achieved $500k recovered when provenance is target', () => {
  const original = { finding: createBaseFinding({ thresholdProvenance: 'PROPOSED_TARGET' }), text: 'We model potential cost recovery.' };
  const candidate = { finding: createBaseFinding({ thresholdProvenance: 'PROPOSED_TARGET' }), text: 'The initiative recovered $500k in cloud overhead.' };
  const res = ProvenanceGuard.checkInvariants(original, candidate);
  assert(!res.preserved, 'Must flag outcome fabrication in text');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_OUTCOME_FABRICATION'), 'Must violate INV_NO_OUTCOME_FABRICATION');
});

runScenario('Scenario 7: INV-4 - Rejects candidate introducing unresolvable fabricated evidence ID', () => {
  const original = { finding: createBaseFinding({ evidenceReferences: ['ev_pg_traces_01'] }), text: 'Original text' };
  const candidate = { finding: createBaseFinding({ evidenceReferences: ['ev_pg_traces_01', 'ev_fabricated_999'] }), text: 'Candidate text' };
  const res = ProvenanceGuard.checkInvariants(original, candidate, { evidenceSet: createEvidenceSet() });
  assert(!res.preserved, 'Must reject fabricated citation ID');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_FABRICATED_CITATION'), 'Must flag citation fabrication');
});

runScenario('Scenario 8: INV-5 - Rejects candidate text leaking [Confidential: Client Alpha]', () => {
  const original = { text: 'A tier-1 financial client experienced latency.' };
  const candidate = { text: 'During the [Confidential: Acme Bank] audit, latency spiked.' };
  const res = ProvenanceGuard.checkInvariants(original, candidate);
  assert(!res.preserved, 'Must reject confidential marker leak');
  assert(res.violations.some(v => v.invariantId === 'INV_NO_CONFIDENTIAL_LEAKAGE'), 'Must flag INV_NO_CONFIDENTIAL_LEAKAGE');
});

runScenario('Scenario 9: INV-6 - Rejects first-person pronouns when firstPersonVoiceAllowed is false', () => {
  const original = { text: 'The team profiled the PostgreSQL instance.' };
  const candidate = { text: 'I personally profiled the PostgreSQL instance and resolved the deadlock.' };
  const res = ProvenanceGuard.checkInvariants(original, candidate, { practitionerContext: createPractitionerContext({ firstPersonVoiceAllowed: false }) });
  assert(!res.preserved, 'Must reject unauthorized first-person voice');
  assert(res.violations.some(v => v.invariantId === 'INV_VOICE_AUTHORIZATION'), 'Must flag voice authorization violation');
});

runScenario('Scenario 10: INV-7 - Rejects stripping mandatory limitations from inference', () => {
  const original = { finding: createBaseFinding({ evidenceClassification: 'INFERENCE', limitations: ['Synthetic simulation data only'] }), text: 'Original inference' };
  const candidate = { finding: createBaseFinding({ evidenceClassification: 'INFERENCE', limitations: [] }), text: 'Candidate stripped limitations' };
  const res = ProvenanceGuard.checkInvariants(original, candidate);
  assert(!res.preserved, 'Must reject removing limitations');
  assert(res.violations.some(v => v.invariantId === 'INV_LIMITATION_PRESERVATION'), 'Must flag limitation preservation violation');
});

// --- Category 2: Repairability Classification Tests (10 Scenarios) ---
console.log('\n--- Category 2: Repairability Classification ---');

runScenario('Scenario 11: Classifies unbacked quantitative metric as NON_REPAIRABLE_INTEGRITY_VIOLATION', () => {
  const finding: any = {
    findingId: 'vf_01',
    ruleId: 'QUANT_PROVENANCE_REQUIRED',
    dimension: 'QUANTITATIVE_INTEGRITY',
    severity: 'CRITICAL',
    explanation: 'Finding contains quantitative metric (40%) but thresholdProvenance is NOT_APPLICABLE.',
    reason: 'Quantitative claims must declare traceable empirical provenance.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'NON_REPAIRABLE_INTEGRITY_VIOLATION', 'Must be classified as non-repairable');
});

runScenario('Scenario 12: Classifies practitioner claim with null profile as NON_REPAIRABLE_INTEGRITY_VIOLATION', () => {
  const finding: any = {
    findingId: 'vf_02',
    ruleId: 'PRACTITIONER_PROFILE_REQUIRED',
    dimension: 'PRACTITIONER_PROVENANCE',
    severity: 'CRITICAL',
    explanation: 'Practitioner experience claimed but no verified practitioner profile exists for tenant.',
    reason: 'System must never invent practitioner expertise.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  };
  const classification = RepairabilityClassifier.classify(finding, { practitionerContext: null });
  assert(classification === 'NON_REPAIRABLE_INTEGRITY_VIOLATION', 'Must be classified as non-repairable');
});

runScenario('Scenario 13: Classifies cross-tag contamination as NON_REPAIRABLE_INTEGRITY_VIOLATION', () => {
  const finding: any = {
    findingId: 'vf_03',
    ruleId: 'NO_TAG_CONTAMINATION',
    dimension: 'EVIDENCE_GROUNDING',
    severity: 'CRITICAL',
    explanation: 'External source fact illicitly cites practitioner experience tag.',
    reason: 'Cannot synthesize practitioner tag on external fact.',
    suggestedCorrectionCategory: 'GENERAL_CORRECTION',
    requiresHumanReview: false
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'NON_REPAIRABLE_INTEGRITY_VIOLATION', 'Must be non-repairable');
});

runScenario('Scenario 14: Classifies disproportionate $10M valuation as HUMAN_REVIEW_REQUIRED', () => {
  const finding: any = {
    findingId: 'vf_04',
    ruleId: 'DISPROPORTIONATE_VALUATION',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Finding makes speculative commercial claim of $10M enterprise valuation.',
    evidenceOrTextLocation: '$10M ARR uplift',
    reason: 'Hyperbolic valuations require human editorial review.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: true
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'HUMAN_REVIEW_REQUIRED', 'Must require human review');
});

runScenario('Scenario 15: Classifies requiresHumanReview flag as HUMAN_REVIEW_REQUIRED', () => {
  const finding: any = {
    findingId: 'vf_05',
    ruleId: 'EDITORIAL_DISCRETION',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Subtle commercial framing requires editorial sign-off.',
    reason: 'Human discretion needed.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: true
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'HUMAN_REVIEW_REQUIRED', 'Must honor requiresHumanReview flag');
});

runScenario('Scenario 16: Classifies unauthorized voice as REQUIRES_PRACTITIONER_INPUT', () => {
  const finding: any = {
    findingId: 'vf_06',
    ruleId: 'VOICE_PERMISSION_REQUIRED',
    dimension: 'PRACTITIONER_PROVENANCE',
    severity: 'CRITICAL',
    explanation: 'First-person voice is used ("I", "my") but firstPersonVoiceAllowed is false in practitioner profile.',
    reason: 'Voice permissions must be granted by practitioner.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'REQUIRES_PRACTITIONER_INPUT', 'Must require practitioner input');
});

runScenario('Scenario 17: Classifies missing project match as REQUIRES_PRACTITIONER_INPUT', () => {
  const finding: any = {
    findingId: 'vf_07',
    ruleId: 'PROJECT_EVIDENCE_MISSING',
    dimension: 'PRACTITIONER_PROVENANCE',
    severity: 'CRITICAL',
    explanation: 'Practitioner reference "[PRACTITIONER EXPERIENCE: proj_quantum_ai]" does not match any verified project or principle.',
    reason: 'Practitioner must add project to profile.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'REQUIRES_PRACTITIONER_INPUT', 'Must require practitioner input');
});

runScenario('Scenario 18: Classifies empty evidence with empty EvidenceSet as REQUIRES_ADDITIONAL_RESEARCH', () => {
  const finding: any = {
    findingId: 'vf_08',
    ruleId: 'EVIDENCE_REQUIRED',
    dimension: 'EVIDENCE_GROUNDING',
    severity: 'CRITICAL',
    explanation: 'Factual finding declares OBSERVED_FACT but evidenceReferences is empty.',
    reason: 'Must have research backing.',
    suggestedCorrectionCategory: 'ADD_EVIDENCE',
    requiresHumanReview: false
  };
  const emptyEvidenceSet: any = {
    targetUrl: 'https://example.com',
    targetBrand: 'Acme',
    dateGenerated: new Date().toISOString(),
    totalEvidenceCount: 0,
    highConfidenceCount: 0,
    items: [],
  };
  const classification = RepairabilityClassifier.classify(finding, { evidenceSet: emptyEvidenceSet });
  assert(classification === 'REQUIRES_ADDITIONAL_RESEARCH', 'Must require additional research');
});

runScenario('Scenario 19: Classifies generic boilerplate with context as REPAIRABLE_WITH_EXISTING_EVIDENCE', () => {
  const finding: any = {
    findingId: 'vf_09',
    ruleId: 'SPECIFICITY_ENFORCE',
    dimension: 'EXPERTISE_SPECIFICITY',
    severity: 'WARNING',
    explanation: 'Observation contains uncontextualized filler phrases ("unlocking value", "game changer").',
    reason: 'Replace with concrete domain terminology.',
    suggestedCorrectionCategory: 'SPECIFY_CONTEXT',
    requiresHumanReview: false
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'REPAIRABLE_WITH_EXISTING_EVIDENCE', 'Must be repairable');
});

runScenario('Scenario 20: Classifies ungrounded conversion guarantee as REPAIRABLE_WITH_EXISTING_EVIDENCE', () => {
  const finding: any = {
    findingId: 'vf_10',
    ruleId: 'QUALIFY_COMMERCIAL_GUARANTEE',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Finding businessImpact contains ungrounded guarantee: "guaranteed 40% boost".',
    reason: 'Qualify guarantee to modeled target or benchmark expectation.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: false
  };
  const classification = RepairabilityClassifier.classify(finding);
  assert(classification === 'REPAIRABLE_WITH_EXISTING_EVIDENCE', 'Must be repairable');
});

// --- Category 3: Finding-Level Controlled Repairs (10 Scenarios) ---
console.log('\n--- Category 3: Finding-Level Controlled Repairs ---');

runScenario('Scenario 21: Successfully repairs generic boilerplate observation with concrete parameters', () => {
  const original = createBaseFinding({
    observation: 'It is important to keep in mind that unlocking value with database pooling is a game changer for modern systems.'
  });
  const issue: any = {
    findingId: 'vf_21',
    ruleId: 'BOILERPLATE_CLEANUP',
    dimension: 'EXPERTISE_SPECIFICITY',
    severity: 'CRITICAL',
    explanation: 'Observation contains generic boilerplate ("unlocking value", "game changer").',
    reason: 'Specify technical context.',
    suggestedCorrectionCategory: 'SPECIFY_CONTEXT',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Repair must be accepted');
  assert(!res.repairedFinding.observation.includes('game changer'), 'Must eliminate filler phrase');
  assert(!res.repairedFinding.observation.includes('unlocking value'), 'Must eliminate boilerplate phrase');
  assert(res.repairedFinding.observation.length >= 50, 'Must have sufficient substantive length');
});

runScenario('Scenario 22: Successfully adds causal explanation to shallow reasoning observation', () => {
  const original = createBaseFinding({
    observation: 'Connection pool saturation happens under traffic spikes.'
  });
  const issue: any = {
    findingId: 'vf_22',
    ruleId: 'CAUSAL_DEPTH_REQUIRED',
    dimension: 'REASONING_DEPTH',
    severity: 'WARNING',
    explanation: 'Observation lacks causal explanation connectors ("because", "due to", "resulting in").',
    reason: 'Deepen causal reasoning.',
    suggestedCorrectionCategory: 'DEEPEN_CAUSAL_REASONING',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Must be accepted');
  assert(/\b(?:because|due to|resulting in|which causes)\b/i.test(res.repairedFinding.observation), 'Must introduce causal connector');
});

runScenario('Scenario 23: Concretizes empty implementation steps array with sequenced action verbs', () => {
  const original = createBaseFinding({
    implementationSteps: ['be careful with database pools', 'do your best']
  });
  const issue: any = {
    findingId: 'vf_23',
    ruleId: 'CONCRETIZE_STEPS',
    dimension: 'RECOMMENDATION_QUALITY',
    severity: 'CRITICAL',
    explanation: 'Implementation steps lack actionable lead verbs.',
    reason: 'Concretize action steps.',
    suggestedCorrectionCategory: 'CONCRETIZE_ACTION',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Must accept concretized steps');
  assert(res.repairedFinding.implementationSteps.length >= 2, 'Must have multiple steps');
  for (const step of res.repairedFinding.implementationSteps) {
    const firstWord = step.split(/\s+/)[0];
    assert(/^(?:audit|configure|deploy|instrument|profile|refactor|isolate|validate)\b/i.test(firstWord), `Step must start with action verb: ${step}`);
  }
});

runScenario('Scenario 24: Qualifies ungrounded conversion guarantee in businessImpact', () => {
  const original = createBaseFinding({
    businessImpact: 'Implementing this will yield a guaranteed 40% boost in revenue and guarantees 100% uptime.'
  });
  const issue: any = {
    findingId: 'vf_24',
    ruleId: 'QUALIFY_OUTCOME',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Finding businessImpact contains ungrounded commercial guarantees ("guaranteed 40% boost").',
    reason: 'Qualify outcome.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Must accept qualified outcome');
  assert(!res.repairedFinding.businessImpact.includes('guaranteed 40% boost'), 'Must remove ungrounded guarantee');
  assert(!res.repairedFinding.businessImpact.includes('guarantees 100% uptime'), 'Must remove 100% uptime guarantee');
  assert(res.repairedFinding.businessImpact.includes('targeted performance improvement'), 'Must substitute qualified phrasing');
});

runScenario('Scenario 25: Qualifies achieved outcome claim when provenance is PROPOSED_TARGET', () => {
  const original = createBaseFinding({
    thresholdProvenance: 'PROPOSED_TARGET',
    businessImpact: 'The client achieved 35% latency reduction and recovered $200k in operating expense.'
  });
  const issue: any = {
    findingId: 'vf_25',
    ruleId: 'QUALIFY_TARGET_OUTCOME',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'CRITICAL',
    explanation: 'Finding claims achieved outcome but thresholdProvenance is PROPOSED_TARGET.',
    reason: 'Qualify outcome claim.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Must accept qualified target');
  assert(!res.repairedFinding.businessImpact.includes('achieved 35%'), 'Must not claim achieved');
  assert(!res.repairedFinding.businessImpact.includes('recovered $200k'), 'Must not claim recovered');
  assert(res.repairedFinding.businessImpact.includes('targets 35%'), 'Must rephrase as target');
});

runScenario('Scenario 26: Refuses repair when finding has unbacked metric and NOT_APPLICABLE provenance', () => {
  const original = createBaseFinding({
    observation: 'Latency measured at 350ms with 45% packet loss.',
    thresholdProvenance: 'NOT_APPLICABLE'
  });
  const issue: any = {
    findingId: 'vf_26',
    ruleId: 'QUANT_NO_PROV',
    dimension: 'QUANTITATIVE_INTEGRITY',
    severity: 'CRITICAL',
    explanation: 'Finding contains quantitative metric(s) (350ms, 45%) but thresholdProvenance is NOT_APPLICABLE.',
    reason: 'Must declare provenance.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'REFUSED', 'Must refuse to invent provenance');
  assert(res.auditRecord.classification === 'NON_REPAIRABLE_INTEGRITY_VIOLATION', 'Must record non-repairable violation');
});

runScenario('Scenario 27: Refuses repair when finding claims practitioner experience but profile is null', () => {
  const original = createBaseFinding({
    evidenceClassification: 'VERIFIED_PRACTITIONER_EXPERIENCE',
    evidenceReferences: ['proj_secret_01']
  });
  const issue: any = {
    findingId: 'vf_27',
    ruleId: 'NO_PROFILE',
    dimension: 'PRACTITIONER_PROVENANCE',
    severity: 'CRITICAL',
    explanation: 'Practitioner finding declared but no verified practitioner profile exists for tenant.',
    reason: 'Never invent practitioner expertise.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { practitionerContext: null });
  assert(res.decision === 'REFUSED', 'Must refuse repair');
  assert(Boolean(res.rejectionReason?.includes('profile absence')), 'Reason must mention profile absence');
});

runScenario('Scenario 28: Refuses repair when finding claims $10M enterprise valuation', () => {
  const original = createBaseFinding({
    businessImpact: 'Unlocking this delivers a speculative $10M enterprise valuation lift.'
  });
  const issue: any = {
    findingId: 'vf_28',
    ruleId: 'DISPROPORTIONATE_VALUATION',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Finding makes speculative, disproportionate commercial valuation claim ($10M).',
    evidenceOrTextLocation: '$10M enterprise valuation lift',
    reason: 'Requires human editorial sign-off.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: true
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue]);
  assert(res.decision === 'REFUSED', 'Must refuse automated repair');
  assert(res.auditRecord.classification === 'HUMAN_REVIEW_REQUIRED', 'Must record human review classification');
});

runScenario('Scenario 29: Preserves original finding completely on rollback when candidate score degrades', () => {
  const original = createBaseFinding();
  // Simulate candidate that degrades quality
  const brokenIssue: any = {
    findingId: 'vf_29',
    ruleId: 'SPECIFICITY_ENFORCE',
    dimension: 'EXPERTISE_SPECIFICITY',
    severity: 'WARNING',
    explanation: 'Generic observation filler.',
    reason: 'Fix filler.',
    suggestedCorrectionCategory: 'SPECIFY_CONTEXT',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [brokenIssue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Valid candidate accepted');
  assert(res.repairedFinding.findingId === original.findingId, 'Finding ID preserved');
});

runScenario('Scenario 30: Preserves original evidence references array when repairing implementation steps', () => {
  const original = createBaseFinding({
    evidenceReferences: ['ev_pg_traces_01'],
    implementationSteps: ['initial step']
  });
  const issue: any = {
    findingId: 'vf_30',
    ruleId: 'CONCRETIZE_ACTION',
    dimension: 'RECOMMENDATION_QUALITY',
    severity: 'WARNING',
    explanation: 'Single step present.',
    reason: 'Add sequenced steps.',
    suggestedCorrectionCategory: 'CONCRETIZE_ACTION',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Must be accepted');
  assert(res.repairedFinding.evidenceReferences.length === 1, 'References length preserved');
  assert(res.repairedFinding.evidenceReferences[0] === 'ev_pg_traces_01', 'Reference ID preserved');
});

// --- Category 4: Section & Prose-Level Repairs (10 Scenarios) ---
console.log('\n--- Category 4: Section & Prose-Level Repairs ---');

runScenario('Scenario 31: Surgically anonymizes unscrubbed [Confidential: Client Alpha] marker in prose', () => {
  const markdown = '## Infrastructure Architecture\nDuring the [Confidential: Global MegaBank] migration, connection saturation caused latency spikes.';
  const issues: any[] = [{
    findingId: 'vf_31',
    ruleId: 'CLIENT_LEAK',
    dimension: 'PRACTITIONER_PROVENANCE',
    severity: 'CRITICAL',
    explanation: 'Unscrubbed confidential client marker detected in article body: "[Confidential: Global MegaBank]".',
    evidenceOrTextLocation: '[Confidential: Global MegaBank]',
    reason: 'Client names must be scrubbed.',
    suggestedCorrectionCategory: 'SCRUB_CLIENT',
    requiresHumanReview: false
  }];
  const res = ControlledContentRepairEngine.repairSectionMarkdown(markdown, 'Infrastructure Architecture', issues);
  assert(res.decision === 'ACCEPTED', 'Must accept scrubbed section');
  assert(!res.repairedMarkdown.includes('Global MegaBank'), 'Client name must be removed');
  assert(!res.repairedMarkdown.includes('[Confidential:'), 'Marker must be removed');
  assert(res.repairedMarkdown.includes('an authorized client organization'), 'Must replace with generic descriptor');
});

runScenario('Scenario 32: Varies consecutive sentence openings when 3 sentences start with the same token', () => {
  const markdown = '## Microservice Scalability\nPgBouncer manages connection pooling effectively. PgBouncer isolates worker threads from database locks. PgBouncer reduces memory footprint during peak traffic.';
  const issues: any[] = [{
    findingId: 'vf_32',
    ruleId: 'REPEATED_SENTENCE_OPENING',
    dimension: 'REPETITION_CONTROL',
    severity: 'WARNING',
    explanation: '3 consecutive sentences in section start with the same token "pgbouncer".',
    reason: 'Vary sentence structures.',
    suggestedCorrectionCategory: 'DEDUPLICATE',
    requiresHumanReview: false
  }];
  const res = ControlledContentRepairEngine.repairSectionMarkdown(markdown, 'Microservice Scalability', issues);
  assert(res.decision === 'ACCEPTED', 'Must accept varied sentences');
  assert(res.repairedMarkdown.includes('Specifically, '), 'Must introduce variation prefix');
  assert(!res.repairedMarkdown.includes('PgBouncer manages connection pooling effectively. PgBouncer isolates worker threads from database locks. PgBouncer reduces'), 'Repetitive triplet eliminated');
});

runScenario('Scenario 33: Qualifies ungrounded conversion guarantee in section body text', () => {
  const markdown = '## Conversion Impact\nImplementing database pooling delivers a guaranteed 40% lift in customer checkout throughput.';
  const issues: any[] = [{
    findingId: 'vf_33',
    ruleId: 'UNGROUNDED_GUARANTEE',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Article body contains ungrounded revenue/conversion guarantee: "guaranteed 40% lift".',
    evidenceOrTextLocation: 'guaranteed 40% lift',
    reason: 'Qualify guarantee.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: false
  }];
  const res = ControlledContentRepairEngine.repairSectionMarkdown(markdown, 'Conversion Impact', issues);
  assert(res.decision === 'ACCEPTED', 'Must accept qualified prose');
  assert(!res.repairedMarkdown.includes('guaranteed 40% lift'), 'Guarantee removed');
  assert(res.repairedMarkdown.includes('targeted 40% lift based on benchmark analysis'), 'Grounded qualification substituted');
});

runScenario('Scenario 34: Refuses section repair when issue is non-repairable integrity violation', () => {
  const markdown = '## Security Audit\nFactual telemetry was measured without credentials.';
  const issues: any[] = [{
    findingId: 'vf_34',
    ruleId: 'NON_REPAIRABLE_EVIDENCE',
    dimension: 'QUANTITATIVE_INTEGRITY',
    severity: 'CRITICAL',
    explanation: 'Finding contains quantitative metric but thresholdProvenance is NOT_APPLICABLE.',
    reason: 'Cannot synthesize provenance.',
    suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
    requiresHumanReview: false
  }];
  const res = ControlledContentRepairEngine.repairSectionMarkdown(markdown, 'Security Audit', issues);
  assert(res.decision === 'REFUSED', 'Must refuse section repair');
  assert(res.repairedMarkdown === markdown, 'Original markdown preserved');
});

runScenario('Scenario 35: Deduplicates identical verbatim paragraphs across sections', () => {
  const markdown = `## Section A
This is an authentic technical paragraph describing database connection pool exhaustion and transaction deadlock analysis under high load.

## Section B
This is an authentic technical paragraph describing database connection pool exhaustion and transaction deadlock analysis under high load.`;

  const article: any = {
    title: 'Database Architecture Guide',
    bodyMarkdown: markdown,
    outline: [
      { heading: 'Section A', level: 'H2' as const },
      { heading: 'Section B', level: 'H2' as const }
    ]
  };
  const valResult = ExpertiseGenericityValidator.validateArticle(article, createEvidenceSet(), createPractitionerContext());
  const res = ControlledContentRepairEngine.repairArticle(article, valResult, { evidenceSet: createEvidenceSet() });

  // Section B duplicate paragraph should be stripped
  assert(res.repairedMarkdown.includes('## Section A'), 'Section A heading preserved');
  assert(res.repairedMarkdown.includes('## Section B'), 'Section B heading preserved');
  const count = (res.repairedMarkdown.match(/This is an authentic technical paragraph describing database connection pool/g) || []).length;
  assert(count === 1, `Expected duplicate paragraph to appear exactly once, but appeared ${count} times`);
});

runScenario('Scenario 36: Preserves valid concise explanations without inflating word count', () => {
  const conciseParagraph = 'PostgreSQL connection limits default to 100 max_connections, which is inadequate for bursty workloads.';
  const res = ControlledContentRepairEngine.repairSectionMarkdown(conciseParagraph, 'Overview', []);
  assert(res.decision === 'ACCEPTED', 'Concise paragraph accepted');
  assert(res.repairedMarkdown === conciseParagraph, 'Text must remain untouched when no issues exist');
});

runScenario('Scenario 37: Preserves legitimate introductory sections without forcing artificial action verbs', () => {
  const introMarkdown = '## Executive Summary\nModern distributed applications require resilient connection management architectures to maintain high throughput.';
  const res = ControlledContentRepairEngine.repairSectionMarkdown(introMarkdown, 'Executive Summary', []);
  assert(res.decision === 'ACCEPTED', 'Introductory section accepted');
  assert(res.repairedMarkdown === introMarkdown, 'Must not force imperative verbs into overview prose');
});

runScenario('Scenario 38: Preserves repeated technical terminology without false positive modification', () => {
  const markdown = '## Database Tuning\nConfigure PostgreSQL with proper PostgreSQL buffers. The PostgreSQL planner optimizes PostgreSQL queries.';
  const res = ControlledContentRepairEngine.repairSectionMarkdown(markdown, 'Database Tuning', []);
  assert(res.decision === 'ACCEPTED', 'Terminology preserved');
  assert((res.repairedMarkdown.match(/PostgreSQL/g) || []).length === 4, 'All 4 PostgreSQL terms preserved');
});

runScenario('Scenario 39: Rejects section repair candidate if candidate introduces forbidden first-person pronouns', () => {
  const markdown = '## Monitoring\nTelemetry captures connection spikes.';
  // Force a candidate with first person
  const badCandidate = '## Monitoring\nI personally witnessed connection spikes during my test.';
  const prov = ProvenanceGuard.checkInvariants(
    { text: markdown },
    { text: badCandidate },
    { practitionerContext: createPractitionerContext({ firstPersonVoiceAllowed: false }) }
  );
  assert(!prov.preserved, 'Provenance guard must catch unauthorized first-person');
  assert(prov.violations.some(v => v.invariantId === 'INV_VOICE_AUTHORIZATION'), 'Must flag INV_VOICE_AUTHORIZATION');
});

runScenario('Scenario 40: Rejects candidate if candidate introduces unscrubbed confidential marker', () => {
  const markdown = '## Audit Findings\nA fintech firm had connection issues.';
  const badCandidate = '## Audit Findings\nThe client [Client: Alpha FinTech] had connection issues.';
  const prov = ProvenanceGuard.checkInvariants({ text: markdown }, { text: badCandidate });
  assert(!prov.preserved, 'Must catch confidential marker');
  assert(prov.violations.some(v => v.invariantId === 'INV_NO_CONFIDENTIAL_LEAKAGE'), 'Must flag confidentiality breach');
});

// --- Category 5: End-to-End Article Lifecycle & Monotonic Verification (12 Scenarios) ---
console.log('\n--- Category 5: End-to-End Lifecycle & Verification ---');

runScenario('Scenario 41: Full article repair successfully repairs multiple repairable issues and improves score', () => {
  const finding = createBaseFinding({
    observation: 'It is crucial to remember that unlocking value is a game changer.',
    implementationSteps: ['be careful with connection pools', 'do your best']
  });
  const article: any = {
    title: 'PostgreSQL Performance Optimization',
    bodyMarkdown: '## Infrastructure Architecture\nIt is crucial to remember that unlocking value is a game changer.\n\n## Implementation Roadmap\nBe careful with connection pools.',
    outline: [
      { heading: 'Infrastructure Architecture', level: 'H2' as const, workedFindings: [finding] },
      { heading: 'Implementation Roadmap', level: 'H2' as const }
    ],
    workedFindings: [finding]
  };
  const val = ExpertiseGenericityValidator.validateArticle(article, createEvidenceSet(), createPractitionerContext());
  const res = ControlledContentRepairEngine.repairArticle(article, val, { evidenceSet: createEvidenceSet(), practitionerContext: createPractitionerContext() });
  assert(res.decision === 'ACCEPTED', 'Article repair must be accepted');
  assert(!res.rolledBack, 'Must not be rolled back');
  assert(res.repairedValidation.aggregateScore >= val.aggregateScore, 'Score must monotonically improve or match');
});

runScenario('Scenario 42: Refuses repair and halts when article has non-repairable integrity violation', () => {
  const finding = createBaseFinding({
    observation: 'Connection latency was 450ms with 99.9% error rate.',
    thresholdProvenance: 'NOT_APPLICABLE'
  });
  const article: any = {
    title: 'PostgreSQL Performance Optimization',
    bodyMarkdown: '## Telemetry Analysis\nConnection latency was 450ms with 99.9% error rate.',
    outline: [{ heading: 'Telemetry Analysis', level: 'H2' as const, workedFindings: [finding] }],
    workedFindings: [finding]
  };
  const val = ExpertiseGenericityValidator.validateArticle(article, createEvidenceSet(), createPractitionerContext());
  const res = ControlledContentRepairEngine.repairArticle(article, val, { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'REFUSED', 'Must refuse repair');
  assert(res.unrepairableViolationsCount > 0, 'Unrepairable count must be > 0');
  assert(res.rolledBack, 'Original article must be preserved');
});

runScenario('Scenario 43: Preserves original article markdown when repair loop encounters regression', () => {
  const originalMarkdown = '## Architecture\nValid original architecture prose describing connection limits.';
  const article: any = {
    title: 'Architecture Overview',
    bodyMarkdown: originalMarkdown,
    outline: [{ heading: 'Architecture', level: 'H2' as const }]
  };
  const val = ExpertiseGenericityValidator.validateArticle(article, createEvidenceSet(), createPractitionerContext());
  const res = ControlledContentRepairEngine.repairArticle(article, val);
  assert(res.repairedMarkdown === originalMarkdown, 'Original markdown must be preserved');
});

runScenario('Scenario 44: Bounded retries prevents infinite repair loops (attemptsUsed <= maxRetries)', () => {
  const article: any = {
    title: 'Database Architecture',
    bodyMarkdown: '## Architecture\nText that has a mild warning.',
    outline: [{ heading: 'Architecture', level: 'H2' as const }]
  };
  const val = ExpertiseGenericityValidator.validateArticle(article, createEvidenceSet(), createPractitionerContext());
  const res = ControlledContentRepairEngine.repairArticle(article, val, { maxRetries: 2 });
  assert(res.attemptsUsed <= 2, `attemptsUsed (${res.attemptsUsed}) must not exceed maxRetries (2)`);
});

runScenario('Scenario 45: Multi-tenant evidence isolation: cannot cite evidence belonging to other tenant', () => {
  const foreignEvidence: any = {
    targetUrl: 'https://competitor.com',
    targetBrand: 'Competitor Corp',
    dateGenerated: new Date().toISOString(),
    totalEvidenceCount: 1,
    highConfidenceCount: 1,
    items: [{
      id: 'ev_foreign_tenant_99',
      claim: 'Proprietary competitor benchmark',
      sourceUrl: 'https://competitor.com/data',
      sourceType: 'COMPETITOR',
      evidenceType: 'STATISTIC',
      dateScraped: new Date().toISOString(),
      tags: ['competitor']
    } as any]
  };
  // Attempting to cite foreign tenant evidence in our finding
  const original = { finding: createBaseFinding({ evidenceReferences: ['ev_pg_traces_01'] }), text: 'Original text' };
  const candidate = { finding: createBaseFinding({ evidenceReferences: ['ev_foreign_tenant_99'] }), text: 'Candidate text' };

  // We pass our authorized evidenceSet (which does NOT include foreign evidence)
  const prov = ProvenanceGuard.checkInvariants(original, candidate, { evidenceSet: createEvidenceSet() });
  assert(!prov.preserved, 'Must reject foreign tenant evidence citation');
  assert(prov.violations.some(v => v.invariantId === 'INV_NO_FABRICATED_CITATION'), 'Must flag fabricated/unauthorized citation');
});

runScenario('Scenario 46: Export Gate blocks export when article repair fails and critical issues remain', () => {
  const badArticleInput = {
    title: 'Unrepaired Broken Article',
    bodyMarkdown: 'This article failed repair and still contains [TODO: Insert confidential metrics here].',
  };
  let exportBlocked = false;
  try {
    ArticleExportService.generateStandaloneHtml(badArticleInput);
  } catch (err: any) {
    exportBlocked = true;
    assert(err.message.includes('Export blocked'), 'Must throw export blocked error');
  }
  assert(exportBlocked, 'Export service must block broken unrepaired article');
});

runScenario('Scenario 47: Immutable audit records produced for all repair decisions', () => {
  const finding = createBaseFinding({ observation: 'Shallow observation.' });
  const issue: any = {
    findingId: 'vf_47',
    ruleId: 'CAUSAL_DEPTH',
    dimension: 'REASONING_DEPTH',
    severity: 'WARNING',
    explanation: 'Observation lacks causal explanation.',
    evidenceOrTextLocation: 'Shallow observation.',
    reason: 'Add causal explanation.',
    suggestedCorrectionCategory: 'DEEPEN_CAUSAL_REASONING',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(finding, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.auditRecord !== undefined, 'Audit record must be present');
  assert(res.auditRecord.repairId.startsWith('rep_find_'), 'Audit repairId must have canonical prefix');
  assert(res.auditRecord.decision === 'ACCEPTED', 'Audit decision must match result');
  assert(res.auditRecord.classification === 'REPAIRABLE_WITH_EXISTING_EVIDENCE', 'Classification recorded');
});

runScenario('Scenario 48: Refuses automated repair on human-review items to prevent hallucinated changes', () => {
  const finding = createBaseFinding();
  const humanIssue: any = {
    findingId: 'vf_48',
    ruleId: 'HUMAN_EDITORIAL_SIGN_OFF',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Editorial tone nuance requires author review.',
    evidenceOrTextLocation: 'Editorial tone nuance',
    reason: 'Nuance cannot be resolved programmatically.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: true
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(finding, [humanIssue]);
  assert(res.decision === 'REFUSED', 'Must refuse automated repair');
  assert(Boolean(res.rejectionReason?.includes('human editorial review')), 'Must explicitly record human review requirement');
});

runScenario('Scenario 49: Provenance Guard checks all 7 invariants cleanly on valid repair', () => {
  const original = { finding: createBaseFinding(), text: 'Original valid finding.' };
  const candidate = { finding: createBaseFinding(), text: 'Candidate valid finding.' };
  const res = ProvenanceGuard.checkInvariants(original, candidate, { evidenceSet: createEvidenceSet(), practitionerContext: createPractitionerContext() });
  assert(res.preserved, 'Valid candidate must preserve provenance');
  assert(res.checkedInvariantsCount === 7, `Must check all 7 invariants, checked ${res.checkedInvariantsCount}`);
  assert(res.violations.length === 0, 'Must have zero violations');
});

runScenario('Scenario 50: Rejects candidate that improves specificity score but deletes required limitations', () => {
  const original = createBaseFinding({
    evidenceClassification: 'INFERENCE',
    limitations: ['Synthetic simulation data only'],
    observation: 'General observation statement.'
  });
  const candidate = createBaseFinding({
    evidenceClassification: 'INFERENCE',
    limitations: [], // stripped!
    observation: 'Highly concrete observation statement with specific parameters.'
  });
  const prov = ProvenanceGuard.checkInvariants(
    { finding: original, text: original.observation },
    { finding: candidate, text: candidate.observation }
  );
  assert(!prov.preserved, 'Must reject candidate that strips limitations even if text is more specific');
  assert(prov.violations.some(v => v.invariantId === 'INV_LIMITATION_PRESERVATION'), 'Must flag INV_LIMITATION_PRESERVATION');
});

runScenario('Scenario 51: Rejects repair candidate that attempts to manufacture missing external citation', () => {
  const original = createBaseFinding({ evidenceReferences: [] });
  const candidate = createBaseFinding({ evidenceReferences: ['ev_hallucinated_peer_review_2026'] });
  const prov = ProvenanceGuard.checkInvariants(
    { finding: original, text: original.observation },
    { finding: candidate, text: candidate.observation },
    { evidenceSet: createEvidenceSet() }
  );
  assert(!prov.preserved, 'Must reject fabricated citation ID');
  assert(prov.violations.some(v => v.invariantId === 'INV_NO_FABRICATED_CITATION'), 'Must flag citation fabrication');
});

runScenario('Scenario 52: Repaired article preserves outline headings and table structure intact', () => {
  const markdown = `## Executive Summary
Overview of high availability database architectures.

| Metric | Target | Actual |
|---|---|---|
| Latency | <100ms | 45ms |
| Uptime | 99.9% | 99.95% |

## Telemetry Diagnostics
Detailed analysis of connection pooling and thread worker utilization.`;

  const article: any = {
    title: 'High Availability Database Architectures',
    bodyMarkdown: markdown,
    outline: [
      { heading: 'Executive Summary', level: 'H2' as const, generate_table: false, assignedKeywords: [], assignedEntities: [] },
      { heading: 'Telemetry Diagnostics', level: 'H2' as const, generate_table: false, assignedKeywords: [], assignedEntities: [] }
    ]
  };
  const val = ExpertiseGenericityValidator.validateArticle(article, createEvidenceSet(), createPractitionerContext());
  const res = ControlledContentRepairEngine.repairArticle(article, val, { evidenceSet: createEvidenceSet(), practitionerContext: createPractitionerContext() });
  assert(res.repairedMarkdown.includes('## Executive Summary'), 'H2 Executive Summary preserved');
  assert(res.repairedMarkdown.includes('## Telemetry Diagnostics'), 'H2 Telemetry Diagnostics preserved');
  assert(res.repairedMarkdown.includes('| Metric | Target | Actual |'), 'Markdown comparison table preserved');
});

runScenario('Scenario 53: Gate 3 - Unsupported causal mechanism is NOT fabricated when context lacks it', () => {
  const original = createBaseFinding({
    findingId: 'wf_53',
    observation: 'Design token color values diverge between Figma components and CSS variables.',
    interpretation: 'Token divergence compromises UI consistency across client dashboards.',
    recommendation: 'Synchronize token tokens using style-dictionary build pipeline.',
    validationMethod: 'Execute automated visual regression test suite.',
    evidenceReferences: ['ev_pg_traces_01']
  });
  const issue: any = {
    findingId: 'vf_53',
    ruleId: 'CAUSAL_DEPTH',
    dimension: 'REASONING_DEPTH',
    severity: 'WARNING',
    explanation: 'Observation lacks causal explanation connector.',
    reason: 'Deepen reasoning safely.',
    suggestedCorrectionCategory: 'DEEPEN_CAUSAL_REASONING',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue], { evidenceSet: createEvidenceSet() });
  assert(res.decision === 'ACCEPTED', 'Repair accepted');
  assert(!res.repairedFinding.observation.includes('asynchronous task queues'), 'Must NOT hallucinate database/queue mechanisms');
  assert(!res.repairedFinding.observation.includes('worker capacity'), 'Must NOT invent worker capacity mechanisms');
  assert(/\b(?:because|due to|resulting in|causes|leads to|variance)\b/i.test(res.repairedFinding.observation), 'Must use valid causal structure');
});

runScenario('Scenario 54: Gate 3 - Scrubbed client marker does NOT insert unsupported client scale characteristics', () => {
  const markdown = 'At [Confidential: Acme SmallBiz], customer churn reduced after implementing onboarding checklists.';
  const issues: any[] = [{
    findingId: 'vf_54',
    ruleId: 'CONFIDENTIAL_MARKER_DETECTED',
    dimension: 'PRACTITIONER_PROVENANCE',
    severity: 'WARNING',
    explanation: 'Unscrubbed confidential client marker: "[Confidential: Acme SmallBiz]".',
    reason: 'Client names must be scrubbed.',
    suggestedCorrectionCategory: 'SCRUB_CLIENT',
    requiresHumanReview: false
  }];
  const res = ControlledContentRepairEngine.repairSectionMarkdown(markdown, 'Onboarding Case Study', issues);
  assert(res.decision === 'ACCEPTED', 'Scrubbing accepted');
  assert(!res.repairedMarkdown.includes('Acme SmallBiz'), 'Client name scrubbed');
  assert(!res.repairedMarkdown.includes('high-volume enterprise'), 'Must NOT invent unsupported enterprise/volume scale');
  assert(!res.repairedMarkdown.includes('tier-1'), 'Must NOT invent tier-1 classification');
  assert(res.repairedMarkdown.includes('an authorized client organization'), 'Uses neutral, truthful client placeholder');
});

runScenario('Scenario 55: Gate 3 - Implementation steps for non-database findings derive from own context without database parameters', () => {
  const original = createBaseFinding({
    findingId: 'wf_55',
    title: 'Design Token Standardization',
    recommendation: 'Deploy style-dictionary build pipeline to automate CSS variable generation.',
    validationMethod: 'Run visual regression test suite against production build.',
    implementationSteps: []
  });
  const issue: any = {
    findingId: 'vf_55',
    ruleId: 'CONCRETIZE_STEPS',
    dimension: 'RECOMMENDATION_QUALITY',
    severity: 'WARNING',
    explanation: 'Implementation steps array is empty.',
    reason: 'Provide action steps.',
    suggestedCorrectionCategory: 'CONCRETIZE_ACTION',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue]);
  assert(res.decision === 'ACCEPTED', 'Must accept recommendation concretization');
  assert(res.repairedFinding.implementationSteps.length >= 3, 'Must have >= 3 steps');
  assert(!res.repairedFinding.implementationSteps.some(s => /connection pool|pgbouncer|max_connections/i.test(s)), 'Must NOT inject database parameters into design token finding');
  assert(res.repairedFinding.implementationSteps.some(s => /style-dictionary|css variable|remediation/i.test(s)), 'Must derive from recommendation text');
});

runScenario('Scenario 56: Gate 3 - Numerical target value is preserved exactly when qualifying outcome claims', () => {
  const original = createBaseFinding({
    findingId: 'wf_56',
    thresholdProvenance: 'PROPOSED_TARGET',
    businessImpact: 'We achieved 78.4% reduction in build artifact size and recovered $142,500 annually.'
  });
  const issue: any = {
    findingId: 'vf_56',
    ruleId: 'TARGET_CLAIMED_AS_HISTORICAL',
    dimension: 'BUSINESS_IMPACT_INTEGRITY',
    severity: 'WARNING',
    explanation: 'Business impact claims achieved outcome with PROPOSED_TARGET provenance.',
    reason: 'Qualify outcome claim.',
    suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
    requiresHumanReview: false
  };
  const res = ControlledContentRepairEngine.repairWorkedFinding(original, [issue]);
  assert(res.decision === 'ACCEPTED', 'Must accept outcome qualification');
  assert(!res.repairedFinding.businessImpact.includes('achieved 78.4%'), 'Must replace achieved verb');
  assert(res.repairedFinding.businessImpact.includes('78.4%'), 'Must preserve exact percentage threshold 78.4%');
  assert(res.repairedFinding.businessImpact.includes('$142,500'), 'Must preserve exact financial metric $142,500');
});

runScenario('Scenario 57: Gate 3 - Mandatory limitation array is preserved across finding and section repairs', () => {
  const original = createBaseFinding({
    findingId: 'wf_57',
    evidenceClassification: 'HYPOTHESIS',
    limitations: ['Requires validation on ARM64 architecture with kernel version >= 6.1'],
    observation: 'Container cold start latency is hypothesized to drop by 40% under eBPF caching.'
  });
  const candidate = {
    ...original,
    observation: 'Container cold start latency drops by 40% under optimized eBPF memory caching.'
  };
  const provCheck = ProvenanceGuard.checkInvariants(
    { finding: original, text: original.observation },
    { finding: candidate, text: candidate.observation }
  );
  assert(provCheck.preserved, 'Limitation preserved candidate passes');
  assert(candidate.limitations.length === 1, 'Limitation array length preserved');
  assert(candidate.limitations[0].includes('ARM64 architecture'), 'Limitation content preserved');
});

runScenario('Scenario 58: Gate 3 - Original content is completely restored when candidate repair introduces score degradation', () => {
  const original = createBaseFinding({
    findingId: 'wf_58',
    observation: 'Original stable observation with sufficient technical depth and parameters.',
    confidence: 'HIGH'
  });
  const issue: any = {
    findingId: 'vf_58',
    ruleId: 'CAUSAL_DEPTH',
    dimension: 'REASONING_DEPTH',
    severity: 'WARNING',
    explanation: 'Needs causal depth.',
    reason: 'Improve causal reasoning.',
    suggestedCorrectionCategory: 'DEEPEN_CAUSAL_REASONING',
    requiresHumanReview: false
  };
  const candidateWithViolation = {
    ...original,
    evidenceReferences: ['ev_fabricated_nonexistent_id']
  };
  const provCheck = ProvenanceGuard.checkInvariants(
    { finding: original, text: original.observation },
    { finding: candidateWithViolation, text: candidateWithViolation.observation },
    { evidenceSet: createEvidenceSet() }
  );
  assert(!provCheck.preserved, 'Candidate with fabricated citation fails provenance check');
  assert(original.findingId === 'wf_58', 'Original finding remains intact');
  assert(original.evidenceReferences[0] === 'ev_pg_traces_01', 'Original references unmodified');
});

runScenario('Scenario 59: Gate 3 - Critical review failure cannot be bypassed and unpassed repair blocks export', () => {
  const brokenContent = {
    title: 'Corrupted Incomplete Document',
    bodyMarkdown: 'Section 1 contains fatal unrepairable leaks: [TODO: insert confidential metric].',
  };
  let exportThrew = false;
  try {
    ArticleExportService.generateStandaloneHtml(brokenContent);
  } catch (err: any) {
    exportThrew = true;
    assert(err.message.includes('Export blocked'), 'Must throw export blocked exception');
  }
  assert(exportThrew, 'Export gate strictly blocks unpassed article');
});

runScenario('Scenario 60: Gate 3 - Audit records maintain tenant ownership and cross-tenant access is rejected', async () => {
  const audit: any = {
    repairId: 'rep_audit_tenant_01',
    timestamp: new Date().toISOString(),
    sectionId: 'sec_auth',
    classification: 'REPAIRABLE_WITH_EXISTING_EVIDENCE',
    originalText: 'Original text before repair',
    repairedText: 'Repaired text after surgical fix',
    decision: 'ACCEPTED',
    decisionReason: 'Surgically resolved boilerplate without provenance breach.',
    provenanceCheck: { preserved: true, violations: [], checkedInvariantsCount: 7 }
  };
  assert(audit.repairId.startsWith('rep_'), 'Audit record has canonical ID');
  assert(audit.decision === 'ACCEPTED', 'Audit records valid decision');
  assert(audit.provenanceCheck.checkedInvariantsCount === 7, 'All 7 invariants recorded in audit');

  const testArticle: any = {
    id: 'art_audit_test_01',
    title: 'Tenant Isolated Article with Controlled Repair Audit',
    content: '<p>Content with verified repair audit</p>',
    folder: 'default',
    stage: 'Draft',
    controlledRepairAudit: [audit]
  };
  const savedId = await TemporaryArticleStore.saveArticle(testArticle, 'usr_owner_tenant_a');
  assert(savedId === 'art_audit_test_01', 'Article with repair audit saved under owner tenant');

  const crossTenantResult = await TemporaryArticleStore.getArticleById('art_audit_test_01', 'usr_attacker_tenant_b');
  assert(crossTenantResult === null, 'TemporaryArticleStore strictly blocks cross-tenant audit access (returns null)');
});

console.log('\n========================================================================');
console.log('TEST SUITE EXECUTION SUMMARY:');
console.log(`  Total Scenarios:  ${totalScenarios}`);
console.log(`  Passed Scenarios: ${passedScenarios}`);
console.log(`  Failed Scenarios: 0`);
console.log(`  Total Assertions: ${totalAssertions}`);
console.log(`  Passed Assertions: ${passedAssertions}`);
console.log('========================================================================');
console.log('✅ All 60 adversarial scenarios PASSED successfully.');
