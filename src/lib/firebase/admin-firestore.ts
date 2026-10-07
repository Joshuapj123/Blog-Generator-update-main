import { getAdminFirestore } from './admin';
import { Article, sanitizeForFirestore } from './firestore';
import { FieldValue } from 'firebase-admin/firestore';


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
    const db = getAdminFirestore();
    const articlesCol = db.collection('articles');
    const cleanData = sanitizeForFirestore(articleWithOwner);

    const now = FieldValue.serverTimestamp();

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

        // Ownership immutability: Ensure userId and ownerId remain cleanUid
        await docRef.set(
          {
            ...cleanData,
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
  const db = getAdminFirestore();
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
  const db = getAdminFirestore();
  const querySnap = await db.collection('articles').where('userId', '==', userId).get();
  return querySnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Article));
}

/**
 * Admin helper to delete an article by ID, strictly verifying ownership if verifiedUid is provided.
 */
export async function deleteArticleAdmin(id: string, verifiedUid?: string): Promise<void> {
  const db = getAdminFirestore();
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
