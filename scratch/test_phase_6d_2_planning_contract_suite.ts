/**
 * Phase 6D.2: Evidence & Experience Planning Contract Test Suite
 *
 * Verifies all 24 mandatory scenarios defined in Phase 6D.2 specification:
 * 1. Valid plan generation for all substantive outline nodes
 * 2. OutlineNodeSchema parses with valid evidencePlan
 * 3. OutlineNodeSchema parses with evidencePlan omitted (backward compatibility)
 * 4. Rejection of invalid EvidenceAvailabilityStatus
 * 5. Rejection of invalid ClaimEvidenceClassification
 * 6. Rejection of empty buyerQuestion (< 10 chars or empty)
 * 7. Rejection of trivial buyer question identical to heading
 * 8. Rejection of empty reasoning requirements (all 5 dimensions mandatory)
 * 9. Detection of MISSING evidence when no evidence matches section
 * 10. Presence of non-empty evidenceGapReason when evidence is MISSING
 * 11. Segregation of practitionerEvidenceReferences from externalSourceReferences
 * 12. Tagging of practitioner evidence with [PRACTITIONER EXPERIENCE] and proper attribution constraints
 * 13. Prevention of competitor evidence from leaking into practitioner references
 * 14. Accurate assignment of deliverable contract requirements to reasoning plan (AUDIT)
 * 15. Accurate assignment of CHECKLIST deliverable requirements to reasoning plan
 * 16. Accurate assignment of COMPARISON deliverable requirements to reasoning plan
 * 17. Non-substantive section correctly identified with isSubstantive=false, NOT_APPLICABLE status
 * 18. Verified practitioner profile with projects creates AVAILABLE_VERIFIED plan with practitioner references
 * 19. Unverified practitioner profile creates AVAILABLE_UNVERIFIED or MISSING plan, never AVAILABLE_VERIFIED for unverified claims
 * 20. Missing practitioner profile executes gracefully without error (default external/general planning)
 * 21. Section prompt formatting includes complete evidence plan context, buyer question, and reasoning requirements
 * 22. Missing evidence prompt formatting includes strict prohibition against synthetic anecdotes and invented metrics
 * 23. End-to-end orchestration run with SectionEvidencePlanner populates brief.outline[i].evidencePlan
 * 24. Integration regression validation
 */

import {
  OutlineNodeSchema,
  OutlineNode,
  EvidenceAvailabilityStatusSchema,
  ClaimEvidenceClassificationSchema,
  SectionPurposePlanSchema,
  EvidenceRequirementsPlanSchema,
  ReasoningRequirementsPlanSchema,
  SectionEvidencePlanSchema,
  PractitionerKnowledgeProfile,
  VerifiedPractitionerContext,
  SaaSProfile,
} from '../src/core/contracts/schemas';
import {
  EvidenceSet,
  EvidenceItem,
  ContentGapMatrix,
} from '../src/core/contracts/evidence';
import { SectionEvidencePlanner } from '../src/lib/intelligence/SectionEvidencePlanner';
import { PractitionerKnowledgeService } from '../src/lib/intelligence/PractitionerKnowledgeService';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';

let totalChecks = 0;
let passedChecks = 0;
const failures: string[] = [];

