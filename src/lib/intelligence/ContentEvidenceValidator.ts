import { 
  EvidenceSet, 
  EvidenceItem,
  ContentGapMatrix,
  SectionEvidenceMap, 
  ResearchIntelligenceDiagnostics,
  CONTENT_INTELLIGENCE_POLICY,
  CanonicalClaim,
  ClaimGroundingDiagnostics,
  GroundingFailureCategory,
  GroundingDecisionDiagnostic
} from '@/core/contracts/evidence';
import { ContentBrief } from '@/core/contracts/schemas';
import { KeywordAuditService } from '../seo-intelligence/KeywordAuditService';
import { ClaimExtractionService } from './ClaimExtractionService';
import { ClaimGroundingEngine, GroundingResult } from './ClaimGroundingEngine';

export interface EvidenceValidationResult {
  passed: boolean;
  evidenceUsageRate: number;
  unsupportedClaims: string[];
  keywordStuffingIssues: string[];
  repetitionIssues: string[];
  accuracyIssues: string[];
  diagnostics: ResearchIntelligenceDiagnostics;
  warnings: string[];
  criticalErrors: string[];
  canonicalClaims?: CanonicalClaim[];
  claimGroundingDiagnostics?: ClaimGroundingDiagnostics;
  structuredDiagnostics?: GroundingDecisionDiagnostic[];
  groundingFailureBreakdown?: Record<GroundingFailureCategory, number>;
}

