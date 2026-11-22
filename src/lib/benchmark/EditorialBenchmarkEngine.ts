/**
 * ACUTE Phase 6D.6: Independent Real-World Editorial Benchmark Engine
 *
 * Mode: RUTHLESS MENTOR — FAST EXECUTION, EVIDENCE FIRST, ZERO PRODUCTION RISK
 *
 * Evaluates generated content across 6 orthogonal dimensions:
 * 1. D1: Factual Grounding & Verifiability (weight: 0.20)
 * 2. D2: Evidence Quality & Provenance Integrity (weight: 0.20)
 * 3. D3: Actionable Technical Utility (weight: 0.20)
 * 4. D4: Practitioner Depth & Nuance (weight: 0.15)
 * 5. D5: Conciseness & Fluff Elimination (weight: 0.15)
 * 6. D6: Repair Safety & Invariant Guard (weight: 0.10)
 */

export interface BenchmarkDimensionScores {
  d1_factualGrounding: number;
  d2_evidenceQuality: number;
  d3_actionableUtility: number;
  d4_practitionerDepth: number;
  d5_fluffElimination: number;
  d6_repairSafety: number;
}

export type BenchmarkDecision = 'PASS' | 'PASS_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'REJECT';

export interface BenchmarkEvaluationResult {
  taskId: string;
  taskName: string;
  domain: string;
  compositeScore: number;
  decision: BenchmarkDecision;
  dimensionScores: BenchmarkDimensionScores;
  criticalFlags: string[];
  warningFlags: string[];
  humanReviewRequired: boolean;
  humanReviewReasons: string[];
  metrics: {
    numbersFound: number;
    numbersGrounded: number;
    codeBlocksCount: number;
    commandsCount: number;
    tradeoffsMentioned: boolean;
    failureModesMentioned: boolean;
    fluffPhrasesDetected: string[];
    sentenceStarterRepetitions: number;
  };
}

export interface BenchmarkTaskInput {
  id: string;
  name: string;
  domain: string;
  taskType: 'SUBSTANTIVE' | 'ADVERSARIAL_NEGATIVE';
  articleMarkdown: string;
  evidenceSet?: any;
  practitionerProfile?: any;
  workedFindings?: any[];
  repairLog?: any[];
  expectedDecision?: BenchmarkDecision;
  expectedFlags?: string[];
}

export class EditorialBenchmarkEngine {
  // Preamble boilerplate fluff patterns to penalize in D5
  private static readonly BOILERPLATE_PATTERNS = [
    /\bin today's fast-paced/i,
    /\bin the modern era of/i,
    /\bin an increasingly digital world/i,
    /\bit is crucial to understand that/i,
    /\bwithout further ado/i,
    /\bplays a vital role in/i,
    /\bserve as a testament to/i,
    /\blet's dive deep into/i,
    /\bnavigating the landscape of/i,
    /\bparadigm shift\b/i,
    /\bgame changer\b/i
  ];

  // Generic truisms to penalize in D3
  private static readonly TRUISM_PATTERNS = [
    /\bensure alignment across teams\b/i,
    /\bcollaborate effectively with stakeholders\b/i,
    /\boptimize continuously for best results\b/i,
    /\bwork hard and stay focused\b/i,
    /\bwrite good tests to find bugs\b/i,
    /\bfoster a culture of innovation\b/i,
    /\bleverage best practices\b/i,
    /\bmonitor metrics regularly\b/i
  ];

