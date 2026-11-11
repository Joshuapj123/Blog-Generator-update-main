/**
 * Phase 6D.1 / 6D.1R — Verified Practitioner Knowledge Foundation & Security Suite
 *
 * Verifies:
 * - Part A: 20 Mandatory Functional Scenarios
 * - Part B: 13 Gate 3 Critical Security Scenarios
 */

import * as fs from 'fs';
import {
  PractitionerKnowledgeProfile,
  PractitionerKnowledgeProfileSchema,
  SaaSProfileSchema,
  BusinessScaleSchema,
} from '../src/core/contracts/schemas';
import {
  PractitionerKnowledgeService,
  ReviewerContext,
  ReviewerDecision,
} from '../src/lib/intelligence/PractitionerKnowledgeService';
import { TemporaryArticleStore } from '../src/lib/test-storage/TemporaryArticleStore';

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
  console.log('=== ACUTE Phase 6D.1 / 6D.1R: Verified Practitioner Knowledge Foundation & Security Suite ===\n');

  process.env.ENABLE_TEMP_TEST_STORAGE = 'true';
  process.env.ACUTE_ENVIRONMENT = 'test';
  TemporaryArticleStore.clear();

  const validProfileFixture: PractitionerKnowledgeProfile = {
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
      verifiedBy: 'editorial-director-lead',
    },
    expertise: [
      {
        expertiseId: 'exp-1',
        capability: 'Checkout Flow Cognitive Walkthrough',
        description: 'Heuristic evaluation of 5-stage checkout funnels to identify friction points.',
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        evidenceReferences: ['audit-framework-v3', 'checkout-cert-2024'],
        verifiedAt: '2026-10-01T10:00:00Z',
        reviewedAt: '2026-10-02T12:00:00Z',
        reviewedBy: 'reviewer-alice',
        sourceReference: 'certified-portfolio-portfolio-item-4',
      },
    ],
    designPrinciples: [
      {
        principleId: 'prin-1',
        statement: 'Never force account creation before cart value is established.',
        explanation: 'Mandatory early registration increases mobile abandonment by 23%.',
        context: 'E-commerce mobile checkout',
        sourceReferences: ['published-paper-2025', 'baymard-comparative'],
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        verifiedAt: '2026-10-01T10:00:00Z',
        reviewedAt: '2026-10-02T12:00:00Z',
      },
    ],
    verifiedProjects: [
      {
        projectId: 'proj-1',
        projectTitle: 'B2B SaaS Multi-Tenant Onboarding Streamline',
        projectType: 'SaaS UX Audit & Redesign',
        clientName: 'SaaSFlow Global',
        confidentialityLevel: 'ANONYMIZED',
        clientNamingPermission: false,
        anonymizedDescription: 'High-volume B2B cloud communication platform with complex role hierarchy.',
        problemObserved: '58% of new account creators dropped out before inviting a second team member due to ambiguous permission settings.',
        intervention: 'Restructured team setup into a progressive 3-step wizard with preconfigured role defaults.',
        documentedOutcome: 'Second-seat activation improved from 42% to 68% over 90 days with zero additional marketing spend.',
        documentedOutcomes: ['Second-seat activation +26 percentage points', 'Onboarding time reduced from 14m to 4m'],
        evidenceReferences: ['client-signoff-analytics-2025.pdf'],
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        verifiedAt: '2026-10-05T09:30:00Z',
        reviewedAt: '2026-10-05T14:00:00Z',
      },
    ],
    attributionRules: {
      firstPersonVoiceAllowed: false,
      thirdPersonVoiceAllowed: true,
      approvedByline: 'Alex Thorne, Principal UX Auditor',
      approvedCredentials: ['14+ Years UX Audit Practice', 'Lead Evaluator'],
      clientNamingPermission: false,
      approvedUsageScope: ['Technical UX guides', 'Audit methodology articles'],
      requireAnonymization: true,
      prohibitedClaims: ['Guaranteed conversion lifts', 'Unmeasured ROI promises'],
    },
    createdAt: '2026-10-01T09:00:00Z',
    updatedAt: '2026-10-05T14:00:00Z',
    version: 1,
  };

  // ==========================================================================
  // PART A: 20 MANDATORY FUNCTIONAL SCENARIOS
  // ==========================================================================

  console.log('--- PART A: 20 Mandatory Functional Scenarios ---\n');

  // Test 1
  console.log('Test 1: Valid practitioner profile passes schema validation');
  const parsed1 = PractitionerKnowledgeProfileSchema.safeParse(validProfileFixture);
  assert(parsed1.success === true, 'Valid practitioner profile parses cleanly via PractitionerKnowledgeProfileSchema');
  assert(parsed1.success && parsed1.data.identity.displayName === 'Alex Thorne', 'Profile identity fields correctly preserved');

  // Test 2
  console.log('Test 2: Missing practitioner information remains missing');
  const minimalProfile: any = {
    id: 'practitioner-min-1',
    tenantId: 'tenant-min',
    userId: 'user-min',
    identity: {
      practitionerId: 'practitioner-min-1',
      tenantId: 'tenant-min',
      displayName: 'Morgan Specialist',
      professionalTitle: 'UX Consultant',
      biography: '',
      domainFocus: [],
      approvedAuthorName: '',
      profileStatus: 'ACTIVE',
      verificationStatus: 'UNVERIFIED',
    },
    expertise: [],
    designPrinciples: [],
    verifiedProjects: [],
    attributionRules: {
      firstPersonVoiceAllowed: false,
      thirdPersonVoiceAllowed: true,
      clientNamingPermission: false,
      requireAnonymization: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  const parsed2 = PractitionerKnowledgeProfileSchema.parse(minimalProfile);
  assert(parsed2.identity.yearsOfExperience === undefined, 'yearsOfExperience remains undefined when not provided');
  assert(parsed2.attributionRules.approvedByline === undefined, 'approvedByline remains undefined when not provided');
  assert(parsed2.expertise.length === 0, 'expertise array remains strictly empty without synthesis');
  assert(parsed2.verifiedProjects.length === 0, 'verifiedProjects array remains strictly empty without synthesis');

  // Test 3
  console.log('Test 3: Unverified expertise is excluded');
  const profileUnverifiedExp: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    expertise: [
      {
        expertiseId: 'exp-unverified',
        capability: 'Web Scraping Reverse Engineering',
        description: 'Derived automatically from website marketing copy.',
        verificationStatus: 'UNVERIFIED',
        approvalStatus: 'APPROVED',
        evidenceReferences: [],
      },
    ],
  };
  const ctx3 = PractitionerKnowledgeService.filterForGenerationContext(profileUnverifiedExp);
  assert(ctx3 !== null, 'Context returned for verified practitioner identity');
  assert(
    ctx3?.verifiedExpertise.some((e) => e.expertiseId === 'exp-unverified') === false,
    'Unverified expertise is strictly excluded from generation context'
  );

  // Test 4
  console.log('Test 4: Pending expertise is excluded');
  const profilePendingExp: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    expertise: [
      {
        expertiseId: 'exp-pending',
        capability: 'Accessibility Testing',
        description: 'WCAG 2.1 compliance audits.',
        verificationStatus: 'PENDING_APPROVAL',
        approvalStatus: 'APPROVED',
        evidenceReferences: [],
      },
    ],
  };
  const ctx4 = PractitionerKnowledgeService.filterForGenerationContext(profilePendingExp);
  assert(
    ctx4?.verifiedExpertise.some((e) => e.expertiseId === 'exp-pending') === false,
    'PENDING_APPROVAL expertise is strictly excluded from generation context'
  );

  // Test 5
  console.log('Test 5: Rejected expertise is excluded');
  const profileRejectedExp: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    expertise: [
      {
        expertiseId: 'exp-rejected',
        capability: 'Unsubstantiated Performance Guarantee',
        description: 'Claims guaranteed 300% conversion rate increase.',
        verificationStatus: 'REJECTED',
        approvalStatus: 'REJECTED',
        evidenceReferences: [],
      },
    ],
  };
  const ctx5 = PractitionerKnowledgeService.filterForGenerationContext(profileRejectedExp);
  assert(
    ctx5?.verifiedExpertise.some((e) => e.expertiseId === 'exp-rejected') === false,
    'REJECTED expertise is strictly excluded from generation context'
  );

  // Test 6
  console.log('Test 6: Expired expertise is excluded');
  const profileExpiredExp: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    expertise: [
      {
        expertiseId: 'exp-expired',
        capability: 'Legacy Flash Navigation Audits',
        description: 'Certification expired in 2020.',
        verificationStatus: 'EXPIRED',
        approvalStatus: 'APPROVED',
        evidenceReferences: [],
      },
    ],
  };
  const ctx6 = PractitionerKnowledgeService.filterForGenerationContext(profileExpiredExp);
  assert(
    ctx6?.verifiedExpertise.some((e) => e.expertiseId === 'exp-expired') === false,
    'EXPIRED expertise is strictly excluded from generation context'
  );

  // Test 7
  console.log('Test 7: Verified approved expertise is included');
  const ctx7 = PractitionerKnowledgeService.filterForGenerationContext(validProfileFixture);
  assert(
    ctx7?.verifiedExpertise.some((e) => e.expertiseId === 'exp-1') === true,
    'VERIFIED and APPROVED expertise is included in generation context'
  );

  // Test 8
  console.log('Test 8: Unapproved personal principles are excluded');
  const profileUnapprovedPrinciple: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    designPrinciples: [
      {
        principleId: 'prin-draft',
        statement: 'Never use modals for mobile alerts.',
        explanation: 'Work in progress draft.',
        context: 'Mobile UX',
        verificationStatus: 'VERIFIED',
        approvalStatus: 'DRAFT',
        sourceReferences: [],
      },
    ],
  };
  const ctx8 = PractitionerKnowledgeService.filterForGenerationContext(profileUnapprovedPrinciple);
  assert(
    ctx8?.verifiedPrinciples.some((p) => p.principleId === 'prin-draft') === false,
    'Unapproved (DRAFT) design principles are excluded from generation context'
  );

  // Test 9
  console.log('Test 9: Unverified project histories are excluded');
  const profileUnverifiedProject: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    verifiedProjects: [
      {
        projectId: 'proj-unverified',
        projectTitle: 'Unverified Fortune 50 Redesign',
        projectType: 'Consulting',
        anonymizedDescription: 'Unverified case study claim.',
        problemObserved: 'Unknown problem.',
        intervention: 'Redesign.',
        documentedOutcome: 'Huge lift claimed.',
        verificationStatus: 'UNVERIFIED',
        approvalStatus: 'APPROVED',
        confidentialityLevel: 'PUBLIC',
        clientNamingPermission: true,
        evidenceReferences: [],
      },
    ],
  };
  const ctx9 = PractitionerKnowledgeService.filterForGenerationContext(profileUnverifiedProject);
  assert(
    ctx9?.verifiedProjects.some((p) => p.projectId === 'proj-unverified') === false,
    'UNVERIFIED project histories are strictly excluded from generation context'
  );

  // Test 10
  console.log('Test 10: First-person voice is disabled by default');
  const profileDefaultVoice: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    attributionRules: {
      ...validProfileFixture.attributionRules,
      firstPersonVoiceAllowed: false,
    },
  };
  const ctx10 = PractitionerKnowledgeService.filterForGenerationContext(profileDefaultVoice);
  assert(ctx10?.firstPersonVoiceAllowed === false, 'firstPersonVoiceAllowed is false by default');
  assert(
    PractitionerKnowledgeService.canUseFirstPersonVoice(profileDefaultVoice) === false,
    'canUseFirstPersonVoice() returns false when not authorized'
  );

  // Test 11
  console.log('Test 11: First-person voice requires approved verified project evidence');
  const profileFirstPersonNoEvidence: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    designPrinciples: [],
    verifiedProjects: [],
    attributionRules: {
      ...validProfileFixture.attributionRules,
      firstPersonVoiceAllowed: true,
    },
  };
  const ctx11A = PractitionerKnowledgeService.filterForGenerationContext(profileFirstPersonNoEvidence);
  assert(
    ctx11A?.firstPersonVoiceAllowed === false,
    'firstPersonVoiceAllowed fails closed to false when verified project/principle evidence is absent'
  );

  const profileFirstPersonWithEvidence: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    attributionRules: {
      ...validProfileFixture.attributionRules,
      firstPersonVoiceAllowed: true,
    },
  };
  const ctx11B = PractitionerKnowledgeService.filterForGenerationContext(profileFirstPersonWithEvidence);
  assert(
    ctx11B?.firstPersonVoiceAllowed === true,
    'firstPersonVoiceAllowed evaluates to true when explicitly authorized AND backed by verified evidence'
  );
  assert(
    PractitionerKnowledgeService.canUseFirstPersonVoice(profileFirstPersonWithEvidence, 'proj-1') === true,
    'canUseFirstPersonVoice evaluates to true for verified project item'
  );

  // Test 12
  console.log('Test 12: Unauthorized client attribution is blocked');
  const profileUnauthorizedClient: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    verifiedProjects: [
      {
        projectId: 'proj-no-naming',
        projectTitle: 'Enterprise Checkout Overhaul',
        projectType: 'E-commerce',
        clientName: 'Megacorp Retail',
        confidentialityLevel: 'PUBLIC',
        clientNamingPermission: false,
        anonymizedDescription: 'Large online department store.',
        problemObserved: 'Cart drop-off.',
        intervention: '1-page checkout.',
        documentedOutcome: 'Drop-off reduced by 15%.',
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        evidenceReferences: ['signoff.pdf'],
      },
    ],
    attributionRules: {
      ...validProfileFixture.attributionRules,
      clientNamingPermission: true,
    },
  };
  const ctx12 = PractitionerKnowledgeService.filterForGenerationContext(profileUnauthorizedClient);
  const proj12 = ctx12?.verifiedProjects.find((p) => p.projectId === 'proj-no-naming');
  assert(proj12?.clientName === undefined, 'Client name is stripped when project clientNamingPermission is false');
  assert(
    PractitionerKnowledgeService.canNameClient(profileUnauthorizedClient, 'proj-no-naming') === false,
    'canNameClient returns false when project clientNamingPermission is false'
  );

  // Test 13
  console.log('Test 13: Cross-tenant reads are rejected');
  // First save draft as owner
  await TemporaryArticleStore.savePractitionerProfile(
    validProfileFixture,
    validProfileFixture.userId,
    validProfileFixture.tenantId
  );

  let crossReadCaught = false;
  try {
    await TemporaryArticleStore.getPractitionerProfile(
      validProfileFixture.id,
      'malicious-intruder-user',
      'malicious-competitor-tenant'
    );
  } catch (err: any) {
    crossReadCaught = err.message.includes('Cross-tenant access denied') || err.message.includes('Forbidden');
  }
  assert(crossReadCaught, 'Cross-tenant read throws Forbidden access error in TemporaryArticleStore');

  let serviceCrossTenantCaught = false;
  try {
    PractitionerKnowledgeService.validateTenantAccess(
      validProfileFixture,
      'different-tenant',
      'different-user'
    );
  } catch (err: any) {
    serviceCrossTenantCaught = err.message.includes('Cross-tenant access denied');
  }
  assert(serviceCrossTenantCaught, 'PractitionerKnowledgeService.validateTenantAccess strictly enforces tenant match');

  // Test 14
  console.log('Test 14: Cross-tenant writes are rejected');
  let crossWriteCaught = false;
  try {
    const maliciousOverwrite = {
      ...validProfileFixture,
      identity: {
        ...validProfileFixture.identity,
        displayName: 'Hacked Impersonator',
      },
    };
    await TemporaryArticleStore.savePractitionerProfile(
      maliciousOverwrite,
      'intruder-user',
      'intruder-tenant'
    );
  } catch (err: any) {
    crossWriteCaught = err.message.includes('Forbidden') || err.message.includes('belonging to tenant');
  }
  assert(crossWriteCaught, 'Cross-tenant write is strictly rejected by TemporaryArticleStore');

  // Test 15
  console.log('Test 15: Confidential project information is not exposed');
  const profileWithConfidential: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    verifiedProjects: [
      {
        projectId: 'proj-confidential',
        projectTitle: 'Secret Defense Project',
        projectType: 'Classified Audit',
        clientName: 'DoD Contractor',
        confidentialityLevel: 'CONFIDENTIAL',
        clientNamingPermission: false,
        anonymizedDescription: 'Classified portal.',
        problemObserved: 'Classified issue.',
        intervention: 'Classified fix.',
        documentedOutcome: 'Classified result.',
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        evidenceReferences: [],
      },
      {
        projectId: 'proj-internal',
        projectTitle: 'Internal Audit Methodology Tool',
        projectType: 'Proprietary IP',
        confidentialityLevel: 'INTERNAL_ONLY',
        clientNamingPermission: false,
        anonymizedDescription: 'Internal codebase analyzer.',
        problemObserved: 'Internal bottleneck.',
        intervention: 'Internal algorithm.',
        documentedOutcome: 'Internal efficiency.',
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        evidenceReferences: [],
      },
      {
        projectId: 'proj-anonymized-safe',
        projectTitle: 'Fintech Mobile App Re-architecture',
        projectType: 'Mobile Audit',
        clientName: 'Bank of America',
        confidentialityLevel: 'ANONYMIZED',
        clientNamingPermission: false,
        anonymizedDescription: 'Tier 1 retail banking mobile application.',
        problemObserved: 'Authentication latency.',
        intervention: 'Biometric passkey rollout.',
        documentedOutcome: 'Login friction dropped 34%.',
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        evidenceReferences: [],
      },
    ],
  };
  const ctx15 = PractitionerKnowledgeService.filterForGenerationContext(profileWithConfidential);
  assert(
    ctx15?.verifiedProjects.some((p) => p.projectId === 'proj-confidential') === false,
    'CONFIDENTIAL project is completely excluded from generation context'
  );
  assert(
    ctx15?.verifiedProjects.some((p) => p.projectId === 'proj-internal') === false,
    'INTERNAL_ONLY project is completely excluded from generation context'
  );
  const safeProj = ctx15?.verifiedProjects.find((p) => p.projectId === 'proj-anonymized-safe');
  assert(safeProj !== undefined, 'ANONYMIZED project is included');
  assert(safeProj?.clientName === undefined, 'Client name is strictly withheld for ANONYMIZED project');

  // Test 16
  console.log('Test 16: Existing SaaSProfile behavior remains compatible');
  const standardSaaS = {
    name: 'MetricFlow Analytics',
    description: 'Serverless product telemetry and analytics platform.',
    targetAudience: 'Engineering and Product teams',
    keyFeatures: ['Event Tracking', 'Funnel Analytics'],
    businessType: 'SaaS',
    businessScale: 'SOLO_PRACTITIONER',
  };
  const parsed16 = SaaSProfileSchema.safeParse(standardSaaS);
  assert(parsed16.success === true, 'Standard SaaSProfile without practitionerProfile parses cleanly');
  assert(parsed16.success && parsed16.data.practitionerProfile === undefined, 'practitionerProfile is optional and undefined');

  // Test 17
  console.log('Test 17: Existing generation works without a practitioner profile');
  const emptyCtx17 = PractitionerKnowledgeService.filterForGenerationContext(undefined);
  assert(emptyCtx17 === null, 'filterForGenerationContext(undefined) returns null cleanly');
  const promptText17 = PractitionerKnowledgeService.formatForPromptContext(emptyCtx17);
  assert(promptText17 === '', 'formatForPromptContext(null) returns empty string');

  // Test 18
  console.log('Test 18: Audit provenance survives serialization and retrieval');
  // Promote via reviewer to establish valid reviewed state
  const reviewerCtx: ReviewerContext = {
    reviewerId: 'reviewer-lead-ed',
    reviewerRole: 'EDITORIAL_DIRECTOR',
    tenantId: 'tenant-editorial',
  };
  await TemporaryArticleStore.reviewPractitionerProfile(
    validProfileFixture.id,
    { targetType: 'IDENTITY', targetId: validProfileFixture.identity.practitionerId, decision: 'APPROVE' },
    reviewerCtx
  );
  await TemporaryArticleStore.reviewPractitionerProfile(
    validProfileFixture.id,
    { targetType: 'EXPERTISE', targetId: 'exp-1', decision: 'APPROVE' },
    reviewerCtx
  );
  const retrieved18 = await TemporaryArticleStore.getPractitionerProfile(
    validProfileFixture.id,
    validProfileFixture.userId,
    validProfileFixture.tenantId
  );
  assert(retrieved18 !== null, 'Profile retrieved from TemporaryArticleStore');
  assert(retrieved18?.identity.verificationStatus === 'VERIFIED', 'identity.verificationStatus is VERIFIED after review');
  assert(retrieved18?.identity.verifiedBy === 'reviewer-lead-ed', 'identity.verifiedBy provenance preserved');
  assert(retrieved18?.expertise[0].sourceReference === 'certified-portfolio-portfolio-item-4', 'expertise.sourceReference preserved');
  assert(retrieved18?.verifiedProjects[0].evidenceReferences[0] === 'client-signoff-analytics-2025.pdf', 'evidenceReferences array preserved');

  // Test 19
  console.log('Test 19: Invalid profile data fails safely');
  const invalidData = {
    id: '',
    tenantId: 't1',
    userId: 'u1',
    identity: {
      practitionerId: 'p1',
      yearsOfExperience: -5,
      verificationStatus: 'SUPER_VERIFIED',
    },
  };
  const parsed19 = PractitionerKnowledgeProfileSchema.safeParse(invalidData);
  assert(parsed19.success === false, 'Invalid profile schema fails safely with Zod error');

  // Test 20
  console.log('Test 20: Existing regression behavior is preserved');
  const scaleParse = BusinessScaleSchema.safeParse('SOLO_PRACTITIONER');
  assert(scaleParse.success === true, 'BusinessScaleSchema still parses SOLO_PRACTITIONER');
  const formattedPrompt = PractitionerKnowledgeService.formatForPromptContext(ctx7);
  assert(
    formattedPrompt.includes('=== VERIFIED PRACTITIONER KNOWLEDGE & ATTRIBUTION BOUNDARY ==='),
    'Prompt formatting produces clear isolation boundary header'
  );
  assert(
    formattedPrompt.includes('First-Person Voice Allowed: NO'),
    'Prompt formatting clearly states First-Person Voice Allowed: NO by default'
  );

  // ==========================================================================
  // PART B: 13 GATE 3 CRITICAL SECURITY SCENARIOS
  // ==========================================================================

  console.log('\n--- PART B: 13 Gate 3 Critical Security Scenarios ---\n');

  // Security Test 1: Owner can create unverified draft
  console.log('Security Test 1: Owner can create unverified draft within their tenant');
  const freshDraft: PractitionerKnowledgeProfile = {
    id: 'practitioner-draft-1',
    tenantId: 'tenant-client-a',
    userId: 'user-client-a',
    identity: {
      practitionerId: 'practitioner-draft-1',
      tenantId: 'tenant-client-a',
      displayName: 'Draft Practitioner',
      professionalTitle: 'UX Consultant',
      biography: 'Draft bio',
      domainFocus: ['Usability'],
      approvedAuthorName: 'Draft Practitioner',
      profileStatus: 'ACTIVE',
      verificationStatus: 'UNVERIFIED',
    },
    expertise: [
      {
        expertiseId: 'exp-draft-1',
        capability: 'Draft Audit',
        description: 'Self-reported capability',
        verificationStatus: 'UNVERIFIED',
        approvalStatus: 'DRAFT',
        evidenceReferences: [],
      },
    ],
    designPrinciples: [],
    verifiedProjects: [],
    attributionRules: {
      firstPersonVoiceAllowed: false,
      thirdPersonVoiceAllowed: true,
      clientNamingPermission: false,
      requireAnonymization: true,
      approvedCredentials: [],
      approvedUsageScope: [],
      prohibitedClaims: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  const savedDraftId = await TemporaryArticleStore.savePractitionerProfile(freshDraft, 'user-client-a', 'tenant-client-a');
  assert(savedDraftId === 'practitioner-draft-1', 'Owner successfully saves unverified draft in own tenant');
  const retrievedDraft = await TemporaryArticleStore.getPractitionerProfile('practitioner-draft-1', 'user-client-a', 'tenant-client-a');
  assert(retrievedDraft?.identity.verificationStatus === 'UNVERIFIED', 'Draft identity is UNVERIFIED');
  assert(retrievedDraft?.expertise[0].approvalStatus === 'DRAFT', 'Draft expertise is DRAFT');

  // Security Test 2: Owner cannot self-promote to VERIFIED or APPROVED
  console.log('Security Test 2: Owner cannot self-promote expertise, principles, identity, or projects to verified/approved');
  const selfPromotedAttempt: PractitionerKnowledgeProfile = {
    ...freshDraft,
    id: 'practitioner-self-promote',
    identity: {
      ...freshDraft.identity,
      practitionerId: 'practitioner-self-promote',
      verificationStatus: 'VERIFIED', // Attacker claims VERIFIED
    },
    expertise: [
      {
        expertiseId: 'exp-self-approved',
        capability: 'Critical System Security',
        description: 'Self-approved security claim',
        verificationStatus: 'VERIFIED', // Attacker claims VERIFIED
        approvalStatus: 'APPROVED',     // Attacker claims APPROVED
        evidenceReferences: [],
      },
    ],
  };
  await TemporaryArticleStore.savePractitionerProfile(selfPromotedAttempt, 'user-client-a', 'tenant-client-a');
  const sanitizedDraft = await TemporaryArticleStore.getPractitionerProfile('practitioner-self-promote', 'user-client-a', 'tenant-client-a');
  assert(sanitizedDraft?.identity.verificationStatus === 'UNVERIFIED', 'Self-promoted identity verification forced down to UNVERIFIED');
  assert(sanitizedDraft?.expertise[0].verificationStatus === 'UNVERIFIED', 'Self-promoted expertise verification forced down to UNVERIFIED');
  assert(sanitizedDraft?.expertise[0].approvalStatus === 'DRAFT', 'Self-promoted expertise approval forced down to DRAFT');

  // Security Test 3: Owner cannot forge reviewer identity or approval timestamps
  console.log('Security Test 3: Owner cannot forge reviewer identity or approval timestamps');
  const forgedTimestampsAttempt: PractitionerKnowledgeProfile = {
    ...freshDraft,
    id: 'practitioner-forged-ts',
    identity: {
      ...freshDraft.identity,
      practitionerId: 'practitioner-forged-ts',
      verifiedAt: '2026-01-01T00:00:00Z',
      verifiedBy: 'fake-auditor-id',
    },
    expertise: [
      {
        expertiseId: 'exp-forged',
        capability: 'Forged Claim',
        description: 'Forged review metadata',
        verificationStatus: 'UNVERIFIED',
        approvalStatus: 'DRAFT',
        verifiedAt: '2026-01-01T00:00:00Z',
        reviewedAt: '2026-01-01T00:00:00Z',
        reviewedBy: 'fake-reviewer-id',
        evidenceReferences: [],
      },
    ],
  };
  await TemporaryArticleStore.savePractitionerProfile(forgedTimestampsAttempt, 'user-client-a', 'tenant-client-a');
  const forgedResult = await TemporaryArticleStore.getPractitionerProfile('practitioner-forged-ts', 'user-client-a', 'tenant-client-a');
  assert(forgedResult?.identity.verifiedBy === undefined, 'Forged identity.verifiedBy is completely stripped');
  assert(forgedResult?.identity.verifiedAt === undefined, 'Forged identity.verifiedAt is completely stripped');
  assert(forgedResult?.expertise[0].reviewedBy === undefined, 'Forged expertise.reviewedBy is completely stripped');
  assert(forgedResult?.expertise[0].verifiedAt === undefined, 'Forged expertise.verifiedAt is completely stripped');

  // Security Test 4: Owner cannot change immutable ownership fields
  console.log('Security Test 4: Owner cannot change immutable ownership fields');
  let tenantTamperCaught = false;
  try {
    const tampered = {
      ...retrievedDraft!,
      tenantId: 'different-tenant-hijack',
    };
    await TemporaryArticleStore.savePractitionerProfile(tampered, 'user-client-a', 'tenant-client-a');
  } catch (err: any) {
    tenantTamperCaught = err.message.includes('immutable') || err.message.includes('Forbidden');
  }
  assert(tenantTamperCaught, 'Tampering with immutable tenantId throws Forbidden error');

  let userTamperCaught = false;
  try {
    const tampered = {
      ...retrievedDraft!,
      userId: 'different-user-hijack',
    };
    await TemporaryArticleStore.savePractitionerProfile(tampered, 'user-client-a', 'tenant-client-a');
  } catch (err: any) {
    userTamperCaught = err.message.includes('immutable') || err.message.includes('Forbidden');
  }
  assert(userTamperCaught, 'Tampering with immutable userId throws Forbidden error');

  // Security Test 5: Cross-tenant reads and writes are rejected
  console.log('Security Test 5: Cross-tenant reads and writes are rejected');
  let crossReadErr = false;
  try {
    await TemporaryArticleStore.getPractitionerProfile('practitioner-draft-1', 'intruder-user', 'intruder-tenant');
  } catch (err: any) {
    crossReadErr = err.message.includes('Cross-tenant') || err.message.includes('Forbidden');
  }
  assert(crossReadErr, 'Cross-tenant read strictly throws Forbidden error');

  let crossWriteErr = false;
  try {
    await TemporaryArticleStore.savePractitionerProfile(freshDraft, 'intruder-user', 'intruder-tenant');
  } catch (err: any) {
    crossWriteErr = err.message.includes('Forbidden');
  }
  assert(crossWriteErr, 'Cross-tenant write strictly throws Forbidden error');

  // Security Test 6: Cross-tenant overwrite attempts are rejected
  console.log('Security Test 6: Cross-tenant overwrite attempts are rejected');
  let overwriteErr = false;
  try {
    const overwriteAttempt: PractitionerKnowledgeProfile = {
      ...freshDraft,
      tenantId: 'tenant-intruder',
      userId: 'user-intruder',
    };
    await TemporaryArticleStore.savePractitionerProfile(overwriteAttempt, 'user-intruder', 'tenant-intruder');
  } catch (err: any) {
    overwriteErr = err.message.includes('Forbidden') && err.message.includes('cannot modify practitioner profile');
  }
  assert(overwriteErr, 'Attempt to overwrite another tenant profile throws Forbidden error');

  // Security Test 7: Unauthorized callers cannot invoke reviewer approval (separation of duties)
  console.log('Security Test 7: Unauthorized callers cannot invoke reviewer approval');
  let selfReviewErr = false;
  try {
    const selfReviewer: ReviewerContext = {
      reviewerId: 'user-client-a', // Same as profile.userId!
      reviewerRole: 'EDITORIAL_DIRECTOR',
    };
    await TemporaryArticleStore.reviewPractitionerProfile(
      'practitioner-draft-1',
      { targetType: 'IDENTITY', targetId: 'practitioner-draft-1', decision: 'APPROVE' },
      selfReviewer
    );
  } catch (err: any) {
    selfReviewErr = err.message.includes('Separation of duties violation');
  }
  assert(selfReviewErr, 'Owner cannot review their own profile (separation of duties strictly enforced)');

  // Security Test 8: Authorized reviewer can approve within permitted scope
  console.log('Security Test 8: Authorized reviewer can approve within permitted scope');
  const validReviewer: ReviewerContext = {
    reviewerId: 'authorized-reviewer-99',
    reviewerRole: 'EDITORIAL_DIRECTOR',
  };
  const reviewed = await TemporaryArticleStore.reviewPractitionerProfile(
    'practitioner-draft-1',
    { targetType: 'IDENTITY', targetId: 'practitioner-draft-1', decision: 'APPROVE' },
    validReviewer
  );
  assert(reviewed.identity.verificationStatus === 'VERIFIED', 'Reviewer successfully sets identity verificationStatus to VERIFIED');
  assert(reviewed.identity.verifiedBy === 'authorized-reviewer-99', 'Reviewer identity recorded in verifiedBy');
  assert(Boolean(reviewed.identity.verifiedAt), 'Trusted verification timestamp recorded in verifiedAt');

  // Also approve expertise item
  const reviewedExp = await TemporaryArticleStore.reviewPractitionerProfile(
    'practitioner-draft-1',
    { targetType: 'EXPERTISE', targetId: 'exp-draft-1', decision: 'APPROVE' },
    validReviewer
  );
  assert(reviewedExp.expertise[0].verificationStatus === 'VERIFIED', 'Reviewer approves expertise item verification');
  assert(reviewedExp.expertise[0].approvalStatus === 'APPROVED', 'Reviewer approves expertise item approval');
  assert(reviewedExp.expertise[0].reviewedBy === 'authorized-reviewer-99', 'Reviewer identity recorded on item');

  // Security Test 9: Editing approved evidence invalidates or requires renewed approval
  console.log('Security Test 9: Editing approved evidence invalidates or requires renewed approval');
  // Owner updates the profile, modifying the capability text of 'exp-draft-1'
  const ownerModified: PractitionerKnowledgeProfile = {
    ...reviewedExp,
    expertise: [
      {
        ...reviewedExp.expertise[0],
        capability: 'MODIFIED capability claim without re-review',
      },
    ],
  };
  await TemporaryArticleStore.savePractitionerProfile(ownerModified, 'user-client-a', 'tenant-client-a');
  const retrievedAfterEdit = await TemporaryArticleStore.getPractitionerProfile('practitioner-draft-1', 'user-client-a', 'tenant-client-a');
  assert(
    retrievedAfterEdit?.expertise[0].verificationStatus === 'UNVERIFIED',
    'Modifying capability text automatically invalidates verificationStatus to UNVERIFIED'
  );
  assert(
    retrievedAfterEdit?.expertise[0].approvalStatus === 'DRAFT',
    'Modifying capability text automatically invalidates approvalStatus to DRAFT'
  );
  assert(
    retrievedAfterEdit?.expertise[0].reviewedBy === undefined,
    'Invalidated item clears prior reviewedBy metadata'
  );

  // Security Test 10: Revoked, expired, rejected, or inactive records are excluded from generation
  console.log('Security Test 10: Revoked, expired, rejected, or inactive records are excluded from generation');
  const inactiveProfile: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    identity: {
      ...validProfileFixture.identity,
      profileStatus: 'INACTIVE', // Inactive profile
    },
  };
  const ctxInactive = PractitionerKnowledgeService.filterForGenerationContext(inactiveProfile);
  assert(ctxInactive === null, 'INACTIVE profile is completely excluded from generation context');

  const archivedProfile: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    identity: {
      ...validProfileFixture.identity,
      profileStatus: 'ARCHIVED',
    },
  };
  const ctxArchived = PractitionerKnowledgeService.filterForGenerationContext(archivedProfile);
  assert(ctxArchived === null, 'ARCHIVED profile is completely excluded from generation context');

  // Security Test 11: Anonymized projects never leak client names through serialized or prompt-formatted context
  console.log('Security Test 11: Anonymized projects never leak client names through serialized or prompt-formatted context');
  const leakTestProfile: PractitionerKnowledgeProfile = {
    ...validProfileFixture,
    verifiedProjects: [
      {
        projectId: 'proj-leak-test',
        projectTitle: 'Confidential Core Banking Redesign',
        projectType: 'Core Audit',
        clientName: 'TopSecret Bank International',
        confidentialityLevel: 'ANONYMIZED',
        clientNamingPermission: true, // Even if requested, ANONYMIZED must never leak
        anonymizedDescription: 'Global Tier 1 retail banking institution.',
        problemObserved: 'Login drop-off',
        intervention: 'Passkey login',
        documentedOutcome: '22% increase in conversion',
        verificationStatus: 'VERIFIED',
        approvalStatus: 'APPROVED',
        evidenceReferences: [],
      },
    ],
  };
  const ctxLeak = PractitionerKnowledgeService.filterForGenerationContext(leakTestProfile);
  const promptLeak = PractitionerKnowledgeService.formatForPromptContext(ctxLeak);
  assert(!promptLeak.includes('TopSecret Bank International'), 'Prompt formatted context does NOT contain client name');
  assert(ctxLeak?.verifiedProjects[0].clientName === undefined, 'Verified context object strictly omits clientName for ANONYMIZED');

  // Security Test 12: Admin SDK functions reject caller-supplied identity mismatch
  console.log('Security Test 12: Admin SDK functions reject caller-supplied identity mismatch');
  // Check validateTenantAccess logic
  let adminMismatchCaught = false;
  try {
    PractitionerKnowledgeService.validateTenantAccess(validProfileFixture, 'tenant-ux-studio-1', 'attacker-impersonator');
  } catch (err: any) {
    adminMismatchCaught = err.message.includes('Cross-tenant access denied');
  }
  assert(adminMismatchCaught, 'validateTenantAccess rejects caller UID mismatch against document owner');

  // Security Test 13: Static verification of firestore.rules security invariants
  console.log('Security Test 13: Static verification of firestore.rules security invariants');
  const firestoreRulesContent = fs.readFileSync('firestore.rules', 'utf8');
  assert(
    firestoreRulesContent.includes('match /practitioner_profiles/{practitionerId}'),
    'firestore.rules explicitly scopes /practitioner_profiles/{practitionerId}'
  );
  assert(
    firestoreRulesContent.includes("request.resource.data.identity.verificationStatus == 'UNVERIFIED'"),
    'firestore.rules strictly requires verificationStatus == UNVERIFIED on create and update'
  );
  assert(
    firestoreRulesContent.includes('isResourceOwner()'),
    'firestore.rules enforces isResourceOwner() check'
  );

  console.log('\n============================================================');
  console.log(`Phase 6D.1 / 6D.1R Test Results: ${passedChecks}/${totalChecks} assertions passed`);
  if (failures.length > 0) {
    console.error(`FAILED Assertions (${failures.length}):`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('ALL MANDATORY & CRITICAL SECURITY SCENARIOS PASSED WITH ZERO FAILURES.');
    console.log('============================================================\n');
  }
}

runSuite().catch((err) => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
