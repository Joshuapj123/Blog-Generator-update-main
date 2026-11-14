import {
  OutlineNode,
  WorkedFinding,
  VerifiedPractitionerContext,
  SaaSProfile,
  ValidationSeverity,
  ValidationDecision,
  ValidationDimension,
  ValidationFinding,
  DimensionScore,
  ExpertiseValidationResult,
  ExpertiseValidationResultSchema,
} from '@/core/contracts/schemas';
import { EvidenceSet, EvidenceItem } from '@/core/contracts/evidence';
import { TopicRelevanceValidator } from './TopicRelevanceValidator';

/**
 * Universal generic boilerplate phrase patterns.
 * When present WITHOUT concrete contextual grounding, causal explanation,
 * or measurable checkpoints, these indicate generic, low-expertise filler.
 */
const GENERIC_FILLER_PATTERNS = [
  /\bimprov(?:e|ing)\s+(?:the\s+)?user\s+experience\b/i,
  /\boptimi[zs](?:e|ing)\s+(?:website\s+)?performance\b/i,
  /\bus(?:e|ing)\s+(?:industry\s+)?best\s+practices\b/i,
  /\bimprov(?:e|ing)\s+(?:conversion\s+rates?|conversions?)\b/i,
  /\bensur(?:e|ing)\s+(?:high\s+)?scalability\b/i,
  /\bfocus(?:ing)?\s+on\s+customer\s+satisfaction\b/i,
  /\bimplement(?:ing)?\s+proper\s+monitoring\b/i,
  /\bdriv(?:e|ing)\s+(?:business\s+)?growth\b/i,
  /\bboost(?:ing)?\s+(?:overall\s+)?efficiency\b/i,
  /\bstreamlin(?:e|ing)\s+(?:operational\s+)?workflows?\b/i,
  /\btak(?:e|ing)\s+your\s+business\s+to\s+the\s+next\s+level\b/i,
  /\bunlock(?:ing)?\s+(?:the\s+)?(?:full\s+)?potential\b/i,
  /\bcutting-?edge\s+technolog(?:y|ies)\b/i,
  /\binnovative\s+solutions?\b/i,
  /\bseamless(?:ly)?\s+integrat(?:e|ing|ion)\b/i,
];

/**
 * Empty implementation guidance patterns.
 * Step advice that instructs the reader to "be careful" or "do quality work"
 * without providing executable technical or procedural instructions.
 */
const EMPTY_IMPLEMENTATION_PATTERNS = [
  /\b(?:be\s+careful|proceed\s+with\s+caution)\b/i,
  /\breview\s+(?:the\s+)?code\s+carefully\b/i,
  /\bmake\s+sure\s+everything\s+works\b/i,
  /\bdo\s+your\s+best\b/i,
  /\bstay\s+vigilant\b/i,
  /\bensure\s+high\s+quality\b/i,
  /\bfollow\s+(?:the\s+)?standard\s+guidelines\b/i,
  /\bcheck\s+that\s+things\s+are\s+correct\b/i,
];

/**
 * Strong, observable engineering/design action verbs.
 */
const ACTIONABLE_VERBS = new Set([
  'audit', 'refactor', 'configure', 'deploy', 'instrument', 'remove', 'replace',
  'measure', 'test', 'isolate', 'integrate', 'benchmark', 'standardize', 'enforce',
  'map', 'inspect', 'verify', 'catalog', 'restrict', 'parameterize', 'decouple',
  'cache', 'throttle', 'sandbox', 'validate', 'patch', 'remediate'
]);

/**
 * Dimension weight matrix for aggregate score calculation.
 * Sum = 1.00.
 */
const DIMENSION_WEIGHTS: Record<ValidationDimension, number> = {
  EVIDENCE_GROUNDING: 0.20,
  EXPERTISE_SPECIFICITY: 0.15,
  REASONING_DEPTH: 0.15,
  RECOMMENDATION_QUALITY: 0.15,
  REPETITION_CONTROL: 0.10,
  BUSINESS_IMPACT_INTEGRITY: 0.10,
  PRACTITIONER_PROVENANCE: 0.10,
  QUANTITATIVE_INTEGRITY: 0.05,
};

/**
 * Expertise & Genericity Validator Engine (Phase 6D.4).
 *
 * Evaluates generated content at three levels:
 * 1. Finding Level: Evaluates WorkedFinding instances across grounding, specificity, and actionability.
 * 2. Section Level: Evaluates complete section text and interaction between findings.
 * 3. Article Level: Evaluates article-wide repetition, reasoning depth, and global consistency.
 */
export class ExpertiseGenericityValidator {
  /**
   * Evaluates a single WorkedFinding independently.
   */
  public static validateFinding(
    finding: WorkedFinding,
    sectionText?: string,
    evidenceSet?: EvidenceSet,
    practitionerContext?: VerifiedPractitionerContext | null,
    saasProfile?: SaaSProfile
  ): ValidationFinding[] {
    const issues: ValidationFinding[] = [];
    const fid = finding.findingId;
    const secId = finding.sectionId;

    // 1. Evidence Grounding & Relevance
    this.validateFindingEvidenceGrounding(finding, evidenceSet, practitionerContext, issues);

    // 2. Expertise Specificity
    this.validateFindingSpecificity(finding, issues);

    // 3. Reasoning Depth & Causal Linkage
    this.validateFindingReasoningDepth(finding, issues);

    // 4. Recommendation Quality & Actionability
    this.validateFindingRecommendationQuality(finding, issues);

    // 5. Business Impact Integrity
    this.validateFindingBusinessImpact(finding, practitionerContext, issues);

    // 6. Practitioner Provenance & Voice Authenticity
    this.validateFindingPractitionerProvenance(finding, practitionerContext, issues);

    // 7. Quantitative Claim & Provenance Integrity
    this.validateFindingQuantitativeIntegrity(finding, issues);

    return issues;
  }

