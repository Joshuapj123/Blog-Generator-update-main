import {
  PractitionerKnowledgeProfile,
  PractitionerKnowledgeProfileSchema,
  VerifiedPractitionerContext,
  VerifiedPractitionerContextSchema,
  VerifiedExpertiseItem,
  DesignPrincipleItem,
  VerifiedProjectItem,
} from '@/core/contracts/schemas';

export interface ReviewerContext {
  reviewerId: string;
  reviewerRole: 'EDITORIAL_DIRECTOR' | 'PRACTITIONER_LEAD' | 'COMPLIANCE_OFFICER';
  tenantId?: string;
}

export interface ReviewerDecision {
  targetType: 'IDENTITY' | 'EXPERTISE' | 'PRINCIPLE' | 'PROJECT';
  targetId: string; // practitionerId, expertiseId, principleId, or projectId
  decision: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
  approvedScope?: string[];
}

/**
 * Service governing verified practitioner knowledge ingestion, tenant isolation,
 * verification filtering, voice enforcement, and generation context formulation.
 *
 * CORE PRINCIPLE:
 * ACUTE may use verified practitioner expertise. It must never manufacture expertise
 * or invent ungrounded personal experience to make an article sound convincing.
 */
export class PractitionerKnowledgeService {
  /**
   * Filters a practitioner profile down to only authoritatively verified and approved items
   * safe for injection into LLM generation context.
   *
   * SAFETY INVARIANTS:
   * - Returns null if profile is missing, profileStatus is not ACTIVE, or identity is not VERIFIED.
   * - Filters out all items with verificationStatus !== 'VERIFIED' or approvalStatus !== 'APPROVED'.
   * - Filters out all projects marked CONFIDENTIAL or INTERNAL_ONLY.
   * - Strips client names for ANONYMIZED projects unconditionally.
   * - Allows client names for PUBLIC projects ONLY IF both item.clientNamingPermission === true
   *   AND profile.attributionRules.clientNamingPermission === true.
   * - Enforces firstPersonVoiceAllowed = false by default; allows true ONLY IF profile explicitly
   *   authorizes it AND verified/approved project/principle evidence exists.
   */
  public static filterForGenerationContext(
    profile?: PractitionerKnowledgeProfile,
    _requestedScope?: string
  ): VerifiedPractitionerContext | null {
    if (!profile || !profile.identity) {
      return null;
    }

    // Identity must be authoritatively verified and profile must be ACTIVE
    if (profile.identity.verificationStatus !== 'VERIFIED') {
      return null;
    }
    if (profile.identity.profileStatus !== 'ACTIVE') {
      return null;
    }

    // 1. Filter expertise: only VERIFIED + APPROVED
    const verifiedExpertise = (profile.expertise || [])
      .filter(
        (e: VerifiedExpertiseItem) =>
          e.verificationStatus === 'VERIFIED' && e.approvalStatus === 'APPROVED'
      )
      .map((e: VerifiedExpertiseItem) => ({
        expertiseId: e.expertiseId,
        capability: e.capability,
        description: e.description,
      }));

    // 2. Filter design principles: only VERIFIED + APPROVED
    const verifiedPrinciples = (profile.designPrinciples || [])
      .filter(
        (p: DesignPrincipleItem) =>
          p.verificationStatus === 'VERIFIED' && p.approvalStatus === 'APPROVED'
      )
      .map((p: DesignPrincipleItem) => ({
        principleId: p.principleId,
        statement: p.statement,
        explanation: p.explanation || '',
        context: p.context || '',
      }));

    // 3. Filter verified projects: only VERIFIED + APPROVED + (PUBLIC or ANONYMIZED)
    const verifiedProjects = (profile.verifiedProjects || [])
      .filter(
        (proj: VerifiedProjectItem) =>
          proj.verificationStatus === 'VERIFIED' &&
          proj.approvalStatus === 'APPROVED' &&
          proj.confidentialityLevel !== 'CONFIDENTIAL' &&
          proj.confidentialityLevel !== 'INTERNAL_ONLY'
      )
      .map((proj: VerifiedProjectItem) => {
        const isPublic = proj.confidentialityLevel === 'PUBLIC';
        const clientNamingAllowed =
          isPublic &&
          proj.clientNamingPermission === true &&
          profile.attributionRules?.clientNamingPermission === true;

        return {
          projectId: proj.projectId,
          projectTitle: proj.projectTitle,
          anonymizedDescription: proj.anonymizedDescription,
          problemObserved: proj.problemObserved,
          intervention: proj.intervention,
          documentedOutcome: proj.documentedOutcome,
          clientName: clientNamingAllowed && proj.clientName ? proj.clientName : undefined,
        };
      });

    // 4. Voice permissions: default false.
    // Authorized only if explicitly enabled AND at least one verified project or design principle exists.
    const hasEvidence = verifiedProjects.length > 0 || verifiedPrinciples.length > 0;
    const firstPersonVoiceAllowed =
      Boolean(profile.attributionRules?.firstPersonVoiceAllowed) && hasEvidence;

    const thirdPersonVoiceAllowed = profile.attributionRules?.thirdPersonVoiceAllowed !== false;

    // 5. Construct safe attribution directives
    const safeAttributionDirectives: string[] = [
      'STRICT PROHIBITION: Never invent client engagements, case studies, conversion metrics, numbers, or professional credentials not explicitly provided in the verified context.',
      'STRICT PROHIBITION: Missing practitioner information must remain missing; do not simulate personal anecdotes or fictional client work.',
    ];

    if (!firstPersonVoiceAllowed) {
      safeAttributionDirectives.push(
        'VOICE RULE: First-person voice ("I", "my", "in my practice", "we") is STRICTLY PROHIBITED. All practitioner insights must be framed in objective, professional third-person phrasing (e.g. "practitioners observe", "the specialist recommends", "industry experience indicates").'
      );
    } else {
      safeAttributionDirectives.push(
        'VOICE RULE: First-person voice ("I", "my") is authorized ONLY when directly referencing the verified design principles or approved project outcomes listed in this context. Do not invent additional personal anecdotes.'
      );
    }

    if (!profile.attributionRules?.clientNamingPermission) {
      safeAttributionDirectives.push(
        'CONFIDENTIALITY RULE: Client naming is strictly prohibited. Refer to past engagements only using anonymized industry/context descriptions.'
      );
    }

    const contextData: VerifiedPractitionerContext = {
      practitionerId: profile.identity.practitionerId,
      displayName: profile.identity.displayName,
      professionalTitle: profile.identity.professionalTitle,
      approvedAuthorName: profile.identity.approvedAuthorName || profile.identity.displayName,
      firstPersonVoiceAllowed,
      thirdPersonVoiceAllowed,
      approvedByline: profile.attributionRules?.approvedByline,
      verifiedPrinciples,
      verifiedProjects,
      verifiedExpertise,
      safeAttributionDirectives,
    };

    return VerifiedPractitionerContextSchema.parse(contextData);
  }

