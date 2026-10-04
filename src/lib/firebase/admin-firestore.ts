import { getAdminFirestore } from './admin';
import { Article, sanitizeForFirestore } from './firestore';

// CommonJS synchronous loading of runtime modules to prevent Webpack async module wrappers
const { FieldValue } = require('firebase-admin/firestore');

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

  // Strictly bind ownership to the server-verified user identity
  const articleWithOwner: Article = {
    ...article,
    userId: verifiedUid,
    ownerId: verifiedUid,
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
        await docRef.set(
          {
            ...cleanData,
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        await docRef.set(
          {
            ...cleanData,
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
 * Admin helper to retrieve an article by ID from Firestore.
 */
export async function getArticleByIdAdmin(id: string): Promise<Article | null> {
  const db = getAdminFirestore();
  const docSnap = await db.collection('articles').doc(id).get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() } as Article;
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
 * Admin helper to delete an article by ID.
 */
export async function deleteArticleAdmin(id: string): Promise<void> {
  const db = getAdminFirestore();
  await db.collection('articles').doc(id).delete();
}
