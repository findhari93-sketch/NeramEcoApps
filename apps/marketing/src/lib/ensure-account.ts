import { getFirebaseAuth } from '@neram/auth';
import { signupAttributionFields } from '@neram/database/analytics';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

export interface EnsuredAccount {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  account_tier?: string;
  /** This sign-in created the account. */
  isNewUser?: boolean;
}

const inFlight = new Map<string, Promise<EnsuredAccount | null>>();

/**
 * Make sure the signed-in Firebase user has a Neram account row, once per uid
 * per page load. The site-wide AuthProvider and the apply form both need the
 * row before they read anything, and two parallel register calls used to race
 * the users.firebase_uid unique key. `force` registers again (after the email
 * link is clicked or the phone is verified, so the row picks up the change).
 * Resolves null when nobody is signed in or the call fails; never throws.
 */
export function ensureAccount(options: { force?: boolean } = {}): Promise<EnsuredAccount | null> {
  const current = getFirebaseAuth().currentUser;
  if (!current) return Promise.resolve(null);
  const cached = inFlight.get(current.uid);
  if (cached && !options.force) return cached;

  const promise = (async () => {
    try {
      // The sign-in dialog already refreshed the token after the email link or
      // the phone step; a second forced refresh here only adds a round trip.
      const idToken = await current.getIdToken();
      const res = await fetch(`${APP_URL}/api/auth/register-user`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        // Cross-origin: the app cannot see this site's cookies, so send the
        // anonymous id and campaign touch with the sign-up.
        body: JSON.stringify({ idToken, ...signupAttributionFields() }),
      });
      if (!res.ok) {
        inFlight.delete(current.uid);
        return null;
      }
      const data = await res.json();
      return data?.user ? ({ ...data.user, isNewUser: data.isNewUser === true } as EnsuredAccount) : null;
    } catch {
      inFlight.delete(current.uid);
      return null;
    }
  })();
  inFlight.set(current.uid, promise);
  return promise;
}
