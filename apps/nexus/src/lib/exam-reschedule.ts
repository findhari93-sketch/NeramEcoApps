import { getSupabaseAdminClient, getExam, loadExamEligibilityFacts, type NexusExam } from '@neram/database';
import { buildExamEligibilityRoster } from '@/lib/exam-eligibility-roster';

/**
 * The self-serve new-joiner reschedule window, computed identically by both
 * the GET (what to show) and the POST (what to accept) -- the POST route
 * must never trust a date range the client remembered from an earlier GET.
 */

export const RESCHEDULE_WINDOW_DAYS = 14;

/** IST wall-clock HH:MM from a timestamptz, same convention as splitLocalDateTime in exams.ts. */
export function istTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

export function istDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface RescheduleWindow {
  min_date: string;
  max_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
}

export function computeRescheduleWindow(exam: NexusExam, now = new Date()): RescheduleWindow {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + RESCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    min_date: istDate(tomorrow),
    max_date: istDate(maxDate),
    start_time: istTime(exam.opens_at),
    end_time: istTime(exam.closes_at),
    duration_minutes: exam.duration_minutes,
  };
}

export type RescheduleEligibility =
  | { ok: true; exam: NexusExam }
  | { ok: false; status: number; error: string };

/**
 * RECOMPUTES eligibility server-side every time -- never trust a bucket the
 * client remembers. Only 'excused_new_joiner' may self-serve; every other
 * excused reason needs a teacher (Phase 2's approval inbox).
 */
export async function checkNewJoinerReschedule(examId: string, studentId: string): Promise<RescheduleEligibility> {
  const exam = await getExam(examId);
  if (!exam) return { ok: false, status: 404, error: 'Exam not found' };

  const facts = await loadExamEligibilityFacts(examId, exam.classroom_id);
  const rows = buildExamEligibilityRoster(facts);
  const mine = rows.find((r) => r.student_id === studentId);

  if (!mine || mine.auto_bucket !== 'excused_new_joiner') {
    return { ok: false, status: 403, error: 'This test is not open for a self-picked reschedule.' };
  }

  return { ok: true, exam };
}

export async function resolveStudentId(msOid: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msOid).maybeSingle();
  return user?.id ?? null;
}
