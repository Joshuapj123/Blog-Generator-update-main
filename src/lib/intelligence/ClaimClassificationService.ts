// src/lib/intelligence/ClaimClassificationService.ts
import { ClaimClassification, EvidenceItem, EvidenceSet } from '@/core/contracts/evidence';

export interface ClaimClassificationResult {
  statement: string;
  classification: ClaimClassification;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  supportingEvidenceId?: string;
  reason: string;
  isFakeAttribution?: boolean;
}

export class ClaimClassificationService {
  private static HEDGING_PATTERNS = [
    /\b(?:suggests|indicates|implies|likely|possibly|may indicate|could mean|inferred|appears to be|seems to)\b/i,
  ];

  private static RECOMMENDATION_PATTERNS = [
    /\b(?:should|recommend|recommended|consider|advisable|best practice|we suggest|it is crucial to|must ensure)\b/i,
  ];

  private static MARKETING_PATTERNS = [
    /\b(?:the best|premier|world-class|unrivaled|revolutionary|game-changing|cutting-edge|unmatched|superior to all|state-of-the-art)\b/i,
  ];

  private static ATTRIBUTION_PATTERNS = [
    /\b(?:according to|as reported by|published by|cited by|source:|cite:|per)\s+([A-Za-z0-9&.-]+(?:\s+[A-Za-z0-9&.-]+)?)/i,
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/i,
  ];

