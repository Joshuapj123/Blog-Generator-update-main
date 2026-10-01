// src/lib/intelligence/SectionEvidenceMapper.ts
import { 
  EvidenceItem, 
  EvidenceSet, 
  ContentGapMatrix, 
  SectionEvidenceMap, 
  SectionIntent 
} from '@/core/contracts/evidence';
import { SaaSProfile } from '@/core/contracts/schemas';

export class SectionEvidenceMapper {
  /**
   * Deterministically maps outline sections to evidence items, buyer questions,
   * competitor gaps, and claim boundaries.
   */
  public static mapSectionsToEvidence(
    outline: Array<{ heading: string; level: string; core_concept?: string; assignedKeywords?: string[]; assignedEntities?: string[] }>,
    evidenceSet: EvidenceSet,
    gapMatrix?: ContentGapMatrix,
    saasProfile?: SaaSProfile
  ): SectionEvidenceMap[] {
    const brandName = saasProfile?.name || 'Target Business';
    const allEvidence = evidenceSet?.items || [];
    const allGaps = gapMatrix?.gaps || [];

    // Extract all verified business facts across canonical types
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

      // 2. Select Relevant Evidence Items
      const headingTokens = new Set(
        normHeading.split(/\s+/).filter(t => t.length > 3 && !['with', 'from', 'your', 'this', 'that', 'software', 'development'].includes(t))
      );

      const assignedEvidence: EvidenceItem[] = [];
      for (const ev of allEvidence) {
        const normClaim = ev.claim.toLowerCase();
        let match = false;
        for (const t of headingTokens) {
          if (normClaim.includes(t)) {
            match = true;
            break;
          }
        }
        if (!match && ev.entities) {
          match = ev.entities.some(e => normHeading.includes(e.toLowerCase()));
        }
        if (match) {
          assignedEvidence.push(ev);
        }
      }

      // If fewer than 2 evidence items matched specifically, allocate general business/research facts
      if (assignedEvidence.length < 2 && allEvidence.length > 0) {
        const fallbackItems = allEvidence.filter(e => !assignedEvidence.some(a => a.id === e.id));
        assignedEvidence.push(...fallbackItems.slice(0, 2 - assignedEvidence.length));
      }

      const evidenceIds = assignedEvidence.map(e => e.id);

      // 3. Match Competitor Gap & Buyer Question
      let matchedGap = allGaps.find(g => !usedGapIds.has(g.id) && Array.from(headingTokens).some(t => g.topic.toLowerCase().includes(t)));
      if (!matchedGap) {
        matchedGap = allGaps.find(g => !usedGapIds.has(g.id));
      }
      if (matchedGap) {
        usedGapIds.add(matchedGap.id);
      }

      const buyerQuestion = matchedGap?.buyerQuestion || 
        `What critical decisions should a technical leader make regarding ${heading}?`;
      
      const competitorGap = matchedGap?.missingFromCompetitors
        ? `Most competitor content omits specific coverage of ${matchedGap.topic}.`
        : (matchedGap?.businessOpportunity || 'Address practitioner workflows with concrete tactical detail.');

      // 4. Required Entities
      const requiredEntities = [
        ...(node.assignedEntities || []),
        brandName,
      ].filter((v, idx, a) => v && a.indexOf(v) === idx);

      // 5. Section-Specific Target Business Facts
      const targetBusinessFacts = verifiedBizFacts.filter(fact => {
        const normFact = fact.toLowerCase();
        return Array.from(headingTokens).some(t => normFact.includes(t)) || 
          assignedEvidence.some(e => e.claim === fact);
      });
      if (targetBusinessFacts.length === 0 && verifiedBizFacts.length > 0) {
        targetBusinessFacts.push(verifiedBizFacts[i % verifiedBizFacts.length]);
      }

      // 6. Section-Specific Claim Constraints & Prohibited Claims
      const claimConstraints: string[] = [
        `Present verified evidence as factual statements regarding ${heading}.`,
        intent === 'COMPARE'
          ? 'Provide a structured comparison evaluating technical tradeoffs and delivery models.'
          : intent === 'EXPLAIN'
          ? 'Explain technical execution workflows step-by-step with architecture-level clarity.'
          : intent === 'PROVE'
          ? 'Provide concrete business impact and operational justification grounded in verified capabilities.'
          : 'Address the assigned buyer question directly with tactical guidance.',
        `Directly answer the buyer question: "${buyerQuestion}".`,
        matchedGap ? `Exploit competitor gap: ${matchedGap.topic}.` : 'Deliver concrete technical detail.',
      ];

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
      });
    }

    return maps;
  }
}
