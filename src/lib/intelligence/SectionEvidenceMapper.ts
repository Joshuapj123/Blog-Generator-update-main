// src/lib/intelligence/SectionEvidenceMapper.ts
import {
  EvidenceItem,
  EvidenceSet,
  ContentGapMatrix,
  SectionEvidenceMap,
  SectionIntent
} from '@/core/contracts/evidence';
import { SaaSProfile } from '@/core/contracts/schemas';
import {
  TopicRelevanceValidator,
  GENERIC_METRIC_STEMS,
  GENERIC_MODIFIER_STEMS,
  UNIVERSAL_FACET_STEMS
} from './TopicRelevanceValidator';

export class SectionEvidenceMapper {
  /**
   * Deterministically evaluates the substantive topical relevance of an evidence item
   * to a specific outline section.
   */
  public static evaluateEvidenceRelevance(
    ev: EvidenceItem,
    section: { heading: string; core_concept?: string; assignedKeywords?: string[]; assignedEntities?: string[] },
    targetKeyword?: string,
    brandName?: string,
    isBrandSection?: boolean
  ): { isMatch: boolean; score: number; reason?: string } {
    const claimLower = (ev.claim || '').toLowerCase();
    const topicsLower = (ev.topics || []).map(t => t.toLowerCase()).join(' ');
    const combinedEvText = `${claimLower} ${topicsLower}`;

    const headingLower = section.heading.toLowerCase();
    const effectiveKw = (targetKeyword || '').toLowerCase();

    // 1. Vector A: Staffing, HR, and Developer Retention Drift
    const isStaffingClaim = /\b(developer retention|talent retention|employee retention|recruiting|hiring developers|staffing models?|engineer burnout|salary|compensation)\b/i.test(combinedEvText);
    const isStaffingDomain = TopicRelevanceValidator.isStaffingDomainTopic(section.heading) || TopicRelevanceValidator.isStaffingDomainTopic(effectiveKw);
    if (isStaffingClaim && !isStaffingDomain) {
      return { isMatch: false, score: 0, reason: 'Staffing/HR evidence is off-topic for this section' };
    }

    // 2. Vector B: Meta-SEO and AI Search Engine Crawler Drift
    const isMetaSeoClaim = /\b(search crawler|llm indexing|perplexity visibility|schema markup|schema\.org|structured data for search)\b/i.test(combinedEvText);
    const isSeoDomain = TopicRelevanceValidator.isSeoDomainTopic(section.heading) || TopicRelevanceValidator.isSeoDomainTopic(effectiveKw);
    if (isMetaSeoClaim && !isSeoDomain) {
      return { isMatch: false, score: 0, reason: 'Meta-SEO evidence is off-topic for non-SEO section' };
    }

    // 3. Vector D: Hardware / Device Repair Drift
    const isHardwareClaim = /\b(hardware repair|screen replacement|battery replacement|soldering)\b/i.test(combinedEvText);
    const isHardwareDomain = /\b(hardware|repair|device repair)\b/i.test(headingLower) || /\b(hardware|repair|device repair)\b/i.test(effectiveKw);
    if (isHardwareClaim && !isHardwareDomain) {
      return { isMatch: false, score: 0, reason: 'Hardware repair evidence is off-topic for digital/software section' };
    }

    // 4. Extract Section Stems
    const headingStems = TopicRelevanceValidator.tokenizeAndStem(section.heading);
    const conceptStems = section.core_concept ? TopicRelevanceValidator.tokenizeAndStem(section.core_concept) : new Set<string>();
    const kwStems = new Set<string>();
    (section.assignedKeywords || []).forEach(k => {
      TopicRelevanceValidator.tokenizeAndStem(k).forEach(s => kwStems.add(s));
    });

    const allSectionStems = new Set([...headingStems, ...conceptStems, ...kwStems]);

    // Substantive section stems exclude generic metrics, generic modifiers, and universal facets
    const substantiveSectionStems = new Set(
      Array.from(allSectionStems).filter(s => !GENERIC_METRIC_STEMS.has(s) && !GENERIC_MODIFIER_STEMS.has(s) && !UNIVERSAL_FACET_STEMS.has(s))
    );

    // If section consists entirely of generic/facet terms, fallback to non-metric heading stems
    const effectiveSubstantiveStems = substantiveSectionStems.size > 0
      ? substantiveSectionStems
      : new Set(Array.from(headingStems).filter(s => !GENERIC_METRIC_STEMS.has(s)));

    // 5. Extract Evidence Stems
    const claimStems = TopicRelevanceValidator.tokenizeAndStem(ev.claim);
    const topicStems = new Set<string>();
    (ev.topics || []).forEach(t => TopicRelevanceValidator.tokenizeAndStem(t).forEach(s => topicStems.add(s)));
    const supportsStems = new Set<string>();
    (ev.supports || []).forEach(s => TopicRelevanceValidator.tokenizeAndStem(s).forEach(st => supportsStems.add(st)));

    const allEvStems = new Set([...claimStems, ...topicStems, ...supportsStems]);

    // 6. Generic Brand Business Fact Isolation
    const isTargetBrandEvidence = ev.sourceType === 'TARGET_SITE' || ev.evidenceType === 'BUSINESS_FACT';
    if (isTargetBrandEvidence && !isBrandSection) {
      // Must have substantive domain overlap to appear in non-brand educational section
      let hasDomainOverlap = false;
      for (const stem of claimStems) {
        if (effectiveSubstantiveStems.has(stem)) {
          hasDomainOverlap = true;
          break;
        }
      }
      if (!hasDomainOverlap) {
        return { isMatch: false, score: 0, reason: 'Generic brand business fact cannot be substituted into neutral educational section' };
      }
    }

    // 7. Check Shared Stems
    const sharedStems = new Set<string>();
    for (const stem of allSectionStems) {
      if (allEvStems.has(stem)) {
        sharedStems.add(stem);
      }
    }

    // If there is zero overlap across all stems
    if (sharedStems.size === 0) {
      // Check explicit entity match
      const hasEntityMatch = Boolean(
        ev.entities && section.assignedEntities &&
        ev.entities.some(e => section.assignedEntities!.some(se => se.toLowerCase() === e.toLowerCase()))
      );
      if (hasEntityMatch) {
        return { isMatch: true, score: 3 };
      }
      return { isMatch: false, score: 0 };
    }

    // Misleading Overlap Check: Are ALL shared stems merely generic metrics or generic modifiers?
    let hasSubstantiveSharedStem = false;
    for (const stem of sharedStems) {
      if (!GENERIC_METRIC_STEMS.has(stem) && !GENERIC_MODIFIER_STEMS.has(stem)) {
        hasSubstantiveSharedStem = true;
        break;
      }
    }

    if (!hasSubstantiveSharedStem) {
      return { isMatch: false, score: 0, reason: 'Shared stems are purely generic modifiers or metrics without substantive domain alignment' };
    }

    // 8. Calculate Substantive Relevance Score
    let score = 0;
    for (const stem of effectiveSubstantiveStems) {
      if (claimStems.has(stem)) score += 3;
      else if (topicStems.has(stem)) score += 2;
      else if (supportsStems.has(stem)) score += 2;
    }

    // Explicit entity alignment
    if (ev.entities && section.assignedEntities) {
      if (ev.entities.some(e => section.assignedEntities!.some(se => se.toLowerCase() === e.toLowerCase()))) {
        score += 3;
      }
    }

    // Explicit supports alignment with section heading
    if (ev.supports && ev.supports.some(s => s.toLowerCase() === headingLower || headingLower.includes(s.toLowerCase()))) {
      score += 4;
    }

    // High confidence boost
    if (ev.confidence === 'HIGH') {
      score += 1;
    }

    return {
      isMatch: score >= 3,
      score
    };
  }

