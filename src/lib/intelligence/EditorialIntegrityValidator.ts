// src/lib/intelligence/EditorialIntegrityValidator.ts
import {
  EvidenceSet,
  EvidenceItem,
  SectionEvidenceMap,
  ClaimSupportStatus,
  GroundingFailureCategory
} from '@/core/contracts/evidence';

export interface EditorialIntegrityIssue {
  type: 'PROMPT_LEAK' | 'PLACEHOLDER' | 'INTERNAL_SCAFFOLDING' | 'FABRICATED_EVIDENCE_ID' | 'FABRICATED_ATTRIBUTION' | 'UNVERIFIED_ATTRIBUTION' | 'UNSUPPORTED_NUMERICAL' | 'REPEATED_BOILERPLATE';
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  matchedSnippet: string;
  context?: string;
}

export interface EditorialIntegrityReport {
  passed: boolean;
  canExport: boolean;
  criticalErrors: string[];
  warnings: string[];
  issues: EditorialIntegrityIssue[];
  diagnostics: {
    promptLeakCount: number;
    placeholderCount: number;
    scaffoldingCount: number;
    fabricatedEvidenceIdCount: number;
    fabricatedAttributionCount: number;
    unverifiedAttributionCount?: number;
    unsupportedNumericalCount: number;
    requiresReviewCount: number;
  };
}

export class EditorialIntegrityValidator {
  /**
   * Internal model instruction and meta-commentary patterns that must never appear in article prose.
   */
  private static PROMPT_LEAK_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    // Model self-identification
    {
      regex: /\b(?:as\s+an?\s+ai(?:\s+language\s+model)?|i\s+am\s+an?\s+ai(?:\s+model)?|as\s+a\s+large\s+language\s+model)\b/i,
      description: 'AI model self-identification'
    },
    // Meta-commentary on draft creation
    {
      regex: /\b(?:in\s+this\s+(?:section|article|blog\s+post),?\s+(?:i\s+will|we\s+will\s+delve|i\s+have\s+written|i\s+am\s+writing|this\s+draft\s+will))\b/i,
      description: 'Model meta-commentary on article drafting'
    },
    {
      regex: /\b(?:here\s+is\s+(?:the\s+)?(?:repaired|generated|drafted|requested)\s+(?:article|section|content|body))\s*:/i,
      description: 'Generation response prefix header'
    },
    // System instructions and prompts leaking
    {
      regex: /(?:\[|\b)(?:prompt\s+instruction|system\s+instruction|system\s+prompt|instruction\s+to\s+writer|note\s+to\s+writer|drafting\s+notes?)\s*:/i,
      description: 'Direct system prompt directive'
    },
    {
      regex: /\b(?:ensure\s+the\s+word\s+count\s+is\s+\d+|write\s+in\s+a\s+(?:professional|conversational)\s+tone|do\s+not\s+include\s+introductory\s+fluff|output\s+format\s*:|output\s+only\s+valid\s+markdown)\b/i,
      description: 'Leaked authoring prompt guideline'
    },
    {
      regex: /\b(?:rewrite\s+the\s+following\s+section\s+to\s+fix|repaired\s+body\s*:)\b/i,
      description: 'Repair prompt scaffolding directive'
    }
  ];

