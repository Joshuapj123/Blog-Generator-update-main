// src/lib/intelligence/SectionEvidencePlanner.ts
import {
  SectionEvidencePlan,
  SectionEvidencePlanSchema,
  SectionPurposePlan,
  SectionPurposePlanSchema,
  EvidenceRequirementsPlan,
  EvidenceRequirementsPlanSchema,
  ReasoningRequirementsPlan,
  ReasoningRequirementsPlanSchema,
  EvidenceAvailabilityStatus,
  VerifiedPractitionerContext,
  SaaSProfile,
  OutlineNode,
} from '@/core/contracts/schemas';
import {
  EvidenceItem,
  EvidenceSet,
  ContentGapMatrix,
  ContentGap,
  SectionIntent,
} from '@/core/contracts/evidence';
import {
  TopicRelevanceValidator,
  GENERIC_METRIC_STEMS,
  GENERIC_MODIFIER_STEMS,
  UNIVERSAL_FACET_STEMS,
} from './TopicRelevanceValidator';
import {
  DeliverableContractValidator,
  DeliverableType,
} from './DeliverableContractValidator';
import { SectionEvidenceMapper } from './SectionEvidenceMapper';

export class SectionEvidencePlanner {
  /**
   * Identifies whether a heading represents a non-substantive structural section
   * (e.g. table of contents, pure navigation, index, brief disclaimer, or closing wrap-up).
   */
  public static isNonSubstantiveHeading(heading: string, isClosingSection: boolean = false): boolean {
    const clean = heading.trim().toLowerCase();

    // Pure navigation, index, or disclaimer
    if (/^(table of contents|quick navigation|navigating this guide|index|disclaimer|citations & references|sources consulted)$/i.test(clean)) {
      return true;
    }

    // Pure closing recap if marked as closing section and matches closing tokens
    if (isClosingSection && /^(conclusion|final thoughts|summary|wrap[- ]?up)$/i.test(clean)) {
      return true;
    }

    return false;
  }

  /**
   * Deterministically derives a substantive, non-trivial buyer question
   * that directly addresses reader friction, diagnostic decisions, or actionable tradeoffs.
   */
  public static deriveBuyerQuestion(
    heading: string,
    intent: SectionIntent,
    deliverableType: DeliverableType | null = null,
    matchedGap?: ContentGap,
    coreConcept?: string
  ): string {
    const cleanHeading = heading.trim();
    const topicNoun = cleanHeading
      .replace(/^(how to|understanding|what is|a guide to|the|an|why)\s+/i, '')
      .replace(/[^\w\s-]/g, '')
      .trim();

    // 1. If gap has an explicit buyer question that is substantive and does not trivially match the heading
    if (matchedGap?.buyerQuestion && matchedGap.buyerQuestion.trim().length >= 10) {
      const qNorm = matchedGap.buyerQuestion.trim().toLowerCase().replace(/[^\w\s]/g, '');
      const hNorm = cleanHeading.toLowerCase().replace(/[^\w\s]/g, '');
      if (qNorm !== hNorm && !qNorm.startsWith(`what is ${hNorm}`)) {
        return matchedGap.buyerQuestion.trim();
      }
    }

    // 2. Deliverable-specific substantive questions
    if (deliverableType === 'AUDIT') {
      return `What specific evaluation heuristics, interface friction points, and severity criteria should an auditor inspect in ${topicNoun}?`;
    }
    if (deliverableType === 'COMPARISON') {
      return `What concrete performance, operational trade-offs, and decision rules determine whether to choose ${topicNoun}?`;
    }
    if (deliverableType === 'CHECKLIST') {
      return `What exact verification criteria, failure thresholds, and pass/fail conditions must be validated for ${topicNoun}?`;
    }
    if (deliverableType === 'STRATEGY') {
      return `What prioritized operational roadmap, resource allocations, and KPIs drive measurable outcomes for ${topicNoun}?`;
    }
    if (deliverableType === 'CASE_STUDY') {
      return `What baseline diagnostic metrics, remediation actions, and verified results occurred in this ${topicNoun} engagement?`;
    }

    // 3. Section intent-specific substantive questions
    switch (intent) {
      case 'ANSWER':
        return `What specific operational thresholds and technical requirements distinguish ${topicNoun} in practice?`;
      case 'EXPLAIN':
        return `How do practitioners execute and troubleshoot the step-by-step implementation of ${topicNoun}?`;
      case 'COMPARE':
        return `What are the critical trade-offs, maintenance overheads, and selection criteria when evaluating ${topicNoun}?`;
      case 'PROVE':
        return `What empirical evidence, benchmarks, or measurable diagnostic indicators substantiate the impact of ${topicNoun}?`;
      case 'RECOMMEND':
      default:
        if (coreConcept && coreConcept.length > 5) {
          return `What prioritized, low-risk remediation steps should technical teams deploy to address ${coreConcept.toLowerCase().replace(/[^\w\s]/g, '')}?`;
        }
        return `What prioritized, low-risk remediation steps should technical teams deploy to optimize ${topicNoun}?`;
    }
  }