  // Concrete operational / validation commands to reward in D3
  private static readonly COMMAND_PATTERNS = [
    /\b(curl|wget|kubectl|helm|docker|git|pg_stat|kafka-consumer-groups|top|htop|systemctl|npm|npx|cargo|pip)\b/i,
    /```(bash|sh|sql|yaml|json|ts|typescript|js|python|ini|conf)/i,
    /\b(SELECT|EXPLAIN ANALYZE|ALTER SYSTEM|SET |SHOW |CREATE INDEX)\b/i,
    /\b(\.conf|\.yaml|\.json|\.toml|\.ini|my\.cnf|pg_hba\.conf)\b/i
  ];

  // Operational trade-offs & failure modes to reward in D4
  private static readonly TRADEOFF_PATTERNS = [
    /\b(trade-off|tradeoff|versus|vs\.?|overhead|latency penalty|memory footprint|connection limit|cold start|partition skew|rebalance storm|cache stampede)\b/i
  ];

  private static readonly FAILURE_MODE_PATTERNS = [
    /\b(failure mode|out-of-memory|OOM|connection pool exhaustion|deadlock|degradation|bottleneck|split-brain|network partition|data loss|cascading failure)\b/i
  ];

  /**
   * Main evaluation entry point
   */
  public static evaluateTask(task: BenchmarkTaskInput): BenchmarkEvaluationResult {
    const text = task.articleMarkdown || '';
    const criticalFlags: string[] = [];
    const warningFlags: string[] = [];
    const humanReviewReasons: string[] = [];

    // Evaluate D1: Factual Grounding & Verifiability
    const { score: d1Score, groundedCount, totalCount, d1Critical, d1Warnings } = this.evaluateD1(task);
    criticalFlags.push(...d1Critical);
    warningFlags.push(...d1Warnings);

    // Evaluate D2: Evidence Quality & Provenance
    const { score: d2Score, d2Critical, d2Warnings } = this.evaluateD2(task);
    criticalFlags.push(...d2Critical);
    warningFlags.push(...d2Warnings);

    // Evaluate D3: Actionable Technical Utility
    const { score: d3Score, codeBlocks, commands, d3Critical, d3Warnings } = this.evaluateD3(task);
    criticalFlags.push(...d3Critical);
    warningFlags.push(...d3Warnings);

    // Evaluate D4: Practitioner Depth & Nuance
    const { score: d4Score, hasTradeoffs, hasFailureModes, d4Warnings } = this.evaluateD4(task);
    warningFlags.push(...d4Warnings);

    // Evaluate D5: Conciseness & Fluff Elimination
    const { score: d5Score, fluffDetected, maxRepetitions, d5Critical, d5Warnings } = this.evaluateD5(task);
    criticalFlags.push(...d5Critical);
    warningFlags.push(...d5Warnings);

    // Evaluate D6: Repair Safety & Invariant Guard
    const { score: d6Score, d6Critical, d6Warnings } = this.evaluateD6(task);
    criticalFlags.push(...d6Critical);
    warningFlags.push(...d6Warnings);

    // Compute Composite Score:
    // D1 (20%), D2 (20%), D3 (20%), D4 (15%), D5 (15%), D6 (10%)
    let compositeScore = Math.round(
      d1Score * 0.20 +
      d2Score * 0.20 +
      d3Score * 0.20 +
      d4Score * 0.15 +
      d5Score * 0.15 +
      d6Score * 0.10
    );

    // Determine Human Review Requirements
    let humanReviewRequired = false;
    if (compositeScore >= 60 && compositeScore < 70) {
      humanReviewRequired = true;
      humanReviewReasons.push('Borderline composite score (60-69): editorial depth requires human calibration.');
    }
    if (task.domain.toLowerCase().includes('security') && warningFlags.length > 0) {
      humanReviewRequired = true;
      humanReviewReasons.push('Security domain with active warnings requires human compliance sign-off.');
    }
    if (d4Score < 60 && compositeScore >= 70) {
      humanReviewRequired = true;
      humanReviewReasons.push('Low practitioner depth score with otherwise passing scores requires expert validation.');
    }

    // Determine Decision
    let decision: BenchmarkDecision;
    if (criticalFlags.length > 0) {
      decision = 'REJECT';
      // Cap composite score on critical rejection
      compositeScore = Math.min(compositeScore, 55);
    } else if (compositeScore >= 85) {
      decision = 'PASS';
    } else if (compositeScore >= 70) {
      decision = 'PASS_WITH_WARNINGS';
    } else if (compositeScore >= 60 || humanReviewRequired) {
      decision = 'REVIEW_REQUIRED';
    } else {
      decision = 'REJECT';
    }

    return {
      taskId: task.id,
      taskName: task.name,
      domain: task.domain,
      compositeScore,
      decision,
      dimensionScores: {
        d1_factualGrounding: d1Score,
        d2_evidenceQuality: d2Score,
        d3_actionableUtility: d3Score,
        d4_practitionerDepth: d4Score,
        d5_fluffElimination: d5Score,
        d6_repairSafety: d6Score
      },
      criticalFlags: Array.from(new Set(criticalFlags)),
      warningFlags: Array.from(new Set(warningFlags)),
      humanReviewRequired,
      humanReviewReasons,
      metrics: {
        numbersFound: totalCount,
        numbersGrounded: groundedCount,
        codeBlocksCount: codeBlocks,
        commandsCount: commands,
        tradeoffsMentioned: hasTradeoffs,
        failureModesMentioned: hasFailureModes,
        fluffPhrasesDetected: fluffDetected,
        sentenceStarterRepetitions: maxRepetitions
      }
    };
  }

  /**
   * D1: Factual Grounding & Verifiability
   */
  private static evaluateD1(task: BenchmarkTaskInput): {
    score: number;
    groundedCount: number;
    totalCount: number;
    d1Critical: string[];
    d1Warnings: string[];
  } {
    const text = task.articleMarkdown || '';
    const d1Critical: string[] = [];
    const d1Warnings: string[] = [];

    // Extract all quantitative metric candidates: e.g. "340%", "450ms", "42ms", "18s", "$10M"
    // Use (?!\w) rather than \b at end because % and $ are non-word characters
    const metricRegex = /\b\d+(?:\.\d+)?(?:%|ms|s|m|MB|GB|TB|k|\$|\/s)(?!\w)/g;
    const matches = Array.from(new Set(text.match(metricRegex) || []));

    // Gather all known claims from evidence set and findings
    const knownEvidenceTexts: string[] = [];
    if (task.evidenceSet?.items) {
      for (const item of task.evidenceSet.items) {
        if (item.claim) knownEvidenceTexts.push(item.claim);
      }
    }
    if (task.workedFindings) {
      for (const finding of task.workedFindings) {
        if (finding.observation) knownEvidenceTexts.push(finding.observation);
        if (finding.evidenceAnchor?.claimSummary) knownEvidenceTexts.push(finding.evidenceAnchor.claimSummary);
        if (finding.businessImpact) knownEvidenceTexts.push(finding.businessImpact);
      }
    }

    const aggregatedEvidence = knownEvidenceTexts.join(' ');

    let groundedCount = 0;
    const ungroundedMetrics: string[] = [];

    for (const match of matches) {
      if (aggregatedEvidence.includes(match)) {
        groundedCount++;
      } else {
        ungroundedMetrics.push(match);
      }
    }

    // Check for extreme unbacked claims in negative tasks
    const hasUnbackedConversionClaim = /\b(increased|grew|boosted|surged) (?:by |revenue by )?(\d{2,3}%)(?!\w)/i.test(text);
    if (hasUnbackedConversionClaim) {
      const matchCandidate = text.match(/\b(increased|grew|boosted|surged) (?:by |revenue by )?(\d{2,3}%)(?!\w)/i);
      const claimedNumber = matchCandidate ? matchCandidate[2] : '';
      if (!aggregatedEvidence.includes(claimedNumber)) {
        d1Critical.push('CRITICAL_FABRICATED_METRIC: Quantitative conversion guarantee not backed by evidence.');
      }
    }

    // Check for unauthorized practitioner credentials claim
    const hasAuthorityClaim = /\b(\d{1,2}\+? years of (?:experience|leadership|engineering))\b/i.test(text);
    if (hasAuthorityClaim) {
      const authorizedYears = task.practitionerProfile?.identity?.yearsOfExperience;
      if (!authorizedYears) {
        d1Critical.push('CRITICAL_INVENTED_PRACTITIONER_AUTHORITY: Claimed professional tenure without verified profile.');
      }
    }

    let score = 100;
    if (matches.length > 0) {
      const groundingRatio = groundedCount / matches.length;
      score = Math.round(groundingRatio * 100);
      if (groundingRatio < 0.6) {
        d1Warnings.push(`Low numerical grounding ratio: ${groundedCount}/${matches.length} metrics verified.`);
      }
    } else if (!task.evidenceSet || task.evidenceSet.items?.length === 0) {
      // Content has zero empirical data and zero evidence backing
      score = 50;
      d1Warnings.push('Content provides zero empirical measurements and has no evidence set backing.');
    }

    if (d1Critical.length > 0) {
      score = Math.min(score, 35);
    }

    return {
      score,
      groundedCount,
      totalCount: matches.length,
      d1Critical,
      d1Warnings
    };
  }

  /**
   * D2: Evidence Quality & Provenance
   */
  private static evaluateD2(task: BenchmarkTaskInput): {
    score: number;
    d2Critical: string[];
    d2Warnings: string[];
  } {
    const text = task.articleMarkdown || '';
    const d2Critical: string[] = [];
    const d2Warnings: string[] = [];

    // Check for confidentiality leakage or cross-tenant contamination
    if (/\[Confidential: [^\]]+\]/i.test(text)) {
      d2Critical.push('CRITICAL_CONFIDENTIALITY_BREACH: Unscrubbed confidential client marker present in text.');
    }

    // Check for foreign tenant IDs
    if (/tenant_[a-z0-9]+_foreign/i.test(text)) {
      d2Critical.push('CRITICAL_TENANT_ISOLATION_VIOLATION: Foreign tenant reference leaked into article.');
    }

    // Check citation validity, authority, and claim support
    const rawUrlMatches = text.match(/https?:\/\/[^\s\)\"\'>]+/g) || [];
    const urlMatches = Array.from(new Set(rawUrlMatches.map(u => u.replace(/[,.;:!?]+$/, ''))));
    let authoritativeCount = 0;
    const STOPWORDS = new Set(['this', 'that', 'with', 'from', 'have', 'were', 'been', 'which', 'their', 'about', 'https', 'http', 'according']);

    for (const url of urlMatches) {
      const isAuthoritative = /(dev|io|org|gov|engineering\.|aws\.amazon|cloud\.google|kubernetes\.io|postgresql\.org|kafka\.apache|nextjs\.org)/i.test(url);
      if (isAuthoritative) {
        authoritativeCount++;
      } else if (/unverified-blog|fake-stats|random-medium/i.test(url)) {
        d2Warnings.push(`Suspicious or low-authority source cited: ${url}`);
      }

      // Check whether citation actually supports the specific claim attributed to it
      if (task.evidenceSet?.items) {
        const matchingEvidenceItem = task.evidenceSet.items.find((item: any) => item.sourceUrl === url);
        if (matchingEvidenceItem) {
          const citingLine = text.split('\n').find((l: string) => l.includes(url)) || '';

          if (citingLine && matchingEvidenceItem.claim) {
            const claimWords = matchingEvidenceItem.claim
              .toLowerCase()
              .replace(/[^a-z0-9]/g, ' ')
              .split(/\s+/)
              .filter((w: string) => w.length >= 4 && !STOPWORDS.has(w));

            const sentenceWords = citingLine
              .toLowerCase()
              .replace(/[^a-z0-9]/g, ' ')
              .split(/\s+/)
              .filter((w: string) => w.length >= 4 && !STOPWORDS.has(w) && !url.includes(w));

            const commonWords = claimWords.filter((w: string) => sentenceWords.includes(w));

            if (claimWords.length > 0 && commonWords.length === 0) {
              d2Critical.push(`CRITICAL_CITATION_MISATTRIBUTION: Cited source (${url}) does not support the assertion attributed to it.`);
            }
          }
        }
      }
    }

    let score = 90;
    if (task.evidenceSet?.items && task.evidenceSet.items.length > 0) {
      score = 100;
    } else if (urlMatches.length === 0 && !task.evidenceSet) {
      score = 65;
      d2Warnings.push('No evidence items or external citations provided.');
    }

    if (d2Critical.length > 0) {
      score = Math.min(score, 30);
    }

    return { score, d2Critical, d2Warnings };
  }

  /**
   * D3: Actionable Technical Utility
   */
  private static evaluateD3(task: BenchmarkTaskInput): {
    score: number;
    codeBlocks: number;
    commands: number;
    d3Critical: string[];
    d3Warnings: string[];
  } {
    const text = task.articleMarkdown || '';
    const d3Critical: string[] = [];
    const d3Warnings: string[] = [];

    // Count code blocks
    const codeBlocks = (text.match(/```/g) || []).length / 2;

    // Count operational commands and configuration directives
    let commands = 0;
    for (const pattern of this.COMMAND_PATTERNS) {
      const m = text.match(pattern);
      if (m) commands += m.length;
    }

    // Check for generic truisms
    let truismsCount = 0;
    for (const pattern of this.TRUISM_PATTERNS) {
      if (pattern.test(text)) truismsCount++;
    }

    let score = 70;
    if (codeBlocks >= 2 || commands >= 4) {
      score = 100;
    } else if (codeBlocks >= 1 || commands >= 2) {
      score = 85;
    } else if (commands === 0) {
      score = 35;
      d3Warnings.push('Content lacks concrete execution commands, configuration snippets, or executable steps.');
    }

    if (truismsCount >= 2) {
      score = Math.max(15, score - 30);
      d3Warnings.push(`Excessive non-actionable generic truisms detected (${truismsCount} occurrences).`);
    }

    // Critical check: if content is superficially technical but has ZERO commands, ZERO code blocks, and 2+ truisms
    if (commands === 0 && codeBlocks === 0 && truismsCount >= 2) {
      d3Critical.push('CRITICAL_SHALLOW_TECHNICAL_EMPTY: Superficially technical content completely devoid of executable implementation, concrete validation, or trade-off analysis.');
      score = Math.min(score, 20);
    }

    return { score, codeBlocks, commands, d3Critical, d3Warnings };
  }

  /**
   * D4: Practitioner Depth & Nuance
   */
  private static evaluateD4(task: BenchmarkTaskInput): {
    score: number;
    hasTradeoffs: boolean;
    hasFailureModes: boolean;
    d4Warnings: string[];
  } {
    const text = task.articleMarkdown || '';
    const d4Warnings: string[] = [];

    let hasTradeoffs = false;
    for (const pattern of this.TRADEOFF_PATTERNS) {
      if (pattern.test(text)) {
        hasTradeoffs = true;
        break;
      }
    }

    let hasFailureModes = false;
    for (const pattern of this.FAILURE_MODE_PATTERNS) {
      if (pattern.test(text)) {
        hasFailureModes = true;
        break;
      }
    }

    let score = 70;
    if (hasTradeoffs && hasFailureModes) {
      score = 100;
    } else if (hasTradeoffs || hasFailureModes) {
      score = 85;
    } else {
      score = 55;
      d4Warnings.push('Content lacks production nuance: no architectural trade-offs or operational failure modes analyzed.');
    }

    return { score, hasTradeoffs, hasFailureModes, d4Warnings };
  }

  /**
   * D5: Conciseness & Fluff Elimination
   */
  private static evaluateD5(task: BenchmarkTaskInput): {
    score: number;
    fluffDetected: string[];
    maxRepetitions: number;
    d5Critical: string[];
    d5Warnings: string[];
  } {
    const text = task.articleMarkdown || '';
    const d5Critical: string[] = [];
    const d5Warnings: string[] = [];
    const fluffDetected: string[] = [];

    // Detect boilerplate fluff phrases
    for (const pattern of this.BOILERPLATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        fluffDetected.push(match[0]);
      }
    }

    // Check sentence openers diversity
    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && !s.startsWith('#') && !s.startsWith('-') && !s.startsWith('```'));

    const starters: Record<string, number> = {};
    for (const s of sentences) {
      const firstWord = s.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
      if (firstWord) {
        starters[firstWord] = (starters[firstWord] || 0) + 1;
      }
    }

    let maxRepetitions = 0;
    for (const word of Object.keys(starters)) {
      if (starters[word] > maxRepetitions) maxRepetitions = starters[word];
    }

    let score = 100;
    if (fluffDetected.length > 0) {
      score -= fluffDetected.length * 15;
      d5Warnings.push(`Boilerplate introductory fluff detected: ${fluffDetected.join(', ')}`);
    }

    if (maxRepetitions >= 5) {
      score -= 20;
      d5Warnings.push(`Monotonous sentence openers detected (${maxRepetitions} sentences starting with the same token).`);
    }

    // Critical check: excessive boilerplate preamble fluff AND repetitive sentence structure
    if (fluffDetected.length >= 2 && maxRepetitions >= 4) {
      d5Critical.push('CRITICAL_BOILERPLATE_FLUFF: Excessive preamble boilerplate and monotonous repetitive sentence structures.');
      score = Math.min(score, 25);
    }

    score = Math.max(15, Math.min(100, score));

    return { score, fluffDetected, maxRepetitions, d5Critical, d5Warnings };
  }

  /**
   * D6: Repair Safety & Invariant Guard
   */
  private static evaluateD6(task: BenchmarkTaskInput): {
    score: number;
    d6Critical: string[];
    d6Warnings: string[];
  } {
    const d6Critical: string[] = [];
    const d6Warnings: string[] = [];

    if (!task.repairLog || task.repairLog.length === 0) {
      return { score: 100, d6Critical, d6Warnings };
    }

    let score = 100;
    for (const entry of task.repairLog) {
      // If a repair claimed to fix an unrepairable violation
      if (entry.attemptedOnUnrepairable) {
        d6Critical.push('CRITICAL_HALLUCINATORY_REPAIR: Attempted automated repair on an unrepairable integrity violation.');
        score = 30;
      }
      // If repair introduced score degradation
      if (entry.scoreDegraded) {
        d6Warnings.push('Repair attempt resulted in quality degradation.');
        score = Math.min(score, 60);
      }
      // If repair fabricated new metrics
      if (entry.introducedFabricatedMetric) {
        d6Critical.push('CRITICAL_REPAIR_FABRICATION: Repair operation injected unbacked factual claims.');
        score = 25;
      }
    }

    return { score, d6Critical, d6Warnings };
  }
}