  /**
   * Obvious placeholders and template variables that indicate unfinished generation.
   */
  private static PLACEHOLDER_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    {
      regex: /\[(?:insert|add|tbd|placeholder|todo)[^\]]*\]/i,
      description: 'Bracketed placeholder directive'
    },
    {
      regex: /\binsert\s+(?:keyword|link|anchor\s+text|image|statistic|source|citation)\s+here\b/i,
      description: 'Inline placeholder text'
    },
    {
      regex: /\b(?:TODO|TBD|PLACEHOLDER)\b/,
      description: 'Unfinished work marker'
    },
    {
      regex: /\{\{[a-zA-Z0-9_.-]+\}\}/,
      description: 'Handlebars/Mustache template variable'
    },
    {
      regex: /\$\{[a-zA-Z0-9_.-]+\}/,
      description: 'ES template literal placeholder'
    },
    {
      regex: /<PLACEHOLDER>|__PLACEHOLDER__|__KEYWORD__/i,
      description: 'Tokenized template placeholder'
    },
    {
      regex: /\b(?:\[object\s+Object\])\b/,
      description: 'JavaScript serialization defect'
    }
  ];

  /**
   * Internal pipeline metadata and GEO distribution scaffolding presented as reader prose.
   * False-positive protection: Legitimate educational discussion of SEO, AI search, or keyword research
   * is strictly allowed and preserved.
   */
  private static INTERNAL_SCAFFOLDING_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    {
      regex: /\b(?:internal\s+geo\s+distribution\s+guidance|geo\s+distribution\s+guidance)\b/i,
      description: 'Internal GEO distribution guidance leaked as reader advice'
    },
    {
      regex: /\b(?:content[- ]gap\s+matrix|content[- ]gap\s+analysis\s+table)\b/i,
      description: 'Internal content gap matrix reference'
    },
    {
      regex: /\bgap\s+importance\s*:\s*(?:high|medium|low)\b/i,
      description: 'Raw content gap importance metadata'
    },
    {
      regex: /\b(?:targetSiteCoverage|competitorCoverage|recommendedTreatment)\b/,
      description: 'Internal pipeline data model property leakage'
    },
    {
      regex: /\bour\s+geo\s+intelligence\s+(?:engine|service|matrix)\b/i,
      description: 'Internal system architecture self-reference'
    },
    {
      regex: /(?:^|\n)\s*(?:buyer\s+question|buyer\s+intent\s+question|target\s+buyer\s+query|candidate\s+gap)\s*:\s*/i,
      description: 'Raw buyer-question or gap scaffolding prefix'
    }
  ];

  /**
   * Standard non-attribution sources to avoid treating ordinary phrases as citations.
   */
  private static NON_ATTRIBUTION_SOURCES = new Set([
    'hour', 'day', 'month', 'year', 'user', 'seat', 'client', 'server', 'second', 'minute', 'week', 'quarter',
    'annual audit', 'internal audit', 'internal data', 'internal records', 'company records', 'company data'
  ]);

  /**
   * Pure advice / recommendation patterns that express best practices rather than empirical research claims.
   */
  private static RECOMMENDATION_PATTERNS = [
    /\b(?:we recommend|it is recommended|you should|teams should|organizations should|make sure to|be sure to|consider using|we suggest|it is advisable|best practice is to|it is essential to|prioritize|opt for)\b/i,
  ];

  /**
   * Evaluates comprehensive editorial integrity across prompt leakage, placeholders,
   * internal scaffolding, evidence citation consistency, and factual grounding.
   */
  public static validateEditorialIntegrity(
    markdown: string,
    options?: {
      evidenceSet?: EvidenceSet;
      sectionEvidenceMaps?: SectionEvidenceMap[];
      targetBrand?: string;
    }
  ): EditorialIntegrityReport {
    const criticalErrors: string[] = [];
    const warnings: string[] = [];
    const issues: EditorialIntegrityIssue[] = [];

    let promptLeakCount = 0;
    let placeholderCount = 0;
    let scaffoldingCount = 0;
    let fabricatedEvidenceIdCount = 0;
    let fabricatedAttributionCount = 0;
    let unverifiedAttributionCount = 0;
    let unsupportedNumericalCount = 0;
    let requiresReviewCount = 0;

    if (!markdown || !markdown.trim()) {
      return {
        passed: false,
        canExport: false,
        criticalErrors: ['Editorial Integrity Alert: Content is empty.'],
        warnings: [],
        issues: [],
        diagnostics: {
          promptLeakCount: 0,
          placeholderCount: 0,
          scaffoldingCount: 0,
          fabricatedEvidenceIdCount: 0,
          fabricatedAttributionCount: 0,
          unverifiedAttributionCount: 0,
          unsupportedNumericalCount: 0,
          requiresReviewCount: 0
        }
      };
    }

    const textWithoutCode = markdown.replace(/```[\s\S]*?```/g, '');

    // 1. Detect Prompt Leakage
    for (const pat of this.PROMPT_LEAK_PATTERNS) {
      const match = textWithoutCode.match(pat.regex);
      if (match) {
        promptLeakCount++;
        const msg = `Prompt Leakage Alert: Detected ${pat.description} ("${match[0]}"). Internal model instructions must not be rendered to readers.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'PROMPT_LEAK',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: match[0],
          context: pat.description
        });
      }
    }

    // 2. Detect Placeholders and Template Variables
    for (const pat of this.PLACEHOLDER_PATTERNS) {
      const match = textWithoutCode.match(pat.regex);
      if (match) {
        placeholderCount++;
        const msg = `Placeholder Alert: Detected ${pat.description} ("${match[0]}"). Incomplete template text must be resolved before publication.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'PLACEHOLDER',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: match[0],
          context: pat.description
        });
      }
    }

    // 3. Detect Internal Scaffolding (GEO & Content Gap Pipeline Leaks)
    for (const pat of this.INTERNAL_SCAFFOLDING_PATTERNS) {
      const match = textWithoutCode.match(pat.regex);
      if (match) {
        scaffoldingCount++;
        const msg = `Internal Scaffolding Alert: Detected internal pipeline metadata ("${match[0]}"). Internal system guidance must not appear in reader-facing prose.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'INTERNAL_SCAFFOLDING',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: match[0],
          context: pat.description
        });
      }
    }

    // 4. Detect Fabricated Evidence IDs
    const allEvidence = options?.evidenceSet?.items || [];
    const validEvidenceIds = new Set(allEvidence.map(e => e.id));

    // Check evidence IDs in assigned section maps
    if (options?.sectionEvidenceMaps && options.sectionEvidenceMaps.length > 0) {
      for (const map of options.sectionEvidenceMaps) {
        for (const evId of map.evidenceIds) {
          if (!validEvidenceIds.has(evId)) {
            fabricatedEvidenceIdCount++;
            const msg = `Fabricated Evidence ID Alert: Section "${map.heading}" references non-existent evidence ID "${evId}".`;
            criticalErrors.push(msg);
            issues.push({
              type: 'FABRICATED_EVIDENCE_ID',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: evId
            });
          }
        }
      }
    }

    // Check explicit evidence ID references in markdown body (e.g. [ev-123], (ev-123), <!-- ev-123 -->)
    const evIdMatches = textWithoutCode.match(/\bev[-_][a-zA-Z0-9_-]{3,}\b/g) || [];
    for (const rawId of Array.from(new Set(evIdMatches))) {
      // If it looks like an evidence ID pattern used by the system
      if (/^ev[-_][a-zA-Z0-9_-]+$/i.test(rawId)) {
        if (!validEvidenceIds.has(rawId)) {
          fabricatedEvidenceIdCount++;
          const msg = `Fabricated Evidence ID Alert: Body text references non-existent evidence ID "${rawId}".`;
          criticalErrors.push(msg);
          issues.push({
            type: 'FABRICATED_EVIDENCE_ID',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: rawId
          });
        }
      }
    }

    // 5. Detect Fabricated External Source Attribution
    // Patterns for named studies, surveys, and cited source publications
    const attributionRegexes = [
      /\b(?:according to|as reported by|published by|cited by|study by|survey by|research from)\s+\[?([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\]?/gi,
      /\[([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\s+(?:study|survey|research|benchmark|report)\]\((https?:\/\/[^\)]+)\)/gi,
      /\[([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\]\((https?:\/\/[^\)]+)\)\s+(?:found|reported|showed|discovered|measured)\b/gi,
    ];

    for (const regex of attributionRegexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(textWithoutCode)) !== null) {
        const sourceName = match[1]?.trim();
        const sourceUrl = match[2]?.trim();
        if (!sourceName || this.NON_ATTRIBUTION_SOURCES.has(sourceName.toLowerCase())) continue;

        if (allEvidence.length > 0) {
          const sourceMatch = allEvidence.find(ev => {
            const title = (ev.sourceTitle || '').toLowerCase();
            const url = (ev.sourceUrl || '').toLowerCase();
            const claimText = ev.claim.toLowerCase();
            const entities = (ev.entities || []).map(e => e.toLowerCase());
            const srcLower = sourceName.toLowerCase();
            const urlLower = sourceUrl ? sourceUrl.toLowerCase() : '';

            const nameMatches = title.includes(srcLower) || claimText.includes(srcLower) || entities.includes(srcLower);
            const urlMatches = Boolean(urlLower && url.includes(urlLower));
            return nameMatches || urlMatches;
          });

          if (!sourceMatch) {
            unverifiedAttributionCount++;
            fabricatedAttributionCount++;
            const msg = `Unverified Attribution Alert: External source "${sourceName}" cited in "${match[0]}" is unverified and does not exist in research evidence.`;
            criticalErrors.push(msg);
            issues.push({
              type: 'UNVERIFIED_ATTRIBUTION',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: match[0],
              context: sourceName
            });
          }
        }
      }
    }

    // 6. Cross-Section Repeated Sentences (Boilerplate)
    const sections = textWithoutCode.split(/\n(?=#{2,3}\s+)/);
    if (sections.length > 1) {
      const seenSentences = new Map<string, string>();
      for (const sec of sections) {
        const headingMatch = sec.match(/^#{2,3}\s+([^\n]+)/);
        const heading = headingMatch ? headingMatch[1].trim() : 'Section';
        const cleanSec = sec.replace(/^#{2,3}\s+[^\n]+/m, '').trim();
        const sentences = cleanSec.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 30);

        for (const s of sentences) {
          const wordsCount = s.split(/\s+/).filter(Boolean).length;
          if (wordsCount < 8) continue; // Skip short transitions
          if (seenSentences.has(s)) {
            const priorHeading = seenSentences.get(s)!;
            const msg = `Boilerplate Alert: Verbatim sentence repeated across "${priorHeading}" and "${heading}": "${s.substring(0, 60)}..."`;
            criticalErrors.push(msg);
            issues.push({
              type: 'REPEATED_BOILERPLATE',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: s.substring(0, 60),
              context: `${priorHeading} -> ${heading}`
            });
          } else {
            seenSentences.set(s, heading);
          }
        }
      }
    }

    const passed = criticalErrors.length === 0;
    const canExport = passed;

    return {
      passed,
      canExport,
      criticalErrors,
      warnings,
      issues,
      diagnostics: {
        promptLeakCount,
        placeholderCount,
        scaffoldingCount,
        fabricatedEvidenceIdCount,
        fabricatedAttributionCount,
        unverifiedAttributionCount,
        unsupportedNumericalCount,
        requiresReviewCount
      }
    };
  }

  /**
   * Distinguishes whether a sentence represents a prescriptive recommendation,
   * an explanatory framework, or a factual empirical claim.
   */
  public static isRecommendationOrAdvice(sentence: string): boolean {
    const trimmed = (sentence || '').trim();
    if (!trimmed) return false;
    return this.RECOMMENDATION_PATTERNS.some(pat => pat.test(trimmed));
  }
}