  /**
   * Generates the 5 mandatory reasoning requirements calibrated to deliverable type and intent.
   */
  public static generateReasoningRequirements(
    heading: string,
    intent: SectionIntent,
    deliverableType: DeliverableType | null = null,
    buyerQuestion?: string
  ): ReasoningRequirementsPlan {
    const cleanHeading = heading.trim();

    if (deliverableType === 'AUDIT') {
      return ReasoningRequirementsPlanSchema.parse({
        observationRequirement: `Identify specific UI/UX components (e.g. form fields, navigational menus, error modals, CTAs) and user friction bottlenecks in ${cleanHeading}.`,
        interpretationRequirement: 'Diagnose the underlying cognitive load, usability heuristic violation, or interaction barrier causing user hesitation or abandonment.',
        recommendationRequirement: 'Specify prioritized corrective UI/UX remediations (Critical, Major, Minor) with concrete architectural adjustments.',
        implementationRequirement: 'Provide step-by-step technical and design implementation guidance for frontend engineering and product design teams.',
        validationRequirement: 'Establish quantitative telemetry checkpoints (e.g., funnel drop-off reduction, task completion rate) and usability re-testing criteria.',
      });
    }

    if (deliverableType === 'CHECKLIST') {
      return ReasoningRequirementsPlanSchema.parse({
        observationRequirement: `Identify the critical operational workflows, configurations, or interface touchpoints requiring structured inspection in ${cleanHeading}.`,
        interpretationRequirement: 'Explain why omission or misconfiguration creates systemic friction, compliance vulnerabilities, or user failure modes.',
        recommendationRequirement: 'Formulate at least 3 discrete, observable inspection criteria using active verification verbs (Verify, Ensure, Inspect, Test, Confirm).',
        implementationRequirement: 'Provide exact execution procedures and tooling instructions for conducting each checklist verification.',
        validationRequirement: 'Define unambiguous binary pass/fail verification conditions and formal sign-off audit logging.',
      });
    }

    if (deliverableType === 'COMPARISON') {
      return ReasoningRequirementsPlanSchema.parse({
        observationRequirement: `Identify the explicit alternative architectures, service delivery models, or technical tools evaluated in ${cleanHeading}.`,
        interpretationRequirement: 'Analyze multi-dimensional trade-offs across cost, implementation velocity, maintenance overhead, and operational control.',
        recommendationRequirement: 'Deliver a definitive decision framework and situational criteria specifying exactly when to select each alternative.',
        implementationRequirement: 'Provide concrete migration paths or phased adoption workflows tailored to each evaluated option.',
        validationRequirement: 'Define performance benchmarks and operational metrics to validate that the chosen alternative satisfies requirements.',
      });
    }

    if (deliverableType === 'STRATEGY') {
      return ReasoningRequirementsPlanSchema.parse({
        observationRequirement: `Map the current organizational baseline, technical constraints, and operational friction points in ${cleanHeading}.`,
        interpretationRequirement: 'Analyze why ad-hoc tactics fail and demonstrate the necessity of a structured strategic framework.',
        recommendationRequirement: 'Prescribe a phased, actionable initiative sequencing immediate wins, intermediate architecture, and mature governance.',
        implementationRequirement: 'Detail the operational rollout schedule with phase-by-phase resource allocation and execution milestones.',
        validationRequirement: 'Establish measurable leading and lagging KPIs to continuously monitor strategic effectiveness.',
      });
    }

    if (deliverableType === 'CASE_STUDY') {
      return ReasoningRequirementsPlanSchema.parse({
        observationRequirement: `Establish the baseline organizational context, technical debt, or user friction observed prior to intervention in ${cleanHeading}.`,
        interpretationRequirement: 'Diagnose the systemic root causes and structural constraints that prevented earlier solutions from succeeding.',
        recommendationRequirement: 'Formulate the exact practitioner methodology and technical intervention designed for this engagement scenario.',
        implementationRequirement: 'Detail the chronological execution steps taken to deploy the intervention in the production environment.',
        validationRequirement: 'Document verified quantitative outcomes or observable performance improvements achieved.',
      });
    }

    // Default general reasoning plan
    return ReasoningRequirementsPlanSchema.parse({
      observationRequirement: `Identify specific operational symptoms, technical conditions, or user friction points regarding ${cleanHeading}.`,
      interpretationRequirement: `Explain the root causes, architectural trade-offs, or business consequences of these observations.`,
      recommendationRequirement: `Prescribe concrete, actionable guidance and best practices addressing "${buyerQuestion || cleanHeading}".`,
      implementationRequirement: `Provide practical, step-by-step procedures that readers can directly execute in their operational environment.`,
      validationRequirement: `Define clear verification criteria, metrics, or review checks to confirm successful execution.`,
    });
  }