  /**
   * Evaluates a single WorkedFinding and returns full compiled validation results.
   */
  public static evaluateFinding(
    finding: WorkedFinding,
    evidenceSet?: EvidenceSet,
    practitionerContext?: VerifiedPractitionerContext | null,
    saasProfile?: SaaSProfile
  ): ExpertiseValidationResult {
    const issues = this.validateFinding(finding, undefined, evidenceSet, practitionerContext, saasProfile);
    const wordCount = `${finding.observation} ${finding.recommendation} ${finding.interpretation} ${finding.businessImpact}`.split(/\s+/).filter(Boolean).length;
    return this.compileValidationResult(issues, 1, 1, wordCount);
  }

  /**
   * Evaluates a section and its findings in context.
   */
  public static validateSection(
    section: OutlineNode,
    sectionText: string,
    allSections: OutlineNode[] = [],
    evidenceSet?: EvidenceSet,
    practitionerContext?: VerifiedPractitionerContext | null,
    saasProfile?: SaaSProfile
  ): ValidationFinding[] {
    const issues: ValidationFinding[] = [];
    const findings = section.workedFindings || [];
    const secHeading = section.heading;

    // A. Validate each finding in the section
    findings.forEach(f => {
      const fIssues = this.validateFinding(f, sectionText, evidenceSet, practitionerContext, saasProfile);
      issues.push(...fIssues);
    });

    // B. Intra-section repetition check across findings
    if (findings.length > 1) {
      for (let i = 0; i < findings.length; i++) {
        for (let j = i + 1; j < findings.length; j++) {
          const sim = this.calculateTokenSimilarity(findings[i].observation, findings[j].observation);
          if (sim > 0.75) {
            issues.push({
              findingId: `val_rep_intra_${findings[i].findingId}_${findings[j].findingId}`,
              sectionId: findings[i].sectionId,
              workedFindingId: findings[j].findingId,
              dimension: 'REPETITION_CONTROL',
              severity: 'WARNING',
              explanation: `Section "${secHeading}" contains duplicate/near-identical observations across findings "${findings[i].title}" and "${findings[j].title}" (${Math.round(sim * 100)}% similarity).`,
              evidenceOrTextLocation: findings[j].observation.slice(0, 100),
              reason: 'Findings within the same section must represent distinct diagnostics or operational touchpoints.',
              suggestedCorrectionCategory: 'DEDUPLICATE',
              requiresHumanReview: false,
            });
          }
        }
      }
    }

    // C. Section text alignment with findings
    if (sectionText && findings.length > 0) {
      const sectionStems = TopicRelevanceValidator.tokenizeAndStem(sectionText);
      const hasAnyFindingTerm = findings.some(f => {
        const obsStems = TopicRelevanceValidator.tokenizeAndStem(f.observation);
        let match = 0;
        obsStems.forEach(s => {
          if (s.length > 3 && sectionStems.has(s)) match++;
        });
        return match >= 2;
      });

      if (!hasAnyFindingTerm && sectionText.length > 200) {
        issues.push({
          findingId: `val_sec_finding_omitted_${section.heading.slice(0, 15).replace(/\s+/g, '_')}`,
          sectionId: findings[0]?.sectionId,
          dimension: 'EVIDENCE_GROUNDING',
          severity: 'WARNING',
          explanation: `Section "${secHeading}" does not appear to reflect its planned Worked Findings in the generated body text.`,
          evidenceOrTextLocation: sectionText.slice(0, 120),
          reason: 'Planned worked findings must be synthesized into the substantive section draft.',
          suggestedCorrectionCategory: 'ADD_EVIDENCE',
          requiresHumanReview: false,
        });
      }
    }

    return issues;
  }

