import type { Article } from '@/lib/firebase/firestore';

/**
 * Checks whether the temporary test storage adapter is explicitly activated.
 * 
 * FAIL-CLOSED SECURITY INVARIANT:
 * - Temporary storage is DISABLED by default.
 * - In production (NODE_ENV === 'production'), ENABLE_TEMP_TEST_STORAGE=true ALONE is REJECTED.
 * - In production, it strictly requires BOTH ACUTE_TEST_STORAGE_MODE === 'true' AND ACUTE_ENVIRONMENT === 'test'.
 * - Any ambiguous, partial, or missing environment configuration fails closed to false.
 */
export function isTemporaryStorageActive(): boolean {
  if (process.env.ENABLE_TEMP_TEST_STORAGE !== 'true') {
    return false;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const acuteTestMode = process.env.ACUTE_TEST_STORAGE_MODE === 'true';
  const acuteEnv = process.env.ACUTE_ENVIRONMENT === 'test';

  if (isProduction) {
    // In production environment, strictly require explicit dual-flag test override
    if (acuteTestMode && acuteEnv) {
      return true;
    }
    // Ambiguous, partial, or missing flags in production fail closed
    return false;
  }

  // In non-production (e.g. test, development), ENABLE_TEMP_TEST_STORAGE === 'true' is sufficient
  return true;
}

/**
 * Explicit persistence backend resolver.
 * Fails closed to FIREBASE_ADMIN unless temporary test storage is strictly activated.
 */
export function resolvePersistenceBackend(): 'FIREBASE_ADMIN' | 'TEMP_TEST_STORAGE' {
  if (isTemporaryStorageActive()) {
    return 'TEMP_TEST_STORAGE';
  }
  return 'FIREBASE_ADMIN';
}

/**
 * Pure deep-cloning and sanitization function:
 * - Removes undefined values
 * - Maps undefined array items to null
 * - Detects circular references
 * - Does not depend on any Firebase client/admin runtime libraries
 */
export function sanitizeForTestStorage(val: any, seen = new WeakSet()): any {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;

  if (val instanceof Date) return new Date(val.getTime());

  if (seen.has(val)) {
    throw new TypeError('Circular reference detected during test storage sanitization');
  }
  seen.add(val);

  try {
    if (Array.isArray(val)) {
      return val.map(item => sanitizeForTestStorage(item, seen));
    }

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = sanitizeForTestStorage(v, seen);
      }
    }
    return out;
  } finally {
    seen.delete(val);
  }
}

/**
 * In-memory, isolated temporary test persistence store.
 * Strictly enforces verified UID ownership and provides fresh object serialization.
 */
export class TemporaryArticleStore {
  // Store articles as JSON strings to guarantee zero reference sharing between save and retrieval
  private static store: Map<string, string> = new Map();
  private static idCounter: number = 0;
  private static simulateFailure: boolean = false;
  private static failureMessage: string = 'Temporary test storage simulated write failure';

  /**
   * Resets all stored articles and configuration.
   */
  public static clear(): void {
    this.store.clear();
    this.idCounter = 0;
    this.simulateFailure = false;
    this.failureMessage = 'Temporary test storage simulated write failure';
  }

  /**
   * Configures deterministic failure testing.
   */
  public static setSimulateFailure(fail: boolean, message?: string): void {
    this.simulateFailure = fail;
    if (message) {
      this.failureMessage = message;
    }
  }

  /**
   * Generates a unique, deterministic test article ID.
   * Format: test_article_<timestamp>_<counter>
   */
  public static generateTestId(): string {
    this.idCounter++;
    return `test_article_${Date.now()}_${this.idCounter}`;
  }

  /**
   * Saves or updates an article in the temporary test store.
   * 
   * NON-NEGOTIABLE OWNERSHIP INVARIANT:
   * - verifiedUid is strictly enforced as the authoritative owner.
   * - Any client-supplied userId or ownerId in the article payload is ignored and overwritten.
   * - Sets backend: 'TEMP_TEST_STORAGE' in diagnostics.
   * - Serializes data to prevent memory reference reuse.
   */
  public static async saveArticle(
    article: Article,
    verifiedUid: string,
    timeoutMs: number = 5000
  ): Promise<string> {
    if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
      throw new Error('A verified Firebase UID is required to persist an article.');
    }

