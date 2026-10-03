'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import type { CalculationPurpose } from '@neram/database';

interface UseScoreAutoSaveInput {
  toolName: string;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  academicYear: string;
  /** Only auto-save when true (i.e. when there are real results AND user is logged in) */
  hasData: boolean;
}

export type ScoreSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseScoreAutoSaveReturn {
  /** The Supabase ID of the most recently saved calculation. Null until saved. */
  savedCalcId: string | null;
  isSaving: boolean;
  /** 'error' means the latest result is NOT in the student's history yet. */
  saveStatus: ScoreSaveStatus;
  /** Try the failed save again right away. */
  retrySave: () => void;
  /** Total number of calculations this user has made for this tool (fetched on mount). */
  calculationCount: number;
  /** Call this after the user picks a purpose in the prompt. Resolves false when the update failed. */
  setPurpose: (purpose: CalculationPurpose, label?: string) => Promise<boolean>;
  isUpdatingPurpose: boolean;
}

const DEBOUNCE_MS = 1200;
const AUTO_RETRY_MS = 4000;

/**
 * Auto-saves cutoff calculator results for logged-in users.
 *
 * Design:
 * - Keyed on a JSON fingerprint string of resultData, so unrelated re-renders
 *   never restart the debounce or trigger a save
 * - 1200ms debounce: only saves after the user stops changing inputs
 * - Every POST gets a sequence number; a slower, older response can never
 *   overwrite savedCalcId from a newer one
 * - A failed save (network error or non-2xx) is retried once automatically,
 *   then surfaced as saveStatus 'error' with retrySave() for a visible retry
 * - No-op if user is not logged in (hasData will be false)
 * - Fetches prior calculation count on mount for PurposePrompt copy
 */
export function useScoreAutoSave({
  toolName,
  inputData,
  resultData,
  academicYear,
  hasData,
}: UseScoreAutoSaveInput): UseScoreAutoSaveReturn {
  const { user } = useFirebaseAuth();

  const [savedCalcId, setSavedCalcId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<ScoreSaveStatus>('idle');
  const [calculationCount, setCalculationCount] = useState(0);
  const [isUpdatingPurpose, setIsUpdatingPurpose] = useState(false);
  // Bumped to re-run the save effect for the same fingerprint (retry)
  const [retryTick, setRetryTick] = useState(0);

  const fingerprint = JSON.stringify(resultData);

  // Latest payload, read inside the debounced save without being an effect dep
  const payloadRef = useRef({ inputData, resultData, academicYear });
  payloadRef.current = { inputData, resultData, academicYear };

  // Fingerprint of the last result that was saved successfully (prevents duplicates)
  const lastSavedFingerprintRef = useRef<string | null>(null);
  // Fingerprint the user is currently looking at
  const currentFingerprintRef = useRef<string | null>(null);
  // Sequence number of the most recent POST; older responses are ignored
  const saveSeqRef = useRef(0);
  // How many automatic retries were spent on the current fingerprint
  const autoRetriesRef = useRef<{ fingerprint: string | null; count: number }>({
    fingerprint: null,
    count: 0,
  });

  // Fetch prior count once when user authenticates
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await getFirebaseAuth().currentUser?.getIdToken();
        const res = await fetch(
          `/api/score-calculations?tool=${encodeURIComponent(toolName)}&limit=1`,
          { headers: { Authorization: `Bearer ${idToken}` } }
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          setCalculationCount(data.count ?? 0);
        }
      } catch {
        // non-critical, swallow
      }
    })();
    return () => { cancelled = true; };
  }, [user, toolName]);

  // Auto-save effect with debounce, keyed on the result fingerprint
  useEffect(() => {
    if (!user || !hasData) return;

    currentFingerprintRef.current = fingerprint;

    // Reset savedCalcId when result changes so PurposePrompt re-shows for new calc
    if (fingerprint !== lastSavedFingerprintRef.current) {
      setSavedCalcId(null);
      // A new result clears an old "Not saved" notice until its own save runs
      setSaveStatus((s) => (s === 'error' ? 'idle' : s));
    } else {
      return;
    }

    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(async () => {
      // Check again after debounce in case inputs changed while we waited
      if (fingerprint !== currentFingerprintRef.current) return;
      // Don't save a duplicate
      if (fingerprint === lastSavedFingerprintRef.current) return;

      const seq = ++saveSeqRef.current;
      const payload = payloadRef.current;
      setSaveStatus('saving');

      let ok = false;
      try {
        const idToken = await getFirebaseAuth().currentUser?.getIdToken();
        const res = await fetch('/api/score-calculations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            toolName,
            inputData: payload.inputData,
            resultData: payload.resultData,
            academicYear: payload.academicYear,
          }),
        });

        if (res.ok) {
          ok = true;
          const data = await res.json().catch(() => ({}));
          // A row was written either way, so the count goes up
          setCalculationCount((c) => c + 1);
          // Only the newest request may decide what is "saved" right now
          if (seq === saveSeqRef.current) {
            lastSavedFingerprintRef.current = fingerprint;
            // The student may have changed inputs while this was in flight
            if (fingerprint === currentFingerprintRef.current) {
              setSavedCalcId(data?.calculation?.id ?? null);
              setSaveStatus('saved');
            }
          }
        } else {
          console.error('[useScoreAutoSave] save failed with status', res.status);
        }
      } catch (err) {
        console.error('[useScoreAutoSave] save failed:', err);
      }

      if (!ok && seq === saveSeqRef.current && fingerprint === currentFingerprintRef.current) {
        const tracker = autoRetriesRef.current;
        if (tracker.fingerprint !== fingerprint) {
          tracker.fingerprint = fingerprint;
          tracker.count = 0;
        }
        if (tracker.count < 1) {
          // One quiet retry before telling the student
          tracker.count += 1;
          retryTimer = setTimeout(() => setRetryTick((t) => t + 1), AUTO_RETRY_MS);
          setSaveStatus('saving');
        } else {
          setSaveStatus('error');
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user, hasData, fingerprint, retryTick, toolName]);

  const retrySave = useCallback(() => {
    autoRetriesRef.current = { fingerprint: null, count: 0 };
    setSaveStatus('saving');
    setRetryTick((t) => t + 1);
  }, []);

  const setPurpose = useCallback(
    async (purpose: CalculationPurpose, label?: string): Promise<boolean> => {
      if (!savedCalcId || !user) return false;
      setIsUpdatingPurpose(true);
      try {
        const idToken = await getFirebaseAuth().currentUser?.getIdToken();
        const res = await fetch(`/api/score-calculations/${savedCalcId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ purpose, label }),
        });
        if (!res.ok) {
          console.error('[useScoreAutoSave] purpose update failed with status', res.status);
          return false;
        }
        return true;
      } catch (err) {
        console.error('[useScoreAutoSave] purpose update failed:', err);
        return false;
      } finally {
        setIsUpdatingPurpose(false);
      }
    },
    [savedCalcId, user]
  );

  return {
    savedCalcId,
    isSaving: saveStatus === 'saving',
    saveStatus,
    retrySave,
    calculationCount,
    setPurpose,
    isUpdatingPurpose,
  };
}
