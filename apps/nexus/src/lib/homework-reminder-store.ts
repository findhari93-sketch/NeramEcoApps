/**
 * Reads and writes nexus_homework_reminder_plans (migration 20261007090000).
 * Decisions live in homework-reminders.ts. Server only, service-role client.
 */

import type { HomeworkPlanEnd, HomeworkPlanRow } from './homework-reminders';

const TABLE = 'nexus_homework_reminder_plans';
const COLUMNS =
  'id, scheduled_class_id, classroom_id, student_id, every_days, started_by, next_on, sends, last_sent_at, ended_at, end_reason';

/** Every plan on one class, active or ended. */
export async function loadClassPlans(supabase: any, classId: string): Promise<HomeworkPlanRow[]> {
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq('scheduled_class_id', classId);
  if (error) throw error;
  return (data || []) as HomeworkPlanRow[];
}

/** Every plan still running, across all classes. The evening run's work list. */
export async function loadActivePlans(supabase: any): Promise<HomeworkPlanRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .is('ended_at', null)
    .order('next_on', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return (data || []) as HomeworkPlanRow[];
}

/**
 * A teacher pressed Remind and the first message went. Starts a plan for each
 * student, or restarts an ended one, or counts the send on a running one. The
 * next reminder is `everyDays` from today either way.
 */
export async function startPlans(
  supabase: any,
  input: {
    classId: string;
    classroomId: string;
    startedBy: string;
    everyDays: number;
    nextOn: string;
    sentAt: string;
    sends: Array<{ studentId: string; channel: string | null }>;
  },
): Promise<void> {
  if (input.sends.length === 0) return;
  const existing = await loadClassPlans(supabase, input.classId);
  const byStudent = new Map(existing.map((p) => [p.student_id, p]));
  const rows = input.sends.map(({ studentId, channel }) => {
    const prior = byStudent.get(studentId);
    return {
      scheduled_class_id: input.classId,
      classroom_id: input.classroomId,
      student_id: studentId,
      every_days: input.everyDays,
      started_by: input.startedBy,
      next_on: input.nextOn,
      sends: prior && !prior.ended_at ? prior.sends + 1 : 1,
      last_sent_at: input.sentAt,
      last_channel: channel,
      ended_at: null,
      end_reason: null,
      ended_by: null,
      updated_at: input.sentAt,
      ...(prior && !prior.ended_at ? {} : { started_at: input.sentAt }),
    };
  });
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'scheduled_class_id,student_id' });
  if (error) throw error;
}

/** Stop reminding: the whole class, or the named students. Returns how many stopped. */
export async function stopPlans(
  supabase: any,
  input: { classId: string; studentIds?: string[] | null; stoppedBy: string },
): Promise<number> {
  const now = new Date().toISOString();
  let q = supabase
    .from(TABLE)
    .update({ ended_at: now, end_reason: 'stopped', ended_by: input.stoppedBy, updated_at: now })
    .eq('scheduled_class_id', input.classId)
    .is('ended_at', null);
  if (input.studentIds?.length) q = q.in('student_id', input.studentIds);
  const { data, error } = await q.select('id');
  if (error) throw error;
  return (data || []).length;
}

export async function endPlan(supabase: any, planId: string, reason: HomeworkPlanEnd): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({ ended_at: now, end_reason: reason, updated_at: now })
    .eq('id', planId)
    .is('ended_at', null);
  if (error) throw error;
}

/**
 * Claim today's send by moving next_on on. Only one run can win: the update is
 * conditional on next_on still being due and the plan still running. False
 * means another run already claimed it (or a teacher stopped it meanwhile).
 */
export async function claimSend(supabase: any, plan: HomeworkPlanRow, today: string, nextOn: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ next_on: nextOn, sends: plan.sends + 1, last_sent_at: now, updated_at: now })
    .eq('id', plan.id)
    .is('ended_at', null)
    .lte('next_on', today)
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

export async function recordChannel(supabase: any, planId: string, channel: string | null): Promise<void> {
  await supabase.from(TABLE).update({ last_channel: channel }).eq('id', planId);
}
