/**
 * Who gets AI answers (docs/superpowers/specs/2026-10-04-assistant-ai-access-design.md).
 * Live from catch-up, no stored state: a student has them while no missed
 * class has a ready catch-up left undone and, for classes held before they
 * joined, they are not behind their pace. A teacher's override beats that.
 * Only the model costs money; everything else in the assistant ignores this.
 */
import { getCatchupBacklog } from '@neram/database';
import { getStudentPrimaryClassroom, type CatchupBacklog } from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { computeCatchupPace } from '@/lib/catchup-pace';
import { readAssistantGate } from './access';
import { formatDay, todayIst } from './format';
import { istDayStartIso } from './history';
import { countLlmRepliesToday } from './store';
import type { ToolLink } from './types';

export const DAILY_LIMIT_KEY = 'assistant_ai_daily_limit';
export const DEFAULT_DAILY_LIMIT = 10;
export const MAX_DAILY_LIMIT = 50;
const OVERRIDES = 'nexus_assistant_ai_overrides';
const CATCHUP_LINK: ToolLink = { label: 'Catch-up', url: '/student/catch-up' };
/** Item statuses that mean "ready to do and not done". Not ready, excused, blocked and done never count. */
const OWED = new Set(['waiting', 'active']);

export type AiAccessReason = 'not_in_pilot' | 'no_classroom' | 'teacher_off' | 'teacher_on' | 'missed_class' | 'behind_pace' | 'caught_up';

export interface OverrideRow {
  id: string; student_id: string; mode: 'on' | 'off'; reason: string; set_by: string | null;
  set_at: string; ends_on: string | null; cleared_at: string | null; cleared_by: string | null;
}

export interface AiAccess {
  on: boolean;
  reason: AiAccessReason;
  /** What the student reads. Never carries the teacher's private reason. */
  sentence: string;
  link: ToolLink | null;
  missed: Array<{ title: string; day: string }>;
  missedCount: number;
  deficit: number;
  override: OverrideRow | null;
}

export function clampDailyLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_DAILY_LIMIT;
  return Math.min(MAX_DAILY_LIMIT, Math.max(0, Math.floor(n)));
}

