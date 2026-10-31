import type { Article } from '@/lib/firebase/firestore';
import type { AnalysisSession } from '@/core/contracts/schemas';

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
/**
 * Detects actual runtime system objects that cannot be serialized to document storage
 * (e.g. AbortSignal, AbortController, Request, Response, Streams).
 * Strictly distinguishes runtime system instances from ordinary application objects
 * that may legitimately carry properties like "headers", "signal", "aborted", or "pipe".
 */
export function isRuntimeSystemObject(val: any): boolean {
  if (!val || typeof val !== 'object') return false;

  // 1. Direct class checks when available in the environment
  if (typeof AbortSignal !== 'undefined' && val instanceof AbortSignal) return true;
  if (typeof AbortController !== 'undefined' && val instanceof AbortController) return true;
  if (typeof Request !== 'undefined' && val instanceof Request) return true;
  if (typeof Response !== 'undefined' && val instanceof Response) return true;
  if (typeof ReadableStream !== 'undefined' && val instanceof ReadableStream) return true;

  // 2. Cross-realm / polyfill Symbol.toStringTag checks
  const tag = Object.prototype.toString.call(val);
  if (
    tag === '[object AbortSignal]' ||
    tag === '[object AbortController]' ||
    tag === '[object Request]' ||
    tag === '[object Response]' ||
    tag === '[object ReadableStream]' ||
    tag === '[object WritableStream]' ||
    tag === '[object TransformStream]'
  ) {
    return true;
  }

  // 3. Node.js Stream checks (Stream inherits from EventEmitter)
  if (
    typeof val.pipe === 'function' &&
    typeof val.on === 'function' &&
    typeof val.emit === 'function' &&
    (typeof val._read === 'function' || typeof val._write === 'function' || typeof val.destroy === 'function')
  ) {
    return true;
  }

  // 4. Robust duck-typing for custom AbortController/Signal polyfills
  if (
    (typeof val.aborted === 'boolean' && typeof val.addEventListener === 'function' && typeof val.removeEventListener === 'function') ||
    (typeof val.abort === 'function' && val.signal && typeof val.signal.aborted === 'boolean')
  ) {
    return true;
  }

  return false;
}


/**
 * Pure deep-cloning and sanitization function:
 * - Removes undefined values
 * - Maps undefined array items to null
 * - Detects circular references on the active recursion path
 * - Preserves JavaScript Date instances without mutation
 * - Preserves Firestore sentinels without Firebase library dependencies
 * - Rejects runtime system objects (AbortSignal, Streams, etc.)
 * - Prevents call-stack exhaustion on pathological nesting (>50 levels) with RangeError
 */
