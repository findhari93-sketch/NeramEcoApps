/**
 * NATA exam dates as Aintra (Tools app) tells them: the upcoming sessions when the
 * current cycle's schedule is known, otherwise an honest "not announced yet"
 * with last year's pattern. The schedule itself lives with the exam planner
 * (components/exam-planner/nata-2026-schedule.ts); add the new year's file
 * there when CoA publishes it and point SCHEDULE here.
 */
import type { PlannerSession } from '@neram/database';
import { NATA_2026_SESSIONS } from '@/components/exam-planner/nata-2026-schedule';
import { nataCycleYear } from './cycle';

const SCHEDULE: { year: number; sessions: PlannerSession[] } = { year: 2026, sessions: NATA_2026_SESSIONS };

export interface NataDates {
  cycleYear: number;
  scheduleYear: number;
  /** The schedule in code is for the year students are preparing for. */
  announced: boolean;
  phases: Array<{ phase: string; from: string; to: string; days: number }>;
  /** Up to six upcoming sessions, soonest first. Empty when none are left. */
  upcoming: Array<{ date: string; day: string; time: string; phase: string }>;
}

const istToday = (now: Date) => new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
const phaseLabel = (p: string) => (p === 'phase_2' ? 'Phase 2' : 'Phase 1');

export function nataDates(now: Date = new Date(), schedule = SCHEDULE): NataDates {
  const cycleYear = nataCycleYear(now);
  const today = istToday(now);
  const byPhase = new Map<string, string[]>();
  for (const s of schedule.sessions) {
    const list = byPhase.get(s.phase) ?? [];
    if (!list.includes(s.date)) list.push(s.date);
    byPhase.set(s.phase, list);
  }
  const phases = [...byPhase.entries()].map(([phase, dates]) => {
    const sorted = [...dates].sort();
    return { phase: phaseLabel(phase), from: sorted[0], to: sorted[sorted.length - 1], days: sorted.length };
  });
  const upcoming = schedule.sessions
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeSlot.localeCompare(b.timeSlot))
    .slice(0, 6)
    .map((s) => ({ date: s.date, day: s.day, time: s.timeLabel, phase: phaseLabel(s.phase) }));
  return { cycleYear, scheduleYear: schedule.year, announced: schedule.year === cycleYear, phases, upcoming };
}
