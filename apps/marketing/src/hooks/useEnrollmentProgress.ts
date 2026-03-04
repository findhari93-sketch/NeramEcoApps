'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY_PREFIX = 'enroll_progress_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days - matches token expiry
const DEBOUNCE_MS = 300;

export interface EnrollmentProgress {
  currentStep: number;
  formData: Record<string, unknown>;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  verifiedPhone?: string | null;
  termsAccepted: boolean;
  savedAt: string;
}

export function useEnrollmentProgress(token: string | null) {
  const [restoredState, setRestoredState] = useState<EnrollmentProgress | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Load from localStorage on mount
  useEffect(() => {
    if (!token) return;

    try {
      const key = `${STORAGE_KEY_PREFIX}${token}`;
      const stored = localStorage.getItem(key);
      if (!stored) return;

      const parsed: EnrollmentProgress = JSON.parse(stored);

      // Check if data is too old
      const savedAt = new Date(parsed.savedAt).getTime();
      if (Date.now() - savedAt > MAX_AGE_MS) {
        localStorage.removeItem(key);
        return;
      }

      // Only resume if student has actually filled some data (not just step 0 with defaults)
      if (parsed.currentStep > 0 || parsed.phoneVerified) {
        setRestoredState(parsed);
        setIsResuming(true);
      }
    } catch {
      // Corrupted data, ignore
    }
  }, [token]);

  const saveProgress = useCallback(
    (progress: Omit<EnrollmentProgress, 'savedAt'>) => {
      if (!tokenRef.current) return;

      // Debounce saves
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        try {
          const key = `${STORAGE_KEY_PREFIX}${tokenRef.current}`;
          const data: EnrollmentProgress = {
            ...progress,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(key, JSON.stringify(data));
        } catch {
          // localStorage full or unavailable, ignore
        }
      }, DEBOUNCE_MS);
    },
    []
  );

  const clearProgress = useCallback(() => {
    if (!tokenRef.current) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    try {
      const key = `${STORAGE_KEY_PREFIX}${tokenRef.current}`;
      localStorage.removeItem(key);
    } catch {
      // ignore
    }

    setRestoredState(null);
    setIsResuming(false);
  }, []);

  const dismissResume = useCallback(() => {
    setIsResuming(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    restoredState,
    isResuming,
    saveProgress,
    clearProgress,
    dismissResume,
  };
}
