// src/lib/approval/ApprovalAuthorityService.ts
import crypto from 'crypto';
import { DEFAULT_POLICY_VERSION, ArtifactLifecycleBoundary } from '@/lib/content/ArtifactLifecycleBoundary';
import { getAdminFirestore } from '@/lib/firebase/admin';
import {
  saveApprovalAdmin,
  getApprovalByIdAdmin,
  updateArticleApprovalPointerAdmin,
  getArticleByIdAdmin
} from '@/lib/firebase/admin-firestore';
import { TemporaryArticleStore, resolvePersistenceBackend } from '@/lib/test-storage/TemporaryArticleStore';
import { ApprovalKeyManager } from './ApprovalKeyManager';
import { serializeCanonicalApprovalPayload } from './ApprovalPayloadSerializer';
import {
  ApprovalDecision,
  ApprovalRecord,
  ApprovalRequest,
  ApprovalResult
} from './types';
import { slugify } from '@/lib/article-utils';
import { ContentAsset } from '@/core/contracts/schemas';
import type { Article } from '@/lib/firebase/firestore';

export interface ReleaseEligibilityOptions {
  articleId: string;
  callerUid: string;
  requiredDecision?: ApprovalDecision;
  policyVersion?: string;
}

export interface ReleaseEligibilityResult {
  isEligible: boolean;
  article?: Article;
  contentAsset?: ContentAsset;
  approvalRecord?: ApprovalRecord;
  recomputedFingerprint?: string;
  code?: string;
  reason?: string;
  httpStatus?: number;
}

export class ApprovalAuthorityService {
  /**
   * Processes an approval or rejection request with strict owner-only authorization,
   * lifecycle state verification, canonical serialization, and atomic record creation.
   */
  public static async processDecision(
    request: ApprovalRequest,
    verifiedUid: string
  ): Promise<ApprovalResult> {
    if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
      return {
        success: false,
        error: 'Unauthorized: A verified Firebase UID is required to issue an approval decision.',
        code: 'ERR_UNAUTHORIZED',
        httpStatus: 401
      };
    }

    const cleanUid = verifiedUid.trim();
    const backend = resolvePersistenceBackend();

    if (backend === 'TEMP_TEST_STORAGE') {
      return this.processDecisionTestStorage(request, cleanUid);
    }

