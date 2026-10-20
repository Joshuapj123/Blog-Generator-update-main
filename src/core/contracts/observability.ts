// src/core/contracts/observability.ts

/**
 * Pipeline stages for structured operational telemetry.
 */
export type PipelineStageName =
  | 'INTAKE'
  | 'CRAWL'
  | 'DISCOVER'
  | 'SEARCH_OPPORTUNITY'
  | 'RESEARCH'
  | 'ANALYZE'
  | 'GEO_INTELLIGENCE'
  | 'PLAN'
  | 'ASSET_STRATEGY'
  | 'GENERATE'
  | 'REVIEW'
  | 'REPAIR'
  | 'FINALIZE'
  | 'STORAGE'
  | 'EXPORT'
  | 'DISTRIBUTION';

/**
 * Operational event types.
 */
export type PipelineEventType =
  | 'PIPELINE_START'
  | 'STAGE_START'
  | 'STAGE_COMPLETE'
  | 'STAGE_FAILED'
  | 'RETRY_ATTEMPT'
  | 'REPAIR_ATTEMPT'
  | 'REVALIDATION'
  | 'PIPELINE_COMPLETE'
  | 'PIPELINE_FAILED';

/**
 * High-level outcome of an event or pipeline stage.
 */
export type PipelineOutcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'RETRY'
  | 'PARTIAL'
  | 'REJECTED';

/**
 * Deterministic, normalized failure categories.
 * Unambiguous classification replacing free-form error strings.
 */
export type NormalizedFailureCategory =
  | 'CRAWL_TIMEOUT'
  | 'CRAWL_FAILURE'
  | 'SPARSE_EVIDENCE'
  | 'RESEARCH_TIMEOUT'
  | 'RESEARCH_FAILURE'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_AUTH_FAILURE'
  | 'PROVIDER_QUOTA_EXHAUSTED'
  | 'PROVIDER_TRANSIENT_FAILURE'
  | 'DRAFTING_FAILURE'
  | 'GROUNDING_REJECTION'
  | 'REPAIR_UNAVAILABLE'
  | 'REPAIR_REVALIDATION_FAILED'
  | 'EXPORT_FAILURE'
  | 'PUBLICATION_REJECTED'
  | 'DISTRIBUTION_FAILURE'
  | 'BUDGET_EXCEEDED'
  | 'UNKNOWN_FAILURE';

/**
 * Allowlisted diagnostic fields.
 * Strictly forbids prompts, raw HTML, full bodies, cookies, and tokens.
 */
export interface SanitizedOperationalDetails {
  reason?: string;
  statusCode?: number;
  code?: string;
  retryAfterSec?: number;
  durationMs?: number;
  retryCount?: number;
  unrepairableClaimsCount?: number;
  groundingFailureBreakdown?: Record<string, number>;
  channelsCount?: number;
  channel?: string;
  format?: string;
  sourceKeyword?: string;
  sanitizedMessage?: string;
  targetDomain?: string;
}

/**
 * Standard privacy-safe pipeline event contract.
 */
export interface PipelineOperationalEvent {
  runId: string;
  correlationId?: string;
  parentEventId?: string;
  stage: PipelineStageName;
  eventType: PipelineEventType;
  timestamp: string;
  durationMs?: number;
  outcome: PipelineOutcome;
  failureCategory?: NormalizedFailureCategory;
  retryCount?: number;
  details?: SanitizedOperationalDetails;
}

/**
 * Sanitize text to remove sensitive credentials, HTML, and filesystem paths.
 */
export function sanitizeOperationalText(text: string, maxLength = 250): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text;

  // 1. Redact API keys and Tokens
  cleaned = cleaned.replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_API_KEY]');
  cleaned = cleaned.replace(/sk-[0-9A-Za-z_-]{15,}/g, '[REDACTED_API_KEY]');
  cleaned = cleaned.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]');

  // 2. Redact query parameters or key-value secrets
  cleaned = cleaned.replace(/([?&])?(key|token|secret|password|auth|apiKey|credential|access_token)=([^\s&]+)/gi, (match, prefix, param) => {
    return `${prefix || ''}${param}=[REDACTED]`;
  });

  // 3. Redact Basic Auth in URLs (e.g. https://user:pass@domain.com)
  cleaned = cleaned.replace(/:\/\/([^:]+):([^@]+)@/g, '://[REDACTED_USER]:[REDACTED_PASS]@');

  // 4. Strip raw HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');

  // 5. Strip local filesystem paths
  cleaned = cleaned.replace(/[A-Za-z]:\\[\w\s.-]+(?:\\[\w\s.-]+)*/g, '[PATH]');
  cleaned = cleaned.replace(/\/(?:Users|home|app|var|node_modules)\/[^\s:]+/g, '[PATH]');

  // 6. Clean whitespace and bound length
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength - 3) + '...';
  }

  return cleaned;
}

/**
 * Deterministically classify an error into a NormalizedFailureCategory.
 */
