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
  initFirebaseWithPersistence,
  isFirebaseConfigured,
  signInWithGoogle,
  signInWithGoogleYouTube,
  signInWithEmail,
  createAccountWithEmail,
  resetPassword,
  initRecaptcha,
  sendPhoneOTP,
  verifyPhoneOTP,
  verifyPhoneAndLink,
  linkPhoneToAccount,
  clearRecaptcha,
  getConfirmationResult,
  getCurrentUser,
  signOut as firebaseSignOut,
  onAuthChange,
  updateUserProfile,
  sendVerificationEmail,
  // Password management
  changePassword,
  setPasswordForOAuthUser,
  // Cross-domain redirect helpers
  setAuthRedirectUrl,
  getAuthRedirectUrl,
  hasAuthRedirectUrl,
  clearAuthRedirectUrl,
  // Cross-domain auth
  signInWithCustomToken,
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
  MsalLoginError,
  getMsalErrorMessage,
} from './microsoft';
export type { AccountInfo, AuthenticationResult } from './microsoft';

// Microsoft Graph API (server-side only)
export {
  getAppOnlyToken,
  addMemberToTeam,
  addMemberToGroupChat,
} from './graph';

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