  /**
   * Deterministically segregates and maps practitioner and external evidence,
   * detecting evidence gaps and assigning availability status.
   */
  public static determineEvidenceRequirements(
    node: { heading: string; core_concept?: string; assignedKeywords?: string[]; assignedEntities?: string[] },
    evidenceSet: EvidenceSet,
    practitionerContext?: VerifiedPractitionerContext | null,
    targetKeyword?: string,
    saasProfile?: SaaSProfile,
    isSubstantive: boolean = true
  ): {
    evidenceAvailability: EvidenceAvailabilityStatus;
    evidenceGapReason?: string;
    practitionerEvidenceReferences: string[];
    externalSourceReferences: string[];
    assignedEvidenceReferences: string[];
    requiredEvidenceTypes: string[];
  } {
    if (!isSubstantive) {
      return {
        evidenceAvailability: 'NOT_APPLICABLE',
        evidenceGapReason: undefined,
        practitionerEvidenceReferences: [],
        externalSourceReferences: [],
        assignedEvidenceReferences: [],
        requiredEvidenceTypes: [],
      };
    }

    const brandName = saasProfile?.name || 'Target Business';
    const headingLower = node.heading.toLowerCase();
    const isBrandSection =
      headingLower.includes(brandName.toLowerCase()) ||
      Boolean(node.assignedEntities && node.assignedEntities.some(e => e.toLowerCase() === brandName.toLowerCase())) ||
      (Boolean(node.core_concept) && node.core_concept!.toLowerCase().includes(brandName.toLowerCase()));

    // 1. Extract Section Stems
    const headingStems = TopicRelevanceValidator.tokenizeAndStem(node.heading);
    const conceptStems = node.core_concept ? TopicRelevanceValidator.tokenizeAndStem(node.core_concept) : new Set<string>();
    const kwStems = new Set<string>();
    (node.assignedKeywords || []).forEach(k => {
      TopicRelevanceValidator.tokenizeAndStem(k).forEach(s => kwStems.add(s));
    });
    const allSectionStems = new Set([...headingStems, ...conceptStems, ...kwStems]);
    const substantiveSectionStems = new Set(
      Array.from(allSectionStems).filter(
        s => !GENERIC_METRIC_STEMS.has(s) && !GENERIC_MODIFIER_STEMS.has(s) && !UNIVERSAL_FACET_STEMS.has(s)
      )
    );

    // 2. Match Practitioner Evidence (from VerifiedPractitionerContext ONLY)
    const practitionerEvidenceReferences: string[] = [];
    if (practitionerContext) {
      // (a) Verified Principles
      for (const p of practitionerContext.verifiedPrinciples || []) {
        const pText = `${p.statement} ${p.explanation || ''}`.toLowerCase();
        const pStems = TopicRelevanceValidator.tokenizeAndStem(pText);
        let hasOverlap = false;
        for (const s of pStems) {
          if (substantiveSectionStems.has(s)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) {
          practitionerEvidenceReferences.push(
            `[PRACTITIONER EXPERIENCE] [Principle: ${p.principleId}] ${p.statement}: ${p.explanation || ''}`
          );
        }
      }

      // (b) Verified Projects
      for (const proj of practitionerContext.verifiedProjects || []) {
        const projText = `${proj.anonymizedDescription} ${proj.problemObserved} ${proj.intervention} ${proj.documentedOutcome}`.toLowerCase();
        const projStems = TopicRelevanceValidator.tokenizeAndStem(projText);
        let hasOverlap = false;
        for (const s of projStems) {
          if (substantiveSectionStems.has(s)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) {
          const clientNote = proj.clientName ? ` (Client: ${proj.clientName})` : '';
          practitionerEvidenceReferences.push(
            `[PRACTITIONER EXPERIENCE] [Project: ${proj.projectId}] ${proj.anonymizedDescription}${clientNote} (Problem: ${proj.problemObserved} -> Action: ${proj.intervention} -> Outcome: ${proj.documentedOutcome})`
          );
        }
      }

      // (c) Verified Expertise
      for (const exp of practitionerContext.verifiedExpertise || []) {
        const expText = `${exp.capability} ${exp.description}`.toLowerCase();
        const expStems = TopicRelevanceValidator.tokenizeAndStem(expText);
        let hasOverlap = false;
        for (const s of expStems) {
          if (substantiveSectionStems.has(s)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) {
          practitionerEvidenceReferences.push(
            `[PRACTITIONER EXPERIENCE] [Expertise: ${exp.expertiseId}] ${exp.capability}: ${exp.description}`
          );
        }
      }
    }

    // 3. Match External Research Evidence Items
    const allEvidence = evidenceSet?.items || [];
    const matchedEvidenceItems: EvidenceItem[] = [];
    for (const ev of allEvidence) {
      // Never allow competitor evidence to enter practitioner references
      const evalResult = SectionEvidenceMapper.evaluateEvidenceRelevance(
        ev,
        node,
        targetKeyword,
        brandName,
        isBrandSection
      );
      if (evalResult.isMatch) {
        matchedEvidenceItems.push(ev);
      }
    }

    // Sort deterministically and take top matches
    matchedEvidenceItems.sort((a, b) => {
      if (a.confidence === 'HIGH' && b.confidence !== 'HIGH') return -1;
      if (b.confidence === 'HIGH' && a.confidence !== 'HIGH') return 1;
      return a.id.localeCompare(b.id);
    });

    const externalSourceReferences: string[] = matchedEvidenceItems.slice(0, 3).map(ev => {
      let tag = '[EXTERNAL RESEARCH]';
      if (
        ev.evidenceType === 'BUSINESS_FACT' ||
        ev.evidenceType === 'FEATURE' ||
        ev.evidenceType === 'DIFFERENTIATOR' ||
        ev.evidenceType === 'TECHNICAL_SPEC' ||
        ev.sourceType === 'TARGET_SITE'
      ) {
        tag = '[TARGET BRAND EVIDENCE]';
      } else if (ev.sourceType === 'COMPETITOR') {
        tag = '[COMPETITOR OBSERVATION - DO NOT ATTRIBUTE TO TARGET]';
      } else if (ev.evidenceType === 'INFERENCE') {
        tag = '[EDITORIAL INFERENCE]';
      }
      return `${tag} [ID: ${ev.id}] ${ev.claim}${ev.sourceUrl ? ` (Source: ${ev.sourceUrl})` : ''}`;
    });

    const assignedEvidenceReferences = [
      ...practitionerEvidenceReferences,
      ...externalSourceReferences,
    ];

    const requiredEvidenceTypes: string[] = Array.from(
      new Set(matchedEvidenceItems.map(e => e.evidenceType as string))
    );
    if (practitionerEvidenceReferences.length > 0) {
      requiredEvidenceTypes.unshift('VERIFIED_PRACTITIONER_EXPERIENCE');
    }

    // 4. Determine Evidence Availability Status
    let evidenceAvailability: EvidenceAvailabilityStatus = 'MISSING';
    let evidenceGapReason: string | undefined = undefined;

    if (practitionerEvidenceReferences.length > 0) {
      evidenceAvailability = 'AVAILABLE_VERIFIED';
    } else if (matchedEvidenceItems.length > 0) {
      const hasHighConfidence = matchedEvidenceItems.some(
        e => e.confidence === 'HIGH' || e.sourceType === 'TARGET_SITE' || e.evidenceType === 'BUSINESS_FACT'
      );
      evidenceAvailability = hasHighConfidence ? 'AVAILABLE_VERIFIED' : 'AVAILABLE_UNVERIFIED';
    } else {
      evidenceAvailability = 'MISSING';
      evidenceGapReason = `No empirical research data or verified practitioner case studies were found for "${node.heading}". Ground this section in objective diagnostic frameworks and qualified domain analysis without fabricating empirical statistics.`;
    }

    return {
      evidenceAvailability,
      evidenceGapReason,
      practitionerEvidenceReferences,
      externalSourceReferences,
      assignedEvidenceReferences,
      requiredEvidenceTypes,
    };
  }

  /**
   * Generates a complete typed SectionEvidencePlan for an outline node.
   */
  public static createSectionPlanForNode(
    node: OutlineNode,
    index: number,
    totalNodes: number,
    evidenceSet: EvidenceSet,
    practitionerContext?: VerifiedPractitionerContext | null,
    gapMatrix?: ContentGapMatrix,
    saasProfile?: SaaSProfile,
    targetKeyword?: string
  ): SectionEvidencePlan {
    const isClosing = index === totalNodes - 1;
    const isSubstantive = !this.isNonSubstantiveHeading(node.heading, isClosing);
    const deliverableType = DeliverableContractValidator.detectDeliverableType(node.heading);

    // Intent determination matching SectionEvidenceMapper
    let intent: SectionIntent = 'RECOMMEND';
    if (/\b(?:vs|versus|compare|comparison|alternative|evaluat)\b/i.test(node.heading)) {
      intent = 'COMPARE';
    } else if (/\b(?:why|benefit|roi|impact|success|result|proof|case study)\b/i.test(node.heading)) {
      intent = 'PROVE';
    } else if (/\b(?:how|process|workflow|steps|lifecycle|architecture|architect|guide|implement)\b/i.test(node.heading)) {
      intent = 'EXPLAIN';
    } else if (/\b(?:what|faq|question|answer|criteria)\b/i.test(node.heading)) {
      intent = 'ANSWER';
    }

    // Match gap if available
    const allGaps = (gapMatrix?.gaps || []).filter(g => g.isApprovedForOutline !== false);
    const headingStems = TopicRelevanceValidator.tokenizeAndStem(node.heading);
    const matchedGap = allGaps.find(g => {
      const gapStems = TopicRelevanceValidator.tokenizeAndStem(g.topic);
      for (const s of gapStems) {
        if (headingStems.has(s)) return true;
      }
      return false;
    });

    const buyerQuestion = this.deriveBuyerQuestion(
      node.heading,
      intent,
      deliverableType,
      matchedGap,
      node.core_concept
    );

    const sectionPurpose = isSubstantive
      ? `Deliver concrete tactical guidance and analytical clarity answering: "${buyerQuestion}"`
      : `Provide clear structural transition and high-level summary.`;

    const intendedReaderOutcome = isSubstantive
      ? `Reader gains actionable criteria, operational steps, and measurable validation checkpoints to resolve ${node.heading.toLowerCase().replace(/[^\w\s]/g, '')}.`
      : `Reader understands the article structure and high-level progression.`;

    const purpose: SectionPurposePlan = SectionPurposePlanSchema.parse({
      sectionId: `sec_${index + 1}`,
      heading: node.heading,
      sectionPurpose,
      buyerQuestion,
      readerKnowledgeLevel: 'INTERMEDIATE',
      intendedReaderOutcome,
    });

    const evReqs = this.determineEvidenceRequirements(
      node,
      evidenceSet,
      practitionerContext,
      targetKeyword,
      saasProfile,
      isSubstantive
    );

    const evidence: EvidenceRequirementsPlan = EvidenceRequirementsPlanSchema.parse({
      requiredEvidenceTypes: evReqs.requiredEvidenceTypes,
      assignedEvidenceReferences: evReqs.assignedEvidenceReferences,
      practitionerEvidenceReferences: evReqs.practitionerEvidenceReferences,
      externalSourceReferences: evReqs.externalSourceReferences,
      evidenceAvailability: evReqs.evidenceAvailability,
      evidenceGapReason: evReqs.evidenceGapReason,
    });

    const reasoning: ReasoningRequirementsPlan = this.generateReasoningRequirements(
      node.heading,
      intent,
      deliverableType,
      buyerQuestion
    );

    // Formulate claim classification guidance
    const claimClassificationGuidance: string[] = [
      'OBSERVED_FACT: Use only for directly verifiable empirical statements supported by assigned research citations.',
      'VERIFIED_PRACTITIONER_EXPERIENCE: Use only for verified practitioner principles, anonymized projects, and approved expertise. Follow attribution rules strictly.',
      'EXTERNAL_SOURCE_FACT: Explicitly cite or ground external research without transferring third-party capabilities to the target business.',
      'INFERENCE: Permitted for analytical deductions and logical conclusions, but must be phrased using qualifying language (e.g., "suggests", "typically indicates").',
      'HYPOTHESIS / ILLUSTRATIVE_EXAMPLE: Clearly label hypothetical scenarios or worked examples as illustrative rather than real historical case studies.',
      'PROPOSED_RECOMMENDATION: Frame actionable guidance as concrete best-practice recommendations rather than guaranteed commercial outcomes.',
    ];

    if (evReqs.evidenceAvailability === 'MISSING' || evReqs.evidenceAvailability === 'REQUIRES_EXTERNAL_RESEARCH') {
      claimClassificationGuidance.unshift(
        'ZERO-FABRICATION RULE: Evidence availability is MISSING. DO NOT invent case studies, specific client stories, numerical metrics, or ungrounded statistics. Ground analysis in conceptual frameworks and standard domain heuristics.'
      );
    }

    return SectionEvidencePlanSchema.parse({
      sectionId: `sec_${index + 1}`,
      heading: node.heading,
      purpose,
      evidence,
      reasoning,
      claimClassificationGuidance,
      isSubstantive,
    });
  }

  /**
   * Creates complete SectionEvidencePlans for all outline nodes.
   */
  public static createSectionPlans(
    outline: OutlineNode[],
    evidenceSet: EvidenceSet,
    practitionerContext?: VerifiedPractitionerContext | null,
    gapMatrix?: ContentGapMatrix,
    saasProfile?: SaaSProfile,
    targetKeyword?: string
  ): SectionEvidencePlan[] {
    const plans: SectionEvidencePlan[] = [];
    const total = outline.length;

    for (let i = 0; i < total; i++) {
      const plan = this.createSectionPlanForNode(
        outline[i],
        i,
        total,
        evidenceSet,
        practitionerContext,
        gapMatrix,
        saasProfile,
        targetKeyword
      );
      plans.push(plan);
    }

    return plans;
  }

  /**
   * Formats a SectionEvidencePlan into structured prompt directives
   * to be injected into the LLM section generation prompt.
   */
  public static formatPlanDirectives(plan: SectionEvidencePlan): string {
    const lines: string[] = [];
    lines.push('=== SECTION EVIDENCE & REASONING CONTRACT (PHASE 6D.2) ===');
    lines.push(`Section Heading: "${plan.heading}"`);
    lines.push(`Deliverable Category: ${plan.isSubstantive ? 'SUBSTANTIVE DELIVERABLE' : 'NON-SUBSTANTIVE OVERVIEW / RECAP'}`);
    lines.push(`Assigned Buyer Question to Answer Directly:`);
    lines.push(`- "${plan.purpose.buyerQuestion}"`);
    lines.push(`Intended Reader Outcome:`);
    lines.push(`- ${plan.purpose.intendedReaderOutcome}`);
    lines.push(`Reader Knowledge Level: ${plan.purpose.readerKnowledgeLevel}`);
    lines.push('');
    lines.push(`Evidence Availability: ${plan.evidence.evidenceAvailability}`);

    if (plan.evidence.evidenceGapReason) {
      lines.push(`Evidence Gap Directives:`);
      lines.push(`- ${plan.evidence.evidenceGapReason}`);
      lines.push(`- CRITICAL: Do NOT invent synthetic case studies, fake client anecdotes, or ungrounded statistics.`);
    }

    if (plan.evidence.practitionerEvidenceReferences.length > 0) {
      lines.push(`Verified Practitioner Experience References:`);
      for (const ref of plan.evidence.practitionerEvidenceReferences) {
        lines.push(`- ${ref}`);
      }
    }

    if (plan.evidence.externalSourceReferences.length > 0) {
      lines.push(`External Source / Research Evidence References:`);
      for (const ref of plan.evidence.externalSourceReferences) {
        lines.push(`- ${ref}`);
      }
    }

    lines.push('');
    lines.push('REASONING REQUIREMENTS (You MUST fulfill all 5 dimensions):');
    lines.push(`1. Observation: ${plan.reasoning.observationRequirement}`);
    lines.push(`2. Interpretation: ${plan.reasoning.interpretationRequirement}`);
    lines.push(`3. Recommendation: ${plan.reasoning.recommendationRequirement}`);
    lines.push(`4. Implementation: ${plan.reasoning.implementationRequirement}`);
    lines.push(`5. Validation: ${plan.reasoning.validationRequirement}`);

    lines.push('');
    lines.push('CLAIM CLASSIFICATION & FACTUAL INTEGRITY RULES:');
    for (const guidance of plan.claimClassificationGuidance) {
      lines.push(`- ${guidance}`);
    }
    lines.push('==========================================================');

    return lines.join('\n');
  }
}
