/**
 * Neram Classes - Authentication Hooks
 * 
 * React hooks for Firebase and Microsoft authentication
 */

'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AccountInfo } from '@azure/msal-browser';

// ============================================
// TYPES
// ============================================

export type AuthProvider = 'firebase' | 'microsoft';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatar: string | null;
  provider: AuthProvider;
  emailVerified: boolean;
  phoneVerified: boolean;
  raw: FirebaseUser | AccountInfo;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: Error | null;
}

// ============================================
// FIREBASE AUTH HOOK
// ============================================

export function useFirebaseAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initAuth = async () => {
      try {
        const { onAuthChange, initFirebaseWithPersistence } = await import('./firebase');

        // Initialize with local persistence for sessions that survive browser restarts
        await initFirebaseWithPersistence();

        unsubscribe = onAuthChange((firebaseUser) => {
          if (firebaseUser) {
            setState({
              user: {
                id: firebaseUser.uid,
                email: firebaseUser.email,
                phone: firebaseUser.phoneNumber,
                name: firebaseUser.displayName,
                avatar: firebaseUser.photoURL,
                provider: 'firebase',
                emailVerified: firebaseUser.emailVerified,
                phoneVerified: Boolean(firebaseUser.phoneNumber),
                raw: firebaseUser,
              },
              loading: false,
              error: null,
            });
          } else {
            setState({
              user: null,
              loading: false,
              error: null,
            });
          }
        });
      } catch (error) {
        setState({
          user: null,
          loading: false,
          error: error as Error,
        });
      }
    };

    initAuth();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Auth actions
  const signInWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { signInWithGoogle: firebaseSignInWithGoogle } = await import('./firebase');
      await firebaseSignInWithGoogle();
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error as Error }));
      throw error;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { signInWithEmail: firebaseSignInWithEmail } = await import('./firebase');
      await firebaseSignInWithEmail(email, password);
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error as Error }));
      throw error;
    }
  }, []);

  const createAccount = useCallback(async (email: string, password: string, name?: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { createAccountWithEmail } = await import('./firebase');
      await createAccountWithEmail(email, password, name);
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error as Error }));
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const { signOut: firebaseSignOut } = await import('./firebase');
      await firebaseSignOut();
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error as Error }));
      throw error;
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      const { resetPassword: firebaseResetPassword } = await import('./firebase');
      await firebaseResetPassword(email);
    } catch (error) {
      setState((prev) => ({ ...prev, error: error as Error }));
      throw error;
    }
  }, []);

  return {
    ...state,
    signInWithGoogle,
    signInWithEmail,
    createAccount,
    signOut,
    resetPassword,
  };
}

// ============================================
// PHONE VERIFICATION HOOK
// ============================================

export interface UsePhoneVerificationReturn {
  loading: boolean;
  error: Error | null;
  otpSent: boolean;
  initRecaptcha: (containerId: string) => void;
  sendOTP: (phoneNumber: string) => Promise<void>;
  verifyOTP: (otp: string) => Promise<void>;
  reset: () => void;
}

export function usePhoneVerification(): UsePhoneVerificationReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  const initRecaptcha = useCallback((containerId: string) => {
    import('./firebase').then(({ initRecaptcha: firebaseInitRecaptcha }) => {
      firebaseInitRecaptcha(containerId, {
        size: 'invisible',
      });
    });
  }, []);

  const sendOTP = useCallback(async (phoneNumber: string) => {
    setLoading(true);
    setError(null);
    try {
      const { sendPhoneOTP } = await import('./firebase');
      await sendPhoneOTP(phoneNumber);
      setOtpSent(true);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOTP = useCallback(async (otp: string) => {
    setLoading(true);
    setError(null);
    try {
      const { verifyPhoneOTP } = await import('./firebase');
      await verifyPhoneOTP(otp);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setOtpSent(false);
    setError(null);
  }, []);

  return {
    loading,
    error,
    otpSent,
    initRecaptcha,
    sendOTP,
    verifyOTP,
    reset,
  };
}

// ============================================
// MICROSOFT AUTH HOOK
// ============================================

export function useMicrosoftAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { initializeMsal, getActiveAccount } = await import('./microsoft');
        await initializeMsal();
        
        const account = getActiveAccount();
        if (account) {
          setState({
            user: {
              id: account.localAccountId,
              email: account.username,
              phone: null,
              name: account.name || null,
              avatar: null,
              provider: 'microsoft',
              emailVerified: true,
              phoneVerified: false,
              raw: account,
            },
            loading: false,
            error: null,
          });
        } else {
          setState({
            user: null,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        setState({
          user: null,
          loading: false,
          error: error as Error,
        });
      }
    };

    initAuth();
  }, []);

  const signIn = useCallback(async (scopes?: string[]) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { signInWithMicrosoft, loginScopes } = await import('./microsoft');
      const result = await signInWithMicrosoft(scopes || loginScopes.default);
      
      setState({
        user: {
          id: result.account!.localAccountId,
          email: result.account!.username,
          phone: null,
          name: result.account!.name || null,
          avatar: null,
          provider: 'microsoft',
          emailVerified: true,
          phoneVerified: false,
          raw: result.account!,
        },
        loading: false,
        error: null,
      });
      
      return result;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error as Error }));
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const { signOut: msSignOut } = await import('./microsoft');
      await msSignOut();
      setState({
        user: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error as Error }));
      throw error;
    }
  }, []);

  const getAccessToken = useCallback(async (scopes?: string[]) => {
    const { getAccessToken: msGetAccessToken, loginScopes } = await import('./microsoft');
    return msGetAccessToken(scopes || loginScopes.default);
  }, []);

  return {
    ...state,
    signIn,
    signOut,
    getAccessToken,
  };
}

// ============================================
// AUTH CONTEXT (Optional - for global state)
// ============================================

interface AuthContextValue extends AuthState {
  provider: AuthProvider | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
  provider: AuthProvider;
}

export function AuthProvider({ children, provider }: AuthProviderProps): JSX.Element {
  const firebaseAuth = useFirebaseAuth();
  const microsoftAuth = useMicrosoftAuth();

  const auth = provider === 'firebase' ? firebaseAuth : microsoftAuth;

  const value: AuthContextValue = {
    user: auth.user,
    loading: auth.loading,
    error: auth.error,
    provider,
    signOut: auth.signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
