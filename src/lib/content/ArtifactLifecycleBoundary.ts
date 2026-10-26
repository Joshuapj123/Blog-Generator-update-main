// src/lib/content/ArtifactLifecycleBoundary.ts
import crypto from 'crypto';
import { z } from 'zod';
import { ContentAsset, ContentAssetSchema, SaaSProfile } from '@/core/contracts/schemas';
import { ParagraphSignatureValidator } from '@/lib/intelligence/ParagraphSignatureValidator';

export const ArtifactLifecycleStateSchema = z.enum([
  'DRAFT',
  'READY',
  'REVIEW_REQUIRED',
  'REJECTED'
]);

export type ArtifactLifecycleState = z.infer<typeof ArtifactLifecycleStateSchema>;

export const FINGERPRINT_VERSION = 'vfp-sha256-v1';
export const DEFAULT_POLICY_VERSION = '2026-r5';

export interface ArtifactFingerprintInput {
  title?: string;
  bodyMarkdown: string;
  targetBrand?: string;
  slug?: string;
  metaDescription?: string;
  targetKeyword?: string;
  metaTitle?: string;
  policyVersion?: string;
}

/**
 * ValidatedPublishableAsset represents a ContentAsset that has strictly crossed
 * the artifact boundary, confirmed via fresh fingerprint and full validation.
 */
export interface ValidatedPublishableAsset extends ContentAsset {
  readonly validationStatus: 'READY';
  readonly validationFingerprint: string;
  readonly validatedAt: string;
  readonly targetBrand: string;
  readonly qualityScore: number;
}

/**
 * Discriminated union representing the runtime boundary state of any artifact.
 */
export type ArtifactBoundaryEnvelope =
  | {
      readonly status: 'READY';
      readonly isPublishable: true;
      readonly asset: ValidatedPublishableAsset;
    }
  | {
      readonly status: 'REVIEW_REQUIRED';
      readonly isPublishable: false;
      readonly reason: string;
      readonly code: 'ERR_REVIEW_REQUIRED';
      readonly diagnostics: string[];
    }
  | {
      readonly status: 'REJECTED';
      readonly isPublishable: false;
      readonly reason: string;
      readonly code: 'ERR_REJECTED';
      readonly criticalErrors: string[];
    }
  | {
      readonly status: 'DRAFT';
      readonly isPublishable: false;
      readonly reason: string;
      readonly code: 'ERR_UNVALIDATED_DRAFT';
    };

export interface BoundaryVerificationOptions {
  saasProfile?: SaaSProfile;
  enforceSignatures?: boolean;
  policyVersion?: string;
}

export type ArtifactBoundaryVerificationResult =
  | {
      isEligible: true;
      status: 'READY';
      asset: ValidatedPublishableAsset;
      envelope: ArtifactBoundaryEnvelope;
    }
  | {
      isEligible: false;
      status: ArtifactLifecycleState | 'INVALID_DATA' | 'STALE_FINGERPRINT' | 'SIGNATURE_VIOLATION' | 'BRAND_MISMATCH';
      reason: string;
      code: string;
      envelope: ArtifactBoundaryEnvelope;
    };

/**
 * Authoritative boundary gatekeeper: verifies that an artifact satisfies all typed lifecycle
 * and runtime requirements before downstream publishing, distribution, or export.
 */
export class ArtifactLifecycleBoundary {
  private static readonly VALID_TRANSITIONS: Record<ArtifactLifecycleState, ArtifactLifecycleState[]> = {
    DRAFT: ['READY', 'REVIEW_REQUIRED', 'REJECTED'],
    READY: ['DRAFT', 'READY'], // Mutation demotes to DRAFT; revalidation can refresh READY
    REVIEW_REQUIRED: ['DRAFT'], // Human editor must reopen or re-draft
    REJECTED: ['DRAFT']         // Regeneration or restart required
  };