export class ContentEvidenceValidator {
  /**
   * Generalized Quantitative Claim Patterns:
   * Percentages, Currency, Performance Metrics, Durations, Quantities, and Multipliers.
   */
  private static QUANTITATIVE_REGEXES = [
    /\b\d+(?:\.\d+)?\s*(?:%|\bpercent\b)/gi, // Percentages: 20%, 99.95%, 99.9 percent
    /(?:[\$€£]\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b(?:USD|EUR|GBP)\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:USD|EUR|GBP|dollars|euros|million|billion|k|m|b)\b)/gi, // Currency: $1.2M, EUR 450,000, USD 1.2 million
    /\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:ms|milliseconds|seconds|req\/s|rps|tps|qps|gbps|mbps|tb|gb|mb|ghz|iops)\b/gi, // Performance metrics: 45ms, 15,000 req/s
    /\b\d+(?:\.\d+)?\s*(?:times|x|fold)\s*(?:faster|cheaper|more|increase|reduction|growth)\b/gi, // Comparative multipliers: 10x faster
    /\b\d+\s*(?:days?|weeks?|months?|quarters?|years?|hours?)\b/gi, // Durations: 6 months
    /\b\d+(?:,\d+)?\s*(?:users|clients|nodes|servers|clusters|engineers|microservices|pipelines|tenants)\b/gi, // Concrete quantities
  ];

  /**
   * Negation patterns used by the deterministic evidence-use heuristic to detect
   * contradictory or reversed evidence assertions.
   */
  private static NEGATION_PATTERNS = [
    /\b(?:does\s+not|doesn't|do\s+not|don't|did\s+not|didn't)\s+(?:provide|deliver|offer|feature|include|support|guarantee)\b/i,
    /\b(?:fails?\s+to|failed\s+to|failing\s+to)\s+(?:provide|deliver|offer|feature|include|support)\b/i,
    /\b(?:never|lacks?|lacking|unable\s+to|cannot|can't)\s+(?:provide|deliver|offer|feature|include|support)\b/i,
    /\b(?:is\s+not|isn't|are\s+not|aren't)\s+(?:available|provided|offered|capable|present)\b/i,
    /\bno\s+longer\s+(?:provides|delivers|offers|supports)\b/i,
  ];

  /**
   * Generic words and functional prepositions to exclude when isolating distinctive claim tokens.
   */
  private static GENERIC_CLAIM_STOPWORDS = new Set([
    'software', 'development', 'platform', 'service', 'services', 'business', 'company', 
    'solutions', 'solution', 'provides', 'delivers', 'verified', 'capability', 'operational', 
    'client', 'clients', 'target', 'enterprise', 'features', 'feature',
    'without', 'within', 'across', 'between', 'during', 'through', 'about', 'under',
    'their', 'there', 'which', 'where', 'while', 'after', 'before', 'other', 'another',
    'these', 'those', 'being', 'having', 'into', 'from', 'with'
  ]);

  /**
   * Sanitizes diagnostic URLs to remove basic auth credentials and sensitive query parameters
   * (e.g. api keys, tokens, session IDs, passwords).
   */
  public static sanitizeDiagnosticUrl(urlStr: string): string {
    if (!urlStr) return '';
    try {
      const targetUrl = urlStr.startsWith('http://') || urlStr.startsWith('https://')
        ? urlStr
        : `https://${urlStr}`;
      const parsed = new URL(targetUrl);
      // Strip userinfo credentials (user:password@)
      parsed.username = '';
      parsed.password = '';
      // Redact sensitive query parameters
      const sensitiveParams = [
        'key', 'api_key', 'apikey', 'api-key', 'secret', 'token',
        'access_token', 'refresh_token', 'auth', 'password', 'passwd', 'pwd',
        'credential', 'credentials', 'session', 'session_id'
      ];
      for (const p of sensitiveParams) {
        if (parsed.searchParams.has(p)) {
          parsed.searchParams.set(p, '[REDACTED]');
        }
      }
      return parsed.toString();
    } catch {
      return ContentEvidenceValidator.sanitizeDiagnosticText(urlStr);
    }
  }

  /**
   * Sanitizes diagnostic text to prevent leaking sensitive API keys, secrets, tokens,
   * passwords, session cookies, or raw HTML dumps in diagnostic telemetry.
   */
  public static sanitizeDiagnosticText(text: string): string {
    if (!text) return '';
    let sanitized = text;
    // Strip raw HTML tags (including attributes)
    sanitized = sanitized.replace(/<[^>]+>/g, ' ');
    // Redact Google AI Studio / Gemini API keys
    sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
    // Redact OpenAI, Perplexity, Anthropic, Stripe API keys
    sanitized = sanitized.replace(/sk-[0-9A-Za-z_-]{10,}/g, '[REDACTED_API_KEY]');
    // Redact Authorization Bearer & Basic tokens
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]');
    sanitized = sanitized.replace(/Basic\s+[A-Za-z0-9+/=]{10,}/gi, 'Basic [REDACTED_TOKEN]');
    // Redact Cookies and session IDs
    sanitized = sanitized.replace(/(?:cookie|set-cookie):\s*[^;\r\n]+/gi, 'Cookie: [REDACTED_COOKIE]');
    sanitized = sanitized.replace(/(?:session_id|sessionid|sess_token)=[^\s;&]+/gi, 'session_id=[REDACTED]');
    // Redact key=value secret patterns
    sanitized = sanitized.replace(/(?:api[-_]?key|secret|token|access[-_]?token|refresh[-_]?token|password|passwd|pwd|auth|credential)[=:\s]+[A-Za-z0-9_.-]+/gi, '$1=[REDACTED]');
    // Redact config/env variable constants
    sanitized = sanitized.replace(/\b(?:API_KEY|SECRET_KEY|TOKEN|PASSWORD|AUTH_TOKEN)_[A-Za-z0-9_-]+\b/gi, '[REDACTED_SECRET]');
    return sanitized.replace(/\s+/g, ' ').trim();
  }

  /**
   * Computes a deterministic content validation fingerprint from normalized markdown and target entity.
   * Any change in substantive text, headings, or entity attribution produces a distinct fingerprint.
   */
  public static computeValidationFingerprint(bodyMarkdown: string, targetBrand?: string): string {
    const normText = (bodyMarkdown || '')
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
    const normBrand = (targetBrand || '').toLowerCase().trim();
    const payload = `${normBrand}:::${normText}`;

    // Deterministic 64-bit FNV-1a like hashing
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < payload.length; i++) {
      const code = payload.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code;
      h2 = Math.imul(h2, 0x5bd1e995);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `vfp-${hex1}${hex2}`;
  }

  /**
   * Validates generated article content against verified research evidence and policy thresholds.
   */
  public static validate(
    bodyMarkdown: string,
    brief: ContentBrief,
    evidenceSet?: EvidenceSet,
    sectionEvidenceMaps?: SectionEvidenceMap[],
    targetBrand?: string,
    gapMatrix?: ContentGapMatrix,
    saasProfile?: any,
    options?: {
      correlationId?: string;
      repairAttempted?: boolean;
      repairPassedRevalidation?: boolean;
      unrepairableClaimIds?: string[];
    }
  ): EvidenceValidationResult {
    bodyMarkdown = ClaimExtractionService.normalizeMarkdownLinks(bodyMarkdown || '');
    const warnings: string[] = [];
    const criticalErrors: string[] = [];
    const unsupportedClaims: string[] = [];
    const keywordStuffingIssues: string[] = [];
    const repetitionIssues: string[] = [];
    const accuracyIssues: string[] = [];

    const bodyLower = bodyMarkdown.toLowerCase();
    const primaryKeyword = (brief.targetKeywords?.[0] || '').toLowerCase().trim();
    const allEvidence = evidenceSet?.items || [];

    // 1. Meaningful Evidence Usage Rate Analysis
    const assignedIds = new Set<string>();
    (sectionEvidenceMaps || []).forEach(m => m.evidenceIds.forEach(id => assignedIds.add(id)));
    const totalAssigned = assignedIds.size > 0 ? assignedIds.size : allEvidence.length;

    let usedEvidenceCount = 0;
    const itemsToCheck = assignedIds.size > 0
      ? allEvidence.filter(e => assignedIds.has(e.id))
      : allEvidence;

    for (const ev of itemsToCheck) {
      if (this.isEvidenceMeaningfullyUsed(ev, bodyMarkdown)) {
        usedEvidenceCount++;
      }
    }

    const evidenceUsageRate = totalAssigned > 0 
      ? Math.min(100, Math.round((usedEvidenceCount / totalAssigned) * 100))
      : 100;

    if (evidenceUsageRate < CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT && totalAssigned > 2) {
      warnings.push(`Evidence usage rate is ${evidenceUsageRate}% (target: >= ${CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT}%). Article does not sufficiently reflect researched evidence.`);
    }

    // 2. Generalized Quantitative Claims Verification
    const detectedQuantitativeClaims = this.extractQuantitativeClaims(bodyMarkdown);
    const rawCorpus = allEvidence.map(e => `${e.claim} ${e.extractedFrom || ''}`).join(' ').toLowerCase();
    const normCorpus = this.normalizeQuantitativeString(rawCorpus);

    for (const claim of detectedQuantitativeClaims) {
      const cleanClaim = claim.toLowerCase().trim();
      // Skip benign non-claim numbers (e.g. 100%, 0%, dates/years)
      if (cleanClaim === '100%' || cleanClaim === '0%') continue;

      const normClaim = this.normalizeQuantitativeString(cleanClaim);
      const numMatch = cleanClaim.match(/\d+(?:[,\.]\d+)?/);
      const numToken = numMatch ? numMatch[0].replace(/,/g, '') : cleanClaim;

      const isSupported = 
        rawCorpus.includes(cleanClaim) || 
        normCorpus.includes(normClaim) ||
        rawCorpus.includes(normClaim);

      if (!isSupported) {
        unsupportedClaims.push(claim);
      }
    }

    if (unsupportedClaims.length > 0) {
      warnings.push(`Detected ${unsupportedClaims.length} quantitative, statistical, or performance claim(s) without supporting research evidence: ${unsupportedClaims.slice(0, 3).join(', ')}.`);
    }

    // 3. Keyword Stuffing & Repetitive City/Keyword Loops Audit
    let keywordAuditWarnings = 0;
    let finalPrimaryDensity = 0;
    if (primaryKeyword && primaryKeyword.trim().length > 0) {
      const secondaryKeywords = (brief.targetKeywords || []).slice(1);
      const audit = KeywordAuditService.auditKeywords(
        bodyMarkdown,
        primaryKeyword,
        secondaryKeywords,
        {
          warningThresholdPercent: 2.0,
          criticalThresholdPercent: CONTENT_INTELLIGENCE_POLICY.KEYWORD_DENSITY_MAX_PERCENT,
          minOccurrencesForStuffing: 3
        }
      );

      finalPrimaryDensity = audit.primaryDensity;
      keywordAuditWarnings = audit.warnings.length;

      for (const err of audit.criticalErrors) {
        keywordStuffingIssues.push(err);
        criticalErrors.push(err);
      }
      for (const warn of audit.warnings) {
        if (warn.includes('Repetitive phrase pattern')) {
          repetitionIssues.push(warn);
        } else {
          keywordStuffingIssues.push(warn);
        }
        warnings.push(warn);
      }

      // Check paragraph repetition of primary keyword
      const paragraphs = audit.cleanText.split(/\n\s*\n/).filter(p => p.trim().length > 0 && !p.trim().startsWith('#'));
      let kwParagraphCount = 0;
      const kwRegex = KeywordAuditService.buildKeywordRegex(primaryKeyword);
      for (const p of paragraphs) {
        kwRegex.lastIndex = 0;
        if (kwRegex.test(p)) {
          kwParagraphCount++;
        }
      }

      const pRatio = paragraphs.length > 0 ? (kwParagraphCount / paragraphs.length) : 0;
      if (paragraphs.length > 4 && pRatio > CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO) {
        const msg = `Unnatural keyword repetition: Primary keyword "${primaryKeyword}" appears in ${(pRatio * 100).toFixed(0)}% of body paragraphs (limit: ${(CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO * 100)}%).`;
        keywordStuffingIssues.push(msg);
        warnings.push(msg);
      }
    }

    // 4. Cross-Section Structural Repetition Check
    const sections = bodyMarkdown.split(/\n(?=##\s+)/);
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const secA = sections[i].trim();
        const secB = sections[j].trim();
        if (secA.length > 100 && secB.length > 100) {
          const sentencesA = secA.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 25);
          const sentencesB = secB.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 25);
          
          for (const sA of sentencesA) {
            const wordsCount = sA.split(/\s+/).filter(Boolean).length;
            if (wordsCount < 7) continue; // Don't flag short transition phrases
            for (const sB of sentencesB) {
              if (sA === sB) {
                const msg = `Boilerplate Alert: Identical sentence repeated across sections: "${sA.substring(0, 60)}..."`;
                repetitionIssues.push(msg);
                criticalErrors.push(msg);
                break;
              }
            }
          }

          // Check token Jaccard similarity across sections against policy threshold
          const tokensA = new Set(secA.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          const tokensB = new Set(secB.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          let inter = 0;
          for (const t of tokensA) { if (tokensB.has(t)) inter++; }
          const union = new Set([...tokensA, ...tokensB]).size;
          const similarity = union > 0 ? (inter / union) * 100 : 0;
          if (similarity > CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT) {
            const msg = `Cross-section structural similarity of ${similarity.toFixed(1)}% exceeds maximum allowable threshold (${CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT}%).`;
            repetitionIssues.push(msg);
            criticalErrors.push(msg);
          }
        }
      }
    }

    // 5. Target Business Facts Representation
    if (targetBrand) {
      const brandLower = targetBrand.toLowerCase();
      if (!bodyLower.includes(brandLower)) {
        const msg = `Target brand "${targetBrand}" is not referenced in the article content.`;
        accuracyIssues.push(msg);
        warnings.push(msg);
      }
    }

    // 6. Canonical Claim Extraction and Grounding Engine (Prompt 6 Factual Integrity)
    const knownCompetitors = Array.from(new Set(
      (brief.competitorInsights || []).flatMap(c => {
        const names: string[] = [];
        if (c.title) names.push(c.title);
        try {
          const host = new URL(c.url).hostname.replace('www.', '');
          names.push(host);
          const domainName = host.split('.')[0];
          if (domainName && domainName.length > 2) names.push(domainName);
        } catch {
          if (c.url) names.push(c.url);
        }
        return names;
      })
    ));

    const canonicalClaims = ClaimExtractionService.extractClaimsFromMarkdown(
      bodyMarkdown,
      targetBrand,
      knownCompetitors
    );

    const groundingResult = ClaimGroundingEngine.groundAllClaims(
      canonicalClaims,
      evidenceSet,
      sectionEvidenceMaps,
      targetBrand,
      knownCompetitors
    );

    // Apply Grounding Policy Thresholds
    // A. Contradictions (Critical)
    if (groundingResult.diagnostics.contradictionCount > CONTENT_INTELLIGENCE_POLICY.MAX_CONTRADICTIONS_ALLOWED) {
      for (const c of groundingResult.claims.filter(c => c.supportStatus === 'CONTRADICTED')) {
        const msg = `Factual Contradiction Alert: Claim "${c.sentence}" contradicts verified research evidence: ${c.rejectionReason}`;
        criticalErrors.push(msg);
        accuracyIssues.push(msg);
      }
    }

    // B. Entity Leakage (Critical)
    if (groundingResult.diagnostics.entityLeakageCount > CONTENT_INTELLIGENCE_POLICY.MAX_ENTITY_LEAKAGE_ALLOWED) {
      for (const c of groundingResult.claims.filter(c => c.rejectionReason?.includes('Entity isolation violation'))) {
        const msg = `Entity Isolation Alert: Claim "${c.sentence}" violates entity isolation: ${c.rejectionReason}`;
        criticalErrors.push(msg);
        accuracyIssues.push(msg);
      }
    }

    // C. Unattributed External Statistics (Critical)
    if (groundingResult.diagnostics.unattributedStatCount > CONTENT_INTELLIGENCE_POLICY.MAX_UNATTRIBUTED_STATS_ALLOWED) {
      for (const c of groundingResult.claims.filter(c => c.supportStatus === 'UNVERIFIABLE')) {
        const msg = `Unattributed Statistic Alert: External citation in "${c.sentence}" is not supported by verified research: ${c.rejectionReason}`;
        criticalErrors.push(msg);
        accuracyIssues.push(msg);
      }
    }

    // D. Critical Claim Grounding Rate (< 100% is Critical)
    const criticalClaimsCount = groundingResult.diagnostics.criticalClaims || 0;
    const criticalGroundingRate = groundingResult.diagnostics.criticalGroundingRate ?? 100;
    if (criticalClaimsCount > 0 && criticalGroundingRate < CONTENT_INTELLIGENCE_POLICY.CRITICAL_GROUNDING_RATE_MIN_PERCENT) {
      for (const c of groundingResult.claims.filter(c => c.materiality === 'CRITICAL' && c.supportStatus !== 'SUPPORTED' && c.supportStatus !== 'PARTIALLY_SUPPORTED')) {
        const msg = `Critical Claim Grounding Alert: Critical claim "${c.claimText}" in "${c.sentence}" is not grounded in research evidence: ${c.rejectionReason || 'No supporting evidence found.'}`;
        criticalErrors.push(msg);
        if (!unsupportedClaims.includes(c.claimText)) {
          unsupportedClaims.push(c.claimText);
        }
      }
    }

    // E. Overall Grounding Rate (< 70% is Warning)
    const totalClaimsCount = groundingResult.diagnostics.totalExtractedClaims || 0;
    const overallGroundingRate = groundingResult.diagnostics.groundingRate ?? 100;
    if (totalClaimsCount > 0 && overallGroundingRate < CONTENT_INTELLIGENCE_POLICY.GROUNDING_RATE_MIN_PERCENT) {
      warnings.push(`Overall claim grounding rate is ${overallGroundingRate}% (target: >= ${CONTENT_INTELLIGENCE_POLICY.GROUNDING_RATE_MIN_PERCENT}%).`);
    }

    // 7. Article Completeness, Listicle Promises, Entity Premise & CTA Verification (Phase 7)
    const completenessResults = this.validateCompletenessAndIntegrity(
      bodyMarkdown,
      brief,
      targetBrand,
      saasProfile
    );
    if (completenessResults.criticalErrors.length > 0) {
      criticalErrors.push(...completenessResults.criticalErrors);
      accuracyIssues.push(...completenessResults.criticalErrors);
    }
    if (completenessResults.warnings.length > 0) {
      warnings.push(...completenessResults.warnings);
    }

    // 8. Compute Diagnostics and Structured Decision Artifacts
    const publicationGateDecision: 'READY' | 'REJECTED' = criticalErrors.length === 0 ? 'READY' : 'REJECTED';
    const isRepairAttempted = Boolean(options?.repairAttempted);
    const isRepairPassed = options?.repairAttempted
      ? (options.repairPassedRevalidation ?? (criticalErrors.length === 0))
      : undefined;

    const structuredDiagnostics: GroundingDecisionDiagnostic[] = [];
    const groundingFailureBreakdown: Record<GroundingFailureCategory, number> = {
      TARGET_EVIDENCE_MISSING: 0,
      TARGET_EVIDENCE_LOW_CONFIDENCE: 0,
      ENTITY_ISOLATION_VIOLATION: 0,
      PROPOSITION_MISMATCH: 0,
      NEGATION_CONTRADICTION: 0,
      CONDITIONAL_GUARANTEE_MISMATCH: 0,
      STALE_EVIDENCE: 0,
      UNSUPPORTED_QUANTITATIVE_CLAIM: 0,
      REPAIR_UNAVAILABLE: 0,
      REPAIR_REVALIDATION_FAILED: 0,
    };

    for (const c of groundingResult.claims) {
      if (isRepairAttempted && !isRepairPassed && c.materiality === 'CRITICAL' && c.supportStatus !== 'SUPPORTED' && c.supportStatus !== 'PARTIALLY_SUPPORTED') {
        if (options?.unrepairableClaimIds?.includes(c.id)) {
          c.failureCategory = 'REPAIR_UNAVAILABLE';
        } else {
          c.failureCategory = 'REPAIR_REVALIDATION_FAILED';
        }
      }

      if (c.failureCategory && groundingFailureBreakdown[c.failureCategory] !== undefined) {
        groundingFailureBreakdown[c.failureCategory]++;
      }

      const groundedEv = allEvidence.filter(e => c.groundedEvidenceIds?.includes(e.id));
      const isEntityViolation = Boolean(c.rejectionReason?.includes('Entity isolation violation'));

      structuredDiagnostics.push({
        correlationId: ContentEvidenceValidator.sanitizeDiagnosticText(options?.correlationId || 'correlation-undefined'),
        claimId: c.id,
        claimText: ContentEvidenceValidator.sanitizeDiagnosticText(c.claimText),
        claimType: c.claimType,
        materiality: c.materiality,
        supportStatus: c.supportStatus,
        failureCategory: c.failureCategory,
        groundedEvidenceIds: c.groundedEvidenceIds || [],
        evidenceSources: groundedEv.map(e => ({
          id: e.id,
          sourceType: e.sourceType,
          sourceUrl: ContentEvidenceValidator.sanitizeDiagnosticUrl(e.sourceUrl),
          confidence: e.confidence,
          evidenceType: e.evidenceType,
        })),
        entityIsolationValid: !isEntityViolation,
        rejectionReason: c.rejectionReason ? ContentEvidenceValidator.sanitizeDiagnosticText(c.rejectionReason) : undefined,
        repairAttempted: isRepairAttempted,
        repairPassedRevalidation: isRepairPassed,
        publicationGateDecision,
      });
    }

    const sectionsCount = sectionEvidenceMaps?.length || brief.outline.length;
    const sectionsWithEvidence = (sectionEvidenceMaps || []).filter(m => m.evidenceIds.length > 0).length || sectionsCount;
    const sectionsWithoutEvidence = sectionsCount - sectionsWithEvidence;

    const diagnostics: ResearchIntelligenceDiagnostics = {
      evidenceCount: allEvidence.length,
      highConfidenceEvidenceCount: allEvidence.filter(e => e.confidence === 'HIGH').length,
      competitorObservationCount: allEvidence.filter(e => e.evidenceType === 'COMPETITOR_OBSERVATION' || e.evidenceType === 'STATISTIC').length,
      businessFactCount: allEvidence.filter(e => 
        e.evidenceType === 'BUSINESS_FACT' || 
        e.evidenceType === 'FEATURE' || 
        e.evidenceType === 'DIFFERENTIATOR' || 
        e.evidenceType === 'TECHNICAL_SPEC'
      ).length,
      inferenceCount: allEvidence.filter(e => e.evidenceType === 'INFERENCE').length,
      contentGapCount: gapMatrix?.summary?.totalGaps ?? gapMatrix?.gaps?.length ?? 0,
      highPriorityGapCount: gapMatrix?.summary?.highPriorityGaps ?? gapMatrix?.gaps?.filter(g => g.importance === 'HIGH').length ?? 0,
      sectionsWithEvidence,
      sectionsWithoutEvidence,
      unsupportedClaimCount: Math.max(unsupportedClaims.length, groundingResult.diagnostics.unsupportedClaims),
      evidenceUsageRate,
      repetitionFlags: repetitionIssues.length,
      keywordStuffingFlags: keywordStuffingIssues.length,
      keywordWarningCount: keywordAuditWarnings,
      primaryKeywordDensity: finalPrimaryDensity,
      claimGrounding: groundingResult.diagnostics,
      structuredGroundingDiagnostics: structuredDiagnostics,
      groundingFailureBreakdown,
    };

    return {
      passed: criticalErrors.length === 0,
      evidenceUsageRate,
      unsupportedClaims,
      keywordStuffingIssues,
      repetitionIssues,
      accuracyIssues,
      diagnostics,
      warnings,
      criticalErrors,
      canonicalClaims: groundingResult.claims,
      claimGroundingDiagnostics: groundingResult.diagnostics,
      structuredDiagnostics,
      groundingFailureBreakdown,
    };
  }

  /**
   * Deterministic Evidence-Use Heuristic:
   * Validates whether an evidence item is meaningfully utilized in the article text.
   *
   * Capabilities and Supported Behaviors:
   * A. Exact evidence phrase reuse: Detects contiguous n-grams (>= 3 words) verbatim.
   * B. Bounded lexical co-occurrence: Requires >= 3 distinctive tokens (or >= 60% for short claims)
   *    to co-occur within the exact same sentence.
   * C. Incidental-token rejection: Rejects isolated token matches or tokens dispersed across separate paragraphs.
   * D. Contradictory/reversed evidence meaning rejection: Disqualifies sentences that assert explicit negation
   *    or reversal of positive evidence claims (e.g. "does not provide", "fails to provide", "never delivers").
   *
   * Note on Paraphrase Behavior:
   * Legitimate paraphrases that retain key distinctive domain terminology within a single sentence are accepted
   * by bounded lexical co-occurrence. Paraphrases that substitute all vocabulary with distant synonyms will fail
   * this deterministic heuristic, as an LLM-based semantic judge is deliberately omitted to maintain predictable,
   * fast, and deterministic verification.
   */
  public static isEvidenceMeaningfullyUsed(ev: EvidenceItem, bodyMarkdown: string): boolean {
    const bodyLower = bodyMarkdown.toLowerCase();

    // Clean claim and isolate distinctive tokens
    const rawClaim = (ev.claim || '')
      .replace(/^[^:]+:\s*/, '') // Remove prefixes like "Smetytech provides verified capability: "
      .toLowerCase();

    const claimTokens = rawClaim
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3 && !this.GENERIC_CLAIM_STOPWORDS.has(t));

    if (claimTokens.length === 0) return false;

    // Helper: checks if a sentence contradicts/reverses a positive claim
    const isSentenceContradictory = (sentence: string): boolean => {
      for (const pat of this.NEGATION_PATTERNS) {
        if (pat.test(sentence) && !pat.test(rawClaim)) {
          return true; // Negated or contradictory assertion
        }
      }
      return false;
    };

    const sentences = bodyLower.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 20);

    // Rule 1: Multi-word phrase / n-gram match (length >= 3 distinctive words)
    if (claimTokens.length >= 3) {
      for (let i = 0; i <= claimTokens.length - 3; i++) {
        const triGram = `${claimTokens[i]} ${claimTokens[i + 1]} ${claimTokens[i + 2]}`;
        if (bodyLower.includes(triGram)) {
          // Verify that the sentence containing this triGram does not contradict/reverse the evidence
          const matchingSentence = sentences.find(s => s.includes(triGram));
          if (!matchingSentence || !isSentenceContradictory(matchingSentence)) {
            return true; // Verified contiguous non-contradictory phrase usage
          }
        }
      }
    }

    // Rule 2: Bounded Sentence-Level Co-occurrence
    // At least 3 significant tokens (or >=60% of distinctive tokens for short claims)
    // MUST co-occur within the exact same sentence, and the sentence must not contradict the claim.
    const requiredCooccurrence = Math.min(3, Math.ceil(claimTokens.length * 0.6));

    for (const sent of sentences) {
      let sentenceMatches = 0;
      for (const token of claimTokens) {
        if (sent.includes(token)) {
          sentenceMatches++;
        }
      }
      if (sentenceMatches >= requiredCooccurrence) {
        if (!isSentenceContradictory(sent)) {
          return true; // Meaningful, non-contradictory sentence-level evidence usage
        }
      }
    }

    // Incidental-token and dispersed-token rejection:
    // Isolated tokens or tokens scattered across disparate paragraphs do NOT count as evidence usage.
    return false;
  }

  /**
   * Deterministically normalizes quantitative terms and currencies to assist equivalent format matching.
   * (e.g. "99.9 percent" -> "99.9%", "USD 1.2 million" -> "$1.2m").
   * Note: This is an evidence-backed deterministic heuristic, not a semantic equivalence engine.
   */
  public static normalizeQuantitativeString(str: string): string {
    return str.toLowerCase()
      .replace(/\s*percent\b/g, '%')
      .replace(/\busd\s*/g, '$')
      .replace(/\beur\s*/g, '€')
      .replace(/\bgbp\s*/g, '£')
      .replace(/\s*dollars?\b/g, '')
      .replace(/\s*euros?\b/g, '')
      .replace(/\s*million\b/g, 'm')
      .replace(/\s*billion\b/g, 'b')
      .replace(/,/g, '');
  }

  /**
   * Extracts generalized quantitative claims from article text.
   */
  private static extractQuantitativeClaims(bodyMarkdown: string): string[] {
    const claims: string[] = [];
    const seen = new Set<string>();

    for (const regex of this.QUANTITATIVE_REGEXES) {
      const matches = bodyMarkdown.match(regex) || [];
      for (const m of matches) {
        const clean = m.trim();
        if (!seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          claims.push(clean);
        }
      }
    }

    return claims;
  }

  private static NON_ITEM_HEADING_PATTERNS = [
    /^(?:introduction|overview|background|summary|conclusion|final thoughts|wrapping up|next steps|verdict)\b/i,
    /^(?:how to choose|how we (?:tested|evaluated|picked)|evaluation criteria|buying guide|key factors|what to look for)\b/i,
    /^(?:frequently asked questions|faq|faqs|common questions|q&a)\b/i,
    /^(?:understanding|what is|why you need|methodology)\b/i,
    /^(?:compar|comparing|comparison|versus|vs)\b/i,
    /^(?:case study|case studies)\b/i
  ];

  public static isItemHeading(headingText: string): boolean {
    const clean = headingText.replace(/^[#\s\d\.\-\:\)]+/, '').trim().toLowerCase();
    if (!clean || clean.length < 2) return false;
    return !this.NON_ITEM_HEADING_PATTERNS.some(pat => pat.test(clean));
  }

  public static extractPromisedListicleCount(title: string): number | null {
    if (!title) return null;
    const cleanTitle = title.trim();

    // Pattern 1: e.g. "Top 7 Best ...", "7 Best ...", "Top 10 Collaboration Tools ...", "15 Alternatives to ..."
    const match1 = cleanTitle.match(/\b(?:top\s+)?(\d{1,2})\s+(?:best\s+|top\s+)?(?:[a-z0-9-]+\s+)?(?:alternatives|tools|platforms|software|apps|ways|strategies|solutions|reasons|tips|steps|examples|practices|recommendations|rules|metrics|services|options|methods|environments|ides|products|approaches|libraries)\b/i);
    if (match1 && match1[1]) {
      const num = parseInt(match1[1], 10);
      if (num >= 2 && num <= 50) return num;
    }

    // Pattern 2: e.g. "Top 5 ...", "Top 10 ..."
    const matchTop = cleanTitle.match(/^top\s+(\d{1,2})\s+[A-Za-z]/i);
    if (matchTop && matchTop[1]) {
      const num = parseInt(matchTop[1], 10);
      if (num >= 2 && num <= 50) return num;
    }

    // Pattern 3: e.g. "Best 7 ...", "7 Alternatives ..."
    const match2 = cleanTitle.match(/^(\d{1,2})\s+[A-Za-z]/);
    if (match2 && match2[1]) {
      const num = parseInt(match2[1], 10);
      if (num >= 2 && num <= 50) return num;
    }

    // Pattern 3: e.g. "...: 5 Best Tools", "... - 10 Ways to ..."
    const match3 = cleanTitle.match(/[:\-–—]\s*(?:top\s+)?(\d{1,2})\s+[A-Za-z]/i);
    if (match3 && match3[1]) {
      const num = parseInt(match3[1], 10);
      if (num >= 2 && num <= 50) return num;
    }

    return null;
  }

  public static validateCompletenessAndIntegrity(
    bodyMarkdown: string,
    brief: ContentBrief,
    targetBrand?: string,
    saasProfile?: any
  ): { criticalErrors: string[]; warnings: string[] } {
    const criticalErrors: string[] = [];
    const warnings: string[] = [];
    const title = brief.title || '';
    const promisedCount = this.extractPromisedListicleCount(title);

    // 1. Placeholder detection (applies to all content)
    const placeholderMatches = bodyMarkdown.match(/\[(?:insert|add|tbd|placeholder|todo)[^\]]*\]|\b(?:TODO|TBD|PLACEHOLDER)\b/gi) || [];
    if (placeholderMatches.length > 0) {
      const uniquePlaceholders = Array.from(new Set(placeholderMatches));
      criticalErrors.push(`Article Completeness Alert: Incomplete placeholder text detected: ${uniquePlaceholders.slice(0, 3).map(p => `"${p}"`).join(', ')}.`);
    }

    // 2. Section parsing & duplicate heading detection (applies to all content)
    const textWithoutCodeBlocks = bodyMarkdown.replace(/```[\s\S]*?```/g, '');
    const headingLines = textWithoutCodeBlocks.match(/^#{2,3}\s+(.+)$/gm) || [];
    const sectionHeadings = headingLines.map(h => h.replace(/^#{2,3}\s+/, '').trim());

    const seenHeadings = new Set<string>();
    const dupHeadings = new Set<string>();
    for (const heading of sectionHeadings) {
      const norm = heading.toLowerCase().replace(/^[#\s\d\.\-\:\)]+/, '').trim();
      if (norm.length > 3) {
        if (seenHeadings.has(norm)) {
          dupHeadings.add(heading);
        } else {
          seenHeadings.add(norm);
        }
      }
    }
    if (dupHeadings.size > 0) {
      criticalErrors.push(`Article Completeness Alert: Duplicate section heading detected: ${Array.from(dupHeadings).map(h => `"${h}"`).join(', ')}.`);
    }

    // 2.1 Cross-section boilerplate and repeated sentence detection
    const allSecBlocks = textWithoutCodeBlocks.split(/\n(?=#{2,3}\s+)/);
    if (allSecBlocks.length > 1) {
      const sentenceToSections = new Map<string, { count: number; raw: string; sections: string[] }>();
      const sectionParagraphs: { heading: string; paras: string[] }[] = [];

      for (const block of allSecBlocks) {
        const headingMatch = block.match(/^#{2,3}\s+(.+)/);
        const heading = headingMatch ? headingMatch[1].trim() : 'Intro';
        const bodyOnly = block.replace(/^#{2,3}\s+.*$/m, '').trim();
        const paras = bodyOnly.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0 && !p.startsWith('#') && !p.startsWith('|'));
        sectionParagraphs.push({ heading, paras });

        for (const p of paras) {
          const sentences = p.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 35);
          for (const s of sentences) {
            const cleanS = s.toLowerCase().replace(/[^\w\s]/g, '').trim();
            const words = cleanS.split(/\s+/).filter(Boolean);
            if (words.length >= 7) {
              const normKey = words.join(' ');
              const existing = sentenceToSections.get(normKey);
              if (existing) {
                existing.count++;
                if (!existing.sections.includes(heading)) existing.sections.push(heading);
              } else {
                sentenceToSections.set(normKey, { count: 1, raw: s, sections: [heading] });
              }
            }
          }
        }
      }

      for (const entry of sentenceToSections.values()) {
        if (entry.sections.length >= 2 && entry.count >= 2) {
          criticalErrors.push(`Article Completeness Alert: Generic boilerplate sentence repeated across multiple sections: "${entry.raw.slice(0, 75)}...".`);
          break;
        }
      }

      for (let i = 0; i < sectionParagraphs.length; i++) {
        for (let j = i + 1; j < sectionParagraphs.length; j++) {
          const secA = sectionParagraphs[i];
          const secB = sectionParagraphs[j];
          for (const pA of secA.paras) {
            const wordsA = pA.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
            if (wordsA.length < 15) continue;
            for (const pB of secB.paras) {
              const wordsB = pB.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
              if (wordsB.length < 15) continue;
              const setA = new Set(wordsA);
              const setB = new Set(wordsB);
              let inter = 0;
              for (const w of setA) { if (setB.has(w)) inter++; }
              const union = setA.size + setB.size - inter;
              const sim = union > 0 ? inter / union : 0;
              if (sim >= 0.75) {
                criticalErrors.push(`Article Completeness Alert: Highly repetitive or duplicate paragraph detected across sections "${secA.heading}" and "${secB.heading}" (${Math.round(sim * 100)}% similarity).`);
                break;
              }
            }
          }
        }
      }
    }

    // 2.2 Unverified Corporate Capability Claim Gate
    const unverifiedCapMatch = bodyMarkdown.match(/\b([A-Za-z0-9_.-]+)\s+provides\s+verified\s+(?:capability|service offering):\s*([^.\n]+)/gi);
    if (unverifiedCapMatch) {
      for (const capStr of unverifiedCapMatch) {
        criticalErrors.push(`Unverified Corporate Capability Alert: Unsupported assertion of verified capability: "${capStr.trim()}". Capability claims must have traceable external benchmark provenance.`);
      }
    }

    // 3. Listicle promise and stub item validation (applies when title promises N items)
    if (promisedCount !== null && promisedCount > 0) {
      const sectionBlocks = textWithoutCodeBlocks.split(/\n(?=#{2,3}\s+)/);
      const substantiveItems: { heading: string; wordCount: number }[] = [];

      for (const block of sectionBlocks) {
        const headingMatch = block.match(/^#{2,3}\s+(.+)/);
        if (!headingMatch) continue;
        const heading = headingMatch[1].trim();

        if (this.isItemHeading(heading)) {
          const bodyLines = block.split('\n').slice(1).join(' ');
          const words = bodyLines.split(/\s+/).filter(Boolean);
          const wordCount = words.length;

          if (wordCount < 25) {
            criticalErrors.push(`Article Completeness Alert: Section "${heading}" is an incomplete stub with only ${wordCount} words.`);
          } else {
            substantiveItems.push({ heading, wordCount });
          }
        }
      }

      if (substantiveItems.length < promisedCount) {
        criticalErrors.push(`Article Completeness Alert: Title promises ${promisedCount} items, but content only provides ${substantiveItems.length} distinct substantive sections.`);
      }
    }

    // 4. Entity Premise Validation
    const businessType = saasProfile?.businessType;
    if (businessType && businessType !== 'SaaS') {
      const brandClean = (targetBrand || saasProfile?.name || '').trim();
      if (brandClean) {
        const brandEscaped = brandClean.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const softwareAssertions = [
          new RegExp(`\\b${brandEscaped}\\b\\s+(?:is|offers?|provides?)\\s+(?:a|an)?\\s*(?:all-in-one\\s+)?(?:software|collaboration\\s+(?:tool|platform|software)|task\\s+management\\s+(?:tool|platform|software)|saas\\s+platform|cloud\\s+tool|project\\s+management\\s+platform)`, 'i'),
          new RegExp(`(?:software|collaboration\\s+(?:tool|platform)|task\\s+management\\s+platform)\\s+like\\s+\\b${brandEscaped}\\b`, 'i'),
          new RegExp(`\\b${brandEscaped}\\b\\s+alternatives\\b`, 'i'),
          new RegExp(`\\balternatives\\s+to\\s+\\b${brandEscaped}\\b`, 'i')
        ];

        for (const pat of softwareAssertions) {
          if (pat.test(bodyMarkdown)) {
            criticalErrors.push(`Entity Premise Alert: Entity premise violation: Target brand "${brandClean}" is an ${businessType}, but content treats it as software/SaaS.`);
            break;
          }
        }
      }

      // 5. CTA Relevance Validation
      const ctaMismatchPat = /(?:start\s+(?:your\s+)?(?:14-day\s+|30-day\s+|free\s+)?trial|sign\s+up\s+for\s+(?:free|the\s+software|the\s+platform)|download\s+(?:the\s+app|the\s+software)|create\s+(?:your\s+)?free\s+account)/i;
      const tailContent = bodyMarkdown.slice(Math.floor(bodyMarkdown.length * 0.7));
      if (ctaMismatchPat.test(tailContent) || (brief.ctaStrategy && ctaMismatchPat.test(brief.ctaStrategy))) {
        criticalErrors.push(`CTA Relevance Alert: Contextual CTA proposes a software trial or account signup for an ${businessType} business.`);
      }
    }

    return { criticalErrors, warnings };
  }

  public static validateHtmlCompleteness(
    html: string,
    title: string,
    targetBrand?: string,
    saasProfile?: any
  ): { passed: boolean; criticalErrors: string[]; warnings: string[] } {
    const criticalErrors: string[] = [];
    const warnings: string[] = [];
    const promisedCount = this.extractPromisedListicleCount(title);

    // 1. Placeholder detection
    const placeholderMatches = html.match(/\[(?:insert|add|tbd|placeholder|todo)[^\]]*\]|\b(?:TODO|TBD|PLACEHOLDER)\b/gi) || [];
    if (placeholderMatches.length > 0) {
      const uniquePlaceholders = Array.from(new Set(placeholderMatches));
      criticalErrors.push(`Article Completeness Alert: Incomplete placeholder text detected in HTML: ${uniquePlaceholders.slice(0, 3).map(p => `"${p}"`).join(', ')}.`);
    }

    // 2. Headings and item sections
    const headingMatches = Array.from(html.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi)).map(m => m[1].replace(/<[^>]*>/g, '').trim());
    const seenHeadings = new Set<string>();
    const dupHeadings = new Set<string>();

    for (const heading of headingMatches) {
      const norm = heading.toLowerCase().replace(/^[#\s\d\.\-\:\)]+/, '').trim();
      if (norm.length > 3) {
        if (seenHeadings.has(norm)) {
          dupHeadings.add(heading);
        } else {
          seenHeadings.add(norm);
        }
      }
    }
    if (dupHeadings.size > 0) {
      criticalErrors.push(`Article Completeness Alert: Duplicate section heading detected: ${Array.from(dupHeadings).map(h => `"${h}"`).join(', ')}.`);
    }

    // 2.1 Cross-section boilerplate and repeated sentence detection in HTML
    const sectionHtmlPartsAll = html.split(/(?=<h[23][^>]*>)/i);
    if (sectionHtmlPartsAll.length > 1) {
      const sentenceToSections = new Map<string, { count: number; raw: string; sections: string[] }>();
      const sectionParagraphs: { heading: string; paras: string[] }[] = [];

      for (const part of sectionHtmlPartsAll) {
        const hMatch = part.match(/<h[23][^>]*>(.*?)<\/h[23]>/i);
        const heading = hMatch ? hMatch[1].replace(/<[^>]*>/g, '').trim() : 'Intro';
        const pMatches = Array.from(part.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)).map(m => m[1].replace(/<[^>]*>/g, '').trim());
        sectionParagraphs.push({ heading, paras: pMatches });

        for (const p of pMatches) {
          const sentences = p.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 35);
          for (const s of sentences) {
            const cleanS = s.toLowerCase().replace(/[^\w\s]/g, '').trim();
            const words = cleanS.split(/\s+/).filter(Boolean);
            if (words.length >= 7) {
              const normKey = words.join(' ');
              const existing = sentenceToSections.get(normKey);
              if (existing) {
                existing.count++;
                if (!existing.sections.includes(heading)) existing.sections.push(heading);
              } else {
                sentenceToSections.set(normKey, { count: 1, raw: s, sections: [heading] });
              }
            }
          }
        }
      }

      for (const entry of sentenceToSections.values()) {
        if (entry.sections.length >= 2 && entry.count >= 2) {
          criticalErrors.push(`Article Completeness Alert: Generic boilerplate sentence repeated across multiple sections: "${entry.raw.slice(0, 75)}...".`);
          break;
        }
      }

      for (let i = 0; i < sectionParagraphs.length; i++) {
        for (let j = i + 1; j < sectionParagraphs.length; j++) {
          const secA = sectionParagraphs[i];
          const secB = sectionParagraphs[j];
          for (const pA of secA.paras) {
            const wordsA = pA.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
            if (wordsA.length < 15) continue;
            for (const pB of secB.paras) {
              const wordsB = pB.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
              if (wordsB.length < 15) continue;
              const setA = new Set(wordsA);
              const setB = new Set(wordsB);
              let inter = 0;
              for (const w of setA) { if (setB.has(w)) inter++; }
              const union = setA.size + setB.size - inter;
              const sim = union > 0 ? inter / union : 0;
              if (sim >= 0.75) {
                criticalErrors.push(`Article Completeness Alert: Highly repetitive or duplicate paragraph detected across sections "${secA.heading}" and "${secB.heading}" (${Math.round(sim * 100)}% similarity).`);
                break;
              }
            }
          }
        }
      }
    }

    // 2.2 Unverified Corporate Capability Claim Gate in HTML
    const unverifiedCapMatchHtml = html.match(/\b([A-Za-z0-9_.-]+)\s+provides\s+verified\s+(?:capability|service offering):\s*([^<.\n]+)/gi);
    if (unverifiedCapMatchHtml) {
      for (const capStr of unverifiedCapMatchHtml) {
        criticalErrors.push(`Unverified Corporate Capability Alert: Unsupported assertion of verified capability: "${capStr.replace(/<[^>]*>/g, '').trim()}". Capability claims must have traceable external benchmark provenance.`);
      }
    }

    // Listicle promise and stub item validation (applies when title promises N items)
    if (promisedCount !== null && promisedCount > 0) {
      const sectionHtmlParts = html.split(/(?=<h[23][^>]*>)/i);
      const substantiveItems: { heading: string; wordCount: number }[] = [];

      for (const part of sectionHtmlParts) {
        const hMatch = part.match(/<h[23][^>]*>(.*?)<\/h[23]>/i);
        if (!hMatch) continue;
        const heading = hMatch[1].replace(/<[^>]*>/g, '').trim();

        if (this.isItemHeading(heading)) {
          // Strip tags and heading
          const textOnly = part.replace(/<h[23][^>]*>.*?<\/h[23]>/i, '').replace(/<[^>]*>/g, ' ').trim();
          const words = textOnly.split(/\s+/).filter(Boolean);
          const wordCount = words.length;

          if (wordCount < 25) {
            criticalErrors.push(`Article Completeness Alert: Section "${heading}" is an incomplete stub with only ${wordCount} words.`);
          } else {
            substantiveItems.push({ heading, wordCount });
          }
        }
      }

      if (substantiveItems.length < promisedCount) {
        criticalErrors.push(`Article Completeness Alert: Title promises ${promisedCount} items, but HTML content only provides ${substantiveItems.length} distinct substantive sections.`);
      }
    }

    // 3. Entity Premise & CTA checks on HTML
    const businessType = saasProfile?.businessType;
    if (businessType && businessType !== 'SaaS') {
      const brandClean = (targetBrand || saasProfile?.name || '').trim();
      if (brandClean) {
        const brandEscaped = brandClean.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const textOnly = html.replace(/<[^>]*>/g, ' ');
        const softwareAssertions = [
          new RegExp(`\\b${brandEscaped}\\b\\s+(?:is|offers?|provides?)\\s+(?:a|an)?\\s*(?:all-in-one\\s+)?(?:software|collaboration\\s+(?:tool|platform|software)|task\\s+management\\s+(?:tool|platform|software)|saas\\s+platform|cloud\\s+tool|project\\s+management\\s+platform)`, 'i'),
          new RegExp(`(?:software|collaboration\\s+(?:tool|platform)|task\\s+management\\s+platform)\\s+like\\s+\\b${brandEscaped}\\b`, 'i'),
          new RegExp(`\\b${brandEscaped}\\b\\s+alternatives\\b`, 'i'),
          new RegExp(`\\balternatives\\s+to\\s+\\b${brandEscaped}\\b`, 'i')
        ];

        for (const pat of softwareAssertions) {
          if (pat.test(textOnly)) {
            criticalErrors.push(`Entity Premise Alert: Entity premise violation: Target brand "${brandClean}" is an ${businessType}, but content treats it as software/SaaS.`);
            break;
          }
        }
      }

      const ctaMismatchPat = /(?:start\s+(?:your\s+)?(?:14-day\s+|30-day\s+|free\s+)?trial|sign\s+up\s+for\s+(?:free|the\s+software|the\s+platform)|download\s+(?:the\s+app|the\s+software)|create\s+(?:your\s+)?free\s+account)/i;
      const tailContent = html.slice(Math.floor(html.length * 0.7));
      if (ctaMismatchPat.test(tailContent)) {
        criticalErrors.push(`CTA Relevance Alert: Contextual CTA proposes a software trial or account signup for an ${businessType} business.`);
      }
    }

    return {
      passed: criticalErrors.length === 0,
      criticalErrors,
      warnings
    };
  }
}
