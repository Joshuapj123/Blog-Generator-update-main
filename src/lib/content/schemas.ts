import { z } from 'zod';
import {
  ContentBrief,
  ContentBriefSchema,
  OutlineNodeSchema,
  SearchIntentSchema,
  SaaSProfile,
} from '@/core/contracts/schemas';

export type { ContentBrief };
export {
  ContentBriefSchema,
  OutlineNodeSchema,
  SearchIntentSchema,
};

export interface PlanRecoveryDiagnostics {
  initialStatus: 'VALID' | 'NORMALIZED_VALID' | 'SCHEMA_VIOLATION' | 'ERROR';
  validationFailurePaths: string[];
  normalizationApplied: boolean;
  retryAttempted: boolean;
  retrySucceeded: boolean;
  fallbackUsed: boolean;
  finalStatus: 'SUCCESS' | 'RECOVERED' | 'FALLBACK' | 'FAILED';
}

const VALID_INTENT_TYPES: Record<string, 'Informational' | 'Transactional' | 'Commercial' | 'Navigational' | 'Comparison'> = {
  informational: 'Informational',
  transactional: 'Transactional',
  commercial: 'Commercial',
  navigational: 'Navigational',
  comparison: 'Comparison',
};

const VALID_CONTENT_TYPES: Record<string, 'Listicle' | 'How-To' | 'Guide' | 'Review' | 'Comparison' | 'Other'> = {
  listicle: 'Listicle',
  'how-to': 'How-To',
  'how to': 'How-To',
  howto: 'How-To',
  guide: 'Guide',
  review: 'Review',
  comparison: 'Comparison',
  other: 'Other',
};

const VALID_OUTLINE_LEVELS: Record<string, 'H2' | 'H3'> = {
  h2: 'H2',
  h3: 'H3',
};

/**
 * Checks if a string is clearly a hostname or hostname/path without a protocol.
 * Must have no whitespace, have at least one dot in hostname, end in a valid TLD of >=2 letters.
 */
