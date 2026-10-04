'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import type { ExamPhase, ExamTimeSlot, UserExamSessionPreference, UserReward } from '@neram/database';
import {
  PHASE_1_SESSIONS,
  PHASE_2_SESSIONS,
  getSessionKey,
} from '@/components/exam-planner/nata-2026-schedule';

export interface UseExamPlannerReturn {
  // Data
  preferences: UserExamSessionPreference[];
  rewardEarned: boolean;

  // State
  selectedPhase: ExamPhase | null;
  selectedSessions: Set<string>;
  loading: boolean;
  /** Set when the saved plan could not be loaded; editing stays blocked until a retry succeeds */
  loadError: string | null;
  saving: boolean;
  hasUnsavedChanges: boolean;
  showRewardBanner: boolean;

  // Actions
  selectPhase: (phase: ExamPhase) => void;
  toggleSession: (date: string, timeSlot: ExamTimeSlot) => void;
  save: () => Promise<void>;
  clearSelections: () => Promise<void>;
  dismissRewardBanner: () => void;
  retryLoad: () => void;
  clearError: () => void;

  // Constraints
  maxSelections: number;
  canSelectMore: boolean;
  savedPhase: ExamPhase | null;
  error: string | null;
}

export function useExamPlanner(): UseExamPlannerReturn {
  const { user, loading: authLoading } = useFirebaseAuth();
  const userId = user?.id ?? null;
  const [preferences, setPreferences] = useState<UserExamSessionPreference[]>([]);
  const [rewardEarned, setRewardEarned] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<ExamPhase | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showRewardBanner, setShowRewardBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPhase, setSavedPhase] = useState<ExamPhase | null>(null);
  const [initialKeys, setInitialKeys] = useState<Set<string>>(new Set());
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (authLoading) return;
    const seq = ++loadSeqRef.current;
    const controller = new AbortController();
    const isCurrent = () => seq === loadSeqRef.current && !controller.signal.aborted;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const currentUser = getFirebaseAuth().currentUser;
        if (!userId || !currentUser) {
          throw new Error('Your session has ended. Please sign in again to load your plan.');
        }

        const idToken = await currentUser.getIdToken();
        const res = await fetch('/api/exam-planner', {
          headers: { Authorization: `Bearer ${idToken}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(
            res.status === 401
              ? 'Your session has ended. Please refresh the page to load your plan.'
              : 'Could not load your saved plan.'
          );
        }

        const data = await res.json();
        if (!isCurrent()) return;
        const prefs: UserExamSessionPreference[] = data.preferences || [];
        setPreferences(prefs);
        setRewardEarned(!!data.reward);

        if (prefs.length > 0) {
          const phase = prefs[0].phase as ExamPhase;
          setSavedPhase(phase);
          setSelectedPhase(phase);
          const keys = new Set<string>(prefs.map((p) => getSessionKey(p.exam_date, p.time_slot as ExamTimeSlot)));
          setSelectedSessions(keys);
          setInitialKeys(keys);
        } else {
          setSavedPhase(null);
          setInitialKeys(new Set());
        }
      } catch (err) {
        if (!isCurrent()) return;
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setLoadError(
          offline
            ? 'You seem to be offline. Check your connection and try again.'
            : err instanceof Error && err.name !== 'TypeError'
              ? err.message
              : 'Could not load your saved plan.'
        );
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [authLoading, userId, loadAttempt]);

  const retryLoad = useCallback(() => setLoadAttempt((n) => n + 1), []);
  const clearError = useCallback(() => setError(null), []);

  const maxSelections = selectedPhase === 'phase_2' ? 1 : 2;
  const canSelectMore = selectedSessions.size < maxSelections;

  const hasUnsavedChanges = (() => {
    if (selectedSessions.size !== initialKeys.size) return true;
    for (const key of selectedSessions) {
      if (!initialKeys.has(key)) return true;
    }
    return false;
  })();

  const selectPhase = (phase: ExamPhase) => {
    if (savedPhase && savedPhase !== phase) {
      // Can't switch if already saved in another phase
      setError(`Clear your ${savedPhase === 'phase_1' ? 'Phase 1' : 'Phase 2'} selections first to switch.`);
      return;
    }
    setError(null);
    setSelectedPhase(phase);
    if (phase !== selectedPhase) {
      setSelectedSessions(new Set());
    }
  };

  const toggleSession = (date: string, timeSlot: ExamTimeSlot) => {
    setError(null);
    const key = getSessionKey(date, timeSlot);
    setSelectedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= maxSelections) return prev;
        next.add(key);
      }
      return next;
    });
  };

  const save = async () => {
    if (!user || loadError || !selectedPhase || selectedSessions.size === 0) return;
    setSaving(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const idToken = await currentUser.getIdToken();
      const sessions = selectedPhase === 'phase_1' ? PHASE_1_SESSIONS : PHASE_2_SESSIONS;

      const selections = Array.from(selectedSessions).map((key) => {
        const [date, timeSlot] = key.split('_');
        const session = sessions.find((s) => s.date === date && s.timeSlot === timeSlot);
        const d = new Date(date + 'T00:00:00');
        const month = d.toLocaleDateString('en-IN', { month: 'short' });
        const day = d.getDate();
        const slotLabel = timeSlot === 'morning' ? 'Morning' : 'Afternoon';
        return {
          exam_date: date,
          time_slot: timeSlot,
          session_label: `${month} ${day} ${session?.day || ''} ${slotLabel}`,
        };
      });

      const res = await fetch('/api/exam-planner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ phase: selectedPhase, selections }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save your plan. Please try again.');
      }

      const data = await res.json();
      setPreferences(data.preferences || []);
      setSavedPhase(selectedPhase);
      setInitialKeys(new Set(selectedSessions));

      if (data.rewardIsNew) {
        setRewardEarned(true);
        setShowRewardBanner(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const clearSelections = async () => {
    if (!user || loadError) return;
    setSaving(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/exam-planner', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not clear your plan. Please try again.');
      }

      setPreferences([]);
      setSavedPhase(null);
      setSelectedPhase(null);
      setSelectedSessions(new Set());
      setInitialKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const dismissRewardBanner = () => setShowRewardBanner(false);

  return {
    preferences,
    rewardEarned,
    selectedPhase,
    selectedSessions,
    loading,
    loadError,
    saving,
    hasUnsavedChanges,
    showRewardBanner,
    selectPhase,
    toggleSession,
    save,
    clearSelections,
    dismissRewardBanner,
    retryLoad,
    clearError,
    maxSelections,
    canSelectMore,
    savedPhase,
    error,
  };
}
