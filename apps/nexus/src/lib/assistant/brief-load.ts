/**
 * Gathers the facts for buildBrief from the loaders the student screens already
 * use. Every call is scoped to `userId`; nothing here takes a student id from
 * a request. A failed optional loader drops its section rather than the brief.
 */
import { getCatchupBacklog, getSupabaseAdminClient, listAssignmentsForStudent } from '@neram/database';
import { getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { computeCatchupPace, describeCatchupPace } from '@/lib/catchup-pace';
import { describeExamCountdown } from '@/lib/exam-countdown';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';
import { loadStudentRhythm } from '@/lib/sketchbook-payload';
import { rhythmLine } from '@/lib/sketchbook-rhythm';
import { istNow, loadDeclinedClassIds, loadUpcomingClasses } from '@/lib/upcoming-classes';
import type { BriefFacts } from './brief';
import type { AssistantFeatures } from './types';
import { todayIst } from './format';
import { listRemindersDue } from './store';

async function quiet<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[assistant brief] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** IST calendar date (YYYY-MM-DD) of a UTC timestamp; a due time after midnight IST is the next day in UTC terms. */
export function istDateOf(iso: string): string {
  return todayIst(new Date(iso));
}

/** `features` is the gate's: a switched-off sketchbook is never read and has no line (Ruling 25). */
export async function loadBriefFacts(supabaseIn: any, userId: string, now: Date, features: AssistantFeatures): Promise<BriefFacts> {
  const supabase = supabaseIn || (getSupabaseAdminClient() as any);
  const { today, nowHHMM } = istNow(now);

  const [{ data: user }, classroom] = await Promise.all([
    supabase.from('users').select('name').eq('id', userId).maybeSingle(),
    quiet('classroom', getStudentPrimaryClassroom(userId, supabase), null),
  ]);
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || null;

  const empty: BriefFacts = {
    firstName, today, classroomName: classroom?.name ?? null, nextClass: null,
    assignments: { pending: 0, nextTitle: null, nextDueOn: null }, catchup: null, reviewsBack: 0,
    sketchbookLine: null, exam: null, remindersToday: [],
  };
  if (!classroom) return empty;

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [upcoming, assignments, backlog, reviewed, rhythm, examTarget, reminders] = await Promise.all([
    quiet('upcoming', loadUpcomingClasses(supabase, classroom.id, { today, nowHHMM, limit: 3 }), []),
    quiet('assignments', listAssignmentsForStudent(userId, classroom.id, supabase), []),
    quiet('catchup', getCatchupBacklog(userId, classroom.id, supabase), null),
    quiet('reviews', supabase.from('drawing_submissions').select('id', { count: 'exact', head: true }).eq('student_id', userId).eq('status', 'reviewed').gte('reviewed_at', weekAgo), { count: 0 }),
    features.sketchbook ? quiet('sketchbook', loadStudentRhythm(userId, now), null) : Promise.resolve(null),
    quiet('exam', resolveExamCountdown(supabase, { classroomId: classroom.id, studentId: userId }), null),
    quiet('reminders', listRemindersDue(supabase, userId, today), []),
  ]);

  const declined = upcoming.length ? await quiet('declined', loadDeclinedClassIds(supabase, userId, upcoming.map((c) => c.id)), new Set<string>()) : new Set<string>();
  const next = upcoming[0];

  const pending = assignments
    .filter((a) => !a.submission)
    .sort((a, b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')));
  const nextAssignment = pending[0];

  let catchup: BriefFacts['catchup'] = null;
  if (backlog) {
    const open = backlog.items.filter((i) => !i.caught_up_at && !i.excused).length;
    let sentence: string | null = null;
    if (backlog.journey) {
      const quota = backlog.journey.weekly_quota ?? 2;
      const pace = computeCatchupPace(
        { started_on: backlog.journey.started_on, weekly_quota: quota, total_items: backlog.totals?.total ?? open, completed_items: backlog.totals?.completed ?? 0 },
        today,
      );
      sentence = describeCatchupPace(pace, quota);
    }
    catchup = { open, sentence };
  }

  const examView = examTarget ? describeExamCountdown(examTarget, today) : null;

  return {
    ...empty,
    nextClass: next
      ? { id: next.id, title: next.title, date: next.scheduled_date, startTime: next.start_time, endTime: next.end_time, declined: declined.has(next.id) }
      : null,
    assignments: {
      pending: pending.length,
      nextTitle: nextAssignment?.title ?? null,
      nextDueOn: nextAssignment?.due_at ? istDateOf(String(nextAssignment.due_at)) : null,
    },
    catchup,
    reviewsBack: (reviewed as { count?: number | null })?.count ?? 0,
    sketchbookLine: rhythm ? rhythmLine(rhythm.rhythm) : null,
    exam: examView && examView.visible ? { shortLabel: examView.short_label, headline: examView.headline, detail: examView.detail } : null,
    remindersToday: reminders.map((r) => r.text),
  };
}

/** IST hour of the day, for the greeting. */
export function istHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(now));
}