  /**
   * Sanitizes owner-submitted profile data to prevent self-promotion of verification or approval states.
   *
   * NON-NEGOTIABLE VERIFICATION INVARIANTS:
   * 1. An ordinary profile owner cannot self-verify identity, expertise, principles, or projects.
   * 2. An ordinary profile owner cannot self-approve any item.
   * 3. Self-submitted verification timestamps and reviewer IDs are stripped.
   * 4. Modifying the core content of an already-approved item invalidates its verification and approval,
   *    reverting it to UNVERIFIED and DRAFT.
   * 5. Ownership identifiers (id, tenantId, userId, practitionerId) are strictly immutable.
   */
  public static sanitizeOwnerDraftSubmission(
    incoming: PractitionerKnowledgeProfile,
    existing?: PractitionerKnowledgeProfile | null
  ): PractitionerKnowledgeProfile {
    // 1. Strict ownership immutability check
    if (existing) {
      if (incoming.id !== existing.id) {
        throw new Error(`Forbidden: Profile id is immutable ("${existing.id}" !== "${incoming.id}").`);
      }
      if (incoming.tenantId !== existing.tenantId) {
        throw new Error(`Forbidden: Tenant id is immutable ("${existing.tenantId}" !== "${incoming.tenantId}").`);
      }
      if (incoming.userId !== existing.userId) {
        throw new Error(`Forbidden: User id is immutable ("${existing.userId}" !== "${incoming.userId}").`);
      }
      if (incoming.identity.practitionerId !== existing.identity.practitionerId) {
        throw new Error(`Forbidden: Practitioner id is immutable.`);
      }
    }

    // 2. Identity verification sanitization:
    let identityVerification: 'UNVERIFIED' | 'VERIFIED' = 'UNVERIFIED';
    let identityVerifiedAt: string | undefined = undefined;
    let identityVerifiedBy: string | undefined = undefined;

    if (existing && existing.identity.verificationStatus === 'VERIFIED') {
      const coreIdentityChanged =
        incoming.identity.displayName !== existing.identity.displayName ||
        incoming.identity.professionalTitle !== existing.identity.professionalTitle ||
        incoming.identity.approvedAuthorName !== existing.identity.approvedAuthorName;
      if (!coreIdentityChanged) {
        identityVerification = 'VERIFIED';
        identityVerifiedAt = existing.identity.verifiedAt;
        identityVerifiedBy = existing.identity.verifiedBy;
      }
    }

    const sanitizedIdentity = {
      ...incoming.identity,
      verificationStatus: identityVerification,
      verifiedAt: identityVerifiedAt,
      verifiedBy: identityVerifiedBy,
    };

    // 3. Expertise sanitization:
    const sanitizedExpertise = (incoming.expertise || []).map((exp) => {
      const existingExp = existing?.expertise.find((e) => e.expertiseId === exp.expertiseId);
      if (
        existingExp &&
        existingExp.verificationStatus === 'VERIFIED' &&
        existingExp.approvalStatus === 'APPROVED'
      ) {
        const changed =
          exp.capability !== existingExp.capability ||
          exp.description !== existingExp.description;
        if (!changed) {
          return {
            ...exp,
            verificationStatus: 'VERIFIED' as const,
            approvalStatus: 'APPROVED' as const,
            verifiedAt: existingExp.verifiedAt,
            reviewedAt: existingExp.reviewedAt,
            reviewedBy: existingExp.reviewedBy,
          };
        }
      }
      return {
        ...exp,
        verificationStatus: 'UNVERIFIED' as const,
        approvalStatus: 'DRAFT' as const,
        verifiedAt: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
      };
    });

    // 4. Design Principles sanitization:
    const sanitizedPrinciples = (incoming.designPrinciples || []).map((prin) => {
      const existingPrin = existing?.designPrinciples.find((p) => p.principleId === prin.principleId);
      if (
        existingPrin &&
        existingPrin.verificationStatus === 'VERIFIED' &&
        existingPrin.approvalStatus === 'APPROVED'
      ) {
        const changed =
          prin.statement !== existingPrin.statement ||
          prin.explanation !== existingPrin.explanation ||
          prin.context !== existingPrin.context;
        if (!changed) {
          return {
            ...prin,
            verificationStatus: 'VERIFIED' as const,
            approvalStatus: 'APPROVED' as const,
            verifiedAt: existingPrin.verifiedAt,
            reviewedAt: existingPrin.reviewedAt,
            reviewedBy: existingPrin.reviewedBy,
          };
        }
      }
      return {
        ...prin,
        verificationStatus: 'UNVERIFIED' as const,
        approvalStatus: 'DRAFT' as const,
        verifiedAt: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
      };
    });

    // 5. Verified Projects sanitization:
    const sanitizedProjects = (incoming.verifiedProjects || []).map((proj) => {
      const existingProj = existing?.verifiedProjects.find((p) => p.projectId === proj.projectId);
      if (
        existingProj &&
        existingProj.verificationStatus === 'VERIFIED' &&
        existingProj.approvalStatus === 'APPROVED'
      ) {
        const changed =
          proj.projectTitle !== existingProj.projectTitle ||
          proj.clientName !== existingProj.clientName ||
          proj.confidentialityLevel !== existingProj.confidentialityLevel ||
          proj.clientNamingPermission !== existingProj.clientNamingPermission ||
          proj.anonymizedDescription !== existingProj.anonymizedDescription ||
          proj.problemObserved !== existingProj.problemObserved ||
          proj.intervention !== existingProj.intervention ||
          proj.documentedOutcome !== existingProj.documentedOutcome;
        if (!changed) {
          return {
            ...proj,
            verificationStatus: 'VERIFIED' as const,
            approvalStatus: 'APPROVED' as const,
            verifiedAt: existingProj.verifiedAt,
            reviewedAt: existingProj.reviewedAt,
            reviewedBy: existingProj.reviewedBy,
          };
        }
      }
      return {
        ...proj,
        verificationStatus: 'UNVERIFIED' as const,
        approvalStatus: 'DRAFT' as const,
        verifiedAt: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
      };
    });

    return PractitionerKnowledgeProfileSchema.parse({
      ...incoming,
      identity: sanitizedIdentity,
      expertise: sanitizedExpertise,
      designPrinciples: sanitizedPrinciples,
      verifiedProjects: sanitizedProjects,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Promotes an item or identity to VERIFIED / APPROVED by an authenticated, authorized reviewer.
   * Enforces separation of duties: reviewer cannot review their own profile.
   */
  public static applyReviewerDecision(
    profile: PractitionerKnowledgeProfile,
    decision: ReviewerDecision,
    reviewer: ReviewerContext
  ): PractitionerKnowledgeProfile {
    if (!profile) throw new Error('Profile not found.');
    if (!reviewer || !reviewer.reviewerId || !reviewer.reviewerId.trim()) {
      throw new Error('Authenticated reviewer identity required.');
    }

    // Separation of duties: owner cannot review their own knowledge profile
    if (reviewer.reviewerId === profile.userId) {
      throw new Error(
        `Forbidden: Separation of duties violation. Caller "${reviewer.reviewerId}" cannot review their own practitioner profile.`
      );
    }

    const nowIso = new Date().toISOString();
    const isApprove = decision.decision === 'APPROVE';
    const verStatus = isApprove ? ('VERIFIED' as const) : ('REJECTED' as const);
    const appStatus = isApprove ? ('APPROVED' as const) : ('REJECTED' as const);

    const updated = JSON.parse(JSON.stringify(profile)) as PractitionerKnowledgeProfile;

    if (decision.targetType === 'IDENTITY') {
      if (updated.identity.practitionerId !== decision.targetId) {
        throw new Error(`Target identity mismatch: "${decision.targetId}".`);
      }
      updated.identity.verificationStatus = verStatus;
      updated.identity.verifiedAt = isApprove ? nowIso : undefined;
      updated.identity.verifiedBy = isApprove ? reviewer.reviewerId : undefined;
    } else if (decision.targetType === 'EXPERTISE') {
      const item = updated.expertise.find((e) => e.expertiseId === decision.targetId);
      if (!item) throw new Error(`Expertise item "${decision.targetId}" not found.`);
      item.verificationStatus = verStatus;
      item.approvalStatus = appStatus;
      item.verifiedAt = isApprove ? nowIso : undefined;
      item.reviewedAt = nowIso;
      item.reviewedBy = reviewer.reviewerId;
    } else if (decision.targetType === 'PRINCIPLE') {
      const item = updated.designPrinciples.find((p) => p.principleId === decision.targetId);
      if (!item) throw new Error(`Design principle "${decision.targetId}" not found.`);
      item.verificationStatus = verStatus;
      item.approvalStatus = appStatus;
      item.verifiedAt = isApprove ? nowIso : undefined;
      item.reviewedAt = nowIso;
      item.reviewedBy = reviewer.reviewerId;
    } else if (decision.targetType === 'PROJECT') {
      const item = updated.verifiedProjects.find((p) => p.projectId === decision.targetId);
      if (!item) throw new Error(`Verified project "${decision.targetId}" not found.`);
      item.verificationStatus = verStatus;
      item.approvalStatus = appStatus;
      item.verifiedAt = isApprove ? nowIso : undefined;
      item.reviewedAt = nowIso;
      item.reviewedBy = reviewer.reviewerId;
    }

    updated.updatedAt = nowIso;
    return PractitionerKnowledgeProfileSchema.parse(updated);
  }

  /**
   * Evaluates whether first-person voice is authorized for a given profile and optional target item.
   */
  public static canUseFirstPersonVoice(
    profile?: PractitionerKnowledgeProfile,
    targetId?: string
  ): boolean {
    if (!profile || !profile.identity) return false;
    if (profile.identity.verificationStatus !== 'VERIFIED') return false;
    if (profile.identity.profileStatus !== 'ACTIVE') return false;
    if (!profile.attributionRules?.firstPersonVoiceAllowed) return false;

    if (targetId) {
      // Check project
      const proj = (profile.verifiedProjects || []).find((p) => p.projectId === targetId);
      if (proj) {
        return (
          proj.verificationStatus === 'VERIFIED' &&
          proj.approvalStatus === 'APPROVED' &&
          proj.confidentialityLevel !== 'CONFIDENTIAL' &&
          proj.confidentialityLevel !== 'INTERNAL_ONLY'
        );
      }
      // Check design principle
      const principle = (profile.designPrinciples || []).find((p) => p.principleId === targetId);
      if (principle) {
        return principle.verificationStatus === 'VERIFIED' && principle.approvalStatus === 'APPROVED';
      }
      // Check expertise
      const exp = (profile.expertise || []).find((e) => e.expertiseId === targetId);
      if (exp) {
        return exp.verificationStatus === 'VERIFIED' && exp.approvalStatus === 'APPROVED';
      }
      return false;
    }

    // General check: must have at least one verified, approved project or principle
    const hasVerifiedProject = (profile.verifiedProjects || []).some(
      (p) =>
        p.verificationStatus === 'VERIFIED' &&
        p.approvalStatus === 'APPROVED' &&
        p.confidentialityLevel !== 'CONFIDENTIAL' &&
        p.confidentialityLevel !== 'INTERNAL_ONLY'
    );
    const hasVerifiedPrinciple = (profile.designPrinciples || []).some(
      (p) => p.verificationStatus === 'VERIFIED' && p.approvalStatus === 'APPROVED'
    );

    return hasVerifiedProject || hasVerifiedPrinciple;
  }

  /**
   * Evaluates whether a client may be named for a project.
   */
  public static canNameClient(
    profile?: PractitionerKnowledgeProfile,
    projectId?: string
  ): boolean {
    if (!profile || !profile.attributionRules?.clientNamingPermission) return false;
    if (!projectId) return false;

    const proj = (profile.verifiedProjects || []).find((p) => p.projectId === projectId);
    if (!proj) return false;

    return (
      proj.confidentialityLevel === 'PUBLIC' &&
      proj.clientNamingPermission === true &&
      proj.verificationStatus === 'VERIFIED' &&
      proj.approvalStatus === 'APPROVED' &&
      Boolean(proj.clientName)
    );
  }

  /**
   * Enforces strict tenant isolation.
   * Throws if caller tenant or user does not match the record's owner.
   */
  public static validateTenantAccess(
    profile: PractitionerKnowledgeProfile,
    requestingTenantId: string,
    requestingUserId: string
  ): void {
    if (!profile) {
      throw new Error('Unauthorized: Profile not found');
    }
    if (!requestingTenantId || !requestingTenantId.trim()) {
      throw new Error('Unauthorized: requestingTenantId is required');
    }
    if (!requestingUserId || !requestingUserId.trim()) {
      throw new Error('Unauthorized: requestingUserId is required');
    }

    const cleanTenant = requestingTenantId.trim();
    const cleanUser = requestingUserId.trim();

    if (profile.tenantId !== cleanTenant || profile.userId !== cleanUser) {
      throw new Error(
        `Forbidden: Cross-tenant access denied. Tenant "${cleanTenant}" (user "${cleanUser}") cannot access practitioner knowledge owned by tenant "${profile.tenantId}" (user "${profile.userId}").`
      );
    }
  }

  /**
   * Formats a verified practitioner context into an isolated prompt boundary block.
   */
  public static formatForPromptContext(context: VerifiedPractitionerContext | null): string {
    if (!context) return '';

    const lines: string[] = [
      '=== VERIFIED PRACTITIONER KNOWLEDGE & ATTRIBUTION BOUNDARY ===',
      `Practitioner: ${context.displayName} (${context.professionalTitle})`,
      `Approved Byline: ${context.approvedByline || context.approvedAuthorName}`,
      `First-Person Voice Allowed: ${context.firstPersonVoiceAllowed ? 'YES (Strictly limited to verified items below)' : 'NO (STRICTLY PROHIBITED - Use professional third-person phrasing only)'}`,
      '',
      '--- AUTHORITATIVE ATTRIBUTION DIRECTIVES ---',
      ...context.safeAttributionDirectives.map((d) => `- ${d}`),
    ];

    if (context.verifiedPrinciples.length > 0) {
      lines.push('', '--- VERIFIED PRACTITIONER DESIGN PRINCIPLES ---');
      for (const p of context.verifiedPrinciples) {
        lines.push(`- Principle: "${p.statement}"`);
        if (p.explanation) lines.push(`  Explanation: ${p.explanation}`);
        if (p.context) lines.push(`  Context: ${p.context}`);
      }
    }

    if (context.verifiedProjects.length > 0) {
      lines.push('', '--- VERIFIED PROJECT CASE EVIDENCE ---');
      for (const pr of context.verifiedProjects) {
        lines.push(`- Project: ${pr.projectTitle}${pr.clientName ? ` (Client: ${pr.clientName})` : ''}`);
        lines.push(`  Context: ${pr.anonymizedDescription}`);
        lines.push(`  Problem Observed: ${pr.problemObserved}`);
        lines.push(`  Intervention: ${pr.intervention}`);
        lines.push(`  Documented Outcome: ${pr.documentedOutcome}`);
      }
    }

    if (context.verifiedExpertise.length > 0) {
      lines.push('', '--- VERIFIED CAPABILITIES & EXPERTISE ---');
      for (const e of context.verifiedExpertise) {
        lines.push(`- Capability: ${e.capability} — ${e.description}`);
      }
    }

    lines.push('================================================================');
    return lines.join('\n');
  }

  /**
   * Sanitizes a practitioner profile for storage, ensuring schema compliance and zero reference leaking.
   */
  public static sanitizeForStorage(profile: PractitionerKnowledgeProfile): Record<string, any> {
    const validated = PractitionerKnowledgeProfileSchema.parse(profile);
    return JSON.parse(JSON.stringify(validated));
  }

  /**
   * Deserializes and validates a practitioner profile from storage.
   */
  public static deserializeFromStorage(data: any): PractitionerKnowledgeProfile {
    return PractitionerKnowledgeProfileSchema.parse(data);
  }
}