export async function readDailyLimit(supabase: any): Promise<number> {
  const { data, error } = await supabase.from('nexus_settings').select('value').eq('key', DAILY_LIMIT_KEY).maybeSingle();
  // Fail closed: if the allowance cannot be read, pause paid answers rather than run unmetered.
  if (error) return 0;
  return clampDailyLimit(data?.value);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function decideAiAccess(input: {
  inPilot: boolean; classroomId: string | null; override: OverrideRow | null; backlog: CatchupBacklog | null; today: string;
}): AiAccess {
  const base: AiAccess = { on: false, reason: 'caught_up', sentence: '', link: null, missed: [], missedCount: 0, deficit: 0, override: input.override };
  if (!input.inPilot) return { ...base, reason: 'not_in_pilot', sentence: 'AI answers are not switched on for this account yet.' };
  if (!input.classroomId) return { ...base, reason: 'no_classroom', sentence: 'AI answers switch on once you are in a classroom.' };
  if (input.override?.mode === 'off') {
    return { ...base, reason: 'teacher_off', sentence: 'AI answers are off for your account. Ask your teacher if you think this is a mistake.' };
  }
  if (input.override?.mode === 'on') return { ...base, on: true, reason: 'teacher_on', sentence: 'AI answers: on.' };

  const b = input.backlog;
  const owed = (b?.missed || []).filter((i: any) => OWED.has(i.status));
  if (owed.length > 0) {
    const missed = owed.slice(0, 3).map((i: any) => ({ title: i.class?.title || 'a class', day: formatDay(i.class?.scheduled_date) }));
    const first = `${missed[0].title} (${missed[0].day})`;
    const sentence = owed.length === 1
      ? `AI answers are off. Catch up on ${first} to switch them back on.`
      : `AI answers are off. Catch up on ${owed.length} classes, starting with ${first}, to switch them back on.`;
    return { ...base, reason: 'missed_class', sentence, link: CATCHUP_LINK, missed, missedCount: owed.length };
  }

  if (b?.journey && b.totals && b.totals.total > 0) {
    const quota = b.journey.weekly_quota ?? 2;
    const pace = computeCatchupPace({ started_on: b.journey.started_on, weekly_quota: quota, total_items: b.totals.total, completed_items: b.totals.completed }, input.today);
    if (pace.state === 'behind') {
      const n = pace.deficit;
      return {
        ...base, reason: 'behind_pace', link: CATCHUP_LINK, deficit: n,
        sentence: `AI answers are off. You are ${plural(n, 'class', 'classes')} behind on your earlier classes. Clear ${n === 1 ? 'it' : 'them'} this week to switch AI answers back on.`,
      };
    }
  }
  return { ...base, on: true, reason: 'caught_up', sentence: 'AI answers: on.' };
}

/** The newest override that is not cleared and has not ended (ends_on is inclusive). */
export async function activeOverride(supabase: any, studentId: string, today: string): Promise<OverrideRow | null> {
  const { data, error } = await supabase
    .from(OVERRIDES)
    .select('*')
    .eq('student_id', studentId)
    .is('cleared_at', null)
    .order('set_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data || []) as OverrideRow[]).find((r) => !r.ends_on || r.ends_on >= today) ?? null;
}

export async function loadAiAccess(supabase: any, studentId: string, now: Date): Promise<AiAccess> {
  const today = todayIst(now);
  const [gate, classroom, override] = await Promise.all([
    readAssistantGate(supabase),
    getStudentPrimaryClassroom(studentId, supabase).catch(() => null),
    activeOverride(supabase, studentId, today),
  ]);
  const inPilot = gate.enabled && (gate.pilot.length === 0 || gate.pilot.includes(studentId));
  const classroomId = classroom?.id ?? null;
  // Only the catch-up rule needs the backlog; skip the read when something earlier decides.
  const needsBacklog = inPilot && classroomId && !override;
  const backlog = needsBacklog ? await getCatchupBacklog(studentId, classroomId, supabase) : null;
  return decideAiAccess({ inPilot, classroomId, override, backlog, today });
}

export async function clearOverrides(supabase: any, studentId: string, clearedBy: string, now: Date): Promise<number> {
  const { data, error } = await supabase
    .from(OVERRIDES)
    .update({ cleared_at: now.toISOString(), cleared_by: clearedBy })
    .eq('student_id', studentId)
    .is('cleared_at', null)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

export async function setOverride(
  supabase: any,
  input: { studentId: string; mode: 'on' | 'off'; reason: string; endsOn: string | null; setBy: string; now: Date },
): Promise<OverrideRow> {
  const reason = input.reason.trim();
  if (!reason || reason.length > 200) throw new ApiError('Give a reason of up to 200 characters, so other teachers know why.', 400);
  await clearOverrides(supabase, input.studentId, input.setBy, input.now);
  const { data, error } = await supabase
    .from(OVERRIDES)
    .insert({ student_id: input.studentId, mode: input.mode, reason, set_by: input.setBy, set_at: input.now.toISOString(), ends_on: input.endsOn, cleared_at: null, cleared_by: null })
    .select('*')
    .single();
  if (error) throw error;
  return data as OverrideRow;
}

/** The same decision in a teacher's words: the reason they need to act on. */
export function teacherAccessLine(a: AiAccess): string {
  const until = a.override?.ends_on ? ` until ${formatDay(a.override.ends_on)}` : '';
  switch (a.reason) {
    case 'caught_up': return 'On: all caught up.';
    case 'teacher_on': return `On: set by a teacher${until} (${a.override?.reason}).`;
    case 'teacher_off': return `Off: set by a teacher${until} (${a.override?.reason}).`;
    case 'missed_class': return `Off: ${plural(a.missedCount, 'missed class', 'missed classes')} to catch up, starting with ${a.missed[0].title} (${a.missed[0].day}).`;
    case 'behind_pace': return `Off: ${plural(a.deficit, 'class', 'classes')} behind on classes held before they joined.`;
    case 'no_classroom': return 'Off: not in a classroom.';
    case 'not_in_pilot': return 'Off: not in the pilot list.';
  }
}

export interface AiStatus { on: boolean; reason: AiAccessReason; sentence: string; link: ToolLink | null; left_today: number; daily_limit: number }

export async function buildAiStatus(supabase: any, studentId: string, now: Date): Promise<AiStatus> {
  const [access, limit] = await Promise.all([loadAiAccess(supabase, studentId, now), readDailyLimit(supabase)]);
  const used = access.on && limit > 0 ? await countLlmRepliesToday(supabase, studentId, istDayStartIso(now), limit) : 0;
  const left = Math.max(0, limit - used);
  let sentence = access.sentence;
  if (access.on) {
    sentence = limit === 0 ? 'AI answers are paused right now.'
      : left === 0 ? 'AI answers: on, none left today. They reset at midnight.'
      : `AI answers: on, ${left} left today.`;
  }
  return { on: access.on && limit > 0, reason: access.reason, sentence, link: access.link, left_today: left, daily_limit: limit };
}