export function sanitizeForTestStorage(
  val: any,
  seen = new WeakSet(),
  path = '',
  depth = 0
): any {
  if (depth > 50) {
    throw new RangeError(`Maximum nesting depth exceeded during test storage sanitization at path "${path || 'root'}"`);
  }

  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;

  if (val instanceof Date) return new Date(val.getTime());

  // Preserve Firestore-native sentinels when passed through test storage
  if (
    (typeof val?.toMillis === 'function' && typeof val?.toDate === 'function') ||
    (val?._methodName && typeof val?._methodName === 'string') ||
    (val?.methodName && typeof val?.methodName === 'string') ||
    (val?.type === 'document' && typeof val?.path === 'string') ||
    (typeof val?.latitude === 'number' && typeof val?.longitude === 'number' && typeof val?.isEqual === 'function')
  ) {
    return val;
  }

  // Handle Error instances safely without arbitrary graph recursion
  if (val instanceof Error) {
    const errObj: { name: string; message: string; code?: string | number } = {
      name: val.name || 'Error',
      message: val.message || String(val),
    };
    if (typeof (val as any).code === 'string' || typeof (val as any).code === 'number') {
      errObj.code = (val as any).code;
    }
    return errObj;
  }

  // Reject runtime system objects that cannot be serialized to storage
  if (isRuntimeSystemObject(val)) {
    throw new TypeError(
      `Cannot persist runtime system object of type "${val.constructor?.name || typeof val}" at path "${path || 'root'}" to test storage`
    );
  }

  if (seen.has(val)) {
    throw new TypeError(`Circular reference detected during test storage sanitization at path "${path || 'root'}"`);
  }
  seen.add(val);

  try {
    if (Array.isArray(val)) {
      return val.map((item, index) =>
        sanitizeForTestStorage(
          item,
          seen,
          path ? `${path}[${index}]` : `[${index}]`,
          depth + 1
        )
      );
    }

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = sanitizeForTestStorage(
          v,
          seen,
          path ? `${path}.${k}` : k,
          depth + 1
        );
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
  private static approvalStore: Map<string, string> = new Map();
  private static distributionJobStore: Map<string, string> = new Map();
  private static sessionStore: Map<string, string> = new Map();
  private static idCounter: number = 0;
  private static simulateFailure: boolean = false;
  private static failureMessage: string = 'Temporary test storage simulated write failure';

  /**
   * Resets all stored articles and configuration.
   */
  public static clear(): void {
    this.store.clear();
    this.approvalStore.clear();
    this.distributionJobStore.clear();
    this.sessionStore.clear();
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

    // Assign deterministic test article ID if not already present
    const articleId = article.id || this.generateTestId();

    // Check existing document ownership
    const existingSerialized = this.store.get(articleId);
    let existingDoc: Article | null = null;
    if (existingSerialized) {
      existingDoc = JSON.parse(existingSerialized);
      const existingOwner = existingDoc?.userId || existingDoc?.ownerId;
      if (existingOwner && existingOwner !== cleanUid) {
        throw new Error(
          `Forbidden: Caller "${cleanUid}" does not have permission to modify article "${articleId}" owned by "${existingOwner}".`
        );
      }
    }

    const nowIso = new Date().toISOString();

    // Title preservation: never overwrite an existing real title with 'Untitled Draft'
    const resolvedTitle = (existingDoc?.title && existingDoc.title !== 'Untitled Draft' && (!article.title || article.title === 'Untitled Draft'))
      ? existingDoc.title
      : article.title;

    // Folder preservation: never overwrite an existing customized folder with 'uncategorized'
    const resolvedFolder = (existingDoc?.folder && existingDoc.folder.toLowerCase() !== 'uncategorized' && (!article.folder || article.folder.toLowerCase() === 'uncategorized'))
      ? existingDoc.folder
      : (article.folder || '');

    // Authoritative ownership binding — strictly overwrite any client-supplied userId / ownerId
    const secureArticle: Article = {
      ...article,
      id: articleId,
      userId: cleanUid,
      ownerId: cleanUid,
      title: resolvedTitle,
      folder: resolvedFolder,
      createdAt: existingDoc?.createdAt || article.createdAt || nowIso,
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
   * Retrieves an article by ID without owner filtering (for raw existence/ownership audits).
   */
  public static async getArticleRaw(id: string): Promise<Article | null> {
    if (!id) return null;
    const serialized = this.store.get(id);
    if (!serialized) return null;
    return JSON.parse(serialized);
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

  /**
   * Creates an approval record in the temporary store with fail-closed collision semantics.
   * Rejects duplicate approvalId writes simulating Firestore transaction.create() ALREADY_EXISTS.
   */
  public static async createApproval(approval: any): Promise<void> {
    if (this.simulateFailure) {
      throw new Error(this.failureMessage);
    }
    if (this.approvalStore.has(approval.approvalId)) {
      const err: any = new Error(`Document already exists: ${approval.approvalId}`);
      err.code = 6;
      throw err;
    }
    const serialized = JSON.stringify(approval);
    this.approvalStore.set(approval.approvalId, serialized);
  }

  /**
   * Saves an approval record in the temporary store.
   * Delegates to createApproval to enforce append-only immutability.
   */
  public static async saveApproval(approval: any): Promise<void> {
    return this.createApproval(approval);
  }

  /**
   * Directly mutates an existing approval record for tamper testing only.
   */
  public static async tamperApprovalForTesting(approval: any): Promise<void> {
    const serialized = JSON.stringify(approval);
    this.approvalStore.set(approval.approvalId, serialized);
  }

  /**
   * Retrieves an approval record by its ID.
   */
  public static async getApprovalById(approvalId: string): Promise<any | null> {
    const raw = this.approvalStore.get(approvalId);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  /**
   * Updates an article document's active approval pointer and revision count atomically in memory.
   */
  public static async updateArticleApprovalPointer(
    articleId: string,
    activeApprovalId: string,
    revisionCount: number
  ): Promise<void> {
    const raw = this.store.get(articleId);
    if (!raw) {
      throw new Error(`Article not found: ${articleId}`);
    }
    const doc: Article = JSON.parse(raw);
    doc.activeApprovalId = activeApprovalId;
    doc.approvalRevisionCount = revisionCount;
    doc.updatedAt = new Date().toISOString();
    this.store.set(articleId, JSON.stringify(doc));
  }

  /**
   * Updates an article document directly with partial updates in memory.
   */
  public static async updateArticlePartial(
    articleId: string,
    updates: Partial<Article>
  ): Promise<Article> {
    const raw = this.store.get(articleId);
    if (!raw) {
      throw new Error(`Article not found: ${articleId}`);
    }
    const doc: Article = JSON.parse(raw);
    Object.assign(doc, updates, { updatedAt: new Date().toISOString() });
    this.store.set(articleId, JSON.stringify(doc));
    return doc;
  }

  /**
   * Saves a distribution job record in memory.
   */
  public static async saveDistributionJob(job: any): Promise<string> {
    const id = job.id || job.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.distributionJobStore.set(id, JSON.stringify({ id, ...job }));
    return id;
  }

  /**
   * Retrieves a distribution job by its ID.
   */
  public static async getDistributionJobById(id: string): Promise<any | null> {
    const raw = this.distributionJobStore.get(id);
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Retrieves a distribution job by its idempotency key.
   */
  public static async getDistributionJobByIdempotencyKey(key: string): Promise<any | null> {
    for (const raw of this.distributionJobStore.values()) {
      const parsed = JSON.parse(raw);
      if (parsed.idempotencyKey === key) return parsed;
    }
    return null;
  }

  /**
   * Saves or updates an analysis session in the temporary test store.
   * Enforces verifiedUid ownership.
   */
  public static async saveAnalysisSession(
    session: AnalysisSession,
    verifiedUid: string
  ): Promise<string> {
    if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
      throw new Error('A verified Firebase UID is required to persist an analysis session.');
    }
    if (this.simulateFailure) {
      throw new Error(this.failureMessage);
    }
    const cleanUid = verifiedUid.trim();
    const sessionId = session.id || `ses_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sessionWithOwner: AnalysisSession = {
      ...session,
      id: sessionId,
      userId: cleanUid,
      ownerId: cleanUid,
      updatedAt: Date.now(),
      createdAt: session.createdAt || Date.now(),
    };
    this.sessionStore.set(sessionId, JSON.stringify(sessionWithOwner));
    return sessionId;
  }

  /**
   * Retrieves an analysis session by its ID, enforcing tenant isolation.
   */
  public static async getAnalysisSessionById(
    sessionId: string,
    verifiedUid: string
  ): Promise<AnalysisSession | null> {
    if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
      return null;
    }
    const cleanUid = verifiedUid.trim();
    const raw = this.sessionStore.get(sessionId);
    if (!raw) return null;
    const session = JSON.parse(raw) as AnalysisSession;
    if (session.userId !== cleanUid && session.ownerId !== cleanUid) {
      return null; // Deny access to sessions owned by other users
    }
    return session;
  }

  /**
   * Updates an analysis session with partial fields, enforcing tenant ownership.
   */
  public static async updateAnalysisSession(
    sessionId: string,
    verifiedUid: string,
    updates: Partial<AnalysisSession>
  ): Promise<void> {
    const existing = await this.getAnalysisSessionById(sessionId, verifiedUid);
    if (!existing) {
      throw new Error(`Analysis session "${sessionId}" not found or unauthorized for caller "${verifiedUid}".`);
    }
    if (this.simulateFailure) {
      throw new Error(this.failureMessage);
    }
    const updated: AnalysisSession = {
      ...existing,
      ...updates,
      id: sessionId,
      userId: existing.userId,
      ownerId: existing.ownerId,
      updatedAt: Date.now(),
    };
    this.sessionStore.set(sessionId, JSON.stringify(updated));
  }

  /**
   * Finds an existing completed analysis session for a user and normalized URL.
   */
  public static async findSessionByUserAndUrl(
    verifiedUid: string,
    normalizedUrl: string
  ): Promise<AnalysisSession | null> {
    const cleanUid = verifiedUid.trim();
    for (const raw of this.sessionStore.values()) {
      const s = JSON.parse(raw) as AnalysisSession;
      if (
        (s.userId === cleanUid || s.ownerId === cleanUid) &&
        s.normalizedUrl === normalizedUrl &&
        s.status === 'COMPLETED'
      ) {
        return s;
      }
    }
    return null;
  }

  /**
   * Acquires a generation lease with fencing token (test storage equivalent).
   */
  static async acquireGenerationLease(
    sessionId: string,
    verifiedUid: string,
    leaseDurationMs = 180000
  ): Promise<{
    acquired: boolean;
    leaseToken?: string;
    session?: AnalysisSession;
    reason?: 'NOT_FOUND' | 'FORBIDDEN' | 'INCOMPLETE' | 'IN_PROGRESS' | 'ALREADY_COMPLETED' | 'ERROR';
    errorMessage?: string;
  }> {
    if (!verifiedUid || typeof verifiedUid !== 'string' || !verifiedUid.trim()) {
      return { acquired: false, reason: 'FORBIDDEN', errorMessage: 'Verified UID required' };
    }
    const cleanUid = verifiedUid.trim();
    // Synchronous read-check-write eliminates microtask interleaving (atomic in Node.js)
    const raw = this.sessionStore.get(sessionId);
    if (!raw) {
      return { acquired: false, reason: 'NOT_FOUND', errorMessage: `Session "${sessionId}" not found` };
    }
    const session = JSON.parse(raw) as AnalysisSession;
    if (session.userId !== cleanUid && session.ownerId !== cleanUid) {
      return { acquired: false, reason: 'FORBIDDEN', errorMessage: 'Cross-tenant session access forbidden' };
    }
    if (session.status !== 'COMPLETED' || !session.profile || !session.selectedOpportunity) {
      return { acquired: false, reason: 'INCOMPLETE', errorMessage: 'Analysis session is incomplete or failed' };
    }
    if (session.generationStatus === 'COMPLETED' && session.generatedArticleId) {
      return { acquired: false, reason: 'ALREADY_COMPLETED', session };
    }
    const now = Date.now();
    if (
      session.generationStatus === 'GENERATING' &&
      session.generationLeaseExpiresAt &&
      now < session.generationLeaseExpiresAt
    ) {
      return { acquired: false, reason: 'IN_PROGRESS', errorMessage: 'Article generation is already in progress for this session' };
    }

    const leaseToken = 'lease_' + now + '_' + Math.random().toString(36).substring(2, 9);
    const expiresAt = now + leaseDurationMs;
    const updated: AnalysisSession = {
      ...session,
      generationStatus: 'GENERATING',
      generationLeaseToken: leaseToken,
      generationLeaseExpiresAt: expiresAt,
      failureReason: undefined,
      updatedAt: now,
    };
    this.sessionStore.set(sessionId, JSON.stringify(updated));
    return { acquired: true, leaseToken, session: updated };
  }

  /**
   * Renews generation lease if fencing token matches.
   */
  static async renewGenerationLease(
    sessionId: string,
    verifiedUid: string,
    leaseToken: string,
    additionalMs = 180000
  ): Promise<boolean> {
    const cleanUid = verifiedUid.trim();
    const raw = this.sessionStore.get(sessionId);
    if (!raw) return false;
    const session = JSON.parse(raw) as AnalysisSession;
    if (session.userId !== cleanUid && session.ownerId !== cleanUid) return false;
    if (session.generationLeaseToken !== leaseToken) {
      return false; // Fenced out
    }
    session.generationLeaseExpiresAt = Date.now() + additionalMs;
    session.updatedAt = Date.now();
    this.sessionStore.set(sessionId, JSON.stringify(session));
    return true;
  }

  /**
   * Releases generation lease with outcome, enforcing fencing token check.
   */
  static async releaseGenerationLease(
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
    const raw = this.sessionStore.get(sessionId);
    if (!raw) return false;
    const session = JSON.parse(raw) as AnalysisSession;
    if (session.userId !== cleanUid && session.ownerId !== cleanUid) return false;
    if (session.generationLeaseToken && session.generationLeaseToken !== leaseToken) {
      console.warn(`[TemporaryArticleStore] Fenced out stale worker for session "${sessionId}". Token "${leaseToken}" != active "${session.generationLeaseToken}"`);
      return false; // Fenced out!
    }
    session.generationStatus = outcome.generationStatus;
    if (outcome.generatedArticleId) {
      session.generatedArticleId = outcome.generatedArticleId;
    }
    session.failureReason = outcome.failureReason;
    session.generationLeaseExpiresAt = undefined;
    session.updatedAt = Date.now();
    this.sessionStore.set(sessionId, JSON.stringify(session));
    return true;
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

/**
 * Resolves persistence backend and retrieves article.
 * Fails closed in production if admin retrieval function is not provided.
 */
export async function resolveAndGetArticle(
  articleId: string,
  verifiedUid: string,
  adminGetFn?: (id: string, verifiedUid?: string) => Promise<Article | null>
): Promise<Article | null> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    return TemporaryArticleStore.getArticleById(articleId, verifiedUid);
  }
  if (!adminGetFn) {
    throw new Error('Durable Firestore persistence function is required in production.');
  }
  return adminGetFn(articleId, verifiedUid);
}

/**
 * Resolves persistence backend and persists analysis session.
 * Fails closed in production if admin save function is not provided.
 */
export async function resolveAndSaveAnalysisSession(
  session: AnalysisSession,
  verifiedUid: string,
  adminSaveFn?: (session: AnalysisSession, verifiedUid: string) => Promise<string>
): Promise<{ id: string; backend: 'FIREBASE_ADMIN' | 'TEMP_TEST_STORAGE' }> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    const id = await TemporaryArticleStore.saveAnalysisSession(session, verifiedUid);
    return { id, backend: 'TEMP_TEST_STORAGE' };
  }
  if (!adminSaveFn) {
    throw new Error('Durable Firestore persistence function is required in production.');
  }
  const id = await adminSaveFn(session, verifiedUid);
  return { id, backend: 'FIREBASE_ADMIN' };
}

/**
 * Resolves persistence backend and retrieves analysis session.
 * Fails closed in production if admin get function is not provided.
 */
export async function resolveAndGetAnalysisSession(
  sessionId: string,
  verifiedUid: string,
  adminGetFn?: (sessionId: string, verifiedUid: string) => Promise<AnalysisSession | null>
): Promise<AnalysisSession | null> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    return TemporaryArticleStore.getAnalysisSessionById(sessionId, verifiedUid);
  }
  if (!adminGetFn) {
    throw new Error('Durable Firestore persistence function is required in production.');
  }
  return adminGetFn(sessionId, verifiedUid);
}

/**
 * Resolves persistence backend and updates analysis session.
 * Fails closed in production if admin update function is not provided.
 */
export async function resolveAndUpdateAnalysisSession(
  sessionId: string,
  verifiedUid: string,
  updates: Partial<AnalysisSession>,
  adminUpdateFn?: (sessionId: string, verifiedUid: string, updates: Partial<AnalysisSession>) => Promise<void>
): Promise<void> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    return TemporaryArticleStore.updateAnalysisSession(sessionId, verifiedUid, updates);
  }
  if (!adminUpdateFn) {
    throw new Error('Durable Firestore persistence function is required in production.');
  }
  return adminUpdateFn(sessionId, verifiedUid, updates);
}

/**
 * Resolves persistence backend and atomically acquires a generation lease with fencing token.
 */
export async function resolveAndAcquireGenerationLease(
  sessionId: string,
  verifiedUid: string,
  leaseDurationMs: number = 180000,
  adminAcquireFn?: (sessionId: string, verifiedUid: string, leaseDurationMs?: number) => Promise<any>
): Promise<any> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    return TemporaryArticleStore.acquireGenerationLease(sessionId, verifiedUid, leaseDurationMs);
  }
  if (!adminAcquireFn) {
    throw new Error('Durable Firestore persistence function is required in production.');
  }
  return adminAcquireFn(sessionId, verifiedUid, leaseDurationMs);
}

/**
 * Resolves persistence backend and atomically renews a generation lease if fencing token matches.
 */
export async function resolveAndRenewGenerationLease(
  sessionId: string,
  verifiedUid: string,
  leaseToken: string,
  additionalMs: number = 180000,
  adminRenewFn?: (sessionId: string, verifiedUid: string, leaseToken: string, additionalMs?: number) => Promise<boolean>
): Promise<boolean> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    return TemporaryArticleStore.renewGenerationLease(sessionId, verifiedUid, leaseToken, additionalMs);
  }
  if (!adminRenewFn) {
    throw new Error('Durable Firestore persistence function is required in production.');
  }
  return adminRenewFn(sessionId, verifiedUid, leaseToken, additionalMs);
}

/**
 * Resolves persistence backend and atomically releases a generation lease with fencing check.
 */
export async function resolveAndReleaseGenerationLease(
  sessionId: string,
  verifiedUid: string,
  leaseToken: string,
  outcome: {
    generationStatus: 'COMPLETED' | 'FAILED';
    generatedArticleId?: string;
    failureReason?: string;
  },
  adminReleaseFn?: (sessionId: string, verifiedUid: string, leaseToken: string, outcome: any) => Promise<boolean>
): Promise<boolean> {
  const backend = resolvePersistenceBackend();
  if (backend === 'TEMP_TEST_STORAGE') {
    return TemporaryArticleStore.releaseGenerationLease(sessionId, verifiedUid, leaseToken, outcome);
  }
  if (!adminReleaseFn) {
    throw new Error('Durable Firestore persistence function is required in production.');
  }
  return adminReleaseFn(sessionId, verifiedUid, leaseToken, outcome);
}
