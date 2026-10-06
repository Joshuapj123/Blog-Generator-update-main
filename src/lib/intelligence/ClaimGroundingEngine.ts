// src/lib/intelligence/ClaimGroundingEngine.ts
import {
  CanonicalClaim,
  ClaimGroundingDiagnostics,
  ClaimSupportStatus,
  EvidenceItem,
  EvidenceSet,
  SectionEvidenceMap,
  QuantitativeValue,
} from '@/core/contracts/evidence';
import { ClaimExtractionService } from './ClaimExtractionService';

export interface GroundingResult {
  claims: CanonicalClaim[];
  diagnostics: ClaimGroundingDiagnostics;
}

export class ClaimGroundingEngine {
  private static NEGATION_PATTERNS = [
    /\b(?:does\s+not|doesn't|do\s+not|don't|did\s+not|didn't)\s+(?:provide|deliver|offer|feature|include|support|guarantee)\b/i,
    /\b(?:fails?\s+to|failed\s+to|failing\s+to)\s+(?:provide|deliver|offer|feature|include|support)\b/i,
    /\b(?:never|lacks?|lacking|unable\s+to|cannot|can't)\s+(?:provide|deliver|offer|feature|include|support)\b/i,
    /\b(?:is\s+not|isn't|are\s+not|aren't)\s+(?:available|provided|offered|capable|present|supported)\b/i,
    /\bno\s+longer\s+(?:provides|delivers|offers|supports)\b/i,
    /\bwithout\s+(?:support\s+for|providing|offering)\b/i,
  ];

  private static GENERIC_STOPWORDS = new Set([
    'software', 'platform', 'service', 'services', 'business', 'company',
    'solutions', 'solution', 'provides', 'delivers', 'verified', 'capability',
    'enterprise', 'features', 'feature', 'system', 'tool', 'product',
    'without', 'within', 'across', 'between', 'during', 'through', 'about',
    'their', 'there', 'which', 'where', 'while', 'after', 'before', 'other',
    'these', 'those', 'being', 'having', 'into', 'from', 'with', 'that', 'this',
    'the', 'and', 'for', 'are', 'was', 'were', 'been', 'has', 'have', 'had',
    'does', 'did', 'will', 'would', 'can', 'could', 'should', 'shall', 'may',
    'might', 'must', 'they', 'them', 'its', 'our', 'your', 'his', 'her', 'also',
    'than', 'then', 'very', 'such', 'more', 'most', 'some', 'any', 'each', 'every',
    'both', 'all', 'under', 'over', 'per', 'via', 'not', 'following', 'reached', 'totaled', 'stands'
  ]);

  private static UNIT_DIMENSIONS: Set<string>[] = [
    new Set(['ms', 'milliseconds', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years']),
    new Set(['req/s', 'rps', 'tps', 'qps', 'gbps', 'mbps', 'tb', 'gb', 'mb', 'ghz', 'iops']),
    new Set(['$', '€', '£', 'usd', 'eur', 'gbp']),
    new Set(['%', 'percent']),
    new Set(['x', 'times', 'fold']),
    new Set(['users', 'clients', 'customers', 'engineers', 'developers', 'nodes', 'servers', 'clusters', 'pipelines', 'tenants', 'integrations']),
  ];

  private static areUnitsInSameDimension(u1?: string, u2?: string): boolean {
    if (!u1 || !u2) return false;
    const l1 = u1.toLowerCase();
    const l2 = u2.toLowerCase();
    return this.UNIT_DIMENSIONS.some(dim => dim.has(l1) && dim.has(l2));
  }

  private static LOCATION_TOKENS = new Set([
    'brasov', 'romania', 'europe', 'european', 'london', 'uk', 'us', 'usa',
    'america', 'american', 'global', 'worldwide', 'international', 'offshore',
    'nearshore', 'onshore', 'germany', 'berlin', 'france', 'paris'
  ]);

  private static SEMANTIC_EQUIVALENCE_MAP: Record<string, string> = {
    bespoke: 'custom',
    tailored: 'custom',
    specialized: 'custom',
    builds: 'develop',
    building: 'develop',
    built: 'develop',
    develops: 'develop',
    developing: 'develop',
    developed: 'develop',
    development: 'develop',
    creates: 'develop',
    creating: 'develop',
    created: 'develop',
    provides: 'deliver',
    providing: 'deliver',
    provided: 'deliver',
    delivers: 'deliver',
    delivering: 'deliver',
    delivered: 'deliver',
    offers: 'deliver',
    offering: 'deliver',
    offered: 'deliver',
    applications: 'app',
    application: 'app',
    apps: 'app',
    software: 'software',
    platforms: 'platform',
    platform: 'platform',
    developers: 'developer',
    engineers: 'developer',
    engineer: 'developer',
    teams: 'team',
    systems: 'system',
    solutions: 'solution',
    hourly: 'hour',
    hours: 'hour',
    hour: 'hour',
    charges: 'rate',
    charging: 'rate',
    charged: 'rate',
    charge: 'rate',
    rates: 'rate',
    rate: 'rate',
    pricing: 'rate',
    prices: 'rate',
    price: 'rate',
    cost: 'rate',
    costs: 'rate',
    fee: 'rate',
    fees: 'rate',
    funding: 'funding',
    funds: 'funding',
    funded: 'funding',
    backing: 'funding',
    backed: 'funding',
    investment: 'funding',
    invested: 'funding',
    valuation: 'funding',
    capital: 'funding',
    financing: 'funding',
    financed: 'funding',
    seed: 'seed',
    initial: 'seed',
    handles: 'process',
    handling: 'process',
    handled: 'process',
    handle: 'process',
    processes: 'process',
    processing: 'process',
    processed: 'process',
    process: 'process',
    gateway: 'pipeline',
    rollout: 'onboard',
    onboarding: 'onboard',
    period: 'duration',
    duration: 'duration',
    execute: 'run',
    executing: 'run',
    executed: 'run',
    runs: 'run',
    running: 'run',
    traditional: 'legacy',
    legacy: 'legacy',
    cycles: 'cycle',
    cycle: 'cycle',
    release: 'launch',
    releases: 'launch',
    released: 'launch',
    launch: 'launch',
    launches: 'launch',
    launched: 'launch',
  };

  private static normalizeToken(token: string): string {
    const t = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!t) return '';
    if (this.SEMANTIC_EQUIVALENCE_MAP[t]) {
      return this.SEMANTIC_EQUIVALENCE_MAP[t];
    }
    if (t.endsWith('s') && t.length > 4 && !t.endsWith('ss')) {
      const singular = t.slice(0, -1);
      if (this.SEMANTIC_EQUIVALENCE_MAP[singular]) {
        return this.SEMANTIC_EQUIVALENCE_MAP[singular];
      }
      return singular;
    }
    return t;
  }

  /**
   * Extracts substantive propositional tokens, explicitly excluding:
   * 1. Generic stopwords
   * 2. Target brand tokens
   * 3. Known competitor tokens
   * 4. Generic location tokens
   */
  public static getPropositionalTokens(
    text: string,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): string[] {
    const rawTokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !this.GENERIC_STOPWORDS.has(t));

    const brandTokens = new Set<string>();
    if (targetBrand) {
      targetBrand.toLowerCase().split(/\s+/).forEach(t => brandTokens.add(t));
    }
    knownCompetitors.forEach(c => {
      c.toLowerCase().split(/\s+/).forEach(t => brandTokens.add(t));
    });

    return rawTokens
      .filter(t => !brandTokens.has(t) && !this.LOCATION_TOKENS.has(t))
      .map(t => this.normalizeToken(t))
      .filter(t => t.length > 2);
  }

  /**
   * Resolves the specific competitor identity associated with an evidence item or claim text.
   */
  public static extractCompetitorIdentity(
    text: string,
    knownCompetitors: string[],
    ev?: EvidenceItem
  ): string | undefined {
    if (ev) {
      if (ev.sourceTitle) {
        const found = knownCompetitors.find(c => ev.sourceTitle!.toLowerCase().includes(c.toLowerCase()));
        if (found) return found;
      }
      if (ev.sourceUrl) {
        const found = knownCompetitors.find(c => ev.sourceUrl.toLowerCase().includes(c.toLowerCase()));
        if (found) return found;
      }
      if (ev.entities && ev.entities.length > 0) {
        const found = knownCompetitors.find(c => ev.entities!.some(e => e.toLowerCase() === c.toLowerCase()));
        if (found) return found;
      }
    }
    const textLower = text.toLowerCase();
    return knownCompetitors.find(c => textLower.includes(c.toLowerCase()));
  }

  /**
   * Validates whether a candidate evidence item is entity- and topic-compatible
   * with a quantitative claim before doing numerical comparisons. (Phase 4 / Defect 3)
   */
  private static isQuantitativeCandidateCompatible(
    claim: CanonicalClaim,
    ev: EvidenceItem,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): boolean {
    const sLower = claim.sentence.toLowerCase();
    const eLower = (ev.claim + ' ' + (ev.sourceTitle || '')).toLowerCase();

    // A. Attribution source compatibility
    if (claim.attributionSource) {
      const src = claim.attributionSource.toLowerCase();
      const evMatchesAttribution =
        (ev.sourceTitle && ev.sourceTitle.toLowerCase().includes(src)) ||
        (ev.sourceUrl && ev.sourceUrl.toLowerCase().includes(src)) ||
        (ev.entities && ev.entities.some(e => e.toLowerCase().includes(src))) ||
        ev.claim.toLowerCase().includes(src);

      if (!evMatchesAttribution) {
        return false;
      }
    }

    // B. Entity compatibility
    const claimComp = this.extractCompetitorIdentity(claim.sentence, knownCompetitors);
    const evComp = this.extractCompetitorIdentity(ev.claim, knownCompetitors, ev);
    if (claimComp && evComp && claimComp.toLowerCase() !== evComp.toLowerCase()) {
      return false;
    }
    const hasTargetMention = Boolean(targetBrand && sLower.includes(targetBrand.toLowerCase()));
    if (hasTargetMention && evComp && !claimComp) {
      return false;
    }

    // C. Topical / Predicate overlap check
    const claimPropTokens = this.getPropositionalTokens(sLower, targetBrand, knownCompetitors);
    const evPropTokens = new Set(this.getPropositionalTokens(eLower, targetBrand, knownCompetitors));

    if (claimPropTokens.length > 0) {
      const hasTopicOverlap = claimPropTokens.some(t => evPropTokens.has(t));
      if (!hasTopicOverlap) {
        return false;
      }
    }

    return true;
  }

  /**
   * Asymmetric Propositional Support Check (Phase 3 / Defect 2):
   * Ensures a quantitative claim is not piggybacking on a matching number while adding
   * unsupported propositional content.
   */
  private static validatePropositionalSupport(
    claim: CanonicalClaim,
    ev: EvidenceItem,
    allCandidates: EvidenceItem[] = [],
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): { valid: boolean; reason?: string } {
    const sLower = claim.sentence.toLowerCase();
    const eLower = ev.claim.toLowerCase();

    // Remove the quantitative text itself from propositional check
    let cleanedSentence = sLower;
    if (claim.quantitativeValue?.raw) {
      cleanedSentence = cleanedSentence.replace(claim.quantitativeValue.raw.toLowerCase(), ' ');
    }
    if (claim.quantitativeValue?.unit) {
      cleanedSentence = cleanedSentence.replace(new RegExp(`\\b${claim.quantitativeValue.unit}\\b`, 'gi'), ' ');
    }

    // In compound sentences, isolate the clause containing this metric to prevent cross-clause token pollution
    let targetSentence = cleanedSentence;
    const metricRaw = (claim.quantitativeValue?.raw || '').toLowerCase();
    const clauses = sLower.split(/[,;]|\b(?:and|but|with)\b/i);
    if (clauses.length > 1 && metricRaw) {
      const matchingClause = clauses.find(c => c.toLowerCase().includes(metricRaw));
      if (matchingClause && matchingClause.trim().length > 8) {
        let cleanedClause = matchingClause.toLowerCase();
        if (claim.quantitativeValue?.raw) {
          cleanedClause = cleanedClause.replace(claim.quantitativeValue.raw.toLowerCase(), ' ');
        }
        if (claim.quantitativeValue?.unit) {
          cleanedClause = cleanedClause.replace(new RegExp(`\\b${claim.quantitativeValue.unit}\\b`, 'gi'), ' ');
        }
        targetSentence = cleanedClause;
      }
    }

    let claimTokens = this.getPropositionalTokens(targetSentence, targetBrand, knownCompetitors);
    if (claimTokens.length === 0 && targetSentence !== cleanedSentence) {
      claimTokens = this.getPropositionalTokens(cleanedSentence, targetBrand, knownCompetitors);
    }
    if (claimTokens.length === 0) {
      return { valid: true };
    }

    const evTokens = new Set(this.getPropositionalTokens(eLower, targetBrand, knownCompetitors));
    const corpusTokens = new Set<string>();
    for (const item of allCandidates) {
      this.getPropositionalTokens(item.claim, targetBrand, knownCompetitors).forEach(tok => corpusTokens.add(tok));
    }

    const matchedTokens: string[] = [];
    const unsupportedTokens: string[] = [];

    for (const t of claimTokens) {
      if (evTokens.has(t) || corpusTokens.has(t)) {
        matchedTokens.push(t);
      } else {
        unsupportedTokens.push(t);
      }
    }

    const supportedRatio = matchedTokens.length / claimTokens.length;

    // Violation if multiple unsupported material tokens exist and supported ratio < 0.50
    if (unsupportedTokens.length >= 2 && supportedRatio < 0.5) {
      return {
        valid: false,
        reason: `Unsupported semantic extension: proposition introduces ungrounded concepts (${unsupportedTokens.slice(0, 3).join(', ')}) not supported by evidence (${ev.id}).`,
      };
    }

    return { valid: true };
  }

  /**
   * Grounds all claims against the provided EvidenceSet and SectionEvidenceMaps.
   */
  public static groundAllClaims(
    claims: CanonicalClaim[],
    evidenceSet?: EvidenceSet,
    sectionEvidenceMaps?: SectionEvidenceMap[],
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): GroundingResult {
    const groundedClaims: CanonicalClaim[] = [];
    let sectionGroundedCount = 0;
    let globalGroundedCount = 0;
    let entityLeakageCount = 0;
    let contradictionCount = 0;
    let unattributedStatCount = 0;

    const allItems = evidenceSet?.items || [];

    for (const claim of claims) {
      // Find section evidence map for this claim's section
      const secMap = sectionEvidenceMaps?.find(
        m => m.heading.toLowerCase().trim() === claim.sectionHeading.toLowerCase().trim()
      ) || (sectionEvidenceMaps && sectionEvidenceMaps[claim.sectionIndex]);

      const grounded = this.groundSingleClaim(
        claim,
        allItems,
        secMap,
        targetBrand,
        knownCompetitors
      );

      groundedClaims.push(grounded);

      if (grounded.supportStatus === 'CONTRADICTED') {
        contradictionCount++;
      } else if (grounded.supportStatus === 'SUPPORTED' || grounded.supportStatus === 'PARTIALLY_SUPPORTED') {
        if (secMap && secMap.evidenceIds.some(id => grounded.groundedEvidenceIds.includes(id))) {
          sectionGroundedCount++;
        } else {
          globalGroundedCount++;
        }
      }

      if (grounded.rejectionReason?.includes('Entity isolation violation')) {
        entityLeakageCount++;
      }
      if (grounded.rejectionReason?.includes('Unattributed external statistic')) {
        unattributedStatCount++;
      }
    }

    // Compute diagnostics
    const totalExtractedClaims = groundedClaims.length;
    const criticalClaims = groundedClaims.filter(c => c.materiality === 'CRITICAL').length;
    const importantClaims = groundedClaims.filter(c => c.materiality === 'IMPORTANT').length;
    const supplementalClaims = groundedClaims.filter(c => c.materiality === 'SUPPLEMENTAL').length;

    const supportedClaims = groundedClaims.filter(c => c.supportStatus === 'SUPPORTED').length;
    const partiallySupportedClaims = groundedClaims.filter(c => c.supportStatus === 'PARTIALLY_SUPPORTED').length;
    const unsupportedClaims = groundedClaims.filter(c => c.supportStatus === 'UNSUPPORTED').length;
    const contradictedClaims = groundedClaims.filter(c => c.supportStatus === 'CONTRADICTED').length;
    const overstatedClaims = groundedClaims.filter(c => c.supportStatus === 'OVERSTATED').length;
    const unverifiableClaims = groundedClaims.filter(c => c.supportStatus === 'UNVERIFIABLE').length;

    const totalGrounded = supportedClaims + partiallySupportedClaims;
    const groundingRate = totalExtractedClaims > 0
      ? Math.round((totalGrounded / totalExtractedClaims) * 100)
      : 100;

    const supportedCritical = groundedClaims.filter(
      c => c.materiality === 'CRITICAL' && (c.supportStatus === 'SUPPORTED' || c.supportStatus === 'PARTIALLY_SUPPORTED')
    ).length;

    const criticalGroundingRate = criticalClaims > 0
      ? Math.round((supportedCritical / criticalClaims) * 100)
      : 100;

    const sectionGroundedRatio = totalGrounded > 0
      ? parseFloat((sectionGroundedCount / totalGrounded).toFixed(2))
      : 1.0;

    const diagnostics: ClaimGroundingDiagnostics = {
      totalExtractedClaims,
      criticalClaims,
      importantClaims,
      supplementalClaims,
      supportedClaims,
      partiallySupportedClaims,
      unsupportedClaims,
      contradictedClaims,
      overstatedClaims,
      unverifiableClaims,
      groundingRate,
      criticalGroundingRate,
      contradictionCount,
      entityLeakageCount,
      unattributedStatCount,
      sectionGroundedRatio,
    };

    return { claims: groundedClaims, diagnostics };
  }

  /**
   * Grounds a single CanonicalClaim against the candidate evidence items.
   */
  public static groundSingleClaim(
    claim: CanonicalClaim,
    allEvidence: EvidenceItem[],
    secMap?: SectionEvidenceMap,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim {
    if (allEvidence.length === 0) {
      if (claim.materiality === 'SUPPLEMENTAL') {
        return {
          ...claim,
          supportStatus: 'PARTIALLY_SUPPORTED',
          rejectionReason: 'General domain knowledge (no explicit evidence item required).',
        };
      }
      return {
        ...claim,
        supportStatus: 'UNSUPPORTED',
        rejectionReason: 'No research evidence available.',
      };
    }

    // 1. Attribution check (Phase 5)
    if (claim.attributionSource) {
      const sourceMatch = allEvidence.find(ev => {
        const title = (ev.sourceTitle || '').toLowerCase();
        const url = (ev.sourceUrl || '').toLowerCase();
        const claimText = ev.claim.toLowerCase();
        const entities = (ev.entities || []).map(e => e.toLowerCase());
        const srcLower = claim.attributionSource!.toLowerCase();
        return title.includes(srcLower) || url.includes(srcLower) || claimText.includes(srcLower) || entities.includes(srcLower);
      });

      if (!sourceMatch) {
        return {
          ...claim,
          supportStatus: 'UNVERIFIABLE',
          rejectionReason: `Unattributed external statistic: source "${claim.attributionSource}" not found in verified research evidence.`,
        };
      }
    }

    // Order candidate items: section assigned evidence first, then global evidence
    const sectionCandidateIds = new Set(secMap?.evidenceIds || []);
    const candidateItems = [
      ...allEvidence.filter(e => sectionCandidateIds.has(e.id)),
      ...allEvidence.filter(e => !sectionCandidateIds.has(e.id)),
    ];

    // 2. Check for Contradictions first (Phase 9)
    for (const ev of candidateItems) {
      const contradiction = this.checkContradiction(claim, ev, targetBrand, knownCompetitors);
      if (contradiction) {
        return {
          ...claim,
          supportStatus: 'CONTRADICTED',
          contradictionEvidenceId: ev.id,
          rejectionReason: contradiction,
        };
      }
    }

    // 3. Quantitative Claim Grounding (Phase 4)
    if (claim.quantitativeValue && claim.quantitativeValue.normalizedNumber !== undefined) {
      const quantResult = this.groundQuantitativeClaim(
        claim,
        candidateItems,
        targetBrand,
        knownCompetitors
      );
      if (quantResult) {
        return quantResult;
      }
      return {
        ...claim,
        supportStatus: 'UNSUPPORTED',
        rejectionReason: 'Quantitative metric not supported by research evidence.',
      };
    }

    // 4. Qualitative / Capability / Fact Grounding (Phases 3, 6, 8)
    const qualitativeResult = this.groundQualitativeClaim(
      claim,
      candidateItems,
      targetBrand,
      knownCompetitors
    );
    if (qualitativeResult) {
      return qualitativeResult;
    }

    // If supplemental general fact without entity mention, allow PARTIALLY_SUPPORTED
    const sLower = claim.sentence.toLowerCase();
    const hasEntity = Boolean(
      (targetBrand && sLower.includes(targetBrand.toLowerCase())) ||
      knownCompetitors.some(c => sLower.includes(c.toLowerCase())) ||
      claim.subjectEntity ||
      claim.attributionSource
    );
    if (claim.materiality === 'SUPPLEMENTAL' && !hasEntity) {
      return {
        ...claim,
        supportStatus: 'PARTIALLY_SUPPORTED',
        rejectionReason: 'General industry background fact.',
      };
    }

    return {
      ...claim,
      supportStatus: 'UNSUPPORTED',
      rejectionReason: 'No supporting evidence found matching claim assertions.',
    };
  }

  /**
   * Evaluates if a claim directly contradicts an evidence item.
   */
  private static checkContradiction(
    claim: CanonicalClaim,
    ev: EvidenceItem,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): string | null {
    const sentenceLower = claim.sentence.toLowerCase();
    const evClaimLower = ev.claim.toLowerCase();

    // Check entity alignment: do they refer to the same subject?
    const isSameEntity = this.isEntityAligned(claim, ev, targetBrand, knownCompetitors);
    if (!isSameEntity) return null;

    // A. Direct Negation Contradiction
    // Evidence affirms capability, article sentence negates it
    let hasNegationInArticle = false;
    for (const pat of this.NEGATION_PATTERNS) {
      if (pat.test(sentenceLower)) {
        hasNegationInArticle = true;
        break;
      }
    }

    let hasNegationInEvidence = false;
    for (const pat of this.NEGATION_PATTERNS) {
      if (pat.test(evClaimLower)) {
        hasNegationInEvidence = true;
        break;
      }
    }

    if (hasNegationInArticle && !hasNegationInEvidence) {
      // Check if they share distinctive domain tokens
      const overlapTokens = this.getDistinctiveTokens(evClaimLower).filter(t => sentenceLower.includes(t));
      if (overlapTokens.length >= 2) {
        return `Contradiction detected: article negates capability affirmed in evidence (${ev.id}): "${ev.claim}"`;
      }
    }

    // B. Temporal Contradiction (e.g. "founded in 2018" vs "founded in 2012")
    if (claim.temporalAnchor) {
      const evTemporalMatch = evClaimLower.match(/\b(19\d\d|20\d\d)\b/);
      if (evTemporalMatch && evTemporalMatch[1] !== claim.temporalAnchor) {
        // If both discuss founding/launch/release
        const temporalKeywords = ['founded', 'established', 'launched', 'started', 'created', 'born'];
        const bothDiscussTemporal = temporalKeywords.some(k => sentenceLower.includes(k) && evClaimLower.includes(k));
        if (bothDiscussTemporal) {
          return `Temporal contradiction: article asserts year ${claim.temporalAnchor} but evidence (${ev.id}) proves year ${evTemporalMatch[1]}.`;
        }
      }
    }

    // C. Numeric Contradiction & Unit Mismatches
    if (claim.quantitativeValue && claim.quantitativeValue.normalizedNumber !== undefined) {
      const evQuants = ClaimExtractionService.parseQuantitativeValues(ev.claim);
      for (const eq of evQuants) {
        if (eq.normalizedNumber === undefined) continue;

        // Unit mismatch on same dimension: e.g. 50 ms vs 50 seconds
        if (
          claim.quantitativeValue.unit &&
          eq.unit &&
          claim.quantitativeValue.unit !== eq.unit &&
          this.areUnitsInSameDimension(claim.quantitativeValue.unit, eq.unit)
        ) {
          const overlap = this.getDistinctiveTokens(evClaimLower).filter(t => sentenceLower.includes(t));
          if (overlap.length >= 2) {
            return `Unit contradiction: claim specifies ${claim.quantitativeValue.unit} but evidence (${ev.id}) specifies ${eq.unit}.`;
          }
        }

        // If evidence is a range and claim is within that range, it is not a contradiction
        if (eq.operator === 'RANGE' && eq.rangeMin !== undefined && eq.rangeMax !== undefined) {
          if (claim.quantitativeValue.normalizedNumber >= eq.rangeMin && claim.quantitativeValue.normalizedNumber <= eq.rangeMax) {
            continue;
          }
        }

        // Numeric disparity on same unit
        if (
          (!claim.quantitativeValue.unit && !eq.unit) ||
          (claim.quantitativeValue.unit && eq.unit && claim.quantitativeValue.unit === eq.unit)
        ) {
          const claimNum = claim.quantitativeValue.normalizedNumber;
          const evNum = eq.normalizedNumber;

          // Disparity > 50%
          if (evNum > 0 && Math.abs(claimNum - evNum) / evNum > 0.5) {
            const claimPropTokens = this.getPropositionalTokens(sentenceLower, targetBrand, knownCompetitors);
            const evPropTokens = new Set(this.getPropositionalTokens(evClaimLower, targetBrand, knownCompetitors));
            const hasTopicOverlap = claimPropTokens.some(t => evPropTokens.has(t));
            if (hasTopicOverlap) {
              return `Numeric contradiction: article asserts ${claimNum} ${claim.quantitativeValue.unit || ''} but evidence (${ev.id}) states ${evNum} ${eq.unit || ''}.`;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Grounds quantitative claims against evidence.
   */
  private static groundQuantitativeClaim(
    claim: CanonicalClaim,
    candidates: EvidenceItem[],
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim | null {
    const qv = claim.quantitativeValue!;
    const claimNum = qv.normalizedNumber!;
    const claimUnit = qv.unit;
    const tolerance = qv.tolerance ?? 0.05;

    for (const ev of candidates) {
      // 1. Entity isolation check (Phase 6)
      const entityCheck = this.validateEntityIsolation(claim, ev, targetBrand, knownCompetitors);
      if (!entityCheck.valid) {
        if (entityCheck.leakage) {
          const evQuants = ClaimExtractionService.parseQuantitativeValues(ev.claim);
          const hasMatchingMetric = evQuants.some(eq =>
            eq.normalizedNumber !== undefined &&
            claimNum !== undefined &&
            Math.abs(claimNum - eq.normalizedNumber) / (eq.normalizedNumber || 1) <= tolerance
          );
          if (hasMatchingMetric) {
            return {
              ...claim,
              supportStatus: 'UNSUPPORTED',
              rejectionReason: entityCheck.reason,
            };
          }
        }
        continue;
      }

      // 2. Entity / Attribution / Topic compatibility check (Phase 4 / Defect 3)
      if (!this.isQuantitativeCandidateCompatible(claim, ev, targetBrand, knownCompetitors)) {
        continue;
      }

      // Check if evidence mentions this metric
      const evQuants = ClaimExtractionService.parseQuantitativeValues(ev.claim);
      for (const eq of evQuants) {
        // Unit match check: units must strictly match
        if (claimUnit && eq.unit && claimUnit !== eq.unit) continue;
        if (claimUnit && !eq.unit) continue;
        if (!claimUnit && eq.unit) continue;

        // Range support: e.g. evidence is between 100 and 150
        if (eq.operator === 'RANGE' && eq.rangeMin !== undefined && eq.rangeMax !== undefined) {
          if (claimNum >= eq.rangeMin && claimNum <= eq.rangeMax) {
            const propCheck = this.validatePropositionalSupport(claim, ev, candidates, targetBrand, knownCompetitors);
            if (!propCheck.valid) {
              return {
                ...claim,
                supportStatus: 'UNSUPPORTED',
                rejectionReason: propCheck.reason,
              };
            }
            return {
              ...claim,
              supportStatus: 'SUPPORTED',
              groundedEvidenceIds: [ev.id],
            };
          }
        }

        if (eq.normalizedNumber !== undefined) {
          const evNum = eq.normalizedNumber;

          // Check operator constraints
          if (eq.operator === 'LTE' && (qv.operator === 'GT' || qv.operator === 'GTE')) {
            if (claimNum > evNum) {
              return {
                ...claim,
                supportStatus: 'OVERSTATED',
                contradictionEvidenceId: ev.id,
                rejectionReason: `Overstated claim: evidence (${ev.id}) states at most ${evNum} but claim asserts over ${claimNum}.`,
              };
            }
          }

          // Relative difference
          const diff = Math.abs(claimNum - evNum);
          const relDiff = evNum > 0 ? diff / evNum : diff;

          if (relDiff <= tolerance) {
            const propCheck = this.validatePropositionalSupport(claim, ev, candidates, targetBrand, knownCompetitors);
            if (!propCheck.valid) {
              return {
                ...claim,
                supportStatus: 'UNSUPPORTED',
                rejectionReason: propCheck.reason,
              };
            }
            return {
              ...claim,
              supportStatus: 'SUPPORTED',
              groundedEvidenceIds: [ev.id],
            };
          } else if (claimNum > evNum * 1.1) {
            // Overstated
            return {
              ...claim,
              supportStatus: 'OVERSTATED',
              contradictionEvidenceId: ev.id,
              rejectionReason: `Overstated metric: claim asserts ${claimNum}${claimUnit || ''} but evidence (${ev.id}) only supports ${evNum}${eq.unit || ''}.`,
            };
          }
        }
      }

      // Fallback: check raw text matching for currencies / multipliers
      const normEv = ev.claim.toLowerCase().replace(/,/g, '');
      const normClaim = qv.raw.toLowerCase().replace(/,/g, '');
      if (normEv.includes(normClaim)) {
        const propCheck = this.validatePropositionalSupport(claim, ev, candidates, targetBrand, knownCompetitors);
        if (propCheck.valid) {
          return {
            ...claim,
            supportStatus: 'SUPPORTED',
            groundedEvidenceIds: [ev.id],
          };
        }
      }
    }

    return null;
  }

  /**
   * Grounds qualitative, capability, and factual claims against evidence.
   */
  private static groundQualitativeClaim(
    claim: CanonicalClaim,
    candidates: EvidenceItem[],
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim | null {
    const claimLower = claim.sentence.toLowerCase();
    const claimTokens = this.getPropositionalTokens(claimLower, targetBrand, knownCompetitors);
    if (claimTokens.length === 0) return null;

    for (const ev of candidates) {
      // Entity isolation check (Phase 2 / Defect 1)
      const entityCheck = this.validateEntityIsolation(claim, ev, targetBrand, knownCompetitors);
      const evLower = ev.claim.toLowerCase();
      const evTokens = this.getPropositionalTokens(evLower, targetBrand, knownCompetitors);
      if (evTokens.length === 0) continue;

      if (!entityCheck.valid) {
        if (entityCheck.leakage) {
          const evTokenSet = new Set(evTokens);
          const matches = claimTokens.filter(t => evTokenSet.has(t)).length;
          if (matches >= 2) {
            return {
              ...claim,
              supportStatus: 'UNSUPPORTED',
              rejectionReason: entityCheck.reason,
            };
          }
        }
        continue;
      }

      // Check attribution compatibility
      if (claim.attributionSource) {
        const src = claim.attributionSource.toLowerCase();
        const evMatches =
          (ev.sourceTitle && ev.sourceTitle.toLowerCase().includes(src)) ||
          (ev.sourceUrl && ev.sourceUrl.toLowerCase().includes(src)) ||
          (ev.entities && ev.entities.some(e => e.toLowerCase().includes(src))) ||
          evLower.includes(src);
        if (!evMatches) continue;
      }

      // Rule 1: Contiguous normalized trigram match
      if (evTokens.length >= 3 && claimTokens.length >= 3) {
        const claimJoined = claimTokens.join(' ');
        for (let i = 0; i <= evTokens.length - 3; i++) {
          const tri = `${evTokens[i]} ${evTokens[i + 1]} ${evTokens[i + 2]}`;
          if (claimJoined.includes(tri)) {
            return {
              ...claim,
              supportStatus: 'SUPPORTED',
              groundedEvidenceIds: [ev.id],
            };
          }
        }
      }

      // Rule 2: Bounded Lexical Co-occurrence (matches on substantive propositional tokens)
      const evTokenSet = new Set(evTokens);
      const matched = claimTokens.filter(t => evTokenSet.has(t));
      const requiredMatches = Math.min(3, Math.ceil(claimTokens.length * 0.5));

      if (matched.length >= requiredMatches && matched.length >= 2) {
        return {
          ...claim,
          supportStatus: 'SUPPORTED',
          groundedEvidenceIds: [ev.id],
        };
      }

      // Rule 3: Jaccard Token Overlap >= 0.35 on propositional tokens
      const union = new Set([...claimTokens, ...evTokens]).size;
      const jaccard = union > 0 ? matched.length / union : 0;

      if (jaccard >= 0.35 && matched.length >= 2) {
        return {
          ...claim,
          supportStatus: 'SUPPORTED',
          groundedEvidenceIds: [ev.id],
        };
      }
    }

    return null;
  }

  /**
   * Entity Isolation Validator (Phase 2 / Defect 1):
   * Ensures competitor evidence never grounds target brand claims, and competitor A/B claims are isolated.
   */
  private static validateEntityIsolation(
    claim: CanonicalClaim,
    ev: EvidenceItem,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): { valid: boolean; leakage: boolean; reason?: string } {
    const claimComp = this.extractCompetitorIdentity(claim.sentence, knownCompetitors);
    const evComp = this.extractCompetitorIdentity(ev.claim, knownCompetitors, ev);

    const hasTargetMention = Boolean(
      targetBrand && (
        (claim.subjectEntity && claim.subjectEntity.toLowerCase() === targetBrand.toLowerCase()) ||
        claim.sentence.toLowerCase().includes(targetBrand.toLowerCase())
      )
    );

    const isCompetitorEvidence = Boolean(
      ev.sourceType === 'COMPETITOR' ||
      ev.evidenceType === 'COMPETITOR_OBSERVATION' ||
      evComp
    );

    const isTargetEvidence = Boolean(
      ev.sourceType === 'TARGET_SITE' ||
      ev.evidenceType === 'BUSINESS_FACT' ||
      ev.evidenceType === 'FEATURE' ||
      ev.evidenceType === 'DIFFERENTIATOR' ||
      ev.evidenceType === 'TECHNICAL_SPEC' ||
      (targetBrand && ev.claim.toLowerCase().includes(targetBrand.toLowerCase()))
    );

    // Rule 1: Competitor A vs Competitor B cross-contamination
    if (claimComp && evComp) {
      if (claimComp.toLowerCase() !== evComp.toLowerCase()) {
        return {
          valid: false,
          leakage: true,
          reason: `Entity isolation violation: competitor evidence (${ev.id} for ${evComp}) cannot support competitor assertion for ${claimComp}.`,
        };
      }
    }

    // Rule 2: Competitor claim supported by generic/unassigned competitor evidence when competitor is known
    if (claimComp && !evComp && isCompetitorEvidence) {
      return {
        valid: false,
        leakage: true,
        reason: `Entity isolation violation: competitor evidence (${ev.id}) cannot be verified to belong to ${claimComp}.`,
      };
    }

    // Rule 3: Target brand claim supported by competitor evidence -> LEAKAGE!
    if (hasTargetMention && !claimComp && isCompetitorEvidence && !isTargetEvidence) {
      return {
        valid: false,
        leakage: true,
        reason: `Entity isolation violation: competitor evidence (${ev.id}) cannot support target brand claim.`,
      };
    }

    // Rule 4: Competitor claim supported by target brand evidence -> LEAKAGE!
    if (claimComp && !hasTargetMention && isTargetEvidence && !isCompetitorEvidence) {
      return {
        valid: false,
        leakage: true,
        reason: `Entity isolation violation: target brand evidence (${ev.id}) cannot support competitor assertion.`,
      };
    }

    return { valid: true, leakage: false };
  }

  /**
   * Helper: checks if claim and evidence item refer to the same entity.
   */
  private static isEntityAligned(
    claim: CanonicalClaim,
    ev: EvidenceItem,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): boolean {
    const sLower = claim.sentence.toLowerCase();
    const eLower = (ev.claim + ' ' + (ev.sourceTitle || '')).toLowerCase();

    // If claim has an explicit attribution source, evidence MUST match it
    if (claim.attributionSource) {
      const src = claim.attributionSource.toLowerCase();
      const evMatches =
        (ev.sourceTitle && ev.sourceTitle.toLowerCase().includes(src)) ||
        (ev.sourceUrl && ev.sourceUrl.toLowerCase().includes(src)) ||
        (ev.entities && ev.entities.some(e => e.toLowerCase().includes(src))) ||
        ev.claim.toLowerCase().includes(src);
      if (!evMatches) return false;
    }

    const sTarget = Boolean(targetBrand && sLower.includes(targetBrand.toLowerCase()));
    const eTarget = Boolean(
      ev.sourceType === 'TARGET_SITE' ||
      ev.evidenceType === 'BUSINESS_FACT' ||
      (targetBrand && eLower.includes(targetBrand.toLowerCase()))
    );

    const sComp = this.extractCompetitorIdentity(sLower, knownCompetitors);
    const eComp = this.extractCompetitorIdentity(eLower, knownCompetitors, ev);

    // If claim is target brand, evidence MUST be target
    if (sTarget && !sComp) {
      return eTarget && !eComp;
    }

    // If claim is a competitor, evidence must be for the same competitor
    if (sComp) {
      return Boolean(eComp && eComp.toLowerCase() === sComp.toLowerCase());
    }

    // If evidence is competitor, claim must be for that competitor
    if (eComp) {
      return Boolean(sComp && sComp.toLowerCase() === eComp.toLowerCase());
    }

    // If evidence is target brand, claim must not be competitor
    if (eTarget) {
      return !sComp;
    }

    // Both are general
    return true;
  }

  /**
   * Helper: extracts distinctive tokens from string.
   */
  private static getDistinctiveTokens(str: string): string[] {
    return str
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 3 && !this.GENERIC_STOPWORDS.has(t));
  }
}