  /**
   * Deterministically maps outline sections to evidence items, buyer questions,
   * competitor gaps, and claim boundaries.
   */
  public static mapSectionsToEvidence(
    outline: Array<{ heading: string; level: string; core_concept?: string; assignedKeywords?: string[]; assignedEntities?: string[] }>,
    evidenceSet: EvidenceSet,
    gapMatrix?: ContentGapMatrix,
    saasProfile?: SaaSProfile,
    targetKeyword?: string
  ): SectionEvidenceMap[] {
    const brandName = saasProfile?.name || 'Target Business';
    const allEvidence = evidenceSet?.items || [];
    const allGaps = (gapMatrix?.gaps || []).filter(g => g.isApprovedForOutline !== false);

    // Extract verified business facts across canonical types
    const verifiedBizFacts = allEvidence
      .filter(i => 
        i.evidenceType === 'BUSINESS_FACT' || 
        i.evidenceType === 'FEATURE' || 
        i.evidenceType === 'DIFFERENTIATOR' || 
        i.evidenceType === 'TECHNICAL_SPEC' ||
        i.sourceType === 'TARGET_SITE'
      )
      .map(i => i.claim);

    const maps: SectionEvidenceMap[] = [];
    const usedGapIds = new Set<string>();

    for (let i = 0; i < outline.length; i++) {
      const node = outline[i];
      const heading = node.heading;
      const normHeading = heading.toLowerCase().replace(/[^\w\s]/g, ' ');

      // 1. Determine Intent
      let intent: SectionIntent = 'RECOMMEND';
      if (/\b(?:vs|versus|compare|comparison|alternative|evaluat)\b/i.test(heading)) {
        intent = 'COMPARE';
      } else if (/\b(?:why|benefit|roi|impact|success|result|proof|case study)\b/i.test(heading)) {
        intent = 'PROVE';
      } else if (/\b(?:how|process|workflow|steps|lifecycle|architecture|architect|guide|implement)\b/i.test(heading)) {
        intent = 'EXPLAIN';
      } else if (/\b(?:what|faq|question|answer|criteria)\b/i.test(heading)) {
        intent = 'ANSWER';
      }

      // Determine if this section is brand-relevant
      const isBrandSection =
        normHeading.includes(brandName.toLowerCase()) ||
        Boolean(node.assignedEntities && node.assignedEntities.some(e => e.toLowerCase() === brandName.toLowerCase())) ||
        (Boolean(node.core_concept) && node.core_concept!.toLowerCase().includes(brandName.toLowerCase())) ||
        (i === outline.length - 1 && Boolean(saasProfile?.name)); // Closing takeaway section for explicit brand

      // Extract section stems for gap and business fact matching
      const headingStems = TopicRelevanceValidator.tokenizeAndStem(heading);
      const conceptStems = node.core_concept ? TopicRelevanceValidator.tokenizeAndStem(node.core_concept) : new Set<string>();
      const substantiveSectionStems = new Set(
        Array.from(new Set([...headingStems, ...conceptStems])).filter(
          s => !GENERIC_METRIC_STEMS.has(s) && !GENERIC_MODIFIER_STEMS.has(s) && !UNIVERSAL_FACET_STEMS.has(s)
        )
      );

      // 2. Select Relevant Evidence Items using Deterministic Substantive Evaluation
      const scoredEvidence: Array<{ ev: EvidenceItem; score: number }> = [];
      for (const ev of allEvidence) {
        const evalResult = this.evaluateEvidenceRelevance(ev, node, targetKeyword, brandName, isBrandSection);
        if (evalResult.isMatch) {
          scoredEvidence.push({ ev, score: evalResult.score });
        }
      }

      // Sort deterministically: score desc, HIGH confidence first, id asc (tie-breaker)
      scoredEvidence.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.ev.confidence === 'HIGH' && b.ev.confidence !== 'HIGH') return -1;
        if (b.ev.confidence === 'HIGH' && a.ev.confidence !== 'HIGH') return 1;
        return a.ev.id.localeCompare(b.ev.id);
      });

      // Up to 3 top matching evidence items (NO unconditional fallback to arbitrary unused evidence)
      const assignedEvidence = scoredEvidence.slice(0, 3).map(s => s.ev);
      const evidenceIds = assignedEvidence.map(e => e.id);
      const hasSubstantiveEvidence = evidenceIds.length > 0;

      // 3. Match Competitor Gap & Buyer Question Substantively
      let matchedGap = allGaps.find(g => {
        if (usedGapIds.has(g.id)) return false;
        const gapStems = TopicRelevanceValidator.tokenizeAndStem(g.topic);
        for (const s of gapStems) {
          if (substantiveSectionStems.has(s)) return true;
        }
        return false;
      });

      if (matchedGap) {
        usedGapIds.add(matchedGap.id);
      }

      const buyerQuestion = matchedGap?.buyerQuestion || 
        `What critical decisions should a technical leader make regarding ${heading}?`;
      
      const competitorGap = matchedGap
        ? (matchedGap.missingFromCompetitors
            ? `Most competitor content omits specific coverage of ${matchedGap.topic}.`
            : (matchedGap.businessOpportunity || 'Address practitioner workflows with concrete tactical detail.'))
        : 'Address practitioner workflows with concrete tactical detail.';

      // 4. Required Entities
      const requiredEntities = [
        ...(node.assignedEntities || []),
        ...(isBrandSection ? [brandName] : []),
      ].filter((v, idx, a) => v && a.indexOf(v) === idx);

      // 5. Section-Specific Target Business Facts (Only Substantively Matching Facts; No Arbitrary Modulo Injection)
      const targetBusinessFacts = isBrandSection
        ? verifiedBizFacts.filter(fact => {
            const factStems = TopicRelevanceValidator.tokenizeAndStem(fact);
            return Array.from(substantiveSectionStems).some(s => factStems.has(s)) ||
              assignedEvidence.some(e => e.claim === fact);
          })
        : verifiedBizFacts.filter(fact => {
            const factStems = TopicRelevanceValidator.tokenizeAndStem(fact);
            return Array.from(substantiveSectionStems).some(s => factStems.has(s));
          });

      // 6. Section-Specific Claim Constraints & Prohibited Claims
      const claimConstraints: string[] = [];
      if (hasSubstantiveEvidence) {
        claimConstraints.push(`Present verified evidence as factual statements regarding ${heading}.`);
      } else {
        claimConstraints.push('No empirical research evidence items are specifically assigned to this section. Provide objective, educational analysis and practical best practices grounded in the section topic without fabricating statistics or unverified studies.');
      }

      if (intent === 'COMPARE') {
        claimConstraints.push('Provide a structured comparison evaluating technical tradeoffs and delivery models.');
      } else if (intent === 'EXPLAIN') {
        claimConstraints.push('Explain technical execution workflows step-by-step with architecture-level clarity.');
      } else if (intent === 'PROVE') {
        claimConstraints.push('Provide concrete business impact and operational justification grounded in verified capabilities.');
      } else {
        claimConstraints.push('Address the assigned buyer question directly with tactical guidance.');
      }

      claimConstraints.push(`Directly answer the buyer question: "${buyerQuestion}".`);
      if (matchedGap) {
        claimConstraints.push(`Exploit competitor gap: ${matchedGap.topic}.`);
      } else {
        claimConstraints.push('Deliver concrete technical detail.');
      }

      const prohibitedClaims: string[] = [
        'Do NOT fabricate ungrounded statistics or performance percentages.',
        'Do NOT make unverified superiority claims ("unrivaled", "the single best in the world").',
        'Do NOT state inferences as externally verified facts.',
        'Do NOT repeat the exact primary keyword unnaturally or loop city + keyword phrases.',
      ];

      maps.push({
        sectionId: `sec_${i + 1}`,
        heading,
        intent,
        evidenceIds,
        requiredEntities,
        buyerQuestion,
        competitorGap,
        targetBusinessFacts,
        claimConstraints,
        prohibitedClaims,
        hasSubstantiveEvidence,
        unassignedReason: hasSubstantiveEvidence ? undefined : 'No research evidence items met the substantive relevance threshold for this section.'
      });
    }

    return maps;
  }
}
