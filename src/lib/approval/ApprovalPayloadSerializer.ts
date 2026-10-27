// src/lib/approval/ApprovalPayloadSerializer.ts
import crypto from 'crypto';

export const PROTOCOL_HEADER = 'ACUTE-APR-V1';

export interface CanonicalApprovalPayloadInput {
  keyId: string;
  tenantId: string;
  articleId: string;
  contentVersion: number | string;
  artifactFingerprint: string;
  policyVersion: string;
  decision: 'APPROVED' | 'REJECTED';
  approverId: string;
  approvalTimestamp: string;
  decisionReason?: string;
}

export class ApprovalSerializationError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ApprovalSerializationError';
    this.code = code;
  }
}

/**
 * Validates whether a string contains any lone UTF-16 surrogates.
 */
function hasLoneSurrogates(str: string): boolean {
  return /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(str);
}

/**
 * Validates whether a string contains any forbidden ASCII control characters (0x00-0x1F, 0x7F).
 */
function hasForbiddenControlChars(str: string): boolean {
  return /[\x00-\x1F\x7F]/.test(str);
}

/**
 * Validates string hygiene:
 * - Rejects lone surrogates (preventing \uFFFD mutation)
 * - Enforces NFC normalization (no silent mutation)
 * - Forbids control characters
 */
function validateStringHygiene(val: string, fieldName: string): void {
  if (hasLoneSurrogates(val)) {
    throw new ApprovalSerializationError(
      `Field "${fieldName}" contains unpaired UTF-16 surrogate characters.`,
      'ERR_LONE_UTF16_SURROGATE'
    );
  }

  if (val !== val.normalize('NFC')) {
    throw new ApprovalSerializationError(
      `Field "${fieldName}" must be in Unicode Normalization Form C (NFC). Silent normalization is prohibited.`,
      'ERR_UNICODE_NOT_NORMALIZED_NFC'
    );
  }

  if (hasForbiddenControlChars(val)) {
    throw new ApprovalSerializationError(
      `Field "${fieldName}" contains forbidden control characters or embedded newlines.`,
      'ERR_CONTROL_CHARACTERS_FORBIDDEN'
    );
  }
}

/**
 * Formats a single field using the strict ACUTE-APR-V1 framing rule:
 * `${utf8ByteLength}:${value}\n`
 */
function formatFramedField(val: string, fieldName: string, maxBytes?: number): string {
  const buf = Buffer.from(val, 'utf8');
  if (maxBytes !== undefined && buf.length > maxBytes) {
    throw new ApprovalSerializationError(
      `Field "${fieldName}" exceeds maximum allowed byte length of ${maxBytes} bytes (got ${buf.length} bytes).`,
      'ERR_FIELD_EXCEEDS_MAX_LENGTH'
    );
  }
  return `${buf.length}:${val}\n`;
}

/**
 * Serializes an approval payload into the canonical ACUTE-APR-V1 UTF-8 byte stream.
 *
 * Framing Specification:
 * - Line 0: "12:ACUTE-APR-V1\n"
 * - Lines 1-9: Length-prefixed mandatory fields in fixed sequence.
 * - Line 10 (Optional): Length-prefixed decisionReason if provided and non-empty.
 */
