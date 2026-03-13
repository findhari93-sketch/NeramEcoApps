import type { PlannerSession, ExamPhase, ExamTimeSlot } from '@neram/database';

/**
 * NATA 2026 Exam Schedule
 *
 * Phase 1: Every Friday (afternoon) & Saturday (morning + afternoon)
 *          from April 4 to June 13, 2026
 * Phase 2: August 7 (Friday) & August 8 (Saturday), 2026
 *
 * Friday:   Afternoon session only (1:30 PM - 4:30 PM)
 * Saturday: Morning (10:00 AM - 1:00 PM) + Afternoon (1:30 PM - 4:30 PM)
 */

interface ScheduleEntry {
  date: string;
  day: 'Friday' | 'Saturday';
  phase: ExamPhase;
}

// All exam dates
const SCHEDULE_ENTRIES: ScheduleEntry[] = [
  // APRIL - Phase 1
  { date: '2026-04-04', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-04-10', day: 'Friday', phase: 'phase_1' },
  { date: '2026-04-11', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-04-17', day: 'Friday', phase: 'phase_1' },
  { date: '2026-04-18', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-04-24', day: 'Friday', phase: 'phase_1' },
  { date: '2026-04-25', day: 'Saturday', phase: 'phase_1' },
  // MAY - Phase 1
  { date: '2026-05-02', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-05-08', day: 'Friday', phase: 'phase_1' },
  { date: '2026-05-09', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-05-15', day: 'Friday', phase: 'phase_1' },
  { date: '2026-05-16', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-05-22', day: 'Friday', phase: 'phase_1' },
  { date: '2026-05-23', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-05-29', day: 'Friday', phase: 'phase_1' },
  { date: '2026-05-30', day: 'Saturday', phase: 'phase_1' },
  // JUNE - Phase 1
  { date: '2026-06-05', day: 'Friday', phase: 'phase_1' },
  { date: '2026-06-06', day: 'Saturday', phase: 'phase_1' },
  { date: '2026-06-12', day: 'Friday', phase: 'phase_1' },
  { date: '2026-06-13', day: 'Saturday', phase: 'phase_1' },
  // AUGUST - Phase 2
  { date: '2026-08-07', day: 'Friday', phase: 'phase_2' },
  { date: '2026-08-08', day: 'Saturday', phase: 'phase_2' },
];

function expandToSessions(entry: ScheduleEntry): PlannerSession[] {
  const sessions: PlannerSession[] = [];

  if (entry.day === 'Saturday') {
    sessions.push({
      date: entry.date,
      day: entry.day,
      phase: entry.phase,
      timeSlot: 'morning',
      timeLabel: '10:00 AM - 1:00 PM',
    });
  }

  // Both Friday and Saturday have afternoon
  sessions.push({
    date: entry.date,
    day: entry.day,
    phase: entry.phase,
    timeSlot: 'afternoon',
    timeLabel: '1:30 PM - 4:30 PM',
  });

  return sessions;
}

export const NATA_2026_SESSIONS: PlannerSession[] = SCHEDULE_ENTRIES.flatMap(expandToSessions);

export const PHASE_1_SESSIONS = NATA_2026_SESSIONS.filter((s) => s.phase === 'phase_1');
export const PHASE_2_SESSIONS = NATA_2026_SESSIONS.filter((s) => s.phase === 'phase_2');

/**
 * Check if a date is in the past (IST comparison).
 */
export function isSessionPast(dateStr: string): boolean {
  const sessionDate = new Date(dateStr + 'T23:59:59+05:30');
  return sessionDate < new Date();
}

/**
 * Get a unique key for a session (used for selection tracking).
 */
export function getSessionKey(date: string, timeSlot: ExamTimeSlot): string {
  return `${date}_${timeSlot}`;
}

/**
 * Build a human-readable session label.
 */
export function buildSessionLabel(session: PlannerSession): string {
  const d = new Date(session.date + 'T00:00:00');
  const month = d.toLocaleDateString('en-IN', { month: 'short' });
  const day = d.getDate();
  const slotLabel = session.timeSlot === 'morning' ? 'Morning' : 'Afternoon';
  return `${month} ${day} ${session.day} ${slotLabel}`;
}

/**
 * Group sessions by month for display.
 */
export function groupSessionsByMonth(sessions: PlannerSession[]): Map<string, PlannerSession[]> {
  const groups = new Map<string, PlannerSession[]>();
  for (const session of sessions) {
    const d = new Date(session.date + 'T00:00:00');
    const monthKey = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey)!.push(session);
  }
  return groups;
}