  /**
   * Generalized Quantitative Claim Patterns:
   * Percentages, Currency, Performance Metrics, Durations, Quantities, and Multipliers.
   */
  private static QUANTITATIVE_PATTERNS = [
    /\b\d+(?:\.\d+)?\s*(?:%|\bpercent\b)/i, // Percentages: 12.7%, 99.95%, 99.9 percent
    /(?:[\$€£]\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b(?:USD|EUR|GBP)\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:USD|EUR|GBP|dollars|euros|million|billion|k|m|b)\b)/i, // Currency: $1.2M, EUR 450,000, USD 1.2 million
    /\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:ms|milliseconds|seconds|req\/s|rps|tps|qps|gbps|mbps|tb|gb|mb|ghz|iops)\b/i, // Metrics: 45ms, 15,000 req/s
    /\b\d+(?:\.\d+)?\s*(?:times|x|fold)\s*(?:faster|more|growth|increase|cheaper|reduction)\b/i, // Multipliers: 10x faster
    /\b\d+\s*(?:days?|weeks?|months?|quarters?|years?|hours?)\b/i, // Durations: 6 months
    /\b\d+\s*(?:out of|\/)\s*\d+\b/i, // Fractions: 9 out of 10
    /\b\d+(?:,\d+)?\s*(?:users|clients|nodes|servers|clusters|engineers|microservices|pipelines|tenants)\b/i, // Quantities
  ];

  /**
   * Classifies a statement against the provided EvidenceSet.
   */
  public static classifyClaim(
    statement: string, 
    evidenceSet?: EvidenceSet
  ): ClaimClassificationResult {
    const trimmed = (statement || '').trim();
    if (!trimmed) {
      return {
        statement: '',
        classification: 'UNSUPPORTED',
        confidence: 'LOW',
        reason: 'Empty statement.',
      };
    }

    // 1. Check for Marketing Claim
    for (const pat of this.MARKETING_PATTERNS) {
      if (pat.test(trimmed)) {
        return {
          statement: trimmed,
          classification: 'MARKETING_CLAIM',
          confidence: 'HIGH',
          reason: 'Subjective promotional or superlative language detected.',
        };
      }
    }

    // 2. Check for Recommendation
    for (const pat of this.RECOMMENDATION_PATTERNS) {
      if (pat.test(trimmed)) {
        return {
          statement: trimmed,
          classification: 'RECOMMENDATION',
          confidence: 'HIGH',
          reason: 'Prescriptive advisory language detected.',
        };
      }
    }

    // 3. Check for Inference / Hedging
    for (const pat of this.HEDGING_PATTERNS) {
      if (pat.test(trimmed)) {
        return {
          statement: trimmed,
          classification: 'INFERENCE',
          confidence: 'HIGH',
          reason: 'Deductive or hedging phrasing detected.',
        };
      }
    }

    // 4. Check for External Sourced Attribution
    for (const pat of this.ATTRIBUTION_PATTERNS) {
      const match = trimmed.match(pat);
      if (match) {
        const attributedName = (match[1] || '').trim();
        const attributedUrl = (match[2] || '').trim();

        // Search EvidenceSet for matching source or claim
        let verifiedItem: EvidenceItem | undefined;
        if (evidenceSet?.items && evidenceSet.items.length > 0) {
          verifiedItem = evidenceSet.items.find(item => {
            const title = (item.sourceTitle || '').toLowerCase();
            const url = (item.sourceUrl || '').toLowerCase();
            const claim = item.claim.toLowerCase();
            const entities = (item.entities || []).map(e => e.toLowerCase());

            const nameMatch = attributedName && (
              title.includes(attributedName.toLowerCase()) || 
              entities.includes(attributedName.toLowerCase()) || 
              claim.includes(attributedName.toLowerCase())
            );
            const urlMatch = attributedUrl && url.includes(attributedUrl.toLowerCase());
            const textMatch = this.calculateTokenOverlap(trimmed, item.claim) >= 0.35;

            return Boolean(nameMatch || urlMatch || textMatch);
          });
        }

        if (verifiedItem) {
          return {
            statement: trimmed,
            classification: 'SOURCED_CLAIM',
            confidence: 'HIGH',
            supportingEvidenceId: verifiedItem.id,
            reason: `Verified external source attribution grounded in research evidence (${verifiedItem.id}).`,
          };
        } else {
          return {
            statement: trimmed,
            classification: 'UNSUPPORTED',
            confidence: 'HIGH',
            isFakeAttribution: true,
            reason: `External attribution detected ("${match[0]}") but no corresponding source or evidence found in verified research set.`,
          };
        }
      }
    }

    // 5. Match against EvidenceSet items
    if (evidenceSet && evidenceSet.items && evidenceSet.items.length > 0) {
      const match = this.findBestEvidenceMatch(trimmed, evidenceSet.items);
      if (match) {
        if (
          match.evidenceType === 'BUSINESS_FACT' || 
          match.evidenceType === 'FEATURE' || 
          match.evidenceType === 'DIFFERENTIATOR' || 
          match.evidenceType === 'TECHNICAL_SPEC' ||
          match.sourceType === 'TARGET_SITE'
        ) {
          return {
            statement: trimmed,
            classification: 'BUSINESS_FACT',
            confidence: match.confidence,
            supportingEvidenceId: match.id,
            reason: `Grounded in target business profile (${match.id}).`,
          };
        }
        if (match.evidenceType === 'COMPETITOR_OBSERVATION') {
          return {
            statement: trimmed,
            classification: 'COMPETITOR_OBSERVATION',
            confidence: match.confidence,
            supportingEvidenceId: match.id,
            reason: `Grounded in competitor observation (${match.id}).`,
          };
        }
        if (match.evidenceType === 'SERP_OBSERVATION') {
          return {
            statement: trimmed,
            classification: 'SERP_OBSERVATION',
            confidence: match.confidence,
            supportingEvidenceId: match.id,
            reason: `Grounded in SERP ranking observation (${match.id}).`,
          };
        }
        return {
          statement: trimmed,
          classification: 'VERIFIED_FACT',
          confidence: match.confidence,
          supportingEvidenceId: match.id,
          reason: `Grounded in verified research evidence (${match.id}).`,
        };
      }
    }

    // 6. Check for Unsupported Quantitative / Statistical Claims
    for (const pat of this.QUANTITATIVE_PATTERNS) {
      if (pat.test(trimmed)) {
        return {
          statement: trimmed,
          classification: 'UNSUPPORTED',
          confidence: 'HIGH',
          reason: 'Specific quantitative, performance, or numerical claim without supporting research evidence.',
        };
      }
    }

    // 7. General factual assertion without matching evidence -> UNSUPPORTED
    return {
      statement: trimmed,
      classification: 'UNSUPPORTED',
      confidence: 'MEDIUM',
      reason: 'No grounding evidence found in verified research set.',
    };
  }

  /**
   * Calculates token overlap ratio between two strings.
   */
  public static calculateTokenOverlap(s1: string, s2: string): number {
    const t1 = new Set(s1.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 3));
    const t2 = new Set(s2.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 3));
    if (t1.size === 0 || t2.size === 0) return 0;
    let match = 0;
    for (const t of t1) {
      if (t2.has(t)) match++;
    }
    return match / Math.min(t1.size, t2.size);
  }

  /**
   * Finds the best evidence match using token overlap and entity containment.
   */
  private static findBestEvidenceMatch(
    statement: string, 
    items: EvidenceItem[]
  ): EvidenceItem | undefined {
    const normStatement = statement.toLowerCase().replace(/[^\w\s]/g, ' ');
    const statementTokens = new Set(
      normStatement.split(/\s+/).filter(t => t.length > 3 && !['with', 'from', 'that', 'this', 'their', 'which', 'about'].includes(t))
    );

    if (statementTokens.size === 0) return undefined;

    let bestMatch: EvidenceItem | undefined;
    let highestScore = 0;

    for (const item of items) {
      const normClaim = item.claim.toLowerCase().replace(/[^\w\s]/g, ' ');
      const claimTokens = normClaim.split(/\s+/).filter(t => t.length > 3);
      
      let matchCount = 0;
      for (const t of claimTokens) {
        if (statementTokens.has(t)) matchCount++;
      }

      // Check entity overlap
      if (item.entities) {
        for (const ent of item.entities) {
          if (normStatement.includes(ent.toLowerCase())) {
            matchCount += 2;
          }
        }
      }

      const score = matchCount / Math.max(statementTokens.size, 4);
      if (score >= 0.4 && score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    return bestMatch;
  }
}
