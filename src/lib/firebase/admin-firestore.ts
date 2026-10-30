import { getAdminFirestore } from './admin';
import { Article, sanitizeForFirestore, isFallbackTitle, normalizeFolder } from './firestore';
import type { AnalysisSession } from '@/core/contracts/schemas';


/**
 * Saves or updates an article in Firestore using the Firebase Admin SDK.
 * Bypasses client-side security rules via server-side service credentials.
 * Enforces verified UID ownership: article.userId and article.ownerId MUST match verifiedUid.
 * Strictly ignores and overwrites any client-supplied userId or ownerId in the article object.
 */
export async function saveArticleAdmin(
  article: Article,
  verifiedUid: string,
  timeoutMs: number = 5000
): Promise<string> {
  if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
    throw new Error('A verified Firebase UID is required to persist an article.');
  }

  const cleanUid = verifiedUid.trim();

  // Strictly bind ownership to the server-verified user identity
  const articleWithOwner: Article = {
    ...article,
    userId: cleanUid,
    ownerId: cleanUid,
  };

  const savePromise = (async () => {
    const { FieldValue } = await import('firebase-admin/firestore');
    const db = await getAdminFirestore();
    const articlesCol = db.collection('articles');
    const cleanData = sanitizeForFirestore(articleWithOwner);

    const now = FieldValue.serverTimestamp();

    // Fail-closed publication gate: Only validated content can be saved directly as Published
    if (cleanData.stage === 'Published') {
      const valStatus = (cleanData as any).validationStatus || (cleanData as any).evidenceMetadata?.validationStatus;
      if (valStatus === 'REJECTED' || valStatus === 'FAILED') {
        throw new Error(`Publication Blocked: Article "${cleanData.id || 'new'}" failed factual validation and cannot be published.`);
      }
      if (valStatus !== 'READY' && valStatus !== 'PASSED' && valStatus !== 'PASSED_WITH_WARNINGS') {
        throw new Error(`Publication Blocked: Article "${cleanData.id || 'new'}" has not passed factual validation (status="${valStatus || 'UNVALIDATED'}").`);
      }
    }

    if (cleanData.id) {
      const docRef = articlesCol.doc(cleanData.id as string);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const existingData = docSnap.data();
        const existingOwner = existingData?.userId || existingData?.ownerId;

        // Security Invariant: Existing document must belong to verifiedUid
        if (existingOwner && existingOwner !== cleanUid) {
          throw new Error(
            `Forbidden: Caller "${cleanUid}" does not have permission to modify article "${cleanData.id}" owned by "${existingOwner}".`
          );
        }

        // Protect meaningful title from being overwritten by fallback
        if (isFallbackTitle(cleanData.title as string) && existingData?.title && !isFallbackTitle(existingData.title)) {
          cleanData.title = existingData.title;
        }

        // Protect existing folder from being clobbered by default 'uncategorized'
        const existingFolder = normalizeFolder(existingData?.folder);
        const incomingFolder = normalizeFolder(cleanData.folder as string);
        if (!incomingFolder && existingFolder) {
          cleanData.folder = existingFolder;
        }

        // Preserve original createdAt
        const preservedCreatedAt = existingData?.createdAt || cleanData.createdAt || now;

        // Ownership immutability: Ensure userId and ownerId remain cleanUid
        await docRef.set(
          {
            ...cleanData,
            createdAt: preservedCreatedAt,
            userId: cleanUid,
            ownerId: cleanUid,
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        await docRef.set(
          {
            ...cleanData,
            userId: cleanUid,
            ownerId: cleanUid,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      return cleanData.id as string;
    } else {
      const docRef = await articlesCol.add({
        ...cleanData,
        userId: cleanUid,
        ownerId: cleanUid,
        createdAt: now,
        updatedAt: now,
      });
      return docRef.id;
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Admin Firestore saveArticle timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });

  return Promise.race([savePromise, timeoutPromise]);
}

/**
 * Admin helper to retrieve an article by ID from Firestore, with optional caller verification.
 */
export async function getArticleByIdAdmin(id: string, verifiedUid?: string): Promise<Article | null> {
  const db = await getAdminFirestore();
  const docSnap = await db.collection('articles').doc(id).get();
  if (!docSnap.exists) return null;
  const docData = { id: docSnap.id, ...docSnap.data() } as Article;

  if (verifiedUid) {
    const cleanUid = verifiedUid.trim();
    if (docData.userId !== cleanUid && docData.ownerId !== cleanUid) {
      return null;
    }
  }

  return docData;
}

/**
 * Admin helper to retrieve all articles for a specific user ID.
 */
export async function getArticlesByUserIdAdmin(userId: string): Promise<Article[]> {
  const db = await getAdminFirestore();
  const querySnap = await db.collection('articles').where('userId', '==', userId).get();
  return querySnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Article));
}

/**
 * Admin helper to delete an article by ID, strictly verifying ownership if verifiedUid is provided.
 */
export async function deleteArticleAdmin(id: string, verifiedUid?: string): Promise<void> {
  const db = await getAdminFirestore();
  const docRef = db.collection('articles').doc(id);
  if (verifiedUid) {
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const existingData = docSnap.data();
      const existingOwner = existingData?.userId || existingData?.ownerId;
      const cleanUid = verifiedUid.trim();
      if (existingOwner && existingOwner !== cleanUid) {
        throw new Error(
          `Forbidden: Caller "${cleanUid}" does not have permission to delete article "${id}" owned by "${existingOwner}".`
        );
      }
    }
  }
  await docRef.delete();
}

/**
 * Admin helper to persist an immutable approval record to Firestore.
 */
export async function saveApprovalAdmin(approval: any): Promise<void> {
  const db = await getAdminFirestore();
  const docRef = db.collection('approvals').doc(approval.approvalId);
  await docRef.set(approval);
}

/**
 * Admin helper to retrieve an approval record by its ID.
 */
export async function getApprovalByIdAdmin(approvalId: string): Promise<any | null> {
  const db = await getAdminFirestore();
  const docSnap = await db.collection('approvals').doc(approvalId).get();
  if (!docSnap.exists) return null;
  return docSnap.data();
}

/**
 * Admin helper to update an article document's active approval pointer and revision count.
 */
export async function updateArticleApprovalPointerAdmin(
  articleId: string,
  activeApprovalId: string,
  revisionCount: number
): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const db = await getAdminFirestore();
  const docRef = db.collection('articles').doc(articleId);
  await docRef.update({
    activeApprovalId,
    approvalRevisionCount: revisionCount,
    updatedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Saves or updates an analysis session in Firestore using Firebase Admin SDK.
 * Enforces verified UID ownership: session.userId and session.ownerId MUST match cleanUid.
 */
export async function saveAnalysisSessionAdmin(
  session: AnalysisSession,
  verifiedUid: string
): Promise<string> {
  if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
    throw new Error('A verified Firebase UID is required to persist an analysis session.');
  }

  const cleanUid = verifiedUid.trim();
  const sessionId = session.id || `ses_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const { FieldValue } = await import('firebase-admin/firestore');
  const db = await getAdminFirestore();
  const sessionsCol = db.collection('analysis_sessions');
  const now = FieldValue.serverTimestamp();

  const cleanData = sanitizeForFirestore({
    ...session,
    id: sessionId,
    userId: cleanUid,
    ownerId: cleanUid,
    updatedAt: now,
    createdAt: session.createdAt || now,
  });

  const docRef = sessionsCol.doc(sessionId);
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    const existingData = docSnap.data();
    const existingOwner = existingData?.userId || existingData?.ownerId;
    if (existingOwner && existingOwner !== cleanUid) {
      throw new Error(`Forbidden: Caller "${cleanUid}" does not have permission to modify session "${sessionId}".`);
    }
  }

  await docRef.set(cleanData, { merge: true });
  return sessionId;
}

/**
 * Retrieves an analysis session by ID, enforcing tenant isolation.
 */
export async function getAnalysisSessionAdmin(
  sessionId: string,
  verifiedUid: string
): Promise<AnalysisSession | null> {
  if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
    return null;
  }
  const cleanUid = verifiedUid.trim();
  const db = await getAdminFirestore();
  const docSnap = await db.collection('analysis_sessions').doc(sessionId).get();
  if (!docSnap.exists) return null;
  const data = docSnap.data() as AnalysisSession;
  if (data.userId !== cleanUid && data.ownerId !== cleanUid) {
    return null;
  }
  return data;
}

/**
 * Updates an analysis session with partial updates, enforcing tenant isolation.
 */
export async function updateAnalysisSessionStatusAdmin(
  sessionId: string,
  verifiedUid: string,
  updates: Partial<AnalysisSession>
): Promise<void> {
  if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
    throw new Error('A verified Firebase UID is required to update an analysis session.');
  }
  const cleanUid = verifiedUid.trim();
  const { FieldValue } = await import('firebase-admin/firestore');
  const db = await getAdminFirestore();
  const docRef = db.collection('analysis_sessions').doc(sessionId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new Error(`Analysis session "${sessionId}" not found.`);
  }
  const existingData = docSnap.data();
  if (existingData?.userId !== cleanUid && existingData?.ownerId !== cleanUid) {
    throw new Error(`Forbidden: Caller "${cleanUid}" does not own session "${sessionId}".`);
  }

  const cleanUpdates = sanitizeForFirestore({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });
  delete (cleanUpdates as any).userId;
  delete (cleanUpdates as any).ownerId;
  delete (cleanUpdates as any).id;

  await docRef.update(cleanUpdates);
}

export interface LeaseAcquisitionResult {
  acquired: boolean;
  leaseToken?: string;
  session?: AnalysisSession;
  reason?: 'NOT_FOUND' | 'FORBIDDEN' | 'INCOMPLETE' | 'IN_PROGRESS' | 'ALREADY_COMPLETED' | 'ERROR';
  errorMessage?: string;
}

/**
 * Atomically acquires a generation lease using a Firestore transaction.
 * Guarantees race-free lease assignment and assigns a unique fencing token.
 */
export async function acquireGenerationLeaseAdmin(
  sessionId: string,
  verifiedUid: string,
  leaseDurationMs = 180000
): Promise<LeaseAcquisitionResult> {
  if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
    return { acquired: false, reason: 'FORBIDDEN', errorMessage: 'Verified UID required' };
  }
  const cleanUid = verifiedUid.trim();
  const db = await getAdminFirestore();
  const { FieldValue } = await import('firebase-admin/firestore');
  const docRef = db.collection('analysis_sessions').doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists) {
      return { acquired: false, reason: 'NOT_FOUND', errorMessage: `Session "${sessionId}" not found` };
    }
    const data = docSnap.data() as AnalysisSession;
    if (data.userId !== cleanUid && data.ownerId !== cleanUid) {
      return { acquired: false, reason: 'FORBIDDEN', errorMessage: `Caller does not own session "${sessionId}"` };
    }
    if (data.status !== 'COMPLETED' || !data.profile || !data.selectedOpportunity) {
      return { acquired: false, reason: 'INCOMPLETE', errorMessage: 'Analysis session is incomplete or failed' };
    }
    // Idempotency: already completed
    if (data.generationStatus === 'COMPLETED' && data.generatedArticleId) {
      return { acquired: false, reason: 'ALREADY_COMPLETED', session: data };
    }
    // Concurrency check: active unexpired lease
    const now = Date.now();
    if (
      data.generationStatus === 'GENERATING' &&
      data.generationLeaseExpiresAt &&
      now < data.generationLeaseExpiresAt
    ) {
      return { acquired: false, reason: 'IN_PROGRESS', errorMessage: 'Article generation is already in progress for this session' };
    }

    const leaseToken = 'lease_' + now + '_' + Math.random().toString(36).substring(2, 9);
    const expiresAt = now + leaseDurationMs;

    transaction.update(docRef, {
      generationStatus: 'GENERATING',
      generationLeaseToken: leaseToken,
      generationLeaseExpiresAt: expiresAt,
      failureReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      acquired: true,
      leaseToken,
      session: {
        ...data,
        generationStatus: 'GENERATING',
        generationLeaseToken: leaseToken,
        generationLeaseExpiresAt: expiresAt,
      },
    };
  });
}

/**
 * Atomically renews an active generation lease if the fencing token matches.
 */
export async function renewGenerationLeaseAdmin(
  sessionId: string,
  verifiedUid: string,
  leaseToken: string,
  additionalMs = 180000
): Promise<boolean> {
  const cleanUid = verifiedUid.trim();
  const db = await getAdminFirestore();
  const { FieldValue } = await import('firebase-admin/firestore');
  const docRef = db.collection('analysis_sessions').doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists) return false;
    const data = docSnap.data() as AnalysisSession;
    if (data.userId !== cleanUid && data.ownerId !== cleanUid) return false;
    if (data.generationLeaseToken !== leaseToken) {
      // Fenced out
      return false;
    }
    const expiresAt = Date.now() + additionalMs;
    transaction.update(docRef, {
      generationLeaseExpiresAt: expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/**
 * Atomically releases a generation lease with outcome, enforcing fencing token check.
 * If the worker's leaseToken does not match the active session, the write is fenced out.
 */
export async function releaseGenerationLeaseAdmin(
  sessionId: string,
  verifiedUid: string,
  leaseToken: string,
  outcome: {
    generationStatus: 'COMPLETED' | 'FAILED';
    generatedArticleId?: string;
    failureReason?: string;
  }
): Promise<boolean> {
  const cleanUid = verifiedUid.trim();
  const db = await getAdminFirestore();
  const { FieldValue } = await import('firebase-admin/firestore');
  const docRef = db.collection('analysis_sessions').doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists) return false;
    const data = docSnap.data() as AnalysisSession;
    if (data.userId !== cleanUid && data.ownerId !== cleanUid) return false;

    // Fencing check: if another worker has taken over, do not overwrite!
    if (data.generationLeaseToken && data.generationLeaseToken !== leaseToken) {
      console.warn(`[admin-firestore] Fenced out stale worker for session "${sessionId}". Token "${leaseToken}" != active "${data.generationLeaseToken}"`);
      return false;
    }

    const updates: any = {
      generationStatus: outcome.generationStatus,
      updatedAt: FieldValue.serverTimestamp(),
      generationLeaseExpiresAt: FieldValue.delete(),
    };
    if (outcome.generatedArticleId) {
      updates.generatedArticleId = outcome.generatedArticleId;
    }
    if (outcome.failureReason) {
      updates.failureReason = outcome.failureReason;
    } else {
      updates.failureReason = FieldValue.delete();
    }

    transaction.update(docRef, updates);
    return true;
  });
}