  /**
   * Evaluates the entire article across all 8 dimensions.
   */
  public static validateArticle(
    article: {
      title: string;
      bodyMarkdown: string;
      outline: OutlineNode[];
      workedFindings?: WorkedFinding[];
    },
    evidenceSet?: EvidenceSet,
    practitionerContext?: VerifiedPractitionerContext | null,
    saasProfile?: SaaSProfile
  ): ExpertiseValidationResult {
    const findings: ValidationFinding[] = [];
    const outline = article.outline || [];
    const allFindings = article.workedFindings || outline.flatMap(n => n.workedFindings || []);

    // 1. Extract section texts from body markdown
    const sectionTexts = this.extractSectionTexts(article.bodyMarkdown, outline);

    // 2. Section and Finding Level Validation
    outline.forEach((node, idx) => {
      const text = sectionTexts[idx] || '';
      const secFindings = node.workedFindings && node.workedFindings.length > 0
        ? node.workedFindings
        : allFindings.filter(f => f.sectionId === `sec-${idx + 1}` || f.sectionId === node.heading || (outline.length === 1 && allFindings.length > 0));

      const nodeWithFindings: OutlineNode = {
        ...node,
        workedFindings: secFindings
      };

      const secIssues = this.validateSection(
        nodeWithFindings,
        text,
        outline,
        evidenceSet,
        practitionerContext,
        saasProfile
      );
      findings.push(...secIssues);
    });

    // 3. Article-Level Cross-Section Repetition Validation
    this.validateCrossSectionRepetition(article.bodyMarkdown, outline, sectionTexts, allFindings, findings);

    // 4. Article-Level Unsupported Business Impact Consistency
    this.validateArticleBusinessImpact(article.bodyMarkdown, allFindings, evidenceSet, practitionerContext, findings);

    // 5. Article-Level Client Confidentiality Leakage Check
    this.validateArticleConfidentiality(article.bodyMarkdown, practitionerContext, findings);

    // 6. Compute Dimension Scores & Final Decision
    return this.compileValidationResult(
      findings,
      allFindings.length,
      outline.length,
      article.bodyMarkdown.split(/\s+/).filter(Boolean).length
    );
  }

  // =========================================================================
  // SUB-VALIDATORS (DIMENSIONS 1 TO 8)
  // =========================================================================