    return this.processDecisionFirestore(request, cleanUid);
  }

  /**
   * In-memory transaction processing for test environments.
   */
  private static async processDecisionTestStorage(
    request: ApprovalRequest,
    cleanUid: string
  ): Promise<ApprovalResult> {
    // 1. Check article existence and ownership
    const article = await TemporaryArticleStore.getArticleRaw(request.articleId);
    if (!article) {
      return {
        success: false,
        error: `Not Found: Article "${request.articleId}" was not found.`,
        code: 'ERR_ARTICLE_NOT_FOUND',
        httpStatus: 404
      };
    }

    const isOwner = article.userId === cleanUid || article.ownerId === cleanUid;
    if (!isOwner) {
      return {
        success: false,
        error: `Forbidden: Caller "${cleanUid}" is not the verified owner of article "${request.articleId}".`,
        code: 'ERR_FORBIDDEN_NOT_ARTICLE_OWNER',
        httpStatus: 403
      };
    }

    // 2. Lifecycle state gate
    const currentValStatus = article.validationStatus || 'DRAFT';
    if (request.decision === 'APPROVED' && currentValStatus !== 'READY') {
      return {
        success: false,
        error: `Conflict: Article "${request.articleId}" has validation status "${currentValStatus}". Only READY artifacts can be approved.`,
        code: 'ERR_ARTIFACT_NOT_READY',
        httpStatus: 409
      };
    }

    // 3. Fingerprint matching
    if (!article.validationFingerprint) {
      return {
        success: false,
        error: `Conflict: Article "${request.articleId}" lacks a validation fingerprint.`,
        code: 'ERR_MISSING_FINGERPRINT',
        httpStatus: 409
      };
    }

    if (article.validationFingerprint !== request.artifactFingerprint) {
      return {
        success: false,
        error: `Conflict: Stale fingerprint detected. Article fingerprint is "${article.validationFingerprint}", but request specified "${request.artifactFingerprint}".`,
        code: 'ERR_STALE_FINGERPRINT',
        httpStatus: 409
      };
    }

    // 4. Idempotency & Conflict Check
    if (article.activeApprovalId) {
      const activeRecord: ApprovalRecord | null = await TemporaryArticleStore.getApprovalById(article.activeApprovalId);
      if (activeRecord) {
        if (
          activeRecord.artifactFingerprint === request.artifactFingerprint &&
          activeRecord.decision === request.decision
        ) {
          return {
            success: true,
            status: 'IDEMPOTENT_SUCCESS',
            record: activeRecord
          };
        }

        if (
          activeRecord.artifactFingerprint === request.artifactFingerprint &&
          activeRecord.decision !== request.decision
        ) {
          if (!request.isExplicitReReview) {
            return {
              success: false,
              error: `Conflict: Article already has active decision "${activeRecord.decision}". An explicit re-review is required to change decision.`,
              code: 'ERR_APPROVAL_CONFLICT',
              httpStatus: 409,
              existingDecision: activeRecord.decision
            };
          }
        }
      }
    }

    // 5. Generate new revision & record
    const currentRev = article.approvalRevisionCount || 0;
    const newRev = currentRev + 1;
    const approvalId = `apr_${request.articleId}_rev${newRev}`;
    const tenantId = `user_${cleanUid}`;
    const approvalTimestamp = new Date().toISOString();
    const policyVersion = request.policyVersion || DEFAULT_POLICY_VERSION;
    const contentVersion = Number(article.contentVersion || 1);

    const activeKeyId = ApprovalKeyManager.getActiveKeyId();

    const payloadBytes = serializeCanonicalApprovalPayload({
      keyId: activeKeyId,
      tenantId,
      articleId: request.articleId,
      contentVersion,
      artifactFingerprint: article.validationFingerprint,
      policyVersion,
      decision: request.decision,
      approverId: cleanUid,
      approvalTimestamp,
      decisionReason: request.decisionReason
    });

    const signingResult = ApprovalKeyManager.signPayload(payloadBytes);

    const approvalRecord: ApprovalRecord = {
      approvalId,
      schemaVersion: 'apr-v1',
      keyId: signingResult.keyId,
      tenantId,
      ownerId: cleanUid,
      articleId: request.articleId,
      contentVersion,
      artifactFingerprint: article.validationFingerprint,
      policyVersion,
      decision: request.decision,
      approverId: cleanUid,
      approvalTimestamp,
      decisionReason: request.decisionReason || undefined,
      hmacSignature: signingResult.signature,
      revision: newRev
    };

    try {
      await TemporaryArticleStore.createApproval(approvalRecord);
    } catch (err: any) {
      if (err.code === 6 || String(err.message).includes('already exists')) {
        return {
          success: false,
          error: `Conflict: Approval revision "${approvalId}" already exists. History is append-only.`,
          code: 'ERR_REVISION_COLLISION',
          httpStatus: 409
        };
      }
      throw err;
    }

    await TemporaryArticleStore.updateArticleApprovalPointer(request.articleId, approvalId, newRev);

    return {
      success: true,
      status: 'CREATED',
      record: approvalRecord
    };
  }

  /**
   * Firestore transaction processing for production environment.
   */
  private static async processDecisionFirestore(
    request: ApprovalRequest,
    cleanUid: string
  ): Promise<ApprovalResult> {
    const { FieldValue } = await import('firebase-admin/firestore');
    const db = await getAdminFirestore();

    const articleRef = db.collection('articles').doc(request.articleId);

    return db.runTransaction(async (transaction) => {
      const articleDoc = await transaction.get(articleRef);
      if (!articleDoc.exists) {
        return {
          success: false,
          error: `Not Found: Article "${request.articleId}" does not exist.`,
          code: 'ERR_ARTICLE_NOT_FOUND',
          httpStatus: 404
        };
      }

      const articleData = articleDoc.data() || {};
      const isOwner = articleData.userId === cleanUid || articleData.ownerId === cleanUid;
      if (!isOwner) {
        return {
          success: false,
          error: `Forbidden: Caller "${cleanUid}" is not the verified owner of article "${request.articleId}".`,
          code: 'ERR_FORBIDDEN_NOT_ARTICLE_OWNER',
          httpStatus: 403
        };
      }

      // Lifecycle check
      const currentValStatus = articleData.validationStatus || 'DRAFT';
      if (request.decision === 'APPROVED' && currentValStatus !== 'READY') {
        return {
          success: false,
          error: `Conflict: Article "${request.articleId}" has validation status "${currentValStatus}". Only READY artifacts can be approved.`,
          code: 'ERR_ARTIFACT_NOT_READY',
          httpStatus: 409
        };
      }

      // Fingerprint check
      if (!articleData.validationFingerprint) {
        return {
          success: false,
          error: `Conflict: Article "${request.articleId}" lacks a validation fingerprint.`,
          code: 'ERR_MISSING_FINGERPRINT',
          httpStatus: 409
        };
      }

      if (articleData.validationFingerprint !== request.artifactFingerprint) {
        return {
          success: false,
          error: `Conflict: Stale fingerprint detected. Article fingerprint is "${articleData.validationFingerprint}", but request specified "${request.artifactFingerprint}".`,
          code: 'ERR_STALE_FINGERPRINT',
          httpStatus: 409
        };
      }

      // Idempotency & Conflict Check
      if (articleData.activeApprovalId) {
        const activeApprovalRef = db.collection('approvals').doc(articleData.activeApprovalId);
        const activeApprovalDoc = await transaction.get(activeApprovalRef);
        if (activeApprovalDoc.exists) {
          const activeRecord = activeApprovalDoc.data() as ApprovalRecord;
          if (
            activeRecord.artifactFingerprint === request.artifactFingerprint &&
            activeRecord.decision === request.decision
          ) {
            return {
              success: true,
              status: 'IDEMPOTENT_SUCCESS',
              record: activeRecord
            };
          }

          if (
            activeRecord.artifactFingerprint === request.artifactFingerprint &&
            activeRecord.decision !== request.decision
          ) {
            if (!request.isExplicitReReview) {
              return {
                success: false,
                error: `Conflict: Article already has active decision "${activeRecord.decision}". An explicit re-review is required to change decision.`,
                code: 'ERR_APPROVAL_CONFLICT',
                httpStatus: 409,
                existingDecision: activeRecord.decision
              };
            }
          }
        }
      }

      // Generate new revision & record
      const currentRev = articleData.approvalRevisionCount || 0;
      const newRev = currentRev + 1;
      const approvalId = `apr_${request.articleId}_rev${newRev}`;
      const tenantId = `user_${cleanUid}`;
      const approvalTimestamp = new Date().toISOString();
      const policyVersion = request.policyVersion || DEFAULT_POLICY_VERSION;
      const contentVersion = Number(articleData.contentVersion || 1);

      const activeKeyId = ApprovalKeyManager.getActiveKeyId();

      const payloadBytes = serializeCanonicalApprovalPayload({
        keyId: activeKeyId,
        tenantId,
        articleId: request.articleId,
        contentVersion,
        artifactFingerprint: articleData.validationFingerprint,
        policyVersion,
        decision: request.decision,
        approverId: cleanUid,
        approvalTimestamp,
        decisionReason: request.decisionReason
      });

      const signingResult = ApprovalKeyManager.signPayload(payloadBytes);

      const approvalRecord: ApprovalRecord = {
        approvalId,
        schemaVersion: 'apr-v1',
        keyId: signingResult.keyId,
        tenantId,
        ownerId: cleanUid,
        articleId: request.articleId,
        contentVersion,
        artifactFingerprint: articleData.validationFingerprint,
        policyVersion,
        decision: request.decision,
        approverId: cleanUid,
        approvalTimestamp,
        decisionReason: request.decisionReason || undefined,
        hmacSignature: signingResult.signature,
        revision: newRev
      };

      const newApprovalRef = db.collection('approvals').doc(approvalId);
      try {
        transaction.create(newApprovalRef, approvalRecord);
      } catch (err: any) {
        if (err.code === 6 || err.code === 'already-exists' || String(err.message).includes('already exists')) {
          return {
            success: false,
            error: `Conflict: Approval revision "${approvalId}" already exists. History is append-only.`,
            code: 'ERR_REVISION_COLLISION',
            httpStatus: 409
          };
        }
        throw err;
      }

      transaction.update(articleRef, {
        activeApprovalId: approvalId,
        approvalRevisionCount: newRev,
        updatedAt: FieldValue.serverTimestamp()
      });

      return {
        success: true,
        status: 'CREATED',
        record: approvalRecord
      };
    });
  }

  /**
   * Verifies an active approval record against an authoritative article document.
   * Proves that the active record is validly signed, matches current fingerprint,
   * and holds the required decision.
   */
  public static async verifyActiveApproval(
    articleId: string,
    expectedDecision: ApprovalDecision = 'APPROVED'
  ): Promise<{ isValid: boolean; record?: ApprovalRecord; reason?: string; code?: string }> {
    const backend = resolvePersistenceBackend();

    let article: any;
    if (backend === 'TEMP_TEST_STORAGE') {
      // Direct store lookup
      for (const serialized of (TemporaryArticleStore as any).store.values()) {
        const doc = JSON.parse(serialized);
        if (doc.id === articleId) {
          article = doc;
          break;
        }
      }
    } else {
      article = await getArticleByIdAdmin(articleId);
    }

    if (!article) {
      return { isValid: false, reason: `Article "${articleId}" not found.`, code: 'ERR_ARTICLE_NOT_FOUND' };
    }

    if (!article.activeApprovalId) {
      return {
        isValid: false,
        reason: `Article "${articleId}" has no active approval decision record on file.`,
        code: 'ERR_NO_ACTIVE_APPROVAL'
      };
    }

    let record: ApprovalRecord | null = null;
    if (backend === 'TEMP_TEST_STORAGE') {
      record = await TemporaryArticleStore.getApprovalById(article.activeApprovalId);
    } else {
      record = await getApprovalByIdAdmin(article.activeApprovalId);
    }

    if (!record) {
      return {
        isValid: false,
        reason: `Active approval record "${article.activeApprovalId}" not found in database.`,
        code: 'ERR_APPROVAL_RECORD_MISSING'
      };
    }

    if (record.articleId !== articleId) {
      return {
        isValid: false,
        reason: `Approval record article ID mismatch (expected "${articleId}", got "${record.articleId}").`,
        code: 'ERR_APPROVAL_ARTICLE_MISMATCH'
      };
    }

    if (record.artifactFingerprint !== article.validationFingerprint) {
      return {
        isValid: false,
        reason: 'Approval record fingerprint does not match current article validation fingerprint.',
        code: 'ERR_APPROVAL_SUPERSEDED'
      };
    }

    if (record.decision !== expectedDecision) {
      return {
        isValid: false,
        reason: `Active approval record decision is "${record.decision}", but "${expectedDecision}" is required.`,
        code: 'ERR_DECISION_MISMATCH'
      };
    }

    // Cryptographic verification of HMAC signature
    const payloadBytes = serializeCanonicalApprovalPayload({
      keyId: record.keyId,
      tenantId: record.tenantId,
      articleId: record.articleId,
      contentVersion: record.contentVersion,
      artifactFingerprint: record.artifactFingerprint,
      policyVersion: record.policyVersion,
      decision: record.decision,
      approverId: record.approverId,
      approvalTimestamp: record.approvalTimestamp,
      decisionReason: record.decisionReason
    });

    const sigCheck = ApprovalKeyManager.verifySignature(payloadBytes, record.hmacSignature, record.keyId);
    if (!sigCheck.valid) {
      return {
        isValid: false,
        reason: `HMAC verification failed: ${sigCheck.reason}`,
        code: sigCheck.code || 'ERR_SIGNATURE_INVALID'
      };
    }

    return { isValid: true, record };
  }

  /**
   * Authoritative Release-Eligibility Gate:
   * Reusable server-side gate enforcing all 11 release invariants before distribution or official clean export.
   */
  public static async verifyReleaseEligibility(options: ReleaseEligibilityOptions): Promise<ReleaseEligibilityResult> {
    const { articleId, callerUid, requiredDecision = 'APPROVED', policyVersion } = options;

    if (!callerUid || typeof callerUid !== 'string' || !callerUid.trim()) {
      return {
        isEligible: false,
        reason: 'Unauthorized: A verified Firebase UID is required.',
        code: 'ERR_UNAUTHORIZED',
        httpStatus: 401
      };
    }

    if (!articleId || typeof articleId !== 'string' || !articleId.trim()) {
      return {
        isEligible: false,
        reason: 'Bad Request: A valid articleId is required.',
        code: 'ERR_INVALID_ARTICLE_ID',
        httpStatus: 400
      };
    }

    const cleanUid = callerUid.trim();
    const backend = resolvePersistenceBackend();

    let article: any = null;
    if (backend === 'TEMP_TEST_STORAGE') {
      article = await TemporaryArticleStore.getArticleRaw(articleId);
    } else {
      article = await getArticleByIdAdmin(articleId);
    }

    if (!article) {
      return {
        isEligible: false,
        reason: `Article "${articleId}" not found.`,
        code: 'ERR_ARTICLE_NOT_FOUND',
        httpStatus: 404
      };
    }

    // 2. Ownership check
    const isOwner = article.userId === cleanUid || article.ownerId === cleanUid;
    if (!isOwner) {
      return {
        isEligible: false,
        reason: `Forbidden: Caller is not the authorized owner of article "${articleId}".`,
        code: 'ERR_FORBIDDEN_NOT_ARTICLE_OWNER',
        httpStatus: 403
      };
    }

    // 3. Lifecycle status
    const currentValStatus = article.validationStatus || 'DRAFT';
    if (currentValStatus !== 'READY') {
      return {
        isEligible: false,
        reason: `Article "${articleId}" has validation status "${currentValStatus}". Only READY artifacts are eligible for release.`,
        code: 'ERR_ARTIFACT_NOT_READY',
        httpStatus: 422
      };
    }

    // 4. Fingerprint checks and recomputation
    if (!article.validationFingerprint) {
      return {
        isEligible: false,
        reason: `Article "${articleId}" lacks a validation fingerprint.`,
        code: 'ERR_MISSING_FINGERPRINT',
        httpStatus: 422
      };
    }

    if (!article.validationFingerprint.startsWith('vfp-sha256-v1:')) {
      return {
        isEligible: false,
        reason: `Article "${articleId}" carries a legacy or unrecognized validation fingerprint format.`,
        code: 'ERR_LEGACY_FINGERPRINT',
        httpStatus: 422
      };
    }

    const title = (article.title || '').trim();
    const bodyMarkdown = (article.content || article.blueprint?.bodyMarkdown || '').trim();
    const targetBrand = (article.targetBrand || article.blueprint?.targetBrand || article.referenceUrl || '').trim();
    const slug = (article.blueprint?.slug || article.slug || slugify(title)).trim();
    const metaDescription = (article.blueprint?.metaDescription || article.metaDescription || article.blueprint?.intent || '').trim();
    const targetKeyword = (article.sourceKeyword || article.targetKeyword || article.targetKeywords?.[0] || '').trim();
    const resolvedPolicyVersion = policyVersion || article.blueprint?.policyVersion || article.policyVersion || DEFAULT_POLICY_VERSION;

    const recomputedFingerprint = ArtifactLifecycleBoundary.computeFingerprint({
      title,
      bodyMarkdown,
      targetBrand,
      slug,
      metaDescription,
      targetKeyword,
      policyVersion: resolvedPolicyVersion
    });

    if (recomputedFingerprint !== article.validationFingerprint) {
      return {
        isEligible: false,
        reason: 'Content tampering detected: Stored validation fingerprint does not match authoritative recomputed fingerprint.',
        code: 'ERR_DIRTY_CONTENT_FINGERPRINT_MISMATCH',
        httpStatus: 422,
        recomputedFingerprint
      };
    }

    // 5. Active approval pointer lookup
    if (!article.activeApprovalId) {
      return {
        isEligible: false,
        reason: `Article "${articleId}" has no active approval decision record on file.`,
        code: 'ERR_NO_ACTIVE_APPROVAL',
        httpStatus: 422
      };
    }

    let record: ApprovalRecord | null = null;
    if (backend === 'TEMP_TEST_STORAGE') {
      record = await TemporaryArticleStore.getApprovalById(article.activeApprovalId);
    } else {
      record = await getApprovalByIdAdmin(article.activeApprovalId);
    }

    if (!record) {
      return {
        isEligible: false,
        reason: `Active approval record "${article.activeApprovalId}" not found in database.`,
        code: 'ERR_APPROVAL_RECORD_MISSING',
        httpStatus: 422
      };
    }

    // 6. Record metadata binding checks
    if (record.articleId !== articleId) {
      return {
        isEligible: false,
        reason: `Approval record article ID mismatch (expected "${articleId}", got "${record.articleId}").`,
        code: 'ERR_APPROVAL_ARTICLE_MISMATCH',
        httpStatus: 422
      };
    }

    const expectedTenantId = `user_${cleanUid}`;
    if (record.tenantId !== expectedTenantId) {
      return {
        isEligible: false,
        reason: 'Approval record tenant ID mismatch.',
        code: 'ERR_APPROVAL_TENANT_MISMATCH',
        httpStatus: 422
      };
    }

    if (record.approverId !== cleanUid) {
      return {
        isEligible: false,
        reason: 'Approval record approver ID mismatch.',
        code: 'ERR_APPROVAL_APPROVER_MISMATCH',
        httpStatus: 422
      };
    }

    const articleContentVersion = Number(article.contentVersion || 1);
    if (record.contentVersion !== articleContentVersion) {
      return {
        isEligible: false,
        reason: `Approval record content version (${record.contentVersion}) does not match current article content version (${articleContentVersion}).`,
        code: 'ERR_APPROVAL_VERSION_MISMATCH',
        httpStatus: 422
      };
    }

    if (record.policyVersion !== resolvedPolicyVersion) {
      return {
        isEligible: false,
        reason: `Approval record policy version (${record.policyVersion}) does not match artifact policy version (${resolvedPolicyVersion}).`,
        code: 'ERR_APPROVAL_POLICY_MISMATCH',
        httpStatus: 422
      };
    }

    if (record.artifactFingerprint !== recomputedFingerprint || record.artifactFingerprint !== article.validationFingerprint) {
      return {
        isEligible: false,
        reason: 'Approval record fingerprint does not match current article content fingerprint.',
        code: 'ERR_APPROVAL_SUPERSEDED',
        httpStatus: 422
      };
    }

    if (record.decision !== requiredDecision) {
      return {
        isEligible: false,
        reason: `Active approval record decision is "${record.decision}", but "${requiredDecision}" is required for release.`,
        code: record.decision === 'REJECTED' ? 'ERR_APPROVAL_REJECTED' : 'ERR_APPROVAL_DECISION_MISMATCH',
        httpStatus: 422
      };
    }

    // 7. HMAC signature verification
    const payloadBytes = serializeCanonicalApprovalPayload({
      keyId: record.keyId,
      tenantId: record.tenantId,
      articleId: record.articleId,
      contentVersion: record.contentVersion,
      artifactFingerprint: record.artifactFingerprint,
      policyVersion: record.policyVersion,
      decision: record.decision,
      approverId: record.approverId,
      approvalTimestamp: record.approvalTimestamp,
      decisionReason: record.decisionReason
    });

    const sigCheck = ApprovalKeyManager.verifySignature(payloadBytes, record.hmacSignature, record.keyId);
    if (!sigCheck.valid) {
      return {
        isEligible: false,
        reason: `Cryptographic approval signature verification failed: ${sigCheck.reason}`,
        code: sigCheck.code || 'ERR_SIGNATURE_INVALID',
        httpStatus: 422
      };
    }

    const contentAsset: ContentAsset = {
      title,
      bodyMarkdown,
      wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length,
      seoScore: (article as any).seoScore || 80,
      references: (article as any).references || [],
      slug,
      assetType: (article as any).assetType || 'ARTICLE',
      targetKeyword,
      metaTitle: (article as any).metaTitle || title,
      metaDescription,
      validationStatus: 'READY',
      targetBrand,
      validationFingerprint: article.validationFingerprint,
      contentVersion: articleContentVersion
    };

    return {
      isEligible: true,
      article,
      contentAsset,
      approvalRecord: record,
      recomputedFingerprint
    };
  }

  /**
   * Claims a dispatch operation under an atomic lease lock with a monotonically increasing generation.
   */
  public static async claimDispatchOperation(params: {
    articleId: string;
    callerUid: string;
    clientOperationKey: string;
    channels: string[];
    requiredDecision?: ApprovalDecision;
    policyVersion?: string;
    providerCapabilities?: Record<string, { supportsIdempotency?: boolean; supportsStatusLookup?: boolean }>;
    reconciliationOverride?: boolean;
  }): Promise<
    | {
        success: true;
        status: 'CLAIMED';
        generation: number;
        attemptId: string;
        logicalOperationId: string;
        providerIdempotencyKeys: Record<string, string>;
        article: any;
        approvalRecord: ApprovalRecord;
        contentAsset: ContentAsset;
      }
    | {
        success: true;
        status: 'DEDUPLICATED';
        results: any;
      }
    | {
        success: false;
        error: string;
        code: string;
        httpStatus: number;
      }
  > {
    const {
      articleId,
      callerUid,
      clientOperationKey,
      channels,
      requiredDecision = 'APPROVED',
      policyVersion,
      providerCapabilities,
      reconciliationOverride
    } = params;

    // 1. Enforce Release Eligibility Gate first
    const eligibility = await this.verifyReleaseEligibility({
      articleId,
      callerUid,
      requiredDecision,
      policyVersion
    });

    if (!eligibility.isEligible) {
      return {
        success: false,
        error: eligibility.reason!,
        code: eligibility.code!,
        httpStatus: eligibility.httpStatus || 422
      };
    }

    const article = eligibility.article!;
    const contentVersion = Number(article.contentVersion || 1);
    const approvalRevision = article.approvalRevisionCount || 1;
    const canonicalChannels = [...channels].sort().join(',');
    const durableOperationId = `op_${articleId}_v${contentVersion}_rev${approvalRevision}_${canonicalChannels}`;
    const now = Date.now();
    const backend = resolvePersistenceBackend();

    // 2. Check Deduplication / Idempotency
    // If this exact article version and approval revision has already been successfully dispatched,
    // deduplicate immediately regardless of whether the caller supplied a different clientOperationKey.
    if (
      article.dispatchState === 'DISPATCHED' &&
      (article.dispatchOperationId === durableOperationId ||
        (article.dispatchContentVersion === contentVersion && article.dispatchApprovalRevision === approvalRevision))
    ) {
      return {
        success: true,
        status: 'DEDUPLICATED',
        results: article.dispatchResults || []
      };
    }

    // 3. Active Lease Lock & Concurrent Conflict Check
    const isLeaseActive =
      (article.dispatchState === 'DISPATCH_CLAIMED' || article.dispatchState === 'DISPATCHING') &&
      Boolean(article.dispatchLeaseExpiresAt && article.dispatchLeaseExpiresAt > now);

    if (isLeaseActive) {
      if (article.dispatchClientOperationKey === clientOperationKey) {
        return {
          success: false,
          error: 'Conflict: Dispatch operation is currently in progress under an active lease.',
          code: 'ERR_DISPATCH_IN_PROGRESS',
          httpStatus: 409
        };
      } else {
        return {
          success: false,
          error: 'Conflict: A dispatch operation is currently in progress under an active lease.',
          code: 'ERR_CONCURRENT_DISPATCH_CONFLICT',
          httpStatus: 409
        };
      }
    }

    // 4. Stalled / Unknown Outcome / Non-Idempotent Reconciliation Enforcement
    const isPreviousStateRequiringReconciliation =
      (article.dispatchState === 'RECONCILIATION_REQUIRED' || article.dispatchState === 'OUTCOME_UNKNOWN') &&
      article.dispatchContentVersion === contentVersion &&
      article.dispatchApprovalRevision === approvalRevision;

    const isLeaseExpiredInDispatching =
      article.dispatchState === 'DISPATCHING' &&
      article.dispatchContentVersion === contentVersion &&
      article.dispatchApprovalRevision === approvalRevision &&
      Boolean(article.dispatchLeaseExpiresAt && article.dispatchLeaseExpiresAt <= now);

    if (isPreviousStateRequiringReconciliation && !reconciliationOverride) {
      return {
        success: false,
        error: 'Conflict: Prior dispatch operation outcome is unknown. Manual reconciliation is required before retry.',
        code: 'ERR_DISPATCH_RECONCILIATION_REQUIRED',
        httpStatus: 409
      };
    }

    if (isLeaseExpiredInDispatching && !reconciliationOverride) {
      // Check if any channel lacks idempotency support
      const hasNonIdempotentChannel = channels.some(ch => {
        const caps = providerCapabilities?.[ch];
        return caps && caps.supportsIdempotency === false;
      });

      if (hasNonIdempotentChannel) {
        const updateParams = {
          dispatchState: 'RECONCILIATION_REQUIRED',
          dispatchLeaseExpiresAt: 0
        };
        if (backend === 'TEMP_TEST_STORAGE') {
          await TemporaryArticleStore.updateArticlePartial(articleId, updateParams);
        } else {
          const db = await getAdminFirestore();
          await db.collection('articles').doc(articleId).update(updateParams as any);
        }
        return {
          success: false,
          error: 'Conflict: Prior dispatch operation timed out with unknown outcome on a non-idempotent provider. Manual reconciliation is required before retry.',
          code: 'ERR_DISPATCH_RECONCILIATION_REQUIRED',
          httpStatus: 409
        };
      }
    }

    // 5. Durable, Server-Controlled Provider Idempotency Keys
    // If the article already has provider idempotency keys for this version and revision, reuse them strictly.
    // Even if a caller passes a different clientOperationKey, the external provider receives the same keys.
    let providerIdempotencyKeys: Record<string, string>;
    if (
      article.dispatchContentVersion === contentVersion &&
      article.dispatchApprovalRevision === approvalRevision &&
      article.dispatchProviderIdempotencyKeys
    ) {
      providerIdempotencyKeys = { ...article.dispatchProviderIdempotencyKeys };
    } else {
      providerIdempotencyKeys = {};
    }

    for (const ch of channels) {
      if (!providerIdempotencyKeys[ch]) {
        // Deterministic, server-controlled provider idempotency key:
        // Bound to articleId, contentVersion, approvalRevision, channel
        providerIdempotencyKeys[ch] = `acute_dist_${articleId}_v${contentVersion}_rev${approvalRevision}_${ch}_${clientOperationKey}`;
      }
    }

    // 6. Monotonic Fencing Generation & Lease Claim
    const nextGen = (article.dispatchGeneration || 0) + 1;
    const attemptId = `att_${crypto.randomUUID()}`;
    const leaseExpiresAt = now + 60_000;

    const updates: Partial<Article> = {
      dispatchGeneration: nextGen,
      dispatchOperationId: durableOperationId,
      dispatchAttemptId: attemptId,
      dispatchClientOperationKey: clientOperationKey,
      dispatchState: 'DISPATCH_CLAIMED',
      dispatchLeaseExpiresAt: leaseExpiresAt,
      dispatchApprovalRevision: approvalRevision,
      dispatchContentVersion: contentVersion,
      dispatchProviderIdempotencyKeys: providerIdempotencyKeys,
      dispatchClaimedAt: new Date().toISOString()
    };

    if (backend === 'TEMP_TEST_STORAGE') {
      await TemporaryArticleStore.updateArticlePartial(articleId, updates);
    } else {
      const db = await getAdminFirestore();
      const articleRef = db.collection('articles').doc(articleId);
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(articleRef);
        if (!doc.exists) throw new Error(`Article not found: ${articleId}`);
        const currentData = doc.data() || {};
        const leaseActiveInTx =
          (currentData.dispatchState === 'DISPATCH_CLAIMED' || currentData.dispatchState === 'DISPATCHING') &&
          currentData.dispatchLeaseExpiresAt &&
          currentData.dispatchLeaseExpiresAt > Date.now();
        if (leaseActiveInTx) {
          const conflictErr: any = new Error('Concurrent dispatch in progress under active lease');
          conflictErr.code = 'ERR_CONCURRENT_DISPATCH_CONFLICT';
          throw conflictErr;
        }
        transaction.update(articleRef, updates as any);
      });
    }

    return {
      success: true,
      status: 'CLAIMED',
      generation: nextGen,
      attemptId,
      logicalOperationId: durableOperationId,
      providerIdempotencyKeys,
      article,
      approvalRecord: eligibility.approvalRecord!,
      contentAsset: eligibility.contentAsset!
    };
  }

  /**
   * Transition dispatch state with fencing checks.
   */
  public static async recordDispatchState(params: {
    articleId: string;
    generation: number;
    attemptId: string;
    state: string;
  }): Promise<{ success: boolean; error?: string; code?: string }> {
    const { articleId, generation, attemptId, state } = params;
    const backend = resolvePersistenceBackend();

    if (backend === 'TEMP_TEST_STORAGE') {
      const article = await TemporaryArticleStore.getArticleRaw(articleId);
      if (!article) return { success: false, error: 'Article not found', code: 'ERR_ARTICLE_NOT_FOUND' };
      if (article.dispatchGeneration !== generation || article.dispatchAttemptId !== attemptId) {
        return { success: false, error: `Stale generation: expected ${generation}, found ${article.dispatchGeneration}`, code: 'ERR_STALE_GENERATION' };
      }
      await TemporaryArticleStore.updateArticlePartial(articleId, { dispatchState: state });
      return { success: true };
    }

    const db = await getAdminFirestore();
    const articleRef = db.collection('articles').doc(articleId);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(articleRef);
      if (!doc.exists) return { success: false, error: 'Article not found', code: 'ERR_ARTICLE_NOT_FOUND' };
      const data = doc.data() || {};
      if (data.dispatchGeneration !== generation || data.dispatchAttemptId !== attemptId) {
        return { success: false, error: 'Stale generation', code: 'ERR_STALE_GENERATION' };
      }
      transaction.update(articleRef, { dispatchState: state });
      return { success: true };
    });
  }

  /**
   * Finalizes dispatch result, detects in-flight revocations, and clears lease.
   */
  public static async recordDispatchResult(params: {
    articleId: string;
    generation: number;
    attemptId: string;
    results?: any;
    error?: string;
    status?: 'DISPATCHED' | 'FAILED' | 'REVOKED_POST_DISPATCH' | 'ESCALATION_REQUIRED' | 'OUTCOME_UNKNOWN' | 'RECONCILIATION_REQUIRED';
    expectedApprovalId?: string;
  }): Promise<{ success: boolean; finalStatus: string; error?: string; code?: string }> {
    const { articleId, generation, attemptId, results, error, expectedApprovalId } = params;
    const backend = resolvePersistenceBackend();

    const computeFinalStatus = async (article: any): Promise<string> => {
      if (params.status) return params.status;
      if (expectedApprovalId && article.activeApprovalId !== expectedApprovalId) {
        return 'REVOKED_POST_DISPATCH';
      }
      if (article.activeApprovalId) {
        const activeRecord = backend === 'TEMP_TEST_STORAGE'
          ? await TemporaryArticleStore.getApprovalById(article.activeApprovalId)
          : await getApprovalByIdAdmin(article.activeApprovalId);
        if (activeRecord && activeRecord.decision === 'REJECTED') {
          return 'REVOKED_POST_DISPATCH';
        }
      }
      return error ? 'FAILED' : 'DISPATCHED';
    };

    if (backend === 'TEMP_TEST_STORAGE') {
      const article = await TemporaryArticleStore.getArticleRaw(articleId);
      if (!article) return { success: false, finalStatus: 'FAILED', error: 'Article not found', code: 'ERR_ARTICLE_NOT_FOUND' };
      if (article.dispatchGeneration !== generation || article.dispatchAttemptId !== attemptId) {
        return { success: false, finalStatus: 'FAILED', error: 'Stale worker generation cannot overwrite dispatch state', code: 'ERR_STALE_GENERATION' };
      }
      const finalStatus = await computeFinalStatus(article);
      await TemporaryArticleStore.updateArticlePartial(articleId, {
        dispatchState: finalStatus,
        dispatchResults: results || null,
        dispatchLeaseExpiresAt: 0
      });
      return { success: true, finalStatus };
    }

    const db = await getAdminFirestore();
    const articleRef = db.collection('articles').doc(articleId);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(articleRef);
      if (!doc.exists) return { success: false, finalStatus: 'FAILED', error: 'Article not found', code: 'ERR_ARTICLE_NOT_FOUND' };
      const data = doc.data() || {};
      if (data.dispatchGeneration !== generation || data.dispatchAttemptId !== attemptId) {
        return { success: false, finalStatus: 'FAILED', error: 'Stale worker generation cannot overwrite dispatch state', code: 'ERR_STALE_GENERATION' };
      }
      const finalStatus = await computeFinalStatus(data);
      transaction.update(articleRef, {
        dispatchState: finalStatus,
        dispatchResults: results || null,
        dispatchLeaseExpiresAt: 0
      });
      return { success: true, finalStatus };
    });
  }
}