export function serializeCanonicalApprovalPayload(input: CanonicalApprovalPayloadInput): Buffer {
  if (!input || typeof input !== 'object') {
    throw new ApprovalSerializationError('Payload must be a non-null object.', 'ERR_MALFORMED_PAYLOAD');
  }

  // 1. keyId: ASCII ^[a-zA-Z0-9_-]{1,64}$
  if (typeof input.keyId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.keyId)) {
    throw new ApprovalSerializationError(
      'Field "keyId" must be an ASCII string matching ^[a-zA-Z0-9_-]{1,64}$.',
      'ERR_INVALID_KEY_ID'
    );
  }
  const lineKeyId = formatFramedField(input.keyId, 'keyId', 64);

  // 2. tenantId: ASCII/UTF-8 ^[a-zA-Z0-9_\-\.]{1,128}$
  if (typeof input.tenantId !== 'string' || !/^[a-zA-Z0-9_\-\.]{1,128}$/.test(input.tenantId)) {
    throw new ApprovalSerializationError(
      'Field "tenantId" must match ^[a-zA-Z0-9_\\-\\.]{1,128}$.',
      'ERR_INVALID_TENANT_ID'
    );
  }
  validateStringHygiene(input.tenantId, 'tenantId');
  const lineTenantId = formatFramedField(input.tenantId, 'tenantId', 128);

  // 3. articleId: ASCII-only ^[a-zA-Z0-9_-]{1,128}$
  if (typeof input.articleId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.articleId)) {
    throw new ApprovalSerializationError(
      'Field "articleId" must be an ASCII string matching ^[a-zA-Z0-9_-]{1,128}$.',
      'ERR_INVALID_ARTICLE_ID'
    );
  }
  const lineArticleId = formatFramedField(input.articleId, 'articleId', 128);

  // 4. contentVersion: Canonical ASCII integer 1..2147483647 (no leading zeros, no decimals, no exponent)
  const cvStr = String(input.contentVersion).trim();
  if (!/^[1-9][0-9]*$/.test(cvStr)) {
    throw new ApprovalSerializationError(
      'Field "contentVersion" must be a positive integer without leading zeros or decimals.',
      'ERR_NON_CANONICAL_INTEGER'
    );
  }
  const cvNum = Number(cvStr);
  if (!Number.isSafeInteger(cvNum) || cvNum < 1 || cvNum > 2147483647) {
    throw new ApprovalSerializationError(
      'Field "contentVersion" out of range (1..2147483647).',
      'ERR_NON_CANONICAL_INTEGER'
    );
  }
  const lineContentVersion = formatFramedField(cvStr, 'contentVersion', 10);

  // 5. artifactFingerprint: ^vfp-sha256-v1:[0-9a-f]{64}$
  if (
    typeof input.artifactFingerprint !== 'string' ||
    !/^vfp-sha256-v1:[0-9a-f]{64}$/.test(input.artifactFingerprint)
  ) {
    throw new ApprovalSerializationError(
      'Field "artifactFingerprint" must match ^vfp-sha256-v1:[0-9a-f]{64}$.',
      'ERR_INVALID_ARTIFACT_FINGERPRINT'
    );
  }
  const lineFingerprint = formatFramedField(input.artifactFingerprint, 'artifactFingerprint', 80);

  // 6. policyVersion: ^[a-zA-Z0-9_\-\.]{1,64}$
  if (typeof input.policyVersion !== 'string' || !/^[a-zA-Z0-9_\-\.]{1,64}$/.test(input.policyVersion)) {
    throw new ApprovalSerializationError(
      'Field "policyVersion" must match ^[a-zA-Z0-9_\\-\\.]{1,64}$.',
      'ERR_INVALID_POLICY_VERSION'
    );
  }
  validateStringHygiene(input.policyVersion, 'policyVersion');
  const linePolicyVersion = formatFramedField(input.policyVersion, 'policyVersion', 64);

  // 7. decision: Strictly 'APPROVED' or 'REJECTED'
  if (input.decision !== 'APPROVED' && input.decision !== 'REJECTED') {
    throw new ApprovalSerializationError(
      'Field "decision" must be strictly "APPROVED" or "REJECTED".',
      'ERR_INVALID_DECISION'
    );
  }
  const lineDecision = formatFramedField(input.decision, 'decision', 8);

  // 8. approverId: ASCII ^[a-zA-Z0-9_-]{1,128}$
  if (typeof input.approverId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.approverId)) {
    throw new ApprovalSerializationError(
      'Field "approverId" must be an ASCII string matching ^[a-zA-Z0-9_-]{1,128}$.',
      'ERR_INVALID_APPROVER_ID'
    );
  }
  const lineApproverId = formatFramedField(input.approverId, 'approverId', 128);

  // 9. approvalTimestamp: UTC ISO 8601 with milliseconds: ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$
  if (
    typeof input.approvalTimestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.approvalTimestamp)
  ) {
    throw new ApprovalSerializationError(
      'Field "approvalTimestamp" must be a UTC ISO 8601 string with 3-digit milliseconds and Z suffix.',
      'ERR_INVALID_TIMESTAMP'
    );
  }
  const parsedTime = Date.parse(input.approvalTimestamp);
  if (isNaN(parsedTime)) {
    throw new ApprovalSerializationError(
      'Field "approvalTimestamp" does not evaluate to a valid calendar date.',
      'ERR_INVALID_TIMESTAMP'
    );
  }
  const lineTimestamp = formatFramedField(input.approvalTimestamp, 'approvalTimestamp', 24);

  // Construct standard lines
  const lines: string[] = [
    formatFramedField(PROTOCOL_HEADER, 'protocolHeader', 12),
    lineKeyId,
    lineTenantId,
    lineArticleId,
    lineContentVersion,
    lineFingerprint,
    linePolicyVersion,
    lineDecision,
    lineApproverId,
    lineTimestamp
  ];

  // 10. Optional decisionReason
  if (input.decisionReason !== undefined && input.decisionReason !== null && input.decisionReason.length > 0) {
    validateStringHygiene(input.decisionReason, 'decisionReason');
    const lineReason = formatFramedField(input.decisionReason, 'decisionReason', 1024);
    lines.push(lineReason);
  }

  const serializedString = lines.join('');
  return Buffer.from(serializedString, 'utf8');
}
