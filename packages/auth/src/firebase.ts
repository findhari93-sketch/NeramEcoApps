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

export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    initFirebase();
    firebaseAuth = getAuth(firebaseApp!);
  }
  return firebaseAuth;
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