    if (this.simulateFailure) {
      throw new Error(this.failureMessage);
    }

    const cleanUid = verifiedUid.trim();

    // Assign deterministic test article ID if not already present or if not a test_article ID
    const articleId = (article.id && article.id.startsWith('test_article_')) 
      ? article.id 
      : this.generateTestId();

    const nowIso = new Date().toISOString();

    // Authoritative ownership binding — strictly overwrite any client-supplied userId / ownerId
    const secureArticle: Article = {
      ...article,
      id: articleId,
      userId: cleanUid,
      ownerId: cleanUid,
      createdAt: article.createdAt || nowIso,
      updatedAt: nowIso,
      diagnostics: {
        ...(article.diagnostics || {}),
        backend: 'TEMP_TEST_STORAGE'
      },
      persistenceStatus: 'SAVED',
      persistedAt: nowIso
    };

    const sanitized = sanitizeForTestStorage(secureArticle);

    // Deep clone via serialization to enforce true persistence semantics (zero shared memory references)
    const serialized = JSON.stringify(sanitized);
    this.store.set(articleId, serialized);

    return articleId;
  }

  /**
   * Retrieves an article by ID, strictly enforcing verified UID ownership.
   * Returns null if not found or if the document belongs to a different UID.
   */
  public static async getArticleById(id: string, verifiedUid: string): Promise<Article | null> {
    if (!id || !verifiedUid) return null;
    const cleanUid = verifiedUid.trim();

    const serialized = this.store.get(id);
    if (!serialized) return null;

    const doc: Article = JSON.parse(serialized);

    // Cross-user isolation: strictly refuse retrieval if caller does not own the document
    if (doc.userId !== cleanUid && doc.ownerId !== cleanUid) {
      return null;
    }

    return doc;
  }

  /**
   * Retrieves all articles owned by verifiedUid.
   */
  public static async getArticlesByUserId(verifiedUid: string): Promise<Article[]> {
    if (!verifiedUid) return [];
    const cleanUid = verifiedUid.trim();

    const results: Article[] = [];
    for (const serialized of this.store.values()) {
      const doc: Article = JSON.parse(serialized);
      if (doc.userId === cleanUid || doc.ownerId === cleanUid) {
        results.push(doc);
      }
    }
    return results;
  }

  /**
   * Deletes an article by ID, strictly enforcing verified UID ownership.
   */
  public static async deleteArticle(id: string, verifiedUid: string): Promise<boolean> {
    if (!id || !verifiedUid) return false;
    const cleanUid = verifiedUid.trim();

    const serialized = this.store.get(id);
    if (!serialized) return false;

    const doc: Article = JSON.parse(serialized);
    if (doc.userId !== cleanUid && doc.ownerId !== cleanUid) {
      return false;
    }

    return this.store.delete(id);
  }

  /**
   * Returns the count of stored articles in memory.
   */
  public static count(): number {
    return this.store.size;
  }
}

/**
 * Resolves persistence backend and persists article.
 * Never silently falls back from Firebase failure to temporary test storage.
 */
export async function resolveAndSaveArticle(
  article: Article,
  verifiedUid: string,
  adminSaveFn: (article: Article, verifiedUid: string, timeoutMs?: number) => Promise<string>,
  timeoutMs: number = 5000
): Promise<{ id: string; backend: 'FIREBASE_ADMIN' | 'TEMP_TEST_STORAGE' }> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    const id = await TemporaryArticleStore.saveArticle(article, verifiedUid, timeoutMs);
    return { id, backend: 'TEMP_TEST_STORAGE' };
  }

  // Production: strictly delegate to Firebase Admin save function
  // Any failure throws and propagates directly; zero fallback
  const id = await adminSaveFn(article, verifiedUid, timeoutMs);
  return { id, backend: 'FIREBASE_ADMIN' };
}
