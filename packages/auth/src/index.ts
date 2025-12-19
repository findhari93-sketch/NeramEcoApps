/**
 * Neram Classes - Authentication Package
 * 
 * Unified authentication for the Neram Classes ecosystem:
 * - Firebase (for app.neramclasses.com)
 * - Microsoft Entra ID (for nexus & admin)
 */

// Firebase Auth
export {
  initFirebase,
  getFirebaseAuth,
  isFirebaseConfigured,
  signInWithGoogle,
  signInWithEmail,
  createAccountWithEmail,
  resetPassword,
  initRecaptcha,
  sendPhoneOTP,
  verifyPhoneOTP,
  linkPhoneToAccount,
  getCurrentUser,
  signOut as firebaseSignOut,
  onAuthChange,
  updateUserProfile,
  sendVerificationEmail,
} from './firebase';
export type { FirebaseUser, ConfirmationResult } from './firebase';

// Microsoft Auth
export {
  initializeMsal,
  getMsalInstance,
  isMsalConfigured,
  signInWithMicrosoft,
  signInSilent,
  getAccessToken,
  getActiveAccount,
  setActiveAccount,
  getAllAccounts,
  signOut as microsoftSignOut,
  isAuthenticated,
  getUserInfo,
  getMicrosoftOid,
  callMsGraph,
  loginScopes,
} from './microsoft';
export type { AccountInfo, AuthenticationResult } from './microsoft';

// Hooks
export {
  useFirebaseAuth,
  usePhoneVerification,
  useMicrosoftAuth,
  useAuth,
  AuthProvider,
} from './hooks';
export type {
  AuthProvider as AuthProviderType,
  AuthUser,
  AuthState,
  UsePhoneVerificationReturn,
} from './hooks';
