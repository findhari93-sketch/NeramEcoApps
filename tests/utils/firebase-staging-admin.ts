/**
 * Firebase Admin and Supabase service access for auth E2E on STAGING only.
 *
 * Reads apps/app/.env.local (the Tools App's local env, which points at the
 * neram-staging Firebase project and the staging database) and refuses to run
 * against anything else, so a spec can never create or delete production users.
 * Nothing here prints a credential.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const APP_DIR = path.resolve(__dirname, '../../apps/app');
const STAGING_PROJECT = 'neram-staging';

function readAppEnv(): Record<string, string> {
  const file = path.join(APP_DIR, '.env.local');
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

const env = readAppEnv();

/** True when the local app env is staging and has admin credentials. */
export function stagingAdminAvailable(): boolean {
  return (
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === STAGING_PROJECT &&
    !!(env.FIREBASE_ADMIN_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL) &&
    !!(env.FIREBASE_ADMIN_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY) &&
    /staging/.test(env.NEXT_PUBLIC_SUPABASE_URL || '') &&
    !!env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function assertStaging() {
  if (!stagingAdminAvailable()) throw new Error('Auth E2E helpers run against the staging project only.');
}

let authInstance: any = null;

export function stagingFirebaseAuth(): any {
  assertStaging();
  if (authInstance) return authInstance;
  const req = createRequire(path.join(APP_DIR, 'package.json'));
  const { initializeApp, getApps, cert } = req('firebase-admin/app');
  const { getAuth } = req('firebase-admin/auth');
  const existing = getApps().find((a: any) => a.name === 'e2e-staging');
  const app =
    existing ??
    initializeApp(
      {
        credential: cert({
          projectId: STAGING_PROJECT,
          clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL,
          privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n'),
        }),
      },
      'e2e-staging',
    );
  authInstance = getAuth(app);
  return authInstance;
}

/** Stand in for the student clicking the verification link. */
export async function markEmailVerified(email: string): Promise<void> {
  const auth = stagingFirebaseAuth();
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { emailVerified: true });
}

/** The Firebase uid that owns an email or phone, or null. */
export async function firebaseUidFor(identifier: { email?: string; phoneNumber?: string }): Promise<string | null> {
  const auth = stagingFirebaseAuth();
  try {
    const user = identifier.email ? await auth.getUserByEmail(identifier.email) : await auth.getUserByPhoneNumber(identifier.phoneNumber);
    return user.uid;
  } catch {
    return null;
  }
}

export async function deleteFirebaseUsers(uids: string[]): Promise<void> {
  if (uids.length === 0) return;
  await stagingFirebaseAuth().deleteUsers(uids);
}

export async function stagingSupabase(): Promise<any> {
  assertStaging();
  const req = createRequire(path.join(APP_DIR, 'package.json'));
  const { createClient } = req('@supabase/supabase-js');
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