  /**
   * Computes a versioned SHA-256 fingerprint for the R5 artifact-integrity contract.
   * Deterministically normalizes and canonicalizes publication-critical fields.
   */
  public static computeFingerprint(
    inputOrAsset: ArtifactFingerprintInput | ContentAsset,
    options?: { policyVersion?: string; targetBrand?: string }
  ): string {
    const title = (inputOrAsset.title || '').trim();
    // Canonicalize line endings (CRLF/CR -> LF) and trailing per-line spaces,
    // while strictly preserving paragraph breaks, headers, lists, and internal spacing.
    const bodyMarkdown = (inputOrAsset.bodyMarkdown || '')
      .replace(/\r\n|\r/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
    const targetBrand = (inputOrAsset.targetBrand || options?.targetBrand || '').trim().toLowerCase();
    const slug = (inputOrAsset.slug || '').trim().toLowerCase();
    const metaDescription = (inputOrAsset.metaDescription || '').trim();
    const targetKeyword = (inputOrAsset.targetKeyword || '').trim().toLowerCase();
    const policyVersion = options?.policyVersion || (inputOrAsset as ArtifactFingerprintInput).policyVersion || DEFAULT_POLICY_VERSION;

    const canonicalPayload = JSON.stringify({
      schemaVersion: FINGERPRINT_VERSION,
      policyVersion,
      targetBrand,
      title,
      bodyMarkdown,
      slug,
      metaDescription,
      targetKeyword
    });

    const sha256 = crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
    return `${FINGERPRINT_VERSION}:${sha256}`;
  }

  /**
   * Validates whether a state transition is legal under the lifecycle contract.
   */
  public static validateStateTransition(
    current: ArtifactLifecycleState,
    next: ArtifactLifecycleState
  ): { isValid: boolean; reason?: string } {
    const allowed = this.VALID_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      return {
        isValid: false,
        reason: `Illegal lifecycle transition: Cannot transition artifact from "${current}" to "${next}".`
      };
    }
    return { isValid: true };
  }

  /**
   * Verifies an untrusted or runtime asset against the publishable artifact boundary.
   * Fails closed on missing fields, unapproved status, stale fingerprints, entity mismatches,
   * or structural signature repetition.
   */
  public static verifyPublishableArtifact(
    rawAsset: unknown,
    options?: BoundaryVerificationOptions
  ): ArtifactBoundaryVerificationResult {
    // 1. Runtime schema & shape validation
    if (!rawAsset || typeof rawAsset !== 'object') {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'DRAFT',
        isPublishable: false,
        reason: 'Asset is null, undefined, or not an object.',
        code: 'ERR_UNVALIDATED_DRAFT'
      };
      return {
        isEligible: false,
        status: 'INVALID_DATA',
        reason: 'Asset is null, undefined, or not an object.',
        code: 'ERR_MALFORMED_ASSET',
        envelope
      };
    }