  /**
   * Dimension 1: Evidence Grounding & Relevance
   */
  private static validateFindingEvidenceGrounding(
    finding: WorkedFinding,
    evidenceSet: EvidenceSet | undefined,
    practitionerContext: VerifiedPractitionerContext | null | undefined,
    issues: ValidationFinding[]
  ): void {
    const isFactual = finding.evidenceClassification === 'OBSERVED_FACT' || finding.evidenceClassification === 'EXTERNAL_SOURCE_FACT';
    const isPractitioner = finding.evidenceClassification === 'VERIFIED_PRACTITIONER_EXPERIENCE';

    // A. Missing references for factual claims
    if ((isFactual || isPractitioner) && finding.evidenceReferences.length === 0) {
      issues.push({
        findingId: `val_eg_missing_ref_${finding.findingId}`,
        sectionId: finding.sectionId,
        workedFindingId: finding.findingId,
        dimension: 'EVIDENCE_GROUNDING',
        severity: 'CRITICAL',
        explanation: `Factual finding "${finding.title}" declares ${finding.evidenceClassification} but provides zero evidence references.`,
        evidenceOrTextLocation: finding.observation,
        reason: 'Factual and practitioner findings must cite at least one traceable evidence item.',
        suggestedCorrectionCategory: 'ADD_EVIDENCE',
        requiresHumanReview: false,
      });
      return;
    }

    // B. Reference Resolution Check
    for (const ref of finding.evidenceReferences) {
      if (isPractitioner) {
        const matchesProject = (practitionerContext?.verifiedProjects || []).some(
          p => ref.includes(p.projectId) || ref.includes(p.anonymizedDescription)
        );
        const matchesPrinciple = (practitionerContext?.verifiedPrinciples || []).some(
          p => ref.includes(p.principleId) || ref.includes(p.statement)
        );
        const hasPractitionerTag = ref.includes('[PRACTITIONER EXPERIENCE]') || ref.startsWith('pe_') || ref.startsWith('practitioner:');

        if (!hasPractitionerTag) {
          issues.push({
            findingId: `val_eg_unauth_tag_${finding.findingId}`,
            sectionId: finding.sectionId,
            workedFindingId: finding.findingId,
            dimension: 'EVIDENCE_GROUNDING',
            severity: 'CRITICAL',
            explanation: `Practitioner finding "${finding.title}" cites reference "${ref}" without required [PRACTITIONER EXPERIENCE] authentication tag.`,
            evidenceOrTextLocation: ref,
            reason: 'Practitioner experience references must be explicitly tagged and authenticated.',
            suggestedCorrectionCategory: 'ADD_EVIDENCE',
            requiresHumanReview: false,
          });
        }

        if (practitionerContext && !matchesProject && !matchesPrinciple && !ref.includes('audit_log')) {
          issues.push({
            findingId: `val_eg_unresolved_prac_${finding.findingId}`,
            sectionId: finding.sectionId,
            workedFindingId: finding.findingId,
            dimension: 'EVIDENCE_GROUNDING',
            severity: 'CRITICAL',
            explanation: `Practitioner reference "${ref}" cannot be resolved against any verified project or design principle in the practitioner profile.`,
            evidenceOrTextLocation: ref,
            reason: 'Practitioner citations must resolve to verified and approved database records.',
            suggestedCorrectionCategory: 'SCRUB_CLIENT',
            requiresHumanReview: true,
          });
        }
      } else if (finding.evidenceClassification === 'EXTERNAL_SOURCE_FACT') {
        if (ref.includes('[PRACTITIONER EXPERIENCE]')) {
          issues.push({
            findingId: `val_eg_ext_cited_prac_${finding.findingId}`,
            sectionId: finding.sectionId,
            workedFindingId: finding.findingId,
            dimension: 'EVIDENCE_GROUNDING',
            severity: 'CRITICAL',
            explanation: `External source fact "${finding.title}" cites practitioner experience reference "${ref}".`,
            evidenceOrTextLocation: ref,
            reason: 'External facts cannot cite personal practitioner experience.',
            suggestedCorrectionCategory: 'ADD_EVIDENCE',
            requiresHumanReview: false,
          });
        }

        // If evidenceSet is provided, verify whether the item actually exists
        if (evidenceSet && evidenceSet.items.length > 0) {
          const matchedItem = evidenceSet.items.find(e => e.id === ref || ref.includes(e.id));
          if (!matchedItem && !ref.startsWith('ext_') && !ref.startsWith('http')) {
            issues.push({
              findingId: `val_eg_unresolved_ext_${finding.findingId}`,
              sectionId: finding.sectionId,
              workedFindingId: finding.findingId,
              dimension: 'EVIDENCE_GROUNDING',
              severity: 'WARNING',
              explanation: `Evidence reference "${ref}" does not match any item in the current research EvidenceSet.`,
              evidenceOrTextLocation: ref,
              reason: 'External citations must resolve to discovered research records.',
              suggestedCorrectionCategory: 'ADD_EVIDENCE',
              requiresHumanReview: true,
            });
          } else if (matchedItem) {
            // Check relevance: do observation and evidence claim share key topical stems?
            const obsStems = TopicRelevanceValidator.tokenizeAndStem(finding.observation);
            const claimStems = TopicRelevanceValidator.tokenizeAndStem(matchedItem.claim);
            let overlapCount = 0;
            obsStems.forEach(s => {
              if (claimStems.has(s)) overlapCount++;
            });

            if (overlapCount === 0) {
              issues.push({
                findingId: `val_eg_irrelevant_ev_${finding.findingId}`,
                sectionId: finding.sectionId,
                workedFindingId: finding.findingId,
                dimension: 'EVIDENCE_GROUNDING',
                severity: 'WARNING',
                explanation: `Referenced evidence claim ("${matchedItem.claim.slice(0, 60)}...") lacks semantic overlap with observation in "${finding.title}".`,
                evidenceOrTextLocation: matchedItem.claim,
                reason: 'Citing an existing evidence item is insufficient if the claim does not support the observation.',
                suggestedCorrectionCategory: 'ADD_EVIDENCE',
                requiresHumanReview: true,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Dimension 2: Expertise Specificity
   */
  private static validateFindingSpecificity(
    finding: WorkedFinding,
    issues: ValidationFinding[]
  ): void {
    const textToCheck = `${finding.observation} ${finding.recommendation}`;

    // Check for raw uncontextualized generic filler phrases
    let genericMatchesCount = 0;
    const detectedPatterns: string[] = [];
    for (const pattern of GENERIC_FILLER_PATTERNS) {
      if (pattern.test(textToCheck)) {
        detectedPatterns.push(pattern.source);
        genericMatchesCount++;
      }
    }

    if (genericMatchesCount > 0) {
      // Check if contextually qualified: does the finding also name specific interface/technical terms?
      const hasConcreteContext = /\b(?:form|modal|navigation|checkout|database|latency|cache|payload|api|endpoint|token|query|session|heuristic|component|viewport|css|javascript|sql|cart|button|field|input)\b/i.test(textToCheck);

      if (!hasConcreteContext) {
        const severity = genericMatchesCount >= 2 ? 'CRITICAL' : 'WARNING';
        issues.push({
          findingId: `val_spec_generic_${finding.findingId}`,
          sectionId: finding.sectionId,
          workedFindingId: finding.findingId,
          dimension: 'EXPERTISE_SPECIFICITY',
          severity,
          explanation: `Finding "${finding.title}" relies heavily on generic boilerplate (${genericMatchesCount} matching patterns: ${detectedPatterns.slice(0, 3).join(', ')}) without concrete technical or interface context.`,
          evidenceOrTextLocation: textToCheck.slice(0, 100),
          reason: 'High-expertise content must diagnose specific problems rather than restating generic business goals.',
          suggestedCorrectionCategory: 'SPECIFY_CONTEXT',
          requiresHumanReview: false,
        });
      }
    }
  }

  /**
   * Dimension 3: Reasoning Depth & Causal Linkage
   */
  private static validateFindingReasoningDepth(
    finding: WorkedFinding,
    issues: ValidationFinding[]
  ): void {
    // Check interpretation: must provide causal explanation
    const interp = finding.interpretation.trim();
    const hasCausalIndicator = /\b(?:because|due to|violates|causes|results in|when|leads to|introduces|suppresses|creates|forces|interrupts|triggers|compromises)\b/i.test(interp);

    if (!hasCausalIndicator && interp.length < 50) {
      issues.push({
        findingId: `val_reason_shallow_${finding.findingId}`,
        sectionId: finding.sectionId,
        workedFindingId: finding.findingId,
        dimension: 'REASONING_DEPTH',
        severity: 'WARNING',
        explanation: `Interpretation in finding "${finding.title}" lacks explicit causal reasoning explaining why the observation matters.`,
        evidenceOrTextLocation: interp,
        reason: 'Reasoning depth requires explaining the underlying mechanism or cognitive trade-off causing the symptom.',
        suggestedCorrectionCategory: 'DEEPEN_CAUSAL_REASONING',
        requiresHumanReview: false,
      });
    }

    // Check conclusion jump: observation states a problem, but recommendation is trivial or disjoint
    const obsLower = finding.observation.toLowerCase();
    const recLower = finding.recommendation.toLowerCase();
    if (obsLower.length > 50 && recLower.length < 25) {
      issues.push({
        findingId: `val_reason_jump_${finding.findingId}`,
        sectionId: finding.sectionId,
        workedFindingId: finding.findingId,
        dimension: 'REASONING_DEPTH',
        severity: 'SUGGESTION',
        explanation: `Recommendation in finding "${finding.title}" is disproportionately brief relative to the identified observation.`,
        evidenceOrTextLocation: finding.recommendation,
        reason: 'Substantive findings should provide detailed corrective guidance commensurate with the problem scale.',
        suggestedCorrectionCategory: 'CONCRETIZE_ACTION',
        requiresHumanReview: false,
      });
    }
  }

  /**
   * Dimension 4: Recommendation Quality & Actionability
   */
  private static validateFindingRecommendationQuality(
    finding: WorkedFinding,
    issues: ValidationFinding[]
  ): void {
    const rec = finding.recommendation;

    // A. Check for empty implementation patterns
    for (const pattern of EMPTY_IMPLEMENTATION_PATTERNS) {
      if (pattern.test(rec)) {
        issues.push({
          findingId: `val_rec_empty_${finding.findingId}`,
          sectionId: finding.sectionId,
          workedFindingId: finding.findingId,
          dimension: 'RECOMMENDATION_QUALITY',
          severity: 'WARNING',
          explanation: `Recommendation in finding "${finding.title}" uses empty advisory phrasing (${pattern.toString()}).`,
          evidenceOrTextLocation: rec,
          reason: 'Recommendations must prescribe concrete operational remediations rather than vague vigilance.',
          suggestedCorrectionCategory: 'CONCRETIZE_ACTION',
          requiresHumanReview: false,
        });
        break;
      }
    }

    // B. Check implementation steps for actionability
    const steps = finding.implementationSteps || [];
    if (steps.length === 0) {
      issues.push({
        findingId: `val_rec_no_steps_${finding.findingId}`,
        sectionId: finding.sectionId,
        workedFindingId: finding.findingId,
        dimension: 'RECOMMENDATION_QUALITY',
        severity: 'CRITICAL',
        explanation: `Finding "${finding.title}" has zero implementation steps.`,
        evidenceOrTextLocation: rec,
        reason: 'Every worked finding must provide sequenced implementation procedures.',
        suggestedCorrectionCategory: 'CONCRETIZE_ACTION',
        requiresHumanReview: false,
      });
    } else {
      const hasActionVerb = steps.some(step => {
        const firstWord = step.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\w]/g, '');
        return ACTIONABLE_VERBS.has(firstWord);
      });

      if (!hasActionVerb) {
        issues.push({
          findingId: `val_rec_no_verb_${finding.findingId}`,
          sectionId: finding.sectionId,
          workedFindingId: finding.findingId,
          dimension: 'RECOMMENDATION_QUALITY',
          severity: 'SUGGESTION',
          explanation: `Implementation steps in finding "${finding.title}" should lead with active operational verbs (e.g. Audit, Deploy, Refactor, Instrument).`,
          evidenceOrTextLocation: steps[0],
          reason: 'Active verbs improve clarity and procedural execution for engineering and design teams.',
          suggestedCorrectionCategory: 'CONCRETIZE_ACTION',
          requiresHumanReview: false,
        });
      }
    }
  }

  /**
   * Dimension 5: Business Impact Integrity
   */
  private static validateFindingBusinessImpact(
    finding: WorkedFinding,
    practitionerContext: VerifiedPractitionerContext | null | undefined,
    issues: ValidationFinding[]
  ): void {
    const impact = finding.businessImpact;

    // Check for bold commercial guarantees
    const hasAbsoluteCommercialGuarantee = /\b(?:guaranteed|100%\s+roi|guarantee\s+revenue|eliminate\s+all\s+churn|risk-free\s+growth)\b/i.test(impact);
    if (hasAbsoluteCommercialGuarantee) {
      issues.push({
        findingId: `val_bi_guarantee_${finding.findingId}`,
        sectionId: finding.sectionId,
        workedFindingId: finding.findingId,
        dimension: 'BUSINESS_IMPACT_INTEGRITY',
        severity: 'CRITICAL',
        explanation: `Finding "${finding.title}" promises ungrounded commercial guarantees in business impact statement.`,
        evidenceOrTextLocation: impact,
        reason: 'Absolute commercial guarantees violate ACUTE editorial integrity rules.',
        suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
        requiresHumanReview: false,
      });
    }

    // Check outcome claims: if historical outcome claimed ($ or % improvement achieved), provenance cannot be PROPOSED_TARGET or THEORETICAL_LIMIT
    const claimsAchievedMetric = /\b(?:recovered\s+\$[\d.]+[MBK]?|achieved\s+\d+(?:\.\d+)?%|generated\s+\$[\d.]+[MBK]?|delivered\s+\d+(?:\.\d+)?%\s*(?:lift|increase|reduction|improvement)?)/i.test(impact);
    if (claimsAchievedMetric) {
      if (finding.thresholdProvenance !== 'CLIENT_HISTORICAL' && finding.thresholdProvenance !== 'EMPIRICAL_BENCHMARK') {
        issues.push({
          findingId: `val_bi_misleading_achieved_${finding.findingId}`,
          sectionId: finding.sectionId,
          workedFindingId: finding.findingId,
          dimension: 'BUSINESS_IMPACT_INTEGRITY',
          severity: 'CRITICAL',
          explanation: `Finding "${finding.title}" claims an achieved outcome in business impact but declares provenance as "${finding.thresholdProvenance}".`,
          evidenceOrTextLocation: impact,
          reason: 'Achieved outcomes must be backed by verified client historical records or empirical benchmarks, not proposed targets.',
          suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
          requiresHumanReview: false,
        });
      }
    }

    // Check for disproportionate valuation or multi-million dollar equity claims
    const hasHyperbolicValuation = /\b(?:valuation|enterprise\s+value|market\s+cap(?:italization)?)\s+by\s+\$[\d,.]+|\$[\d,.]+\s*(?:million|billion|[MB])\s+(?:in\s+)?(?:valuation|pipeline|market\s+cap)\b/i.test(impact);
    if (hasHyperbolicValuation) {
      issues.push({
        findingId: `val_bi_hyperbolic_valuation_${finding.findingId}`,
        sectionId: finding.sectionId,
        workedFindingId: finding.findingId,
        dimension: 'BUSINESS_IMPACT_INTEGRITY',
        severity: 'WARNING',
        explanation: `Finding "${finding.title}" makes speculative, disproportionate valuation claims ("${impact.slice(0, 80)}...") for a tactical software intervention.`,
        evidenceOrTextLocation: impact,
        reason: 'Technical findings must not extrapolate tactical engineering remediations into multi-million dollar equity or enterprise valuation claims without audited financial evidence.',
        suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
        requiresHumanReview: true,
      });
    }
  }

  /**
   * Dimension 6: Practitioner Provenance & Voice Authenticity
   */
  private static validateFindingPractitionerProvenance(
    finding: WorkedFinding,
    practitionerContext: VerifiedPractitionerContext | null | undefined,
    issues: ValidationFinding[]
  ): void {
    const isPrac = finding.evidenceClassification === 'VERIFIED_PRACTITIONER_EXPERIENCE';

    if (isPrac) {
      // Must have active, verified practitioner context
      if (!practitionerContext) {
        issues.push({
          findingId: `val_pp_no_context_${finding.findingId}`,
          sectionId: finding.sectionId,
          workedFindingId: finding.findingId,
          dimension: 'PRACTITIONER_PROVENANCE',
          severity: 'CRITICAL',
          explanation: `Finding "${finding.title}" claims VERIFIED_PRACTITIONER_EXPERIENCE when no verified practitioner profile exists.`,
          evidenceOrTextLocation: finding.observation,
          reason: 'Practitioner experience cannot be manufactured or inferred without verified profile data.',
          suggestedCorrectionCategory: 'SCRUB_CLIENT',
          requiresHumanReview: false,
        });
      }

      // Check first person voice restriction
      if (practitionerContext && !practitionerContext.firstPersonVoiceAllowed) {
        const text = `${finding.observation} ${finding.recommendation}`;
        if (/\b(?:I\s+observed|in\s+my\s+practice|my\s+clients|we\s+audited|our\s+consultants)\b/i.test(text)) {
          issues.push({
            findingId: `val_pp_unauth_first_person_${finding.findingId}`,
            sectionId: finding.sectionId,
            workedFindingId: finding.findingId,
            dimension: 'PRACTITIONER_PROVENANCE',
            severity: 'CRITICAL',
            explanation: `Finding "${finding.title}" uses first-person practitioner voice ("I", "my clients", "our consultants") which is unauthorized for this profile.`,
            evidenceOrTextLocation: text.slice(0, 100),
            reason: 'Voice permissions fail-closed to third-person professional phrasing by default.',
            suggestedCorrectionCategory: 'SCRUB_CLIENT',
            requiresHumanReview: false,
          });
        }
      }
    }
  }

  /**
   * Dimension 7: Quantitative Claim & Threshold Defensibility
   */
  private static validateFindingQuantitativeIntegrity(
    finding: WorkedFinding,
    issues: ValidationFinding[]
  ): void {
    const fullText = `${finding.observation} ${finding.recommendation} ${finding.successCriteria}`;
    const metricMatches = fullText.match(/\b\d+(\.\d+)?%|\$\d+(\.\d+)?[MBK]?|\b\d+\s*(?:ms|seconds|minutes|hours|days|points|users|clicks)\b/gi);

    if (metricMatches && metricMatches.length > 0) {
      if (finding.thresholdProvenance === 'NOT_APPLICABLE') {
        issues.push({
          findingId: `val_quant_no_prov_${finding.findingId}`,
          sectionId: finding.sectionId,
          workedFindingId: finding.findingId,
          dimension: 'QUANTITATIVE_INTEGRITY',
          severity: 'CRITICAL',
          explanation: `Finding "${finding.title}" contains quantitative metric(s) (${metricMatches.join(', ')}) but thresholdProvenance is NOT_APPLICABLE.`,
          evidenceOrTextLocation: metricMatches[0],
          reason: 'Quantitative claims must declare traceable empirical, benchmark, or historical provenance.',
          suggestedCorrectionCategory: 'PROVIDE_PROVENANCE',
          requiresHumanReview: false,
        });
      }
    }
  }

  /**
   * Dimension 8: Repetition & Semantic Duplication Control
   */
  private static validateCrossSectionRepetition(
    markdown: string,
    outline: OutlineNode[],
    sectionTexts: string[],
    findings: WorkedFinding[],
    issues: ValidationFinding[]
  ): void {
    // Strip heading lines for pure body text analysis
    const cleanBodyText = markdown
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join('\n');

    // A. Check verbatim duplicate paragraphs in article body
    const paragraphs = cleanBodyText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20);
    const seenParagraphs = new Map<string, number>();
    for (const p of paragraphs) {
      const norm = p.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      if (norm.length > 20) {
        const count = (seenParagraphs.get(norm) || 0) + 1;
        seenParagraphs.set(norm, count);
        if (count === 2) {
          issues.push({
            findingId: `val_rep_art_dup_paragraph`,
            dimension: 'REPETITION_CONTROL',
            severity: 'CRITICAL',
            explanation: `Duplicate paragraph detected across sections in article text: "${p.slice(0, 100)}..."`,
            evidenceOrTextLocation: p.slice(0, 100),
            reason: 'Verbatim duplicate paragraphs across sections severely degrade editorial credibility.',
            suggestedCorrectionCategory: 'DEDUPLICATE',
            requiresHumanReview: false,
          });
        }
      }
    }

    // B. Check repeated consecutive sentence openings in article body
    const sentences = cleanBodyText.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.length > 15);
    for (let i = 0; i < sentences.length - 2; i++) {
      const words1 = sentences[i].split(/\s+/).slice(0, 4).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
      const words2 = sentences[i + 1].split(/\s+/).slice(0, 4).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
      const words3 = sentences[i + 2].split(/\s+/).slice(0, 4).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
      if (words1.length > 8 && words1 === words2 && words2 === words3) {
        issues.push({
          findingId: `val_rep_art_sentence_opening`,
          dimension: 'REPETITION_CONTROL',
          severity: 'WARNING',
          explanation: `Repeated sentence opening ("${words1}...") detected 3 consecutive times in article body.`,
          evidenceOrTextLocation: sentences[i].slice(0, 80),
          reason: 'Monotonous repetitive sentence openings indicate low-quality automated drafting.',
          suggestedCorrectionCategory: 'DEDUPLICATE',
          requiresHumanReview: false,
        });
        break;
      }
    }

    // C. Check cross-section recommendation duplication
    if (findings.length <= 1) return;

    for (let i = 0; i < findings.length; i++) {
      for (let j = i + 1; j < findings.length; j++) {
        const f1 = findings[i];
        const f2 = findings[j];
        if (f1.sectionId === f2.sectionId) continue; // Intra-section already covered

        // Check recommendation duplication across sections
        const recSim = this.calculateTokenSimilarity(f1.recommendation, f2.recommendation);
        if (recSim > 0.80) {
          issues.push({
            findingId: `val_rep_rec_${f1.findingId}_${f2.findingId}`,
            sectionId: f2.sectionId,
            workedFindingId: f2.findingId,
            dimension: 'REPETITION_CONTROL',
            severity: 'WARNING',
            explanation: `Cross-section recommendation duplication (${Math.round(recSim * 100)}% similarity) between finding "${f1.title}" and "${f2.title}".`,
            evidenceOrTextLocation: f2.recommendation.slice(0, 100),
            reason: 'Recommendations should not be recycled across distinct article sections.',
            suggestedCorrectionCategory: 'DEDUPLICATE',
            requiresHumanReview: false,
          });
        }
      }
    }
  }

  /**
   * Article-Level Business Impact Claims Check
   */
  private static validateArticleBusinessImpact(
    markdown: string,
    findings: WorkedFinding[],
    evidenceSet: EvidenceSet | undefined,
    practitionerContext: VerifiedPractitionerContext | null | undefined,
    issues: ValidationFinding[]
  ): void {
    const ungroundedStatMatch = markdown.match(/\b(?:guaranteed\s+(?:\d+%\s+)?(?:revenue|growth|lift)|double\s+your\s+(?:revenue|conversions))\b/gi);
    if (ungroundedStatMatch) {
      issues.push({
        findingId: `val_art_ungrounded_stat`,
        dimension: 'BUSINESS_IMPACT_INTEGRITY',
        severity: 'CRITICAL',
        explanation: `Article body contains ungrounded absolute commercial claims: "${ungroundedStatMatch.join(', ')}".`,
        evidenceOrTextLocation: ungroundedStatMatch[0],
        reason: 'Commercial guarantees without empirical backing violate editorial integrity.',
        suggestedCorrectionCategory: 'QUALIFY_OUTCOME',
        requiresHumanReview: false,
      });
    }
  }

  /**
   * Article-Level Client Confidentiality Check
   */
  private static validateArticleConfidentiality(
    markdown: string,
    practitionerContext: VerifiedPractitionerContext | null | undefined,
    issues: ValidationFinding[]
  ): void {
    const leakedMarker = markdown.match(/\b(?:Secret Client Corp|Confidential Client|Acme Corp)\b/i);
    if (leakedMarker) {
      issues.push({
        findingId: `val_art_client_leak`,
        dimension: 'PRACTITIONER_PROVENANCE',
        severity: 'CRITICAL',
        explanation: `Unscrubbed confidential client marker detected in article body: "${leakedMarker[0]}".`,
        evidenceOrTextLocation: leakedMarker[0],
        reason: 'Client confidentiality markers must be sanitized prior to publication.',
        suggestedCorrectionCategory: 'SCRUB_CLIENT',
        requiresHumanReview: false,
      });
    }
  }

  // =========================================================================
  // HELPER UTILITIES & COMPILATION
  // =========================================================================

  private static calculateTokenSimilarity(textA: string, textB: string): number {
    const tokensA = new Set(textA.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 3));
    const tokensB = new Set(textB.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 3));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    tokensA.forEach(t => {
      if (tokensB.has(t)) intersection++;
    });

    const union = new Set([...tokensA, ...tokensB]).size;
    return union > 0 ? intersection / union : 0;
  }

  private static extractSectionTexts(markdown: string, outline: OutlineNode[]): string[] {
    const texts: string[] = [];
    const lines = markdown.split('\n');
    let currentText: string[] = [];
    let insideHeading = false;

    for (const line of lines) {
      if (line.trim().startsWith('## ') || line.trim().startsWith('### ')) {
        if (insideHeading) {
          texts.push(currentText.join('\n').trim());
          currentText = [];
        }
        insideHeading = true;
      } else if (insideHeading) {
        currentText.push(line);
      }
    }
    if (currentText.length > 0) {
      texts.push(currentText.join('\n').trim());
    }

    while (texts.length < outline.length) {
      texts.push('');
    }
    return texts;
  }

  private static compileValidationResult(
    findings: ValidationFinding[],
    findingCount: number,
    sectionCount: number,
    wordCount: number
  ): ExpertiseValidationResult {
    const dimensions: ValidationDimension[] = [
      'EVIDENCE_GROUNDING',
      'EXPERTISE_SPECIFICITY',
      'REASONING_DEPTH',
      'RECOMMENDATION_QUALITY',
      'REPETITION_CONTROL',
      'BUSINESS_IMPACT_INTEGRITY',
      'PRACTITIONER_PROVENANCE',
      'QUANTITATIVE_INTEGRITY'
    ];

    const dimensionScores: Record<ValidationDimension, DimensionScore> = {} as any;
    let weightedScoreSum = 0;
    let totalCritical = 0;
    let totalWarnings = 0;

    for (const dim of dimensions) {
      const dimFindings = findings.filter(f => f.dimension === dim);
      const critCount = dimFindings.filter(f => f.severity === 'CRITICAL').length;
      const warnCount = dimFindings.filter(f => f.severity === 'WARNING').length;
      const suggCount = dimFindings.filter(f => f.severity === 'SUGGESTION').length;

      totalCritical += critCount;
      totalWarnings += warnCount;

      // Base score 100 with deduction rubric
      let score = 100 - (critCount * 40) - (warnCount * 12) - (suggCount * 4);
      score = Math.max(0, Math.min(100, score));

      const weight = DIMENSION_WEIGHTS[dim];
      weightedScoreSum += score * weight;

      dimensionScores[dim] = {
        dimension: dim,
        score,
        weight,
        passed: critCount === 0 && warnCount <= 1,
        criticalCount: critCount,
        warningCount: warnCount,
        rubricSummary: critCount > 0
          ? `${critCount} critical failure(s) detected in ${dim}.`
          : (warnCount > 0 ? `${warnCount} warning(s) detected in ${dim}.` : `All checks passed for ${dim}.`),
      };
    }

    const aggregateScore = Math.round(weightedScoreSum);

    // Decision Logic:
    let decision: ValidationDecision;
    const hasFatalSecurityFailure = findings.some(
      f => f.severity === 'CRITICAL' && (f.dimension === 'PRACTITIONER_PROVENANCE' || f.dimension === 'EVIDENCE_GROUNDING' || f.dimension === 'QUANTITATIVE_INTEGRITY')
    );

    const hasAnyDimBelow60 = Object.values(dimensionScores).some(d => d.score < 60);
    const hasHumanReviewRequirement = findings.some(f => f.requiresHumanReview);

    if (hasFatalSecurityFailure || aggregateScore < 60) {
      decision = 'REJECT';
    } else if (totalCritical > 0 || hasHumanReviewRequirement || totalWarnings >= 3 || aggregateScore < 75 || hasAnyDimBelow60) {
      decision = 'REVIEW_REQUIRED';
    } else if (totalWarnings > 0 || aggregateScore < 85) {
      decision = 'PASS_WITH_WARNINGS';
    } else {
      decision = 'PASS';
    }

    const deterministicSummary = `Expertise & Genericity Validation Decision: ${decision} (Score: ${aggregateScore}/100, Critical: ${totalCritical}, Warnings: ${totalWarnings}, Evaluated Findings: ${findingCount}, Sections: ${sectionCount})`;

    return ExpertiseValidationResultSchema.parse({
      decision,
      aggregateScore,
      passed: decision === 'PASS' || decision === 'PASS_WITH_WARNINGS',
      dimensionScores,
      findings,
      criticalViolationsCount: totalCritical,
      warningsCount: totalWarnings,
      evaluatedFindingCount: findingCount,
      evaluatedSectionCount: sectionCount,
      evaluatedArticleWordCount: wordCount,
      deterministicSummary,
      timestamp: new Date().toISOString(),
    });
  }
}
