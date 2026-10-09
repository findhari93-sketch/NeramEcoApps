/**
 * Neram Classes - Firebase Authentication
 * 
 * Firebase auth for app.neramclasses.com
 * Supports:
 * - Google Sign-In
 * - Email/Password
 * - Phone OTP verification
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  updatePhoneNumber,
  AuthCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  sendEmailVerification,
  PhoneAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  EmailAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithCustomToken as firebaseSignInWithCustomToken,
} from 'firebase/auth';

// ============================================
// FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim(),
};

// ============================================
// INITIALIZATION
// ============================================

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

export function initFirebase(): FirebaseApp {
  if (!firebaseApp) {
    const apps = getApps();
    firebaseApp = apps.length > 0 ? apps[0] : initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

let persistenceSet = false;

/**
 * True only in a non-production E2E test build. When on, Firebase phone auth
 * skips reCAPTCHA (auth.settings.appVerificationDisabledForTesting) so Playwright
 * can drive the real sign-in flow with a registered test phone number. The
 * NODE_ENV guard keeps this OFF in production even if the flag leaks into an env.
 */
function isE2ETestMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    initFirebase();
    firebaseAuth = getAuth(firebaseApp!);
    if (isE2ETestMode()) {
      // Bypass reCAPTCHA for automated tests; only applies to registered test numbers.
      firebaseAuth.settings.appVerificationDisabledForTesting = true;
    }
  }
  return firebaseAuth;
}

/**
 * Initialize Firebase auth with local persistence
 * This ensures sessions persist across browser tabs and restarts
 * Call this before any auth operations
 */
export async function initFirebaseWithPersistence(): Promise<Auth> {
  const auth = getFirebaseAuth();
  if (!persistenceSet) {
    try {
      await setPersistence(auth, browserLocalPersistence);
      persistenceSet = true;
    } catch (error) {
      console.error('Error setting Firebase persistence:', error);
    }
  }
  return auth;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
}

// ============================================
// GOOGLE AUTH
// ============================================

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

const GOOGLE_CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

/**
 * Google sign-in for a button that should never dead-end: the popup first;
 * if the browser blocks popups, a full-page redirect (the session comes back
 * through onAuthStateChanged, so the page picks up from there). Returns null
 * when the student closes the popup or the page is redirecting.
 */
export async function signInWithGoogleOrRedirect(): Promise<FirebaseUser | null> {
  const auth = getFirebaseAuth();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (GOOGLE_CANCELLED.has(error?.code)) return null;
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

/**
 * Sign in with Google including YouTube scope for subscription management
 * Returns both the Firebase user and the OAuth access token for YouTube API calls
 */
export async function signInWithGoogleYouTube(): Promise<{
  user: FirebaseUser;
  accessToken: string | null;
}> {
  const auth = getFirebaseAuth();

  // Create a new provider with YouTube scope
  const youtubeProvider = new GoogleAuthProvider();
  youtubeProvider.addScope('email');
  youtubeProvider.addScope('profile');
  youtubeProvider.addScope('https://www.googleapis.com/auth/youtube.force-ssl');

  // Force account selection to ensure user consent
  youtubeProvider.setCustomParameters({
    prompt: 'consent',
  });

  const result = await signInWithPopup(auth, youtubeProvider);

  // Get the OAuth access token from the credential
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || null;

  return {
    user: result.user,
    accessToken,
  };
}

// ============================================
// EMAIL/PASSWORD AUTH
// ============================================

export async function signInWithEmail(
  email: string,
  password: string
): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function createAccountWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const result = await createUserWithEmailAndPassword(auth, email, password);
  
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }

  await sendEmailVerification(result.user, verificationLinkSettings());
  return result.user;
}

/** The verification link brings the student back to the page they signed up on. */
function verificationLinkSettings(): { url: string } | undefined {
  if (typeof window === 'undefined') return undefined;
  return { url: window.location.href };
}

/**
 * Re-read the signed-in user from Firebase and refresh the ID token, so a
 * click on the verification link (in another tab or on the phone) shows up
 * here and in the token's email_verified claim.
 */
