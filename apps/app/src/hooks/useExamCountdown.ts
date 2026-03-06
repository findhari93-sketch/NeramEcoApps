'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import type {
  ExamSchedule,
  ExamScheduleSession,
  UserExamProfile,
  UserExamAttempt,
  NataExamStatus,
} from '@neram/database';

export interface ExamCountdownData {
  // Schedule (admin-managed)
  schedule: ExamSchedule | null;
  nextSession: ExamScheduleSession | null;
  registrationCloseDate: string | null;

  // User's personalized data
  profile: UserExamProfile | null;
  attempts: UserExamAttempt[];
  nextAttempt: UserExamAttempt | null;

  // Computed
  daysLeft: number | null;
  needsSetup: boolean; // No profile yet → show CTA
  cardState: 'loading' | 'no-schedule' | 'cta' | 'applied' | 'planning' | 'not-interested' | 'post-exam';

  // Actions
  loading: boolean;
  refetch: () => void;
}

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getNextFutureSession(sessions: ExamScheduleSession[]): ExamScheduleSession | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return (
    sessions
      .filter((s) => new Date(s.date + 'T00:00:00') >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null
  );
}

function getNextFutureAttempt(attempts: UserExamAttempt[]): UserExamAttempt | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return (
    attempts
      .filter(
        (a) => a.status === 'registered' && a.exam_date && new Date(a.exam_date + 'T00:00:00') >= now
      )
      .sort(
        (a, b) => new Date(a.exam_date!).getTime() - new Date(b.exam_date!).getTime()
      )[0] || null
  );
}

export function useExamCountdown(): ExamCountdownData {
  const { user } = useFirebaseAuth();
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [profile, setProfile] = useState<UserExamProfile | null>(null);
  const [attempts, setAttempts] = useState<UserExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch schedule (public)
      const scheduleRes = await fetch('/api/exam-schedule?exam=nata');
      const scheduleData = await scheduleRes.json();
      setSchedule(scheduleData.schedule || null);

      // Fetch user's exam details (if authenticated)
      if (user) {
        try {
          const auth = getFirebaseAuth();
          const currentUser = auth.currentUser;
          if (currentUser) {
            const idToken = await currentUser.getIdToken();
            const detailsRes = await fetch('/api/exam-details', {
              headers: { Authorization: `Bearer ${idToken}` },
            });
            if (detailsRes.ok) {
              const detailsData = await detailsRes.json();
              setProfile(detailsData.profile || null);
              setAttempts(detailsData.attempts || []);
            }
          }
        } catch {
          // Silent fail — user data is optional
        }
      }
    } catch {
      // Silent fail — schedule may not exist yet
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute card state
  const nextSession = schedule ? getNextFutureSession(schedule.sessions) : null;
  const nextAttempt = getNextFutureAttempt(attempts);
  const registrationCloseDate = schedule?.registration_close_date || null;

  let cardState: ExamCountdownData['cardState'] = 'loading';
  let daysLeft: number | null = null;
  let needsSetup = false;

  if (loading) {
    cardState = 'loading';
  } else if (!schedule) {
    cardState = 'no-schedule';
  } else if (!profile || !profile.exam_details_completed) {
    cardState = 'cta';
    needsSetup = true;
    // Show generic days to next session
    if (nextSession) {
      daysLeft = getDaysUntil(nextSession.date);
    }
  } else if (
    profile.nata_status === 'not_interested' ||
    (profile.nata_status === 'planning_to_apply' &&
      profile.planning_year !== new Date().getFullYear())
  ) {
    cardState = 'not-interested';
    if (nextSession) {
      daysLeft = getDaysUntil(nextSession.date);
    }
  } else if (profile.nata_status === 'planning_to_apply') {
    cardState = 'planning';
    if (nextSession) {
      daysLeft = getDaysUntil(nextSession.date);
    }
  } else if (profile.nata_status === 'applied_waiting' || profile.nata_status === 'attempted') {
    // Check if all attempts are past
    const hasUpcomingAttempt = nextAttempt !== null;
    const hasPastAttempts = attempts.some(
      (a) => a.exam_date && new Date(a.exam_date + 'T00:00:00') < new Date()
    );

    if (hasUpcomingAttempt) {
      cardState = 'applied';
      daysLeft = getDaysUntil(nextAttempt!.exam_date!);
    } else if (hasPastAttempts) {
      cardState = 'post-exam';
    } else {
      cardState = 'applied';
      // Use next session from schedule as fallback
      if (nextSession) {
        daysLeft = getDaysUntil(nextSession.date);
      }
    }
  }

  return {
    schedule,
    nextSession,
    registrationCloseDate,
    profile,
    attempts,
    nextAttempt,
    daysLeft,
    needsSetup,
    cardState,
    loading,
    refetch: fetchData,
  };
}
