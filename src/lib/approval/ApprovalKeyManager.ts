// src/lib/approval/ApprovalKeyManager.ts
import crypto from 'crypto';

export type KeyStatus = 'active' | 'verify_only' | 'revoked';

export interface KeyringEntry {
  secret: string;
  encoding?: 'hex' | 'base64' | 'utf8';
  status: KeyStatus;
  algorithm?: 'sha256';
}

export type KeyringMap = Record<string, KeyringEntry>;

export class ApprovalKeyError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ApprovalKeyError';
    this.code = code;
  }
}

/**
 * Manages HMAC keys for ACUTE approval provenance.
 * Enforces key eligibility, rotation, retirement, and constant-time signature verification.
 */
export class ApprovalKeyManager {
  private static testKeyring: KeyringMap | null = null;
  private static testActiveKeyId: string | null = null;

  /**
   * Injects a test keyring. Only permitted in non-production environments.
   */
  public static setTestKeyring(keyring: KeyringMap, activeKeyId?: string): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ApprovalKeyError(
        'Security Violation: Cannot inject test keyring in production environment.',
        'ERR_PRODUCTION_TEST_KEYRING_FORBIDDEN'
      );
    }
    this.testKeyring = keyring;
    this.testActiveKeyId = activeKeyId || null;
  }

  /**
   * Clears the test keyring override.
   */
  public static resetTestKeyring(): void {
    this.testKeyring = null;
    this.testActiveKeyId = null;
  }

  /**
   * Resolves the raw keyring map from environment or test override.
   */
  private static resolveKeyring(): KeyringMap {
    if (this.testKeyring !== null) {
      return this.testKeyring;
    }

    const rawJson = process.env.APPROVAL_KEYRING_JSON;
    if (!rawJson || !rawJson.trim()) {
      throw new ApprovalKeyError(
        'Approval keyring unconfigured: APPROVAL_KEYRING_JSON environment variable is missing.',
        'ERR_KEYRING_UNCONFIGURED'
      );
    }

    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Keyring must be a JSON object mapping key IDs to key definitions.');
      }
      return parsed as KeyringMap;
    } catch (err: any) {
      throw new ApprovalKeyError(
        `Failed to parse APPROVAL_KEYRING_JSON: ${err?.message || 'Invalid JSON'}`,
        'ERR_KEYRING_MALFORMED'
      );
    }
  }

  /**
   * Decodes and validates secret material for a keyring entry.
   * Enforces minimum 32 bytes of entropy.
   */
  private static decodeSecret(entry: KeyringEntry, keyId: string): Buffer {
    if (!entry.secret || typeof entry.secret !== 'string') {
      throw new ApprovalKeyError(
        `Key "${keyId}" secret material is missing or invalid.`,
        'ERR_KEY_SECRET_MISSING'
      );
    }

    let encoding: 'hex' | 'base64' | 'utf8' = entry.encoding || 'utf8';
    // If encoding not specified, auto-detect hex or base64 if standard length
    if (!entry.encoding) {
      if (/^[0-9a-fA-F]{64}$/.test(entry.secret)) {
        encoding = 'hex';
      } else if (/^[A-Za-z0-9+/=]{44}$/.test(entry.secret)) {
        encoding = 'base64';
      }
    }

    const buf = Buffer.from(entry.secret, encoding);
    if (buf.length < 32) {
      throw new ApprovalKeyError(
        `Key "${keyId}" secret material is insufficient (${buf.length} bytes decoded). Minimum requirement is 32 bytes.`,
        'ERR_KEY_SECRET_INSUFFICIENT'
      );
    }

    return buf;
  }

  /**
   * Resolves the active signing key ID.
   */
  public static getActiveKeyId(): string {
    if (this.testActiveKeyId) {
      return this.testActiveKeyId;
    }
    const envActive = process.env.APPROVAL_ACTIVE_KEY_ID;
    if (envActive && envActive.trim()) {
      return envActive.trim();
    }
    throw new ApprovalKeyError(
      'No active signing key configured: APPROVAL_ACTIVE_KEY_ID is missing.',
      'ERR_NO_ACTIVE_SIGNING_KEY'
    );
  }

  /**
   * Signs a canonical byte payload using the active key.
   */
  public static signPayload(payload: Buffer): { signature: string; keyId: string } {
    const keyId = this.getActiveKeyId();
    const keyring = this.resolveKeyring();
    const entry = keyring[keyId];

    if (!entry) {
      throw new ApprovalKeyError(
        `Active key "${keyId}" does not exist in the configured keyring.`,
        'ERR_ACTIVE_KEY_NOT_IN_KEYRING'
      );
    }

    if (entry.status !== 'active') {
      throw new ApprovalKeyError(
        `Key "${keyId}" has status "${entry.status}" and is not eligible for signing new approvals.`,
        'ERR_KEY_NOT_ELIGIBLE_FOR_SIGNING'
      );
    }

    const secretBuf = this.decodeSecret(entry, keyId);
    const signature = crypto.createHmac('sha256', secretBuf).update(payload).digest('hex');

    return { signature, keyId };
  }

  /**
   * Verifies an HMAC signature against the keyring in constant time.
   */
  public static verifySignature(
    payload: Buffer,
    signatureHex: string,
    keyId: string
  ): { valid: boolean; reason?: string; code?: string } {
    if (!signatureHex || typeof signatureHex !== 'string') {
      return { valid: false, reason: 'Missing or malformed signature.', code: 'ERR_SIGNATURE_INVALID' };
    }

    // SHA-256 HMAC hex signatures are strictly 64 hex characters (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(signatureHex)) {
      return { valid: false, reason: 'Signature must be a 64-character hex string.', code: 'ERR_SIGNATURE_MALFORMED' };
    }

    let keyring: KeyringMap;
    try {
      keyring = this.resolveKeyring();
    } catch (err: any) {
      return { valid: false, reason: err.message, code: err.code || 'ERR_KEYRING_ERROR' };
    }

    const entry = keyring[keyId];
    if (!entry) {
      return { valid: false, reason: `Unknown key ID "${keyId}". Key does not exist in keyring.`, code: 'ERR_KEY_UNKNOWN' };
    }

    if (entry.status === 'revoked') {
      return { valid: false, reason: `Key "${keyId}" has been revoked and cannot verify signatures.`, code: 'ERR_KEY_REVOKED' };
    }

    let secretBuf: Buffer;
    try {
      secretBuf = this.decodeSecret(entry, keyId);
    } catch (err: any) {
      return { valid: false, reason: err.message, code: err.code || 'ERR_KEY_SECRET_INVALID' };
    }

    const expectedSignatureHex = crypto.createHmac('sha256', secretBuf).update(payload).digest('hex');

    const sigBuf = Buffer.from(signatureHex.toLowerCase(), 'hex');
    const expectedBuf = Buffer.from(expectedSignatureHex.toLowerCase(), 'hex');

    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, reason: 'Signature length mismatch.', code: 'ERR_SIGNATURE_INVALID' };
    }

    const match = crypto.timingSafeEqual(sigBuf, expectedBuf);
    if (!match) {
      return { valid: false, reason: 'HMAC signature verification failed: signature does not match payload.', code: 'ERR_SIGNATURE_MISMATCH' };
    }

    return { valid: true };
  }
}