export async function refreshEmailVerified(): Promise<boolean> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return false;
  await user.reload();
  const fresh = getFirebaseAuth().currentUser;
  if (fresh?.emailVerified) await fresh.getIdToken(true);
  return Boolean(fresh?.emailVerified);
}

/** Send the verification email again to the signed-in user. */
export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('No user is signed in');
  await sendEmailVerification(user, verificationLinkSettings());
}

export async function resetPassword(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email);
}

// ============================================
// PHONE AUTH
// ============================================

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;
/** The E.164 number the current confirmationResult was sent to. */
let otpPhoneNumber: string | null = null;

export function initRecaptcha(
  containerId: string,
  options?: {
    size?: 'normal' | 'compact' | 'invisible';
    callback?: () => void;
    'expired-callback'?: () => void;
  }
): RecaptchaVerifier {
  const auth = getFirebaseAuth();

  // Defensive: ensure the test bypass is on even if auth was created elsewhere first.
  if (isE2ETestMode()) {
    auth.settings.appVerificationDisabledForTesting = true;
  }

  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // ignore
    }
    recaptchaVerifier = null;
  }

  // Also wipe any leftover reCAPTCHA iframes injected by Google SDK
  if (typeof document !== 'undefined') {
    document.querySelectorAll('iframe[src*="recaptcha"]').forEach((el) => el.remove());
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: options?.size || 'invisible',
    callback: options?.callback,
    'expired-callback': options?.['expired-callback'],
  });

  return recaptchaVerifier;
}