function assert(condition: boolean, desc: string) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${desc}`);
  } else {
    failures.push(desc);
    console.error(`  [FAIL] ${desc}`);
  }
}

async function runSuite() {
  console.log('=== ACUTE Phase 6D.2: Evidence & Experience Planning Contract Test Suite ===\n');

  // Common Fixtures
  const mockEvidenceSet: EvidenceSet = {
    items: [
      {
        id: 'ev-ux-1',
        sourceUrl: 'https://example.com/ux-audit-study',
        sourceTitle: 'Checkout Friction Study',
        sourceType: 'INDUSTRY',
        claim: 'Multi-step checkout flows without progress indicators experience a 24% higher abandonment rate.',
        evidenceType: 'STATISTIC',
        confidence: 'HIGH',
        topics: ['checkout', 'friction', 'ux audit'],
        supports: ['Diagnosing Mobile Checkout Friction'],
        citationRequired: true,
      },
      {
        id: 'ev-comp-1',
        sourceUrl: 'https://competitor.com/blog',
        sourceTitle: 'Competitor Article',
        sourceType: 'COMPETITOR',
        claim: 'Competitor Platform claims their automated widget resolves 90% of support tickets.',
        evidenceType: 'COMPETITOR_OBSERVATION',
        confidence: 'MEDIUM',
        topics: ['support', 'automation'],
        citationRequired: true,
      },
      {
        id: 'ev-brand-1',
        sourceUrl: 'https://uxspecialist.io/services',
        sourceTitle: 'UX Specialist Services',
        sourceType: 'TARGET_SITE',
        claim: 'Alex Thorne conducts manual heuristic walkthroughs across 40 checkout friction checkpoints.',
        evidenceType: 'BUSINESS_FACT',
        confidence: 'HIGH',
        topics: ['ux audit', 'evaluation criteria', 'checkout'],
        citationRequired: false,
      },
    ],
    extractedAt: '2026-11-11T20:00:00Z',
    summary: {
      totalCount: 3,
      highConfidenceCount: 2,
      businessFactCount: 1,
      competitorObservationCount: 1,
      serpObservationCount: 0,
      inferenceCount: 0,
    },
  };

  const mockVerifiedProfile: PractitionerKnowledgeProfile = {
    id: 'practitioner-alex-101',
    tenantId: 'tenant-ux-studio-1',
    userId: 'user-alex-1',
    identity: {
      practitionerId: 'practitioner-alex-101',
      tenantId: 'tenant-ux-studio-1',
      displayName: 'Alex Thorne',
      professionalTitle: 'Principal Conversion & UX Specialist',
      biography: '14 years conducting enterprise checkout and SaaS onboarding UX audits.',
      domainFocus: ['UX Audit', 'Checkout Optimization', 'SaaS Onboarding'],
      approvedAuthorName: 'Alex Thorne',
      profileStatus: 'ACTIVE',
      yearsOfExperience: 14,
      verificationStatus: 'VERIFIED',
      verifiedAt: '2026-10-01T10:00:00Z',
      verifiedBy: 'compliance-dir-1',
    },
    expertise: [
      {
        expertiseId: 'exp-1',
        capability: 'Checkout Funnel Heuristic Auditing',
        description: 'Comprehensive manual heuristic evaluation of multi-step mobile checkout flows.',
        evidenceReferences: ['audit-framework-v3'],
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
      },
    ],
    designPrinciples: [
      {
        principleId: 'principle-1',
        statement: 'Never obscure form validation errors behind sticky navigation bars.',
        explanation: 'Users abandon mobile checkouts when error states cannot be visually located within the viewport.',
        context: 'Mobile checkout optimization',
        sourceReferences: ['published-paper-2025'],
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
      },
    ],
    verifiedProjects: [
      {
        projectId: 'proj-1',
        projectTitle: 'B2B SaaS Checkout Overhaul',
        projectType: 'Consultancy',
        confidentialityLevel: 'ANONYMIZED',
        clientNamingPermission: false,
        anonymizedDescription: 'High-volume B2B subscription portal checkout audit.',
        problemObserved: 'Hidden field validation errors caused 18% premature user abandonment.',
        intervention: 'Restructured form error highlighting and introduced persistent inline error summaries.',
        documentedOutcome: 'Eliminated form abandonment loops and improved task completion by 14%.',
        evidenceReferences: ['client-signoff-2025.pdf'],
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
      },
    ],
    attributionRules: {
      firstPersonVoiceAllowed: false,
      thirdPersonVoiceAllowed: true,
      approvedCredentials: ['Principal Conversion Specialist'],
      clientNamingPermission: false,
      approvedUsageScope: ['UX Audit', 'Checkout Optimization'],
      requireAnonymization: true,
      prohibitedClaims: [],
    },
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    version: 1,
  };

  const verifiedContext = PractitionerKnowledgeService.filterForGenerationContext(mockVerifiedProfile);

  // -------------------------------------------------------------
  // Scenario 1: Valid plan generation for all substantive outline nodes
  // -------------------------------------------------------------
  console.log('\n--- Scenario 1: Valid plan generation for all substantive outline nodes ---');
  const outlineNodes: OutlineNode[] = [
    OutlineNodeSchema.parse({
      heading: 'Diagnosing Mobile Checkout Friction',
      level: 'H2',
      assignedKeywords: ['mobile checkout friction'],
      assignedEntities: ['Checkout Flow'],
      core_concept: 'Identifying checkout drop-off bottlenecks',
    }),
    OutlineNodeSchema.parse({
      heading: 'UX Audit Evaluation Criteria',
      level: 'H2',
      assignedKeywords: ['ux audit criteria'],
      assignedEntities: ['Heuristic Walkthrough'],
      core_concept: 'Evaluation heuristics for user interfaces',
    }),
  ];

  const plans = SectionEvidencePlanner.createSectionPlans(
    outlineNodes,
    mockEvidenceSet,
    verifiedContext,
    undefined,
    { name: 'Alex Thorne UX', description: 'UX Audit Consultancy', targetAudience: 'Product Teams' } as SaaSProfile,
    'ux audit services'
  );

  assert(plans.length === 2, 'createSectionPlans produces exactly 2 plans for 2 nodes');
  assert(plans[0].heading === 'Diagnosing Mobile Checkout Friction', 'Plan 1 matches heading');
  assert(plans[1].heading === 'UX Audit Evaluation Criteria', 'Plan 2 matches heading');
  assert(plans[0].isSubstantive === true, 'Plan 1 is marked substantive');
  assert(plans[1].isSubstantive === true, 'Plan 2 is marked substantive');
  assert(typeof plans[0].purpose.buyerQuestion === 'string' && plans[0].purpose.buyerQuestion.length >= 10, 'Plan 1 has substantive buyerQuestion');
  assert(typeof plans[1].purpose.buyerQuestion === 'string' && plans[1].purpose.buyerQuestion.length >= 10, 'Plan 2 has substantive buyerQuestion');

  // -------------------------------------------------------------
  // Scenario 2: OutlineNodeSchema parses with valid evidencePlan
  // -------------------------------------------------------------
  console.log('\n--- Scenario 2: OutlineNodeSchema parses with valid evidencePlan ---');
  const nodeWithPlan = {
    heading: 'Diagnosing Mobile Checkout Friction',
    level: 'H2' as const,
    evidencePlan: plans[0],
  };
  const parseWithPlan = OutlineNodeSchema.safeParse(nodeWithPlan);
  assert(parseWithPlan.success === true, 'OutlineNodeSchema parses valid node with evidencePlan');
  assert(parseWithPlan.success && parseWithPlan.data.evidencePlan?.sectionId === 'sec_1', 'Parsed node contains matching sectionId');

  // -------------------------------------------------------------
  // Scenario 3: OutlineNodeSchema parses with evidencePlan omitted (backward compatibility)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 3: OutlineNodeSchema parses with evidencePlan omitted ---');
  const nodeWithoutPlan = {
    heading: 'Legacy Section Heading',
    level: 'H2' as const,
  };
  const parseWithoutPlan = OutlineNodeSchema.safeParse(nodeWithoutPlan);
  assert(parseWithoutPlan.success === true, 'OutlineNodeSchema parses cleanly without evidencePlan');
  assert(parseWithoutPlan.success && parseWithoutPlan.data.evidencePlan === undefined, 'Parsed node has evidencePlan === undefined');

  // -------------------------------------------------------------
  // Scenario 4: Rejection of invalid EvidenceAvailabilityStatus
  // -------------------------------------------------------------
  console.log('\n--- Scenario 4: Rejection of invalid EvidenceAvailabilityStatus ---');
  const invalidStatusParse = EvidenceAvailabilityStatusSchema.safeParse('TOTALLY_BOGUS_STATUS');
  assert(invalidStatusParse.success === false, 'EvidenceAvailabilityStatusSchema rejects unrecognized status');
  const validStatusParse = EvidenceAvailabilityStatusSchema.safeParse('AVAILABLE_VERIFIED');
  assert(validStatusParse.success === true, 'EvidenceAvailabilityStatusSchema accepts AVAILABLE_VERIFIED');

  // -------------------------------------------------------------
  // Scenario 5: Rejection of invalid ClaimEvidenceClassification
  // -------------------------------------------------------------
  console.log('\n--- Scenario 5: Rejection of invalid ClaimEvidenceClassification ---');
  const invalidClaimParse = ClaimEvidenceClassificationSchema.safeParse('HALLUCINATED_ANECDOTE');
  assert(invalidClaimParse.success === false, 'ClaimEvidenceClassificationSchema rejects invalid classification');
  const validClaimParse = ClaimEvidenceClassificationSchema.safeParse('VERIFIED_PRACTITIONER_EXPERIENCE');
  assert(validClaimParse.success === true, 'ClaimEvidenceClassificationSchema accepts VERIFIED_PRACTITIONER_EXPERIENCE');

  // -------------------------------------------------------------
  // Scenario 6: Rejection of empty buyerQuestion (< 10 chars or empty)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 6: Rejection of empty buyerQuestion (< 10 chars or empty) ---');
  const emptyBuyerQ = SectionPurposePlanSchema.safeParse({
    sectionId: 'sec_1',
    heading: 'Diagnosing Checkout Friction',
    sectionPurpose: 'Diagnose friction points',
    buyerQuestion: '',
    intendedReaderOutcome: 'Fix checkout friction',
  });
  assert(emptyBuyerQ.success === false, 'SectionPurposePlanSchema rejects empty buyerQuestion');

  const shortBuyerQ = SectionPurposePlanSchema.safeParse({
    sectionId: 'sec_1',
    heading: 'Diagnosing Checkout Friction',
    sectionPurpose: 'Diagnose friction points',
    buyerQuestion: 'Why buy?',
    intendedReaderOutcome: 'Fix checkout friction',
  });
  assert(shortBuyerQ.success === false, 'SectionPurposePlanSchema rejects buyerQuestion under 10 chars');

  // -------------------------------------------------------------
  // Scenario 7: Rejection of trivial buyer question identical to heading
  // -------------------------------------------------------------
  console.log('\n--- Scenario 7: Rejection of trivial buyer question identical to heading ---');
  const trivialQ = SectionPurposePlanSchema.safeParse({
    sectionId: 'sec_1',
    heading: 'Diagnosing Checkout Friction',
    sectionPurpose: 'Diagnose friction points',
    buyerQuestion: 'Diagnosing Checkout Friction?',
    intendedReaderOutcome: 'Fix checkout friction',
  });
  assert(trivialQ.success === false, 'SectionPurposePlanSchema rejects buyerQuestion identical to heading');

  // -------------------------------------------------------------
  // Scenario 8: Rejection of empty reasoning requirements
  // -------------------------------------------------------------
  console.log('\n--- Scenario 8: Rejection of empty reasoning requirements ---');
  const emptyObs = ReasoningRequirementsPlanSchema.safeParse({
    observationRequirement: '',
    interpretationRequirement: 'Valid interpretation',
    recommendationRequirement: 'Valid recommendation',
    implementationRequirement: 'Valid implementation',
    validationRequirement: 'Valid validation',
  });
  assert(emptyObs.success === false, 'ReasoningRequirementsPlanSchema rejects empty observationRequirement');

  const emptyRec = ReasoningRequirementsPlanSchema.safeParse({
    observationRequirement: 'Valid observation',
    interpretationRequirement: 'Valid interpretation',
    recommendationRequirement: '',
    implementationRequirement: 'Valid implementation',
    validationRequirement: 'Valid validation',
  });
  assert(emptyRec.success === false, 'ReasoningRequirementsPlanSchema rejects empty recommendationRequirement');

  // -------------------------------------------------------------
  // Scenario 9: Detection of MISSING evidence when no evidence matches section
  // -------------------------------------------------------------
  console.log('\n--- Scenario 9: Detection of MISSING evidence when no evidence matches section ---');
  const ungroundedNode: OutlineNode = OutlineNodeSchema.parse({
    heading: 'Quantum Computing Encryption Algorithms',
    level: 'H2',
    assignedKeywords: ['quantum cryptography', 'qubits'],
    core_concept: 'Post-quantum algorithmic lattice structures',
  });
  const ungroundedReqs = SectionEvidencePlanner.determineEvidenceRequirements(
    ungroundedNode,
    mockEvidenceSet,
    null,
    'ux audit services',
    undefined,
    true
  );
  assert(ungroundedReqs.evidenceAvailability === 'MISSING', 'Novel/unrelated topic receives MISSING evidenceAvailability');

  // -------------------------------------------------------------
  // Scenario 10: Presence of non-empty evidenceGapReason when evidence is MISSING
  // -------------------------------------------------------------
  console.log('\n--- Scenario 10: Presence of non-empty evidenceGapReason when evidence is MISSING ---');
  assert(
    typeof ungroundedReqs.evidenceGapReason === 'string' && ungroundedReqs.evidenceGapReason.trim().length > 10,
    'evidenceGapReason is populated with a substantive explanation when evidence is MISSING'
  );

  const missingWithoutReason = EvidenceRequirementsPlanSchema.safeParse({
    evidenceAvailability: 'MISSING',
    evidenceGapReason: '',
  });
  assert(missingWithoutReason.success === false, 'EvidenceRequirementsPlanSchema rejects MISSING evidence without non-empty gap reason');

  // -------------------------------------------------------------
  // Scenario 11: Segregation of practitionerEvidenceReferences from externalSourceReferences
  // -------------------------------------------------------------
  console.log('\n--- Scenario 11: Segregation of practitionerEvidenceReferences from externalSourceReferences ---');
  const dualEvidencePlan = plans[0]; // Matches both practitioner project and research study
  assert(dualEvidencePlan.evidence.practitionerEvidenceReferences.length > 0, 'Plan has practitioner references');
  assert(dualEvidencePlan.evidence.externalSourceReferences.length > 0, 'Plan has external references');
  assert(
    dualEvidencePlan.evidence.practitionerEvidenceReferences.every(r => r.includes('[PRACTITIONER EXPERIENCE]')),
    'Practitioner references are tagged exclusively with [PRACTITIONER EXPERIENCE]'
  );
  assert(
    dualEvidencePlan.evidence.externalSourceReferences.every(r => !r.includes('[PRACTITIONER EXPERIENCE]')),
    'External source references never include [PRACTITIONER EXPERIENCE]'
  );

  // -------------------------------------------------------------
  // Scenario 12: Tagging of practitioner evidence with [PRACTITIONER EXPERIENCE] and proper attribution constraints
  // -------------------------------------------------------------
  console.log('\n--- Scenario 12: Tagging of practitioner evidence and proper attribution constraints ---');
  const projRef = dualEvidencePlan.evidence.practitionerEvidenceReferences.find(r => r.includes('Project: proj-1'));
  assert(Boolean(projRef), 'Practitioner project is referenced');
  assert(!projRef?.includes('Secret Client Corp'), 'Client name is NOT leaked when anonymized');
  assert(Boolean(projRef?.includes('High-volume B2B subscription portal checkout audit')), 'Anonymized description is used');

  // -------------------------------------------------------------
  // Scenario 13: Prevention of competitor evidence from leaking into practitioner references
  // -------------------------------------------------------------
  console.log('\n--- Scenario 13: Prevention of competitor evidence from leaking into practitioner references ---');
  const allPractitionerRefs = plans.flatMap(p => p.evidence.practitionerEvidenceReferences);
  const leakedCompetitor = allPractitionerRefs.some(r => r.includes('Competitor Platform') || r.includes('ev-comp-1'));
  assert(!leakedCompetitor, 'Competitor evidence never leaks into practitioner references');

  // -------------------------------------------------------------
  // Scenario 14: Accurate assignment of deliverable contract requirements to reasoning plan (AUDIT)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 14: Accurate assignment of deliverable contract requirements to reasoning plan (AUDIT) ---');
  const auditNode: OutlineNode = OutlineNodeSchema.parse({
    heading: 'Conducting a Comprehensive UX Audit',
    level: 'H2',
  });
  const auditPlan = SectionEvidencePlanner.createSectionPlanForNode(
    auditNode,
    0,
    1,
    mockEvidenceSet,
    null
  );
  assert(auditPlan.reasoning.observationRequirement.includes('UI/UX components'), 'AUDIT observation requires UI/UX components');
  assert(auditPlan.reasoning.interpretationRequirement.includes('cognitive load'), 'AUDIT interpretation requires cognitive load / heuristics');
  assert(auditPlan.reasoning.recommendationRequirement.includes('remediations'), 'AUDIT recommendation requires prioritized remediations');
  assert(auditPlan.reasoning.implementationRequirement.includes('implementation guidance'), 'AUDIT implementation requires frontend/design guidance');
  assert(auditPlan.reasoning.validationRequirement.includes('telemetry checkpoints'), 'AUDIT validation requires telemetry / re-testing');

  // -------------------------------------------------------------
  // Scenario 15: Accurate assignment of CHECKLIST deliverable requirements to reasoning plan
  // -------------------------------------------------------------
  console.log('\n--- Scenario 15: Accurate assignment of CHECKLIST deliverable requirements to reasoning plan ---');
  const checklistNode: OutlineNode = OutlineNodeSchema.parse({
    heading: 'Mobile UX Audit Verification Checklist',
    level: 'H2',
  });
  const checklistPlan = SectionEvidencePlanner.createSectionPlanForNode(
    checklistNode,
    0,
    1,
    mockEvidenceSet,
    null
  );
  assert(checklistPlan.reasoning.recommendationRequirement.includes('Verify, Ensure, Inspect, Test, Confirm'), 'CHECKLIST recommendation requires verification verbs');
  assert(checklistPlan.reasoning.validationRequirement.includes('pass/fail verification conditions'), 'CHECKLIST validation requires binary pass/fail conditions');

  // -------------------------------------------------------------
  // Scenario 16: Accurate assignment of COMPARISON deliverable requirements to reasoning plan
  // -------------------------------------------------------------
  console.log('\n--- Scenario 16: Accurate assignment of COMPARISON deliverable requirements to reasoning plan ---');
  const comparisonNode: OutlineNode = OutlineNodeSchema.parse({
    heading: 'In-House UX Reviews vs Specialist Agency Audits',
    level: 'H2',
  });
  const comparisonPlan = SectionEvidencePlanner.createSectionPlanForNode(
    comparisonNode,
    0,
    1,
    mockEvidenceSet,
    null
  );
  assert(comparisonPlan.reasoning.observationRequirement.includes('alternative architectures'), 'COMPARISON observation requires explicit alternatives');
  assert(comparisonPlan.reasoning.interpretationRequirement.includes('trade-offs across cost'), 'COMPARISON interpretation requires multi-dimensional trade-offs');
  assert(comparisonPlan.reasoning.recommendationRequirement.includes('decision framework'), 'COMPARISON recommendation requires decision framework');

  // -------------------------------------------------------------
  // Scenario 17: Non-substantive section correctly identified with isSubstantive=false, NOT_APPLICABLE status
  // -------------------------------------------------------------
  console.log('\n--- Scenario 17: Non-substantive section correctly identified ---');
  const tocNode: OutlineNode = OutlineNodeSchema.parse({
    heading: 'Table of Contents',
    level: 'H2',
  });
  const tocPlan = SectionEvidencePlanner.createSectionPlanForNode(
    tocNode,
    0,
    3,
    mockEvidenceSet,
    null
  );
  assert(tocPlan.isSubstantive === false, 'Table of Contents is identified as non-substantive');
  assert(tocPlan.evidence.evidenceAvailability === 'NOT_APPLICABLE', 'Table of Contents evidenceAvailability is NOT_APPLICABLE');

  const closingNode: OutlineNode = OutlineNodeSchema.parse({
    heading: 'Conclusion',
    level: 'H2',
  });
  const closingPlan = SectionEvidencePlanner.createSectionPlanForNode(
    closingNode,
    2,
    3,
    mockEvidenceSet,
    null
  );
  assert(closingPlan.isSubstantive === false, 'Closing Conclusion is identified as non-substantive');
  assert(closingPlan.evidence.evidenceAvailability === 'NOT_APPLICABLE', 'Closing Conclusion evidenceAvailability is NOT_APPLICABLE');

  // -------------------------------------------------------------
  // Scenario 18: Verified practitioner profile with projects creates AVAILABLE_VERIFIED plan with practitioner references
  // -------------------------------------------------------------
  console.log('\n--- Scenario 18: Verified practitioner profile creates AVAILABLE_VERIFIED plan ---');
  const practitionerNode: OutlineNode = OutlineNodeSchema.parse({
    heading: 'Heuristic Walkthroughs for Subscription Portals',
    level: 'H2',
    assignedKeywords: ['checkout', 'subscription', 'portal'],
    core_concept: 'Subscription checkout audit walkthrough',
  });
  const pPlan = SectionEvidencePlanner.createSectionPlanForNode(
    practitionerNode,
    0,
    1,
    { items: [], extractedAt: '', summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 } },
    verifiedContext
  );
  assert(pPlan.evidence.evidenceAvailability === 'AVAILABLE_VERIFIED', 'Verified practitioner evidence establishes AVAILABLE_VERIFIED');
  assert(pPlan.evidence.practitionerEvidenceReferences.length > 0, 'Plan contains practitioner evidence references');

  // -------------------------------------------------------------
  // Scenario 19: Unverified practitioner profile creates AVAILABLE_UNVERIFIED or MISSING plan, never AVAILABLE_VERIFIED for unverified claims
  // -------------------------------------------------------------
  console.log('\n--- Scenario 19: Unverified practitioner profile filtered out, yielding MISSING status ---');
  const unverifiedProfile: PractitionerKnowledgeProfile = {
    ...mockVerifiedProfile,
    identity: {
      ...mockVerifiedProfile.identity,
      verificationStatus: 'UNVERIFIED',
    },
  };
  const filteredUnverified = PractitionerKnowledgeService.filterForGenerationContext(unverifiedProfile);
  assert(filteredUnverified === null, 'PractitionerKnowledgeService returns null for unverified profile');

  const unverifiedPlan = SectionEvidencePlanner.createSectionPlanForNode(
    practitionerNode,
    0,
    1,
    { items: [], extractedAt: '', summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 } },
    filteredUnverified
  );
  assert(unverifiedPlan.evidence.evidenceAvailability === 'MISSING', 'Unverified profile yields MISSING status, never AVAILABLE_VERIFIED');

  // -------------------------------------------------------------
  // Scenario 20: Missing practitioner profile executes gracefully without error (default external/general planning)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 20: Missing practitioner profile executes gracefully ---');
  let threwError = false;
  try {
    const defaultPlans = SectionEvidencePlanner.createSectionPlans(
      outlineNodes,
      mockEvidenceSet,
      null, // No practitioner profile
      undefined,
      undefined,
      'ux audit services'
    );
    assert(defaultPlans.length === 2, 'Planning without practitioner profile succeeds with 2 plans');
  } catch (e) {
    threwError = true;
  }
  assert(!threwError, 'Missing practitioner profile does not throw');

  // -------------------------------------------------------------
  // Scenario 21: Section prompt formatting includes complete evidence plan context, buyer question, and reasoning requirements
  // -------------------------------------------------------------
  console.log('\n--- Scenario 21: Section prompt formatting includes complete evidence plan context ---');
  const promptDirectives = SectionEvidencePlanner.formatPlanDirectives(plans[0]);
  assert(promptDirectives.includes('SECTION EVIDENCE & REASONING CONTRACT'), 'Prompt directives include header');
  assert(promptDirectives.includes(plans[0].purpose.buyerQuestion), 'Prompt directives include buyer question');
  assert(promptDirectives.includes('1. Observation:'), 'Prompt directives include Observation requirement');
  assert(promptDirectives.includes('2. Interpretation:'), 'Prompt directives include Interpretation requirement');
  assert(promptDirectives.includes('3. Recommendation:'), 'Prompt directives include Recommendation requirement');
  assert(promptDirectives.includes('4. Implementation:'), 'Prompt directives include Implementation requirement');
  assert(promptDirectives.includes('5. Validation:'), 'Prompt directives include Validation requirement');
  assert(promptDirectives.includes('CLAIM CLASSIFICATION & FACTUAL INTEGRITY RULES:'), 'Prompt directives include Claim Classification rules');

  // -------------------------------------------------------------
  // Scenario 22: Missing evidence prompt formatting includes strict prohibition against synthetic anecdotes and invented metrics
  // -------------------------------------------------------------
  console.log('\n--- Scenario 22: Missing evidence prompt formatting includes strict prohibition ---');
  const missingPlan = SectionEvidencePlanner.createSectionPlanForNode(
    ungroundedNode,
    0,
    1,
    mockEvidenceSet,
    null
  );
  const missingPrompt = SectionEvidencePlanner.formatPlanDirectives(missingPlan);
  assert(missingPrompt.includes('Evidence Availability: MISSING'), 'Prompt specifies Evidence Availability: MISSING');
  assert(missingPrompt.includes('Do NOT invent synthetic case studies, fake client anecdotes, or ungrounded statistics'), 'Prompt contains explicit ban on fake case studies/statistics');
  assert(missingPrompt.includes('ZERO-FABRICATION RULE:'), 'Prompt contains ZERO-FABRICATION RULE');

  // -------------------------------------------------------------
  // Scenario 23: End-to-end orchestration run with SectionEvidencePlanner populates brief.outline[i].evidencePlan
  // -------------------------------------------------------------
  console.log('\n--- Scenario 23: End-to-end orchestration run populates brief.outline[i].evidencePlan ---');
  // Create mock AgentOrchestrator dependencies to execute orchestrator planning pipeline
  const mockLLM = {
    getModel: () => 'mock-gemini-3.5',
    generate: async () => 'Generated mock content for testing.',
    chat: async (prompt: string) => {
      if (prompt.includes('ContentBrief') || prompt.includes('outline') || prompt.includes('PLAN')) {
        return JSON.stringify({
          title: 'Professional UX Audit Services to Fix Product Friction',
          targetKeywords: ['ux audit services'],
          wordCountBudget: { min: 1500, target: 2000, max: 2500 },
          intent: { primaryKeyword: 'ux audit services', intentType: 'Commercial', contentType: 'Guide' },
          outline: [
            { heading: 'Diagnosing Critical Mobile Checkout Friction', level: 'H2', assignedKeywords: ['mobile checkout friction'], core_concept: 'Diagnosing checkout drop-off' },
            { heading: 'UX Audit Evaluation Criteria and Framework', level: 'H2', assignedKeywords: ['ux audit criteria'], core_concept: 'Evaluation heuristics' },
            { heading: 'Closing Thoughts and Next Steps', level: 'H2', assignedKeywords: [], core_concept: 'Summary' },
          ]
        });
      }
      return 'Generated mock content for testing.';
    },
    structuredGenerate: async (schema: any, prompt: string) => {
      return {
        title: 'Professional UX Audit Services to Fix Product Friction',
        targetKeywords: ['ux audit services'],
        wordCountBudget: { min: 1500, target: 2000, max: 2500 },
        intent: { primaryKeyword: 'ux audit services', intentType: 'Commercial', contentType: 'Guide' },
        outline: [
          { heading: 'Diagnosing Critical Mobile Checkout Friction', level: 'H2', assignedKeywords: ['mobile checkout friction'], core_concept: 'Diagnosing checkout drop-off' },
          { heading: 'UX Audit Evaluation Criteria and Framework', level: 'H2', assignedKeywords: ['ux audit criteria'], core_concept: 'Evaluation heuristics' },
          { heading: 'Closing Thoughts and Next Steps', level: 'H2', assignedKeywords: [], core_concept: 'Summary' },
        ]
      };
    }
  };

  const mockSearch = {
    search: async () => [{ title: 'Top UX Audits', link: 'https://example.com/ux', snippet: 'Guide to UX audits.' }]
  };

  const mockScraper = {
    scrape: async () => [{ url: 'https://example.com/ux', title: 'UX Audits', textContent: 'Alex Thorne conducts expert manual UX audits.' }]
  };

  const orchestrator = new AgentOrchestrator({
    llm: mockLLM as any,
    search: mockSearch as any,
    scraper: mockScraper as any,
    maxReviewRetries: 0,
  });

  const orchestratorResult = await orchestrator.run({
    targetKeyword: 'ux audit services',
    targetAudience: 'Product teams and eCommerce engineering leaders',
    saasProfile: {
      name: 'Alex Thorne UX',
      description: 'Independent conversion rate and usability consultant specializing in manual UX audits.',
      targetAudience: 'Product teams and eCommerce engineering leaders.',
      businessScale: 'SOLO_PRACTITIONER',
      practitionerProfile: mockVerifiedProfile,
    } as any,
  });

  assert(orchestratorResult.plan !== undefined, 'Orchestration produced a brief plan');
  const planBrief = orchestratorResult.plan!;
  assert(Array.isArray(planBrief.outline) && planBrief.outline.length >= 2, 'Brief outline contains planned nodes');
  assert(Boolean(planBrief.outline[0].evidencePlan), 'Brief outline node 0 has populated evidencePlan');
  assert(planBrief.outline[0].evidencePlan?.heading === planBrief.outline[0].heading, 'Outline node 0 evidencePlan matches heading');
  assert(Boolean(planBrief.outline[1].evidencePlan), 'Brief outline node 1 has populated evidencePlan');
  assert(Array.isArray(orchestratorResult.sectionEvidencePlans) && orchestratorResult.sectionEvidencePlans.length >= 2, 'Orchestrator returned sectionEvidencePlans array');

  // -------------------------------------------------------------
  // Scenario 24: Integration regression validation
  // -------------------------------------------------------------
  console.log('\n--- Scenario 24: Integration regression validation ---');
  assert(totalChecks >= 40, `Executed comprehensive check suite with ${totalChecks} discrete assertions`);
  assert(failures.length === 0, `Zero test failures encountered (passed: ${passedChecks}/${totalChecks})`);

  console.log(`\n==================================================`);
  console.log(`Phase 6D.2 Suite Results: ${passedChecks}/${totalChecks} PASSED`);
  if (failures.length > 0) {
    console.error(`FAILURES:`);
    failures.forEach(f => console.error(`- ${f}`));
    process.exit(1);
  } else {
    console.log(`ALL 24 SCENARIOS PASSED CONVINCINGLY WITH ZERO FAILURES.`);
    console.log(`==================================================\n`);
  }
}

runSuite().catch(err => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