export function classifyPipelineFailure(
  stage: PipelineStageName | string,
  error: any
): NormalizedFailureCategory {
  if (!error) {
    return 'UNKNOWN_FAILURE';
  }

  const rawMsg = String(error?.message || error || '');
  const causeMsg = error?.cause ? String(error.cause?.message || error.cause) : '';
  const combined = `${rawMsg} ${causeMsg} ${error?.name || ''} ${error?.code || ''}`.toLowerCase();
  const statusCode = Number(error?.statusCode || error?.status || 0);
  const code = String(error?.code || '').toUpperCase();
  const category = String(error?.category || '').toUpperCase();

  const stageUpper = String(stage).toUpperCase();

  // 1. Crawl Failures & Timeouts
  if (stageUpper === 'CRAWL' || combined.includes('crawl') || combined.includes('playwright') || combined.includes('page.goto')) {
    if (statusCode === 504 || combined.includes('timeout') || combined.includes('navigation timeout')) {
      return 'CRAWL_TIMEOUT';
    }
    if (combined.includes('sparse') || combined.includes('<80 chars') || combined.includes('sparse_content') || combined.includes('sparse_evidence')) {
      return 'SPARSE_EVIDENCE';
    }
    return 'CRAWL_FAILURE';
  }

  // 2. Sparse Evidence (even if detected outside crawl stage)
  if (combined.includes('sparse_evidence') || combined.includes('sparse evidence') || combined.includes('target_evidence_missing')) {
    if (stageUpper === 'RESEARCH' || stageUpper === 'DISCOVER') {
      return 'SPARSE_EVIDENCE';
    }
  }

  // 3. Research Failures & Timeouts
  if (stageUpper === 'RESEARCH') {
    if (statusCode === 504 || combined.includes('timeout') || combined.includes('deadline')) {
      return 'RESEARCH_TIMEOUT';
    }
    return 'RESEARCH_FAILURE';
  }

  // 4. Provider Rate Limits (429 / RESOURCE_EXHAUSTED / Rate Limit)
  if (
    category === 'RATE_LIMIT' ||
    statusCode === 429 ||
    code === 'RESOURCE_EXHAUSTED' ||
    combined.includes('429') ||
    combined.includes('resource_exhausted') ||
    combined.includes('rate limit') ||
    combined.includes('too many requests')
  ) {
    return 'PROVIDER_RATE_LIMIT';
  }

  // 5. Provider Authentication / Quota Failures
  if (
    category === 'AUTH_FAILURE' ||
    statusCode === 401 ||
    statusCode === 403 ||
    code === 'PERMISSION_DENIED' ||
    code === 'AUTH_TOKEN_VERIFICATION_FAILED' ||
    combined.includes('api_key_invalid') ||
    combined.includes('invalid api key') ||
    combined.includes('unauthorized') ||
    combined.includes('permission denied')
  ) {
    return 'PROVIDER_AUTH_FAILURE';
  }

  if (
    category === 'QUOTA_EXHAUSTED' ||
    code === 'QUOTA_EXCEEDED' ||
    combined.includes('quota exceeded') ||
    combined.includes('insufficient quota') ||
    combined.includes('exceeded your current quota')
  ) {
    return 'PROVIDER_QUOTA_EXHAUSTED';
  }

  // 6. Provider Transient Failures (503 / Capacity / Overloaded)
  if (
    category === 'CAPACITY' ||
    statusCode === 503 ||
    combined.includes('503') ||
    combined.includes('service unavailable') ||
    combined.includes('overloaded') ||
    combined.includes('high demand')
  ) {
    return 'PROVIDER_TRANSIENT_FAILURE';
  }

  // 7. Budget / Timeout
  if (
    statusCode === 504 ||
    code === 'DEADLINE_EXCEEDED' ||
    combined.includes('timeout limit exceeded') ||
    combined.includes('budget exceeded') ||
    combined.includes('timeout_exceeded')
  ) {
    return 'BUDGET_EXCEEDED';
  }

  // 8. Grounding & Factual Validation Failures
  if (
    combined.includes('grounding alert') ||
    combined.includes('entity isolation') ||
    combined.includes('target_evidence_missing') ||
    combined.includes('target_evidence_low_confidence') ||
    combined.includes('entity_isolation_violation') ||
    combined.includes('proposition_mismatch') ||
    combined.includes('negation_contradiction') ||
    combined.includes('conditional_guarantee_mismatch') ||
    combined.includes('stale_evidence') ||
    combined.includes('unsupported_quantitative_claim') ||
    combined.includes('unsupported critical claim') ||
    combined.includes('grounding rejection')
  ) {
    return 'GROUNDING_REJECTION';
  }

  // 9. Repair Failures
  if (
    combined.includes('repair_unavailable') ||
    combined.includes('repair unavailable') ||
    combined.includes('repair was unavailable') ||
    combined.includes('unrepairable') ||
    (stageUpper === 'REPAIR' && !combined.includes('revalidation'))
  ) {
    return 'REPAIR_UNAVAILABLE';
  }

  if (
    combined.includes('repair_revalidation_failed') ||
    combined.includes('post-repair revalidation failed') ||
    combined.includes('failed re-grounding') ||
    combined.includes('revalidation failed')
  ) {
    return 'REPAIR_REVALIDATION_FAILED';
  }

  // 10. Drafting / Generation Stage Failures
  if (stageUpper === 'GENERATE') {
    return 'DRAFTING_FAILURE';
  }

  // 11. Export Failures
  if (stageUpper === 'EXPORT' || combined.includes('export blocked') || combined.includes('article completeness or integrity validation failed')) {
    return 'EXPORT_FAILURE';
  }

  // 12. Publication / Storage Gate Failures
  if (stageUpper === 'STORAGE' || combined.includes('publication gate') || combined.includes('cannot publish unvalidated') || combined.includes('cannot publish rejected')) {
    return 'PUBLICATION_REJECTED';
  }

  // 13. Distribution Failures
  if (stageUpper === 'DISTRIBUTION' || combined.includes('distribution blocked') || combined.includes('entity mismatch between asset target brand') || combined.includes('fingerprint mismatch')) {
    return 'DISTRIBUTION_FAILURE';
  }

  return 'UNKNOWN_FAILURE';
}