export async function sendPhoneOTP(phoneNumber: string): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  
  if (!recaptchaVerifier) {
    throw new Error('reCAPTCHA not initialized. Call initRecaptcha first.');
  }
  
  // Ensure phone number has country code
  const formattedPhone = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+91${phoneNumber.replace(/\D/g, '')}`;
  
  confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
  otpPhoneNumber = formattedPhone;
  return confirmationResult;
}

export async function verifyPhoneOTP(otp: string): Promise<FirebaseUser> {
  if (!confirmationResult) {
    throw new Error('No OTP was sent. Call sendPhoneOTP first.');
  }

  const result = await confirmationResult.confirm(otp);
  return result.user;
}

/**
 * Verify phone OTP and link to existing account if user is signed in.
 *
 * When a user is already signed in (e.g., via Google), this links the phone
 * credential to their existing account rather than creating a new sign-in,
 * which would replace their session.
 *
 * When no user is signed in (standalone phone login), falls back to
 * confirmationResult.confirm() for a regular phone sign-in.
 */
export async function verifyPhoneAndLink(otp: string): Promise<FirebaseUser> {
  if (!confirmationResult) {
    throw new Error('No OTP was sent. Call sendPhoneOTP first.');
  }

  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    // No user signed in: a regular phone sign-in.
    const result = await confirmationResult.confirm(otp);
    return result.user;
  }

  // Signed in (Google or email): attach the phone to THIS account. A plain
  // confirm() here would sign in as a separate phone-only account and replace
  // the session.
  const credential = PhoneAuthProvider.credential(confirmationResult.verificationId, otp);
  const hasPhone = currentUser.providerData.some((p) => p.providerId === 'phone');

  try {
    if (hasPhone) {
      if (otpPhoneNumber && currentUser.phoneNumber === otpPhoneNumber) return currentUser;
      // A different number is already on the account: replace it.
      await updatePhoneNumber(currentUser, credential);
      return currentUser;
    }
    const result = await linkWithCredential(currentUser, credential);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/provider-already-linked') {
      await updatePhoneNumber(currentUser, credential);
      return currentUser;
    }
    if (error?.code === 'auth/credential-already-in-use' || error?.code === 'auth/account-exists-with-different-credential') {
      // The number belongs to another Firebase account. Hand the verified
      // credential back so the caller can offer "Sign in with this number".
      throw new PhoneInUseError(PhoneAuthProvider.credentialFromError(error));
    }
    throw error;
  }
}

/**
 * The verified phone number already belongs to a different account. Carries
 * the credential so the student can sign in to that account without a new OTP.
 */
export class PhoneInUseError extends Error {
  code = 'neram/phone-in-use' as const;
  credential: AuthCredential | null;
  constructor(credential: AuthCredential | null) {
    super('This phone number is already on another Neram account.');
    this.name = 'PhoneInUseError';
    this.credential = credential;
  }
}

/** Sign in to the account that owns a verified phone credential (from PhoneInUseError). */
export async function signInWithPhoneCredential(credential: AuthCredential): Promise<FirebaseUser> {
  const result = await signInWithCredential(getFirebaseAuth(), credential);
  return result.user;
}

export async function linkPhoneToAccount(
  user: FirebaseUser,
  phoneNumber: string,
  otp: string
): Promise<FirebaseUser> {
  const credential = PhoneAuthProvider.credential(
    confirmationResult!.verificationId,
    otp
  );
  
  const result = await linkWithCredential(user, credential);
  return result.user;
}

// ============================================
// CROSS-DOMAIN REDIRECT HANDLING
// ============================================

const AUTH_REDIRECT_KEY = 'neram_auth_redirect_url';

/**
 * Store return URL before redirecting to auth flow
 * Used for cross-domain authentication between neramclasses.com and app.neramclasses.com
 */
export function setAuthRedirectUrl(url: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(AUTH_REDIRECT_KEY, url);
  }
}

/**
 * Get and clear the stored redirect URL after successful authentication
 * Returns null if no redirect URL was stored
 */
export function getAuthRedirectUrl(): string | null {
  if (typeof window !== 'undefined') {
    const url = sessionStorage.getItem(AUTH_REDIRECT_KEY);
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    return url;
  }
  return null;
}

/**
 * Check if there's a pending redirect URL
 */
export function hasAuthRedirectUrl(): boolean {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(AUTH_REDIRECT_KEY) !== null;
  }
  return false;
}

/**
 * Clear any pending redirect URL without returning it
 */
export function clearAuthRedirectUrl(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  }
}

// ============================================
// SESSION MANAGEMENT
// ============================================

export function getCurrentUser(): FirebaseUser | null {
  const auth = getFirebaseAuth();
  return auth.currentUser;
}

export async function signInWithCustomToken(customToken: string): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const result = await firebaseSignInWithCustomToken(auth, customToken);
  return result.user;
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
}

export function onAuthChange(
  callback: (user: FirebaseUser | null) => void
): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

// ============================================
// PROFILE MANAGEMENT
// ============================================

export async function updateUserProfile(
  updates: { displayName?: string; photoURL?: string }
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('No user is signed in');
  await updateProfile(user, updates);
}

export async function sendVerificationEmail(): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('No user is signed in');
  await sendEmailVerification(user);
}

// ============================================
// PASSWORD MANAGEMENT
// ============================================

/**
 * Change password for current user
 * Requires re-authentication with current password
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('No user is signed in');
  if (!user.email) throw new Error('User has no email for password auth');

  // Re-authenticate with current password
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);

  // Update to new password
  await updatePassword(user, newPassword);
}

/**
 * Set password for a user who signed up with OAuth (Google)
 * This links email/password auth to their existing account
 */
export async function setPasswordForOAuthUser(
  email: string,
  password: string
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('No user is signed in');

  // Create email/password credential
  const credential = EmailAuthProvider.credential(email, password);

  // Link the credential to the current user
  await linkWithCredential(user, credential);
}

/**
 * Clear reCAPTCHA verifier (call when unmounting)
 */
export function clearRecaptcha(): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      // Ignore errors when clearing
    }
    recaptchaVerifier = null;
  }
  confirmationResult = null;
  otpPhoneNumber = null;

  // Clear rendered reCAPTCHA widgets from DOM to prevent "already rendered" errors
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[id^="recaptcha-container"]').forEach((el) => {
      el.innerHTML = '';
    });
  }
}

/**
 * Get the current confirmation result (for linking phone to account)
 */
export function getConfirmationResult(): ConfirmationResult | null {
  return confirmationResult;
}

// ============================================
// EXPORTS
// ============================================

export type { FirebaseUser, ConfirmationResult };
