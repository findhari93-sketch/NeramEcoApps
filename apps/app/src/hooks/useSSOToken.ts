'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from '@neram/auth';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

interface UseSSOTokenResult {
  /** Whether SSO token processing is in progress */
  processing: boolean;
  /** SSO error message, if any */
  error: string | null;
  /** Clear the error state */
  clearError: () => void;
  /** Retry SSO by redirecting to marketing */
  retrySSO: () => void;
}

export function useSSOToken(): UseSSOTokenResult {
  const searchParams = useSearchParams();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    const authToken = searchParams.get('authToken');
    const ssoParam = searchParams.get('sso');

    // Show error from URL param (e.g., marketing SSO exchange failed)
    if (ssoParam === 'error' && !error) {
      setError('Single sign-on failed. Please try logging in directly.');
      return;
    }

    // Process authToken if present and not already attempted
    if (authToken && !attemptedRef.current) {
      attemptedRef.current = true;
      setProcessing(true);
      setError(null);

      signInWithCustomToken(authToken)
        .then(() => {
          // Success: clean URL, set processing=false (auth state is already updated by this point)
          const url = new URL(window.location.href);
          url.searchParams.delete('authToken');
          window.history.replaceState({}, '', url.toString());
          setProcessing(false);
        })
        .catch((err: Error) => {
          console.error('SSO sign-in error:', err);
          // Clean URL to prevent retry loop
          const url = new URL(window.location.href);
          url.searchParams.delete('authToken');
          url.searchParams.set('sso', 'error');
          window.history.replaceState({}, '', url.toString());
          // Mark SSO as attempted to prevent redirect loop
          try {
            sessionStorage.setItem('neram_sso_attempted', String(Date.now()));
          } catch { /* ignore */ }
          setError(err.message || 'Failed to sign in with SSO token');
          setProcessing(false);
        });
    }
  }, [searchParams, error]);

  const clearError = useCallback(() => {
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('sso');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const retrySSO = useCallback(() => {
    try {
      sessionStorage.removeItem('neram_sso_attempted');
    } catch { /* ignore */ }
    attemptedRef.current = false;
    setError(null);
    setProcessing(false);
    const currentUrl = window.location.origin + window.location.pathname;
    window.location.href = `${MARKETING_URL}/sso?redirect=${encodeURIComponent(currentUrl)}`;
  }, []);

  return { processing, error, clearError, retrySSO };
}
