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
  sendEmailVerification,
  PhoneAuthProvider,
  linkWithCredential,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';

// ============================================
// FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
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

export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    initFirebase();
    firebaseAuth = getAuth(firebaseApp!);
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
  
  await sendEmailVerification(result.user);
  return result.user;
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

export function initRecaptcha(
  containerId: string,
  options?: {
    size?: 'normal' | 'compact' | 'invisible';
    callback?: () => void;
    'expired-callback'?: () => void;
  }
): RecaptchaVerifier {
  const auth = getFirebaseAuth();
  
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
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
  return confirmationResult;
}

export async function verifyPhoneOTP(otp: string): Promise<FirebaseUser> {
  if (!confirmationResult) {
    throw new Error('No OTP was sent. Call sendPhoneOTP first.');
  }
  
  const result = await confirmationResult.confirm(otp);
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
// EXPORTS
// ============================================

export type { FirebaseUser, ConfirmationResult };
