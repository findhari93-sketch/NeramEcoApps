import { NextRequest } from 'next/server';
import { createAdminClient, getUserByFirebaseUid } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (err) {
    console.warn('Firebase Admin initialization warning:', err instanceof Error ? err.message : err);
  }
}

export interface AuthResult {
  userId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  /** users.phone_verified: the number on the account was proven by OTP. */
  phoneVerified: boolean;
}

/**
 * Verify Firebase ID token from Authorization header and resolve the Supabase user ID.
 */
export async function verifyFirebaseToken(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await getAuth().verifyIdToken(token);

    // getUserByFirebaseUid also follows user_identities, so a person's second
    // sign-in method (phone OTP after Google, or Google after a phone-first
    // application) reaches the same account instead of a 401.
    const user: any = await getUserByFirebaseUid(decodedToken.uid, createAdminClient() as any);

    if (!user) {
      return null;
    }

    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
    return { userId: user.id, email: user.email, name, phone: user.phone, phoneVerified: user.phone_verified === true };
  } catch {
    return null;
  }
}
