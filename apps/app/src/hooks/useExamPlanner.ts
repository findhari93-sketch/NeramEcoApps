'use client';

import { useState, useEffect, useCallback } from 'react';
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
  saving: boolean;
  hasUnsavedChanges: boolean;
  showRewardBanner: boolean;

  // Actions
  selectPhase: (phase: ExamPhase) => void;
  toggleSession: (date: string, timeSlot: ExamTimeSlot) => void;
  save: () => Promise<void>;
  clearSelections: () => Promise<void>;
  dismissRewardBanner: () => void;

  // Constraints
  maxSelections: number;
  canSelectMore: boolean;
  savedPhase: ExamPhase | null;
  error: string | null;
}

export function useExamPlanner(): UseExamPlannerReturn {
  const { user } = useFirebaseAuth();
  const [preferences, setPreferences] = useState<UserExamSessionPreference[]>([]);
  const [rewardEarned, setRewardEarned] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<ExamPhase | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRewardBanner, setShowRewardBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPhase, setSavedPhase] = useState<ExamPhase | null>(null);
  const [initialKeys, setInitialKeys] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/exam-planner', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        const prefs = data.preferences || [];
        setPreferences(prefs);
        setRewardEarned(!!data.reward);

        if (prefs.length > 0) {
          const phase = prefs[0].phase as ExamPhase;
          setSavedPhase(phase);
          setSelectedPhase(phase);
          const keys = new Set(prefs.map((p: UserExamSessionPreference) => getSessionKey(p.exam_date, p.time_slot as ExamTimeSlot)));
          setSelectedSessions(keys);
          setInitialKeys(keys);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    if (!user || !selectedPhase || selectedSessions.size === 0) return;
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
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
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
    if (!user) return;
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
        const data = await res.json();
        throw new Error(data.error || 'Failed to clear');
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
    saving,
    hasUnsavedChanges,
    showRewardBanner,
    selectPhase,
    toggleSession,
    save,
    clearSelections,
    dismissRewardBanner,
    maxSelections,
    canSelectMore,
    savedPhase,
    error,
  };
}
