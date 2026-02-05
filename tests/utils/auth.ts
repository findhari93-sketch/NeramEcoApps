/**
 * Auth Test Utilities
 *
 * Helpers for mocking Firebase and Microsoft authentication in tests.
 */

import { vi } from 'vitest';
import { mockFirebaseUser, mockMicrosoftUser } from '../fixtures/users';

/**
 * Mock Firebase Auth module
 * Use in beforeEach to mock Firebase authentication
 */
export function mockFirebaseAuth(options: {
  user?: typeof mockFirebaseUser | null;
  isSignedIn?: boolean;
} = {}) {
  const { user = mockFirebaseUser, isSignedIn = true } = options;

  const mockAuth = {
    currentUser: isSignedIn ? user : null,
    onAuthStateChanged: vi.fn((callback: (user: typeof mockFirebaseUser | null) => void) => {
      callback(isSignedIn ? user : null);
      return () => {}; // Unsubscribe function
    }),
    signInWithPopup: vi.fn().mockResolvedValue({
      user,
      credential: { accessToken: 'mock-access-token' },
    }),
    signInWithRedirect: vi.fn().mockResolvedValue(undefined),
    signInWithCredential: vi.fn().mockResolvedValue({ user }),
    signInWithPhoneNumber: vi.fn().mockResolvedValue({
      verificationId: 'mock-verification-id',
      confirm: vi.fn().mockResolvedValue({ user }),
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
  };

  vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => mockAuth),
    GoogleAuthProvider: vi.fn(),
    PhoneAuthProvider: vi.fn(),
    RecaptchaVerifier: vi.fn(() => ({
      clear: vi.fn(),
      render: vi.fn(),
      verify: vi.fn().mockResolvedValue('mock-recaptcha-token'),
    })),
    signInWithPopup: mockAuth.signInWithPopup,
    signInWithRedirect: mockAuth.signInWithRedirect,
    signInWithCredential: mockAuth.signInWithCredential,
    signInWithPhoneNumber: mockAuth.signInWithPhoneNumber,
    signOut: mockAuth.signOut,
    onAuthStateChanged: mockAuth.onAuthStateChanged,
    PhoneAuthCredential: vi.fn(),
  }));

  return mockAuth;
}

/**
 * Mock Microsoft MSAL module
 * Use in beforeEach to mock Microsoft authentication
 */
export function mockMicrosoftAuth(options: {
  user?: typeof mockMicrosoftUser | null;
  isSignedIn?: boolean;
} = {}) {
  const { user = mockMicrosoftUser, isSignedIn = true } = options;

  const mockAccount = isSignedIn
    ? {
        homeAccountId: 'mock-home-account-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'mock-tenant-id',
        username: user?.email || 'user@example.com',
        localAccountId: user?.oid || 'mock-local-id',
        name: user?.name || 'Test User',
      }
    : null;

  const mockMsal = {
    getActiveAccount: vi.fn(() => mockAccount),
    getAllAccounts: vi.fn(() => (mockAccount ? [mockAccount] : [])),
    setActiveAccount: vi.fn(),
    loginPopup: vi.fn().mockResolvedValue({
      account: mockAccount,
      accessToken: 'mock-access-token',
      idToken: 'mock-id-token',
    }),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    acquireTokenSilent: vi.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      account: mockAccount,
    }),
    acquireTokenPopup: vi.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      account: mockAccount,
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
  };

  vi.mock('@azure/msal-browser', () => ({
    PublicClientApplication: vi.fn(() => mockMsal),
    InteractionRequiredAuthError: class extends Error {
      constructor() {
        super('interaction_required');
      }
    },
  }));

  return mockMsal;
}

/**
 * Create mock authorization headers for API route testing
 */
export function createMockAuthHeaders(type: 'firebase' | 'microsoft' = 'firebase') {
  return {
    Authorization: `Bearer mock-${type}-token`,
    'Content-Type': 'application/json',
  };
}

/**
 * Mock the useFirebaseAuth hook
 */
export function mockUseFirebaseAuth(options: {
  user?: typeof mockFirebaseUser | null;
  loading?: boolean;
} = {}) {
  const { user = mockFirebaseUser, loading = false } = options;

  return {
    user,
    loading,
    error: null,
    signIn: vi.fn().mockResolvedValue(user),
    signOut: vi.fn().mockResolvedValue(undefined),
    signInWithGoogle: vi.fn().mockResolvedValue(user),
    signInWithPhone: vi.fn().mockResolvedValue('verification-id'),
    verifyPhoneOTP: vi.fn().mockResolvedValue(user),
  };
}

/**
 * Mock the useMicrosoftAuth hook
 */
export function mockUseMicrosoftAuth(options: {
  user?: typeof mockMicrosoftUser | null;
  loading?: boolean;
  isAuthenticated?: boolean;
} = {}) {
  const { user = mockMicrosoftUser, loading = false, isAuthenticated = true } = options;

  return {
    user,
    loading,
    isAuthenticated,
    error: null,
    login: vi.fn().mockResolvedValue(user),
    logout: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  };
}

/**
 * Verify Firebase token (mock implementation for tests)
 */
export async function verifyMockFirebaseToken(token: string): Promise<{
  uid: string;
  email: string;
  email_verified: boolean;
}> {
  if (token === 'mock-id-token' || token === 'mock-firebase-id-token') {
    return {
      uid: mockFirebaseUser.uid,
      email: mockFirebaseUser.email!,
      email_verified: mockFirebaseUser.emailVerified,
    };
  }
  throw new Error('Invalid token');
}
