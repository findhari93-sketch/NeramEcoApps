'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFirebaseAuth } from '@neram/auth';
import type { CalculationPurpose } from '@neram/database';

interface UseScoreAutoSaveInput {
  toolName: string;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  academicYear: string;
  /** Only auto-save when true (i.e. when there are real results AND user is logged in) */
  hasData: boolean;
}

interface UseScoreAutoSaveReturn {
  /** The Supabase ID of the most recently saved calculation. Null until saved. */
  savedCalcId: string | null;
  isSaving: boolean;
  /** Total number of calculations this user has made for this tool (fetched on mount). */
  calculationCount: number;
  /** Call this after the user picks a purpose in the prompt. */
  setPurpose: (purpose: CalculationPurpose, label?: string) => Promise<void>;
  isUpdatingPurpose: boolean;
}

/**
 * Auto-saves cutoff calculator results for logged-in users.
 *
 * Design:
 * - Watches resultData via JSON fingerprint (avoids saving on every keystroke)
 * - 1200ms debounce — only saves after user stops changing inputs
 * - Fire-and-forget — never blocks the UI, errors logged to console only
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
  const [isSaving, setIsSaving] = useState(false);
  const [calculationCount, setCalculationCount] = useState(0);
  const [isUpdatingPurpose, setIsUpdatingPurpose] = useState(false);

  // Track the fingerprint of the last result we saved (prevents duplicate saves)
  const lastSavedFingerprintRef = useRef<string | null>(null);
  // Reset savedCalcId when inputs change so PurposePrompt re-shows
  const currentFingerprintRef = useRef<string | null>(null);

  // Fetch prior count once when user authenticates
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
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

  // Auto-save effect with 1200ms debounce
  useEffect(() => {
    if (!user || !hasData) return;

    const fingerprint = JSON.stringify(resultData);
    currentFingerprintRef.current = fingerprint;

    // Reset savedCalcId when result changes so PurposePrompt re-shows for new calc
    if (fingerprint !== lastSavedFingerprintRef.current) {
      setSavedCalcId(null);
    }

    const timer = setTimeout(async () => {
      // Check again after debounce in case inputs changed while we waited
      if (fingerprint !== currentFingerprintRef.current) return;
      // Don't save a duplicate
      if (fingerprint === lastSavedFingerprintRef.current) return;

      lastSavedFingerprintRef.current = fingerprint;
      setIsSaving(true);

      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/score-calculations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            toolName,
            inputData,
            resultData,
            academicYear,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setSavedCalcId(data.calculation?.id ?? null);
          setCalculationCount((c) => c + 1);
        }
      } catch (err) {
        console.error('[useScoreAutoSave] save failed:', err);
        // Reset fingerprint so we retry on next change
        lastSavedFingerprintRef.current = null;
      } finally {
        setIsSaving(false);
      }
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasData, JSON.stringify(resultData)]);

  const setPurpose = useCallback(
    async (purpose: CalculationPurpose, label?: string) => {
      if (!savedCalcId || !user) return;
      setIsUpdatingPurpose(true);
      try {
        const idToken = await user.getIdToken();
        await fetch(`/api/score-calculations/${savedCalcId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ purpose, label }),
        });
      } catch (err) {
        console.error('[useScoreAutoSave] purpose update failed:', err);
      } finally {
        setIsUpdatingPurpose(false);
      }
    },
    [savedCalcId, user]
  );

  return {
    savedCalcId,
    isSaving,
    calculationCount,
    setPurpose,
    isUpdatingPurpose,
  };
}
