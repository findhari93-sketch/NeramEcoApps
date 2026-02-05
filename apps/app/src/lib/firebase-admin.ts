/**
 * Firebase Admin SDK initialization
 * Used for server-side token verification and custom token generation
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const apps = getApps();
  if (apps.length > 0) {
    adminApp = apps[0];
    return adminApp;
  }

  // Validate required environment variables
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials. Please set FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY environment variables.'
    );
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return adminApp;
}

export function getFirebaseAdminAuth(): Auth {
  if (adminAuth) {
    return adminAuth;
  }

  getFirebaseAdminApp();
  adminAuth = getAuth();
  return adminAuth;
}

/**
 * Verify an ID token and return the decoded token
 */
export async function verifyIdToken(idToken: string) {
  const auth = getFirebaseAdminAuth();
  return auth.verifyIdToken(idToken);
}

/**
 * Create a custom token for cross-domain authentication
 */
export async function createCustomToken(uid: string) {
  const auth = getFirebaseAdminAuth();
  return auth.createCustomToken(uid);
}