export function isClearlyHostnamePath(str: string): boolean {
  if (!str || typeof str !== 'string' || /\s/.test(str)) return false;
  // Exclude schemes like mailto:, javascript:, ftp:
  if (/^[a-zA-Z0-9+.-]+:/.test(str)) return false;

  const hostPart = str.split(/[/?#]/)[0];
  if (!hostPart || !hostPart.includes('.')) return false;

  const parts = hostPart.split('.');
  if (parts.length < 2) return false;

  const tld = parts[parts.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;

  for (const part of parts) {
    if (!part || !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)) {
      return false;
    }
  }

  try {
    const candidate = new URL(`https://${str}`);
    return candidate.protocol === 'https:' && candidate.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Deterministically normalizes only unambiguous representations in a raw ContentBrief object.
 * Unknown semantic values (e.g. "banana", "Blog", "Random") remain unchanged and proceed to validation failure.
 */
export function normalizeContentBrief(raw: any): { normalized: any; normalizationApplied: boolean } {
  if (!raw || typeof raw !== 'object') {
    return { normalized: raw, normalizationApplied: false };
  }

  let normalizationApplied = false;
  // Deep clone to avoid mutating input
  const normalized = JSON.parse(JSON.stringify(raw));

  // 1. intent normalization
  if (normalized.intent && typeof normalized.intent === 'object') {
    if (typeof normalized.intent.intentType === 'string') {
      const key = normalized.intent.intentType.trim().toLowerCase();
      if (VALID_INTENT_TYPES[key]) {
        if (normalized.intent.intentType !== VALID_INTENT_TYPES[key]) {
          normalized.intent.intentType = VALID_INTENT_TYPES[key];
          normalizationApplied = true;
        }
      }
    }

    if (typeof normalized.intent.contentType === 'string') {
      const key = normalized.intent.contentType.trim().toLowerCase();
      if (VALID_CONTENT_TYPES[key]) {
        if (normalized.intent.contentType !== VALID_CONTENT_TYPES[key]) {
          normalized.intent.contentType = VALID_CONTENT_TYPES[key];
          normalizationApplied = true;
        }
      }
    }
  }

  // 2. outline node level normalization
  if (Array.isArray(normalized.outline)) {
    for (const node of normalized.outline) {
      if (node && typeof node.level === 'string') {
        const key = node.level.trim().toLowerCase();
        if (VALID_OUTLINE_LEVELS[key]) {
          if (node.level !== VALID_OUTLINE_LEVELS[key]) {
            node.level = VALID_OUTLINE_LEVELS[key];
            normalizationApplied = true;
          }
        }
      }
    }
  }

  // 3. competitorInsights URL normalization
  if (Array.isArray(normalized.competitorInsights)) {
    for (const insight of normalized.competitorInsights) {
      if (insight && typeof insight.url === 'string') {
        const trimmed = insight.url.trim();
        if (!/^https?:\/\//i.test(trimmed) && isClearlyHostnamePath(trimmed)) {
          insight.url = `https://${trimmed}`;
          normalizationApplied = true;
        }
      }
    }
  }

  return { normalized, normalizationApplied };
}

/**
 * Extracts sanitized, user-safe validation issues and paths without leaking secrets or raw text.
 */
export function extractSanitizedValidationIssues(error: any): { paths: string[]; issues: string[] } {
  const paths: string[] = [];
  const issues: string[] = [];

  if (!error) {
    return { paths: ['unknown'], issues: ['Schema validation failed'] };
  }

  if (error instanceof z.ZodError || Array.isArray(error.issues)) {
    for (const issue of (error.issues as z.ZodIssue[])) {
      const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
      if (!paths.includes(pathStr)) {
        paths.push(pathStr);
      }

      const issueAny = issue as any;
      const code = issue.code as string;
      if (code === 'invalid_value' || code === 'invalid_enum_value') {
        const allowed = issueAny.values || issueAny.options;
        const allowedStr = Array.isArray(allowed) ? ` (allowed: ${allowed.join(', ')})` : '';
        issues.push(`Field '${pathStr}': Invalid enum value${allowedStr}`);
      } else if (
        (code === 'invalid_format' && issueAny.format === 'url') ||
        (code === 'invalid_string' && issueAny.validation === 'url')
      ) {
        issues.push(`Field '${pathStr}': Must be a valid URL starting with http:// or https://`);
      } else if (code === 'too_small') {
        issues.push(`Field '${pathStr}': Minimum length or value constraint not met`);
      } else if (code === 'invalid_type') {
        issues.push(`Field '${pathStr}': Expected ${issueAny.expected}, received ${issueAny.received}`);
      } else {
        issues.push(`Field '${pathStr}': Invalid format or constraint violated`);
      }
    }
  } else if (typeof error.message === 'string') {
    issues.push('Content brief format violated schema requirements');
    paths.push('schema');
  }

  return { paths, issues };
}

export interface DeterministicFallbackContext {
  targetKeyword: string;
  topic?: string;
  targetAudience?: string;
  saasProfile?: Partial<SaaSProfile> | null;
  medianWordCount?: number;
  supportingTerms?: string[];
  competitorUrls?: string[];
}

/**
 * Constructs a minimal deterministic, schema-valid ContentBrief using ONLY already-known context.
 * Never invents fake competitor URLs, research claims, authority scores, or SEO scores.
 */
export function createDeterministicFallbackBrief(context: DeterministicFallbackContext): ContentBrief {
  const keyword = (context.targetKeyword || 'Comprehensive Guide').trim();
  const audience = (context.targetAudience || 'Practitioners and Decision Makers').trim();
  const median = typeof context.medianWordCount === 'number' && context.medianWordCount > 0
    ? context.medianWordCount
    : 2000;

  // Title: 5-12 words containing the exact canonical keyword
  const title = `${keyword}: Comprehensive Guide for ${audience}`;

  const validCompetitorInsights: Array<{ url: string; title?: string; wordCount?: number }> = [];
  if (Array.isArray(context.competitorUrls)) {
    for (const rawUrl of context.competitorUrls) {
      if (typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl.trim())) {
        try {
          new URL(rawUrl.trim());
          validCompetitorInsights.push({ url: rawUrl.trim() });
        } catch {
          // ignore invalid URLs; do not invent fake ones
        }
      }
    }
  }

  const supporting = Array.isArray(context.supportingTerms) ? context.supportingTerms : [];

  const fallbackBrief: ContentBrief = {
    title,
    targetKeywords: [keyword, ...supporting.slice(0, 5)],
    outline: [
      {
        heading: `Understanding ${keyword}`,
        level: 'H2',
        generate_table: false,
        assignedKeywords: [keyword],
        assignedEntities: [],
        core_concept: `Core fundamentals of ${keyword}`,
      },
      {
        heading: 'Key Capabilities and Core Operational Benefits',
        level: 'H2',
        generate_table: false,
        assignedKeywords: supporting.slice(0, 2),
        assignedEntities: [],
        core_concept: 'Business advantages and strategic value',
      },
      {
        heading: 'Step-by-Step Implementation Workflow',
        level: 'H2',
        generate_table: false,
        assignedKeywords: supporting.slice(2, 4),
        assignedEntities: [],
        core_concept: 'Actionable practitioner processes and execution steps',
      },
      {
        heading: 'Feature Breakdown and Evaluation Criteria',
        level: 'H2',
        generate_table: true,
        assignedKeywords: [],
        assignedEntities: [],
        core_concept: 'Structured comparison criteria and capabilities matrix',
      },
      {
        heading: 'Best Practices and Strategic Recommendations',
        level: 'H2',
        generate_table: false,
        assignedKeywords: supporting.slice(4, 6),
        assignedEntities: [],
        core_concept: 'Industry recommendations and common pitfalls to avoid',
      },
      {
        heading: 'Conclusion and Next Steps',
        level: 'H2',
        generate_table: false,
        assignedKeywords: [],
        assignedEntities: [],
        core_concept: 'Summary of key takeaways and actionable roadmap',
      },
    ],
    wordCountBudget: {
      target: median,
      min: Math.round(median * 0.8),
      max: Math.round(median * 1.2),
    },
    intent: {
      primaryKeyword: keyword,
      intentType: 'Informational',
      contentType: 'Guide',
      confidenceScore: 85,
    },
    competitorInsights: validCompetitorInsights,
    assetType: 'ARTICLE',
    audience,
    businessObjective: context.saasProfile?.description || '',
    primaryEntities: [],
    supportingEntities: [],
    competitorGaps: [],
    serpFeatures: [],
    geoRequirements: [],
    supportingTerms: supporting,
    internalLinks: [],
    ctaStrategy: 'Contextual product call-to-action.',
  };

  // Enforce strict invariant: must pass ContentBriefSchema.parse
  return ContentBriefSchema.parse(fallbackBrief);
}

/**
 * Strict validation invariant enforcement.
 */
export function validateContentBriefStrict(data: any): ContentBrief {
  return ContentBriefSchema.parse(data);
}
