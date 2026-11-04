import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;

export const EXPECTED_FIREBASE_PROJECT_ID = 'blog-generator-c0309';

export interface ValidatedServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * Safely parses and validates a service account JSON string from an environment variable.
 * Handles:
 * - Direct valid JSON
 * - Escaped wrapping quotes ('...' or "...")
 * - Base64 encoded JSON strings
 * - Escaped newlines (\n) in private_key
 *
 * Validates presence of:
 * - project_id (and verifies against expected project)
 * - client_email
 * - private_key (including valid PEM header)
 *
 * Strips unexpected JSON properties from the returned validated object.
 * Strictly adheres to security rules: never logs credentials, private keys, or secrets.
 */
export function parseAndValidateServiceAccount(
  raw: string | undefined,
  expectedProjectId: string = EXPECTED_FIREBASE_PROJECT_ID
): ValidatedServiceAccount | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return null;
  }

  let str = raw.trim();

  // Strip wrapping single or double quotes accidentally added by UI or shell
  if (
    (str.startsWith("'") && str.endsWith("'")) ||
    (str.startsWith('"') && str.endsWith('"'))
  ) {
    str = str.slice(1, -1).trim();
  }

  // Handle base64 encoded strings
  if (!str.startsWith('{') && /^[A-Za-z0-9+/=]+$/.test(str.replace(/\s+/g, ''))) {
    try {
      const decoded = Buffer.from(str, 'base64').toString('utf8');
      if (decoded.trim().startsWith('{')) {
        str = decoded.trim();
      }
    } catch {
      // Not base64 JSON, fall through to direct parse attempt
    }
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(str);
  } catch {
    // Attempt parsing with unescaped newlines
    try {
      parsed = JSON.parse(str.replace(/\\n/g, '\n'));
    } catch {
      console.error('[Firebase Admin] Service account JSON parsing failed: syntax error');
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('[Firebase Admin] Service account payload is not a valid JSON object');
    return null;
  }

  // Validate required fields
  const projectId = parsed.project_id;
  const clientEmail = parsed.client_email;
  let privateKey = parsed.private_key;

  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    console.error('[Firebase Admin] Service account is missing "project_id"');
    return null;
  }

  if (expectedProjectId && projectId.trim() !== expectedProjectId) {
    console.error(
      `[Firebase Admin] Service account project_id mismatch: expected "${expectedProjectId}", found "${projectId.trim()}"`
    );
    return null;
  }

  if (!clientEmail || typeof clientEmail !== 'string' || !clientEmail.trim()) {
    console.error('[Firebase Admin] Service account is missing "client_email"');
    return null;
  }

  if (!privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
    console.error('[Firebase Admin] Service account is missing "private_key"');
    return null;
  }

  // Normalize escaped newlines in private_key
  privateKey = privateKey.replace(/\\n/g, '\n');

  if (
    !privateKey.includes('-----BEGIN PRIVATE KEY-----') &&
    !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')
  ) {
    console.error('[Firebase Admin] Service account "private_key" has invalid PEM header');
    return null;
  }

  // Return strictly validated, sanitized fields — discarding any unexpected attributes
  return {
    project_id: projectId.trim(),
    client_email: clientEmail.trim(),
    private_key: privateKey,
  };
}

/**
 * Initializes and returns the Firebase Admin singleton instance safely.
 * Safe for Vercel serverless execution across multiple invocations.
 * Never logs credentials, private keys, or secrets.
 * Fails closed in production when credentials are missing or invalid.
 */
export async function getFirebaseAdminApp(): Promise<App> {
  if (adminApp) {
    return adminApp;
  }

  const { initializeApp, getApps, cert } = await import('firebase-admin/app');

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }

  // Enforce project identity: EXPECTED_FIREBASE_PROJECT_ID is authoritative.
  // A conflicting FIREBASE_PROJECT_ID must never silently change the project.
  const configuredProjectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (configuredProjectId && configuredProjectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    console.error(
      `[Firebase Admin] Conflicting project ID detected: environment variable specifies "${configuredProjectId}", ` +
      `but required project is "${EXPECTED_FIREBASE_PROJECT_ID}". Rejecting initialization.`
    );
    throw new Error(
      `[Firebase Admin] Conflicting project ID: "${configuredProjectId}" does not match required "${EXPECTED_FIREBASE_PROJECT_ID}".`
    );
  }

  const projectId = EXPECTED_FIREBASE_PROJECT_ID;

  // 1. Primary: Parse single JSON environment variable
  const rawServiceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawServiceAccount) {
    const validatedAccount = parseAndValidateServiceAccount(rawServiceAccount, EXPECTED_FIREBASE_PROJECT_ID);
    if (!validatedAccount) {
      throw new Error(
        `[Firebase Admin] Invalid FIREBASE_SERVICE_ACCOUNT_KEY provided. Expected valid JSON credentials for project "${EXPECTED_FIREBASE_PROJECT_ID}".`
      );
    }
    adminApp = initializeApp({
      credential: cert({
        projectId: validatedAccount.project_id,
        clientEmail: validatedAccount.client_email,
        privateKey: validatedAccount.private_key,
      }),
      projectId: validatedAccount.project_id,
    });
    return adminApp;
  }

  // 2. Secondary: Check discrete individual environment variables
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (clientEmail || privateKey) {
    if (!clientEmail || !privateKey) {
      throw new Error(
        '[Firebase Admin] Incomplete discrete credentials: both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be provided.'
      );
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
    if (
      !privateKey.includes('-----BEGIN PRIVATE KEY-----') &&
      !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')
    ) {
      throw new Error(
        '[Firebase Admin] Invalid FIREBASE_PRIVATE_KEY: missing valid PEM header.'
      );
    }
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail: clientEmail.trim(),
        privateKey,
      }),
      projectId,
    });
    return adminApp;
  }

  // 3. Strict Fail-Closed Check for Production / Vercel
  // In serverless hosting outside GCP (e.g. Vercel), ADC cannot discover metadata credentials.
  // We strictly throw an explicit configuration error rather than deferring a cryptic ADC error to Firestore.
  const isServerlessProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
  if (isServerlessProd) {
    throw new Error(
      '[Firebase Admin] Missing or invalid server-side credentials in production environment. ' +
      'Please configure FIREBASE_SERVICE_ACCOUNT_KEY in Vercel Project Settings.'
    );
  }

  // 4. Default initialization only in local/test environments where ADC may be configured
  adminApp = initializeApp({
    projectId,
  });

  return adminApp;
}

let testAdminAuth: any = null;
let testAdminFirestore: any = null;

export function setAdminAuthForTesting(mock: any): void {
  testAdminAuth = mock;
}

export function setAdminFirestoreForTesting(mock: any): void {
  testAdminFirestore = mock;
}

export async function resetAdminAppForTesting(): Promise<void> {
  adminApp = null;
  testAdminAuth = null;
  testAdminFirestore = null;
  try {
    const { getApps, deleteApp } = await import('firebase-admin/app');
    const apps = getApps();
    for (const app of apps) {
      if (app) {
        await deleteApp(app);
      }
    }
  } catch {
    // Ignore test cleanup error
  }
}

export async function getAdminAuth(): Promise<Auth> {
  if (testAdminAuth) return testAdminAuth;
  const { getAuth } = await import('firebase-admin/auth');
  const app = await getFirebaseAdminApp();
  return getAuth(app);
}

export async function getAdminFirestore(): Promise<Firestore> {
  if (testAdminFirestore) return testAdminFirestore;
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = await getFirebaseAdminApp();
  return getFirestore(app);
}
