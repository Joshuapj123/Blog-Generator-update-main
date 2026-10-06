// src/lib/intelligence/ClaimExtractionService.ts
import { 
  CanonicalClaim, 
  CanonicalClaimType, 
  QuantitativeValue 
} from '@/core/contracts/evidence';

export class ClaimExtractionService {
  /**
   * Question patterns to reject
   */
  private static QUESTION_PATTERNS = [
    /^(?:how|what|why|when|where|who|can|could|should|is|are|do|does|will|would)\b/i,
  ];

  /**
   * Pure subjective advice / recommendations to reject from factual claim extraction
   */
  private static ADVICE_PATTERNS = [
    /\b(?:we recommend|it is recommended|you should|teams should|make sure to|be sure to|consider using|we suggest|it is advisable|best practice is to)\b/i,
  ];

  /**
   * Subjective opinion / promotional puffery without verifiable factual assertions
   */
  private static OPINION_PATTERNS = [
    /\b(?:in our opinion|we believe|it feels like|many believe|widely regarded as the most beloved)\b/i,
  ];

  /**
   * External attribution patterns
   */
  private static ATTRIBUTION_PATTERNS = [
    /\b(?:[Aa]ccording to|[Aa]s reported by|[Pp]ublished by|[Cc]ited by|[Ss]ource:|[Cc]ite:|[Ss]tudy by|[Ss]urvey by|[Rr]esearch from)\s+([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)/,
    /\b(?:[Pp]er)\s+([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\b/,
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/i,
  ];

  private static NON_ATTRIBUTION_SOURCES = new Set([
    'hour', 'day', 'month', 'year', 'user', 'seat', 'client', 'server', 'second', 'minute', 'week', 'quarter', 'se', 'annum', 'developer', 'engineer',
    'annual audit', 'annual audit figures', 'audit figures', 'internal audit', 'internal data', 'internal records', 'company records', 'company data', 'audit data'
  ]);

  /**
   * Comparative patterns
   */
  private static COMPARATIVE_PATTERNS = [
    /\b(?:faster than|cheaper than|better than|more affordable than|outperforms?|superior to|compared to|versus|vs\.?|unlike)\s+([A-Z][A-Za-z0-9&.-]+)/i,
    /\b(\d+(?:\.\d+)?)\s*(?:x|times|fold)\s*(?:faster|more|higher|lower|cheaper|reduction|growth)/i,
    /\b(?:in contrast to|as opposed to|whereas)\s+([A-Z][A-Za-z0-9&.-]+)/i,
  ];

  /**
   * Capability and feature patterns
   */
  private static CAPABILITY_PATTERNS = [
    /\b(?:supports?|provides?|features?|integrates? with|offers?|delivers?|includes?|automates?|handles?|built with|certified for|compliant with|operates?|manufactures?|invents?|develops?|builds?)\b/i,
  ];

  /**
   * Temporal patterns (years, founding, launching)
   */
  private static TEMPORAL_PATTERNS = [
    /\b(?:founded in|established in|launched in|released in|started in|created in)\s+(19\d\d|20\d\d)\b/i,
    /\b(?:since|in|by)\s+(19\d\d|20\d\d)\b/i,
  ];

  /**
   * Quantitative regex patterns
   */
  private static QUANTITATIVE_PATTERNS = [
    // Ranges
    /(?:between|from)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?\s*(?:%|ms|users?|engineers?|developers?|k|m|b)?\s+(?:and|to)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:%|ms|users?|engineers?|developers?|k|m|b))?/gi,
    // Currencies
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?(?:[\$€£]\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b(?:USD|EUR|GBP)\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:USD|EUR|GBP|dollars?|euros?|million|billion|k|m|b)\b)/gi,
    // Percentages (note: no \b after %)
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:\.\d+)?\s*(?:%|\bpercent\b)/gi,
    // Performance & time metrics
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|req\/s|rps|tps|qps|gbps|mbps|tb|gb|mb|ghz|iops)\b/gi,
    // Multipliers
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:\.\d+)?\s*(?:times|x|fold)\b/gi,
    // Quantities & counts (allowing optional descriptive adjective e.g. senior developers, integrations)
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:,\d+)?\s*(?:(?:senior|junior|lead|enterprise|cloud|active|total)\s+)?(?:users?|clients?|nodes?|servers?|clusters?|engineers?|developers?|microservices|pipelines?|tenants?|customers?|integrations?)\b/gi,
  ];

  /**
   * Extracts canonical claims from full markdown content.
   */
  public static extractClaimsFromMarkdown(
    markdown: string,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim[] {
    const claims: CanonicalClaim[] = [];
    if (!markdown || !markdown.trim()) return claims;

    // Split markdown into sections by headings
    const sectionRegex = /(?:^|\n)(#{2,3})\s+([^\n]+)/g;
    const sectionIndices: { heading: string; level: string; headingStart: number; contentStart: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = sectionRegex.exec(markdown)) !== null) {
      sectionIndices.push({
        heading: match[2].trim(),
        level: match[1],
        headingStart: match.index,
        contentStart: match.index + match[0].length,
      });
    }

    if (sectionIndices.length === 0) {
      // Treat entire content as single section 0
      return this.extractClaimsFromSection(markdown, 0, 'Introduction', targetBrand, knownCompetitors);
    }

    for (let i = 0; i < sectionIndices.length; i++) {
      const current = sectionIndices[i];
      const end = i + 1 < sectionIndices.length ? sectionIndices[i + 1].headingStart : markdown.length;
      const sectionText = markdown.slice(current.contentStart, end).trim();
      const secClaims = this.extractClaimsFromSection(
        sectionText,
        i,
        current.heading,
        targetBrand,
        knownCompetitors
      );
      claims.push(...secClaims);
    }

    return claims;
  }

  /**
   * Extracts canonical claims from a single section text.
   */
  public static extractClaimsFromSection(
    sectionContent: string,
    sectionIndex: number,
    sectionHeading: string,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim[] {
    const claims: CanonicalClaim[] = [];
    if (!sectionContent || !sectionContent.trim()) return claims;

    // Split text into paragraphs, skipping tables, code blocks, and markdown headings
    const paragraphs = sectionContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0 && !p.startsWith('|') && !p.startsWith('```') && !p.startsWith('#'));

    let claimIdx = 0;
    for (const para of paragraphs) {
      // Split paragraph into sentences
      const sentences = this.splitIntoSentences(para);
      for (const sent of sentences) {
        const extracted = this.extractClaimsFromSentence(
          sent,
          sectionIndex,
          sectionHeading,
          claimIdx,
          targetBrand,
          knownCompetitors
        );
        for (const c of extracted) {
          claims.push(c);
          claimIdx++;
        }
      }
    }

    return claims;
  }

  /**
   * Extracts canonical claims from a single sentence.
   */
  public static extractClaimsFromSentence(
    sentence: string,
    sectionIndex: number,
    sectionHeading: string,
    claimIndex: number,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim[] {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) return []; // Ignore tiny fragments

    // Reject rhetorical or inquiry questions
    if (trimmed.endsWith('?')) return [];
    for (const pat of this.QUESTION_PATTERNS) {
      if (pat.test(trimmed)) return [];
    }

    // Reject pure recommendations/advice without factual metrics
    let isAdvice = false;
    for (const pat of this.ADVICE_PATTERNS) {
      if (pat.test(trimmed)) {
        isAdvice = true;
        break;
      }
    }

    // Check for quantitative values
    const quantValues = this.parseQuantitativeValues(trimmed);

    // If pure advice and NO quantitative value, ignore
    if (isAdvice && quantValues.length === 0) {
      return [];
    }

    // Check for subjective puffery without facts
    let isOpinion = false;
    for (const pat of this.OPINION_PATTERNS) {
      if (pat.test(trimmed)) {
        isOpinion = true;
        break;
      }
    }
    if (isOpinion && quantValues.length === 0) {
      return [];
    }

    // Detect attribution
    let attributionSource: string | undefined;
    for (const pat of this.ATTRIBUTION_PATTERNS) {
      const m = trimmed.match(pat);
      if (m) {
        const candidate = m[1]?.trim();
        if (candidate && !this.NON_ATTRIBUTION_SOURCES.has(candidate.toLowerCase())) {
          attributionSource = candidate;
          break;
        }
      }
    }

    // Detect temporal anchor
    let temporalAnchor: string | undefined;
    for (const pat of this.TEMPORAL_PATTERNS) {
      const m = trimmed.match(pat);
      if (m) {
        temporalAnchor = m[1]?.trim();
        break;
      }
    }

    // Detect subject entity and target entity
    const { subjectEntity, targetEntity } = this.resolveEntities(
      trimmed,
      targetBrand,
      knownCompetitors
    );

    // Detect comparative
    let isComparative = false;
    for (const pat of this.COMPARATIVE_PATTERNS) {
      if (pat.test(trimmed)) {
        isComparative = true;
        break;
      }
    }

    // Detect capability
    let isCapability = false;
    for (const pat of this.CAPABILITY_PATTERNS) {
      if (pat.test(trimmed)) {
        isCapability = true;
        break;
      }
    }

    // If quantitative values found, each distinct metric produces a claim
    if (quantValues.length > 0) {
      return quantValues.map((qv, idx) => {
        let claimType: CanonicalClaimType = 'QUANTITATIVE';
        if (attributionSource) claimType = 'ATTRIBUTION';
        else if (isComparative) claimType = 'COMPARATIVE';
        else if (temporalAnchor && !qv.unit) claimType = 'TEMPORAL';

        // Materiality: Quantitative claims with metrics, currencies, percentages, or multipliers are CRITICAL
        const materiality: 'CRITICAL' | 'IMPORTANT' | 'SUPPLEMENTAL' = 'CRITICAL';

        return {
          id: `claim-${sectionIndex}-${claimIndex}-${idx}`,
          sectionIndex,
          sectionHeading,
          sentence: trimmed,
          claimText: qv.raw,
          claimType,
          subjectEntity,
          targetEntity,
          quantitativeValue: qv,
          attributionSource,
          temporalAnchor,
          confidence: 0.95,
          materiality,
          supportStatus: 'UNSUPPORTED',
          groundedEvidenceIds: [],
        };
      });
    }

    // Attribution without explicit quantitative value (e.g. "According to Gartner, CRM adoption is accelerating")
    if (attributionSource) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: trimmed,
        claimText: trimmed,
        claimType: 'ATTRIBUTION',
        subjectEntity,
        targetEntity,
        attributionSource,
        temporalAnchor,
        confidence: 0.9,
        materiality: 'CRITICAL',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Comparative assertion without numbers
    if (isComparative) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: trimmed,
        claimText: trimmed,
        claimType: 'COMPARATIVE',
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality: 'CRITICAL',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Competitor assertion
    if (subjectEntity && knownCompetitors.some(c => c.toLowerCase() === subjectEntity.toLowerCase())) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: trimmed,
        claimText: trimmed,
        claimType: 'COMPETITOR_ASSERTION',
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality: 'IMPORTANT',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Entity capability
    if (isCapability && subjectEntity) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: trimmed,
        claimText: trimmed,
        claimType: 'ENTITY_CAPABILITY',
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality: 'IMPORTANT',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Temporal fact (e.g., "Founded in 2018 in San Francisco")
    if (temporalAnchor) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: trimmed,
        claimText: trimmed,
        claimType: 'TEMPORAL',
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality: 'IMPORTANT',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // General fact
    return [{
      id: `claim-${sectionIndex}-${claimIndex}-0`,
      sectionIndex,
      sectionHeading,
      sentence: trimmed,
      claimText: trimmed,
      claimType: 'GENERAL_FACT',
      subjectEntity,
      targetEntity,
      confidence: 0.7,
      materiality: 'SUPPLEMENTAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: [],
    }];
  }

  /**
   * Parses structured QuantitativeValues from text.
   */
  public static parseQuantitativeValues(text: string): QuantitativeValue[] {
    const results: QuantitativeValue[] = [];
    const seen = new Set<string>();

    for (const pat of this.QUANTITATIVE_PATTERNS) {
      const regex = new RegExp(pat.source, pat.flags);
      const matches = text.match(regex) || [];

      for (const rawMatch of matches) {
        const raw = rawMatch.trim();
        const rawLower = raw.toLowerCase();
        if (seen.has(rawLower)) continue;
        seen.add(rawLower);

        // Check for Range: "between $100 and $150", "from 10 to 20%"
        const rangeMatch = raw.match(/(?:between|from)\s+([\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?)\s*(?:and|to)\s+([\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?)(?:\s*(%|ms|users|engineers|developers|k|m|b))?/i);
        if (rangeMatch) {
          const minNum = this.parseNumericValue(rangeMatch[1]);
          const maxNum = this.parseNumericValue(rangeMatch[2]);
          const unit = this.parseUnit(raw);
          results.push({
            raw,
            operator: 'RANGE',
            rangeMin: minNum,
            rangeMax: maxNum,
            normalizedNumber: minNum,
            unit,
            tolerance: 0.05,
          });
          continue;
        }

        // Check operators
        let operator: 'EXACT' | 'APPROX' | 'GT' | 'GTE' | 'LT' | 'LTE' = 'EXACT';
        if (/\b(?:at\s+least|minimum\s+of|>=)\b/i.test(raw)) {
          operator = 'GTE';
        } else if (/\b(?:more\s+than|greater\s+than|over|above|exceeding|>|\+)\b/i.test(raw)) {
          operator = 'GT';
        } else if (/\b(?:at\s+most|up\s+to|maximum\s+of|<=)\b/i.test(raw)) {
          operator = 'LTE';
        } else if (/\b(?:less\s+than|fewer\s+than|under|below|<)\b/i.test(raw)) {
          operator = 'LT';
        } else if (/\b(?:approximately|approx\.|about|around|nearly|roughly|~)\b/i.test(raw)) {
          operator = 'APPROX';
        }

        const numVal = this.parseNumericValue(raw);
        const unit = this.parseUnit(raw);

        results.push({
          raw,
          operator,
          normalizedNumber: numVal,
          unit,
          tolerance: 0.05,
        });
      }
    }

    return results;
  }

  /**
   * Helper: parses numeric value from string (supporting k, m, b, million, billion).
   */
  public static parseNumericValue(str: string): number | undefined {
    const clean = str.replace(/,/g, '').toLowerCase();
    const numMatch = clean.match(/(\d+(?:\.\d+)?)/);
    if (!numMatch) return undefined;

    let base = parseFloat(numMatch[1]);
    if (clean.includes('billion') || clean.includes(' b')) {
      base *= 1_000_000_000;
    } else if (clean.includes('million') || clean.includes(' m') || clean.endsWith('m') || clean.includes('m ')) {
      // Check if it's 'ms' (milliseconds)
      if (!clean.includes('ms')) {
        base *= 1_000_000;
      }
    } else if (clean.includes('k') || clean.includes('thousand')) {
      base *= 1_000;
    }

    return base;
  }

  /**
   * Helper: parses unit from string.
   */
  public static parseUnit(str: string): string | undefined {
    const clean = str.toLowerCase();
    if (clean.includes('%') || clean.includes('percent')) return '%';
    if (clean.includes('$') || clean.includes('usd') || clean.includes('dollar')) return '$';
    if (clean.includes('€') || clean.includes('eur') || clean.includes('euro')) return '€';
    if (clean.includes('£') || clean.includes('gbp')) return '£';
    if (clean.includes('ms') || clean.includes('millisecond')) return 'ms';
    if (clean.includes('second')) return 'seconds';
    if (clean.includes('minute')) return 'minutes';
    if (clean.includes('hour')) return 'hours';
    if (clean.includes('day')) return 'days';
    if (clean.includes('week')) return 'weeks';
    if (clean.includes('month')) return 'months';
    if (clean.includes('year')) return 'years';
    if (/\b(?:req\/s|rps)\b/.test(clean)) return 'req/s';
    if (/\b(?:tps|qps)\b/.test(clean)) return 'tps';
    if (/\b(?:x|times|fold)\b/.test(clean)) return 'x';
    if (clean.includes('user')) return 'users';
    if (clean.includes('client')) return 'clients';
    if (clean.includes('customer')) return 'customers';
    if (clean.includes('developer')) return 'developers';
    if (clean.includes('engineer')) return 'engineers';
    if (clean.includes('node')) return 'nodes';
    if (clean.includes('server')) return 'servers';
    if (clean.includes('pipeline')) return 'pipelines';
    if (clean.includes('integration')) return 'integrations';
    return undefined;
  }

  /**
   * Helper: splits text into clean sentences.
   */
  public static splitIntoSentences(text: string): string[] {
    // Preserve decimals (e.g. 99.9%) and abbreviations (e.g. e.g., vs.)
    const normalized = text
      .replace(/(\d+)\.(\d+)/g, '$1__DOT__$2')
      .replace(/\b(?:e\.g\.|i\.e\.|vs\.|approx\.)/gi, match => match.replace(/\./g, '__DOT__'));

    const sentences = normalized.split(/(?<=[.!?])\s+/);
    return sentences
      .map(s => s.replace(/__DOT__/g, '.').trim())
      .filter(s => s.length > 0);
  }

  /**
   * Helper: resolves subject and target entities in a sentence.
   */
  private static resolveEntities(
    sentence: string,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): { subjectEntity?: string; targetEntity?: string } {
    const sLower = sentence.toLowerCase();
    let subjectEntity: string | undefined;
    let targetEntity: string | undefined;

    // Check target brand presence
    const hasTarget = targetBrand && sLower.includes(targetBrand.toLowerCase());

    // Check competitors presence
    const matchedCompetitors = knownCompetitors.filter(c => sLower.includes(c.toLowerCase()));

    if (hasTarget && matchedCompetitors.length > 0) {
      // Comparison: target brand is subject, competitor is target
      subjectEntity = targetBrand;
      targetEntity = matchedCompetitors[0];
    } else if (matchedCompetitors.length > 0) {
      // Competitor is the subject
      subjectEntity = matchedCompetitors[0];
    } else if (hasTarget) {
      subjectEntity = targetBrand;
    }

    return { subjectEntity, targetEntity };
  }
}
