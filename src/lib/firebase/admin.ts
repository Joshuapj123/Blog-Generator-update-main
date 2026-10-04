import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

// CommonJS synchronous loading of runtime modules to prevent Webpack async module wrappers
const { initializeApp, getApps, cert } = require('firebase-admin/app') as {
  initializeApp: (options?: any, name?: string) => App;
  getApps: () => App[];
  cert: (serviceAccountPathOrObject: any) => any;
};
const { getAuth } = require('firebase-admin/auth') as {
  getAuth: (app?: App) => Auth;
};
const { getFirestore } = require('firebase-admin/firestore') as {
  getFirestore: (app?: App) => Firestore;
};

let adminApp: App | null = null;

/**
 * Initializes and returns the Firebase Admin singleton instance safely.
 * Safe for Vercel serverless execution across multiple invocations.
 * Never logs credentials, private keys, or secrets.
 */
export function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'blog-generator-c0309';

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    // Correctly format escaped newlines in environment variable
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // Support single-variable JSON configuration if provided
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      adminApp = initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || projectId,
      });
      return adminApp;
    } catch {
      // Intentionally do not log error details that might contain configuration strings
      console.error('[Firebase Admin] Failed to parse service account JSON');
    }
  }

  if (clientEmail && privateKey) {
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else {
    // Default/project-scoped initialization (compatible with Google Cloud environment default credentials)
    adminApp = initializeApp({
      projectId,
    });
  }

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

export function getAdminAuth(): Auth {
  if (testAdminAuth) return testAdminAuth;
  return getAuth(getFirebaseAdminApp());
}

export function getAdminFirestore(): Firestore {
  if (testAdminFirestore) return testAdminFirestore;
  return getFirestore(getFirebaseAdminApp());
}