    // 1.5. Body Markdown completeness check
    const rawBody = (rawAsset as any).bodyMarkdown;
    if (typeof rawBody !== 'string' || rawBody.trim().length === 0) {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'DRAFT',
        isPublishable: false,
        reason: 'Asset markdown body is missing or empty.',
        code: 'ERR_UNVALIDATED_DRAFT'
      };
      return {
        isEligible: false,
        status: 'INVALID_DATA',
        reason: 'Asset markdown body is missing or empty.',
        code: 'ERR_EMPTY_BODY',
        envelope
      };
    }

    const parseResult = ContentAssetSchema.safeParse(rawAsset);
    if (!parseResult.success) {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'DRAFT',
        isPublishable: false,
        reason: `Schema validation failed: ${parseResult.error.issues.map(i => i.message).join(', ')}`,
        code: 'ERR_UNVALIDATED_DRAFT'
      };
      return {
        isEligible: false,
        status: 'INVALID_DATA',
        reason: `Schema validation failed: ${parseResult.error.issues.map(i => i.message).join(', ')}`,
        code: 'ERR_SCHEMA_VALIDATION_FAILED',
        envelope
      };
    }

    const asset = parseResult.data;

    // 2. Strict lifecycle state gate
    const status = (asset.validationStatus || 'DRAFT') as ArtifactLifecycleState;

    if (status === 'REVIEW_REQUIRED') {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'REVIEW_REQUIRED',
        isPublishable: false,
        reason: `Artifact requires human editorial review before publishing (status: "${status}").`,
        code: 'ERR_REVIEW_REQUIRED',
        diagnostics: ['Artifact failed automated bounded repair or encountered unmappable structural defects.']
      };
      return {
        isEligible: false,
        status: 'REVIEW_REQUIRED',
        reason: `Artifact requires human editorial review before publishing (status: "${status}").`,
        code: 'ERR_REVIEW_REQUIRED',
        envelope
      };
    }

    if (status === 'REJECTED') {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'REJECTED',
        isPublishable: false,
        reason: `Artifact has been REJECTED by editorial quality validation.`,
        code: 'ERR_REJECTED',
        criticalErrors: ['Article failed critical quality or grounding checks.']
      };
      return {
        isEligible: false,
        status: 'REJECTED',
        reason: `Artifact has been REJECTED by editorial quality validation.`,
        code: 'ERR_REJECTED',
        envelope
      };
    }

    if (status !== 'READY') {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'DRAFT',
        isPublishable: false,
        reason: `Artifact has unvalidated status "${status}". Only 'READY' assets are eligible for publishing.`,
        code: 'ERR_UNVALIDATED_DRAFT'
      };
      return {
        isEligible: false,
        status: status,
        reason: `Artifact has unvalidated status "${status}". Only 'READY' assets are eligible for publishing.`,
        code: 'ERR_NOT_READY',
        envelope
      };
    }

    // 4. Stale validation check via content fingerprinting
    const targetBrand = asset.targetBrand || options?.saasProfile?.name || '';
    if (!asset.validationFingerprint) {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'DRAFT',
        isPublishable: false,
        reason: 'Missing validation fingerprint: Asset must carry cryptographic evidence of fresh review.',
        code: 'ERR_UNVALIDATED_DRAFT'
      };
      return {
        isEligible: false,
        status: 'INVALID_DATA',
        reason: 'Missing validation fingerprint: Asset must carry cryptographic evidence of fresh review.',
        code: 'ERR_MISSING_FINGERPRINT',
        envelope
      };
    }

    // Check for versioned SHA-256 fingerprint prefix (fail closed on legacy FNV-1a or unknown hashes)
    if (!asset.validationFingerprint.startsWith(`${FINGERPRINT_VERSION}:`)) {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'DRAFT',
        isPublishable: false,
        reason: 'Legacy or unrecognized validation fingerprint format: Asset must be revalidated under the R5 SHA-256 integrity contract.',
        code: 'ERR_UNVALIDATED_DRAFT'
      };
      return {
        isEligible: false,
        status: 'STALE_FINGERPRINT',
        reason: 'Legacy or unrecognized validation fingerprint format: Asset must be revalidated under the R5 SHA-256 integrity contract.',
        code: 'ERR_LEGACY_FINGERPRINT',
        envelope
      };
    }

    const expectedFingerprint = this.computeFingerprint(asset, {
      targetBrand,
      policyVersion: options?.policyVersion
    });

    if (asset.validationFingerprint !== expectedFingerprint) {
      const envelope: ArtifactBoundaryEnvelope = {
        status: 'DRAFT',
        isPublishable: false,
        reason: 'Stale validation detected: Content or publication metadata has been modified since validation (fingerprint mismatch).',
        code: 'ERR_UNVALIDATED_DRAFT'
      };
      return {
        isEligible: false,
        status: 'STALE_FINGERPRINT',
        reason: 'Stale validation detected: Content or publication metadata has been modified since validation (fingerprint mismatch).',
        code: 'ERR_STALE_VALIDATION_FINGERPRINT',
        envelope
      };
    }

    // 5. Strict brand/entity isolation between asset and profile
    if (options?.saasProfile?.name && targetBrand) {
      const normAssetBrand = targetBrand.toLowerCase().trim();
      const normProfileBrand = options.saasProfile.name.toLowerCase().trim();
      if (
        normAssetBrand !== normProfileBrand &&
        !normProfileBrand.includes(normAssetBrand) &&
        !normAssetBrand.includes(normProfileBrand)
      ) {
        const envelope: ArtifactBoundaryEnvelope = {
          status: 'REJECTED',
          isPublishable: false,
          reason: `Entity mismatch: Asset target brand "${targetBrand}" does not match profile "${options.saasProfile.name}".`,
          code: 'ERR_REJECTED',
          criticalErrors: ['Target brand does not match distribution profile identity.']
        };
        return {
          isEligible: false,
          status: 'BRAND_MISMATCH',
          reason: `Entity mismatch: Asset target brand "${targetBrand}" does not match profile "${options.saasProfile.name}".`,
          code: 'ERR_BRAND_MISMATCH',
          envelope
        };
      }
    }

    // 6. R3 Canonical Paragraph Signature validation (never allow repetition through boundary)
    if (options?.enforceSignatures !== false) {
      const sigValidation = ParagraphSignatureValidator.validate(asset.bodyMarkdown);
      if (!sigValidation.valid) {
        const envelope: ArtifactBoundaryEnvelope = {
          status: 'REVIEW_REQUIRED',
          isPublishable: false,
          reason: `Canonical paragraph signature violation: ${sigValidation.criticalErrors.join(' ')}`,
          code: 'ERR_REVIEW_REQUIRED',
          diagnostics: sigValidation.criticalErrors
        };
        return {
          isEligible: false,
          status: 'SIGNATURE_VIOLATION',
          reason: `Canonical paragraph signature violation: ${sigValidation.criticalErrors.join(' ')}`,
          code: 'ERR_PARAGRAPH_SIGNATURE_VIOLATION',
          envelope
        };
      }
    }

    // 7. Verified Publishable Asset Envelope
    const validatedAsset: ValidatedPublishableAsset = {
      ...asset,
      validationStatus: 'READY',
      validationFingerprint: asset.validationFingerprint,
      validatedAt: asset.validatedAt || new Date().toISOString(),
      targetBrand,
      qualityScore: asset.qualityScore ?? 90
    };

    const envelope: ArtifactBoundaryEnvelope = {
      status: 'READY',
      isPublishable: true,
      asset: validatedAsset
    };

    return {
      isEligible: true,
      status: 'READY',
      asset: validatedAsset,
      envelope
    };
  }
}
