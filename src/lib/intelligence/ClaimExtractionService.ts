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
    /\b(?:supports?|provides?|features?|integrates?(?:\s+with)?|offers?|delivers?|includes?|automates?|handles?|built with|certified for|compliant with|operates?|manufactures?|invents?|develops?|builds?|eliminates?|guarantees?|achieves?|streamlines?|accelerates?|optimizes?|ensures?|prevents?|reduces?|simplifies?|enables?|empowers?)\b/i,
  ];

  /**
   * Qualitative commercial promises, performance guarantees, and operational claims
   */
  private static COMMERCIAL_PROMISE_PATTERNS = [
    /\b(?:instant|effortless|frictionless|risk-free|turnkey|seamless|zero[- ]downtime)\s+(?:deployment|integration|operation|setup|onboarding|migration|rollout|synchronization|execution)\b/i,
    /\b(?:deployment|setup|onboarding|integration|operation|rollout)\s+is\s+(?:instant|effortless|frictionless|risk-free|seamless|automated)\b/i,
    /\b(?:works|integrates|compatible)\s+with\s+(?:every|all)\s+(?:major\s+)?(?:system|systems|platform|platforms|tool|tools|database|databases|cloud|clouds|provider|providers)\b/i,
    /\b(?:guarantees?|promises?)\s+(?:effortless|seamless|instant|frictionless|zero[- ]downtime|risk-free|enterprise)\b/i,
    /\b(?:teams?|enterprises?|users?|developers?|customers?)\s+(?:achieves?|enjoys?|benefits?\s+from)\s+(?:seamless|effortless|instant|frictionless)\b/i,
    /\b(?:eliminates?|removes?)\s+(?:onboarding|deployment|integration|operational|workflow)\s+friction\b/i,
  ];

  /**
   * Negated capability statements (limitations, disclaimers, or explicit absence of capability)
   */
  private static NEGATED_CAPABILITY_PATTERNS = [
    /\b(?:does\s+not|doesn't|do\s+not|don't|did\s+not|didn't|cannot|can't|never|fails?\s+to)\s+(?:guarantee|eliminate|provide|deliver|offer|feature|include|support|achieve|ensure|streamline|accelerate|optimize|prevent|reduce|simplify)\b/i,
  ];

  /**
   * Purely hypothetical or conditional statement openings
   */
  private static HYPOTHETICAL_PATTERNS = [
    /^(?:if|assuming|suppose|hypothetically|in theory)\b/i,
    /\b(?:could potentially|might potentially)\b/i,
  ];

  /**
   * Concessive, skeptical, or third-party reporting contexts where commercial promises
   * are discussed critically, cited as vendor claims, or contrasted with independent findings.
   * e.g., "Although the vendor advertises instant deployment, independent tests found delays."
   */
  private static SKEPTICAL_OR_CONCESSIVE_PATTERNS = [
    /\b(?:although|though|even though|while|whereas)\s+(?:the\s+)?(?:vendor|competitor|maker|company|provider)\s+(?:advertises?|claims?|promises?|touts?)\b/i,
    /\b(?:independent|third-party)\s+(?:tests?|evaluations?|audits?|benchmarks?|observers?|researchers?)\s+(?:found|reported|showed|discovered|noted)\s+(?:delays?|issues?|problems?|limitations?|bottlenecks?|failures?)\b/i,
    /\b(?:advertises?|allegedly|purportedly|supposedly)\s+(?:instant|effortless|frictionless|risk-free|seamless)\b/i,
    /\b(?:question\s+whether|doubt\s+whether|debated\s+whether|unclear\s+whether|dispute\s+whether)\b/i,
  ];

  /**
   * First-person brand subject patterns (marketing / organizational copy):
   * "our platform", "our software", "our team", "we", etc.
   */
  private static FIRST_PERSON_SUBJECT_PATTERNS = [
    /\b(?:our|my)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|team|agency|product|products|company|architecture|infrastructure|api|engine|application|app|engineers?|developers?)\b/i,
    /\b(?:we)\b/i,
  ];

  /**
   * Definite product subject patterns:
   * "the platform", "the software", "the tool", "this platform", "the solution", "the system"
   */
  private static DEFINITE_PRODUCT_PATTERNS = [
    /\b(?:the|this)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|product|products|application|app|engine|api)\b/i,
  ];

  /**
   * Lead indicators for coordinate predicate clauses
   */
  private static VERB_LEAD_REGEX = /^(?:guarantees?|provides?|features?|integrates?(?:\s+with)?|offers?|delivers?|includes?|automates?|handles?|eliminates?|achieves?|streamlines?|accelerates?|optimizes?|ensures?|prevents?|reduces?|simplifies?|enables?|empowers?|operates?|manufactures?|invents?|develops?|builds?|does\s+not|doesn't|cannot|can't)\b/i;

  private static PROMISE_LEAD_REGEX = /^(?:instant|effortless|frictionless|risk-free|turnkey|seamless|zero[- ]downtime)\b/i;

  private static SUBORDINATE_LEAD_REGEX = /^(?:while|whereas|although|though|if|unless|since|because|even\s+if)\b/i;

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
          knownCompetitors,
          para
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
   * Helper: splits a compound sentence into distinct proposition clauses.
   */
  public static splitSentenceIntoClauses(sentence: string): string[] {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) return [trimmed];

    // Protect ranges: e.g. "between $100 and $150", "from 10 to 20%"
    const rangePlaceholders: string[] = [];
    const protectedSentence = trimmed.replace(
      /(?:between|from)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?\s*(?:%|ms|users?|engineers?|developers?|k|m|b)?\s+(?:and|to)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:%|ms|users?|engineers?|developers?|k|m|b))?/gi,
      (m) => {
        rangePlaceholders.push(m);
        return `__RANGE_${rangePlaceholders.length - 1}__`;
      }
    );

    const splitRegex = /(?:;\s*|,\s*(?:and|but|while|whereas|although|though|however|yet|plus|as well as)\s+|,\s*(?=(?:guarantees?|delivers?|provides?|eliminates?|automates?|features?|reduces?|achieves?|streamlines?|optimizes?|ensures?)\b)|\s+(?:and|but|while|whereas|although|though|yet|plus|as well as)\s+|\s+with\s+(?=(?:instant|effortless|frictionless|risk-free|seamless|zero[- ]downtime)\b))/gi;

    const rawSplits: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = splitRegex.exec(protectedSentence)) !== null) {
      const clauseBefore = protectedSentence.slice(lastIndex, match.index).trim();
      const delimiter = match[0];
      const remainingAfter = protectedSentence.slice(match.index + delimiter.length).trim();

      const isPunctuationDelimiter = delimiter.includes(';') || delimiter.includes(',');
      const isClauseFollower =
        isPunctuationDelimiter ||
        this.VERB_LEAD_REGEX.test(remainingAfter) ||
        this.PROMISE_LEAD_REGEX.test(remainingAfter) ||
        this.SUBORDINATE_LEAD_REGEX.test(remainingAfter) ||
        /^(?:our\s+|the\s+|this\s+|we\b|teams?\b|enterprises?\b|users?\b|developers?\b|customers?\b|[A-Z][a-zA-Z0-9_]*\b)/.test(remainingAfter);

      if (clauseBefore.length >= 10 && remainingAfter.length >= 10 && isClauseFollower) {
        rawSplits.push(clauseBefore);
        lastIndex = match.index + delimiter.length;
      }
    }

    const trailing = protectedSentence.slice(lastIndex).trim();
    if (trailing.length > 0) {
      rawSplits.push(trailing);
    }

    const finalClauses = rawSplits.map(clause => {
      return clause.replace(/__RANGE_(\d+)__/g, (_, idx) => rangePlaceholders[parseInt(idx, 10)]).trim();
    });

    return finalClauses.length > 0 ? finalClauses : [trimmed];
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
    knownCompetitors: string[] = [],
    contextParagraph?: string
  ): CanonicalClaim[] {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) return []; // Ignore tiny fragments

    // Reject rhetorical or inquiry questions
    if (trimmed.endsWith('?')) return [];
    for (const pat of this.QUESTION_PATTERNS) {
      if (pat.test(trimmed)) return [];
    }

    const clauses = this.splitSentenceIntoClauses(trimmed);
    if (clauses.length <= 1) {
      return this.extractClaimsFromClause(
        trimmed,
        trimmed,
        sectionIndex,
        sectionHeading,
        claimIndex,
        targetBrand,
        knownCompetitors,
        contextParagraph
      );
    }

    // Resolve sentence-level subject for coordinate predicate inheritance
    const { subjectEntity: sentenceSubject } = this.resolveEntities(
      trimmed,
      targetBrand,
      knownCompetitors,
      contextParagraph,
      sectionHeading,
      true
    );

    const allClaims: CanonicalClaim[] = [];
    let subIdx = 0;
    let inheritedSubject = sentenceSubject;

    for (const clause of clauses) {
      const clauseClaims = this.extractClaimsFromClause(
        clause,
        trimmed,
        sectionIndex,
        sectionHeading,
        claimIndex + subIdx,
        targetBrand,
        knownCompetitors,
        contextParagraph,
        inheritedSubject
      );

      for (const c of clauseClaims) {
        allClaims.push(c);
        if (c.subjectEntity) {
          inheritedSubject = c.subjectEntity;
        }
        subIdx++;
      }
    }

    return allClaims;
  }

  /**
   * Extracts canonical claims from an individual proposition clause.
   */
  private static extractClaimsFromClause(
    clauseText: string,
    fullSentence: string,
    sectionIndex: number,
    sectionHeading: string,
    claimIndex: number,
    targetBrand?: string,
    knownCompetitors: string[] = [],
    contextParagraph?: string,
    inheritedSubject?: string
  ): CanonicalClaim[] {
    const trimmed = clauseText.trim();
    if (trimmed.length < 10) return [];

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

    // Detect comparative
    let isComparative = false;
    for (const pat of this.COMPARATIVE_PATTERNS) {
      if (pat.test(trimmed)) {
        isComparative = true;
        break;
      }
    }

    // Detect commercial promise patterns
    let isCommercialPromise = false;
    for (const pat of this.COMMERCIAL_PROMISE_PATTERNS) {
      if (pat.test(trimmed)) {
        isCommercialPromise = true;
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

    // Detect negated capability
    let isNegatedCapability = false;
    for (const pat of this.NEGATED_CAPABILITY_PATTERNS) {
      if (pat.test(trimmed)) {
        isNegatedCapability = true;
        break;
      }
    }

    // Detect hypothetical
    let isHypothetical = false;
    for (const pat of this.HYPOTHETICAL_PATTERNS) {
      if (pat.test(trimmed)) {
        isHypothetical = true;
        break;
      }
    }

    // Detect skeptical or concessive context
    let isSkeptical = false;
    for (const pat of this.SKEPTICAL_OR_CONCESSIVE_PATTERNS) {
      if (pat.test(trimmed)) {
        isSkeptical = true;
        break;
      }
    }

    // Preliminary subject indicators
    const hasTargetMention = Boolean(targetBrand && this.hasWordBoundaryMatch(trimmed, targetBrand));
    const hasCompetitorMention = knownCompetitors.some(c => this.hasWordBoundaryMatch(trimmed, c));
    const isFirstPerson = this.FIRST_PERSON_SUBJECT_PATTERNS.some(pat => pat.test(trimmed));
    const isDefiniteProduct = this.DEFINITE_PRODUCT_PATTERNS.some(pat => pat.test(trimmed));
    const isCommercialSubjectContext = hasTargetMention || hasCompetitorMention || isFirstPerson || isDefiniteProduct;

    // Commercial capability assertion:
    // Matches commercial promise pattern OR has capability verb in commercial subject context.
    // Disqualified if affirmative capability is explicitly negated, hypothetical, or skeptical/concessive.
    const isCommercialCapability = !isNegatedCapability && !isHypothetical && !isSkeptical && (
      isCommercialPromise || (isCapability && isCommercialSubjectContext)
    );

    // Detect subject entity and target entity (context-aware & boundary-safe)
    const isMarketingClaimContext = isCommercialCapability || isCapability || isComparative || quantValues.length > 0;
    let { subjectEntity, targetEntity } = this.resolveEntities(
      trimmed,
      targetBrand,
      knownCompetitors,
      contextParagraph,
      sectionHeading,
      isMarketingClaimContext
    );

    // Inherit subject from previous coordinate predicate if clause has no explicit subject
    if (!subjectEntity && inheritedSubject && (isCommercialCapability || isCapability || quantValues.length > 0)) {
      subjectEntity = inheritedSubject;
    }

    const claims: CanonicalClaim[] = [];

    // If quantitative values found, each distinct metric produces a claim
    if (quantValues.length > 0) {
      quantValues.forEach((qv, idx) => {
        let claimType: CanonicalClaimType = 'QUANTITATIVE';
        if (attributionSource) claimType = 'ATTRIBUTION';
        else if (isComparative) claimType = 'COMPARATIVE';
        else if (temporalAnchor && !qv.unit) claimType = 'TEMPORAL';

        // Materiality: Quantitative claims with metrics, currencies, percentages, or multipliers are CRITICAL
        const materiality: 'CRITICAL' | 'IMPORTANT' | 'SUPPLEMENTAL' = 'CRITICAL';

        claims.push({
          id: `claim-${sectionIndex}-${claimIndex}-${idx}`,
          sectionIndex,
          sectionHeading,
          sentence: fullSentence,
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
        });
      });

      // Residual safety: if this same clause ALSO contains an independent commercial promise
      // that is not just the numeric metric itself, extract it as an independent capability claim.
      if (isCommercialPromise && !isNegatedCapability && !isHypothetical && !isSkeptical) {
        const isCompetitor = Boolean(
          subjectEntity && knownCompetitors.some(c => c.toLowerCase() === subjectEntity.toLowerCase())
        );
        const materiality: 'CRITICAL' | 'IMPORTANT' | 'SUPPLEMENTAL' = isCompetitor ? 'IMPORTANT' : 'CRITICAL';
        const claimType: CanonicalClaimType = isCompetitor ? 'COMPETITOR_ASSERTION' : 'ENTITY_CAPABILITY';

        claims.push({
          id: `claim-${sectionIndex}-${claimIndex}-${claims.length}`,
          sectionIndex,
          sectionHeading,
          sentence: fullSentence,
          claimText: trimmed,
          claimType,
          subjectEntity,
          targetEntity,
          temporalAnchor,
          confidence: 0.85,
          materiality,
          supportStatus: 'UNSUPPORTED',
          groundedEvidenceIds: [],
        });
      }

      return claims;
    }

    // Attribution without explicit quantitative value (e.g. "According to Gartner, CRM adoption is accelerating")
    if (attributionSource) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
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
        sentence: fullSentence,
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
        sentence: fullSentence,
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

    // Entity capability or commercial product promise
    if (!isNegatedCapability && !isHypothetical && !isSkeptical && (isCommercialCapability || (isCapability && subjectEntity))) {
      const isTargetBrand = Boolean(
        targetBrand && subjectEntity && subjectEntity.toLowerCase() === targetBrand.toLowerCase()
      );
      const isCompetitor = Boolean(
        subjectEntity && knownCompetitors.some(c => c.toLowerCase() === subjectEntity.toLowerCase())
      );

      // Materiality:
      // - Explicit competitor assertion: IMPORTANT
      // - Target brand capability: CRITICAL
      // - Unresolved commercial promise (subject entity absent): CRITICAL (cannot bypass strict validation)
      const materiality: 'CRITICAL' | 'IMPORTANT' | 'SUPPLEMENTAL' = isCompetitor ? 'IMPORTANT' : 'CRITICAL';
      const claimType: CanonicalClaimType = isCompetitor ? 'COMPETITOR_ASSERTION' : 'ENTITY_CAPABILITY';

      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType,
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality,
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
        sentence: fullSentence,
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
      sentence: fullSentence,
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
   * Helper: checks if text contains entity using word boundary matching.
   */
  public static hasWordBoundaryMatch(text: string, entity: string): boolean {
    if (!text || !entity || !entity.trim()) return false;
    const trimmed = entity.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = /^\w/.test(trimmed) ? '\\b' : '';
    const suffix = /\w$/.test(trimmed) ? '\\b' : '';
    const regex = new RegExp(`${prefix}${escaped}${suffix}`, 'i');
    return regex.test(text);
  }

  /**
   * Helper: resolves subject and target entities in a sentence.
   */
  private static resolveEntities(
    sentence: string,
    targetBrand?: string,
    knownCompetitors: string[] = [],
    contextParagraph?: string,
    sectionHeading?: string,
    isMarketingClaimContext: boolean = false
  ): { subjectEntity?: string; targetEntity?: string } {
    let subjectEntity: string | undefined;
    let targetEntity: string | undefined;

    // Check explicit target brand presence with boundary-safe matching
    const hasTarget = Boolean(targetBrand && this.hasWordBoundaryMatch(sentence, targetBrand));

    // Check explicit competitor presence with boundary-safe matching
    const matchedCompetitors = knownCompetitors.filter(c => this.hasWordBoundaryMatch(sentence, c));

    // Check first-person brand ownership ("our platform", "our software", "we")
    const isFirstPerson = this.FIRST_PERSON_SUBJECT_PATTERNS.some(pat => pat.test(sentence));

    // Check definite product mention ("the platform", "the software")
    const isDefiniteProduct = this.DEFINITE_PRODUCT_PATTERNS.some(pat => pat.test(sentence));

    if (hasTarget && matchedCompetitors.length > 0) {
      // Comparison: target brand is subject, competitor is target
      subjectEntity = targetBrand;
      targetEntity = matchedCompetitors[0];
    } else if (matchedCompetitors.length > 0) {
      if (isFirstPerson && targetBrand && isMarketingClaimContext) {
        // e.g. "Our platform outperforms CompetitorX"
        subjectEntity = targetBrand;
        targetEntity = matchedCompetitors[0];
      } else {
        // Competitor is the subject
        subjectEntity = matchedCompetitors[0];
      }
    } else if (hasTarget) {
      subjectEntity = targetBrand;
    } else if (isFirstPerson && targetBrand && isMarketingClaimContext) {
      // Unambiguous first-person marketing statement in branded content:
      // "Our platform provides X", "We offer X"
      subjectEntity = targetBrand;
    } else if (isDefiniteProduct && targetBrand && isMarketingClaimContext) {
      // "The platform delivers X"
      // Verify surrounding context (paragraph or section heading) unambiguously identifies target brand
      const contextText = [contextParagraph, sectionHeading].filter(Boolean).join(' ');
      const contextHasTarget = this.hasWordBoundaryMatch(contextText, targetBrand);
      const contextHasCompetitor = knownCompetitors.some(c => this.hasWordBoundaryMatch(contextText, c));

      if (contextHasTarget && !contextHasCompetitor) {
        subjectEntity = targetBrand;
      }
      // Ambiguous context -> do not invent entity association
    }

    return { subjectEntity, targetEntity };
  }
}
