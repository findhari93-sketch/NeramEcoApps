/**
 * Starting an Answer Pad session: reading the request, deciding which class it
 * is for, and deciding whether this teacher may run it. Pure, so every rule is
 * unit tested; the route only loads the facts these functions weigh.
 */

import type { ScheduledClassCandidate } from './meeting-binding';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teams ids are opaque strings; the cap keeps a request from carrying megabytes into a query. */
const MAX_TEAMS_ID = 512;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** What TeamsJS reported inside the meeting. Any of the three may be missing. */
export interface TeamsMeetingContext {
  meetingId: string | null;
  chatId: string | null;
  channelId: string | null;
}

export interface StartSessionRequest {
  meeting: TeamsMeetingContext | null;
  /** The teacher picked a classroom (the meeting matched nothing, or they overrode it). */
  classroomId: string | null;
  batchId: string | null;
  /** The teacher picked a specific scheduled class. */
  scheduledClassId: string | null;
  /** The teacher confirmed "End X and start this class". */
  endExisting: boolean;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

export function parseStartSessionRequest(body: unknown): Parsed<StartSessionRequest> {
  const input = (body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;

  const ids: Record<'classroomId' | 'batchId' | 'scheduledClassId', string | null> = {
    classroomId: null,
    batchId: null,
    scheduledClassId: null,
  };
  for (const field of ['classroomId', 'batchId', 'scheduledClassId'] as const) {
    const value = input[field];
    if (value === undefined || value === null || value === '') continue;
    if (!isUuid(value)) return { ok: false, field };
    ids[field] = value.toLowerCase();
  }
  // A section only means something inside the classroom it belongs to.
  if (ids.batchId && !ids.classroomId) return { ok: false, field: 'batchId' };

  let meeting: TeamsMeetingContext | null = null;
  if (input.meeting !== undefined && input.meeting !== null) {
    if (typeof input.meeting !== 'object' || Array.isArray(input.meeting)) return { ok: false, field: 'meeting' };
    const raw = input.meeting as Record<string, unknown>;
    const context: TeamsMeetingContext = { meetingId: null, chatId: null, channelId: null };
    for (const key of ['meetingId', 'chatId', 'channelId'] as const) {
      const value = raw[key];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string' || value.length > MAX_TEAMS_ID) return { ok: false, field: 'meeting' };
      context[key] = value;
    }
    if (context.meetingId || context.chatId || context.channelId) meeting = context;
  }

  if (input.endExisting !== undefined && typeof input.endExisting !== 'boolean') {
    return { ok: false, field: 'endExisting' };
  }

  return { ok: true, value: { meeting, ...ids, endExisting: input.endExisting === true } };
}

export type BindingSource = 'chosen_class' | 'chosen_classroom' | 'scheduled_class' | 'remembered';

export interface BoundSession {
  kind: 'bound';
  source: BindingSource;
  classroomId: string;
  batchId: string | null;
  scheduledClassId: string | null;
}

export type SessionBinding = BoundSession | { kind: 'choose' };

/**
 * Which class this session is for, in order of how sure we can be:
 *   1. the scheduled class the teacher picked,
 *   2. the classroom the teacher picked (keeping the matched scheduled class
 *      only when it belongs to that classroom),
 *   3. the scheduled class the meeting matched by thread and date,
 *   4. the classroom this meeting series was bound to last time,
 *   5. otherwise ask the teacher, once.
 */
export function decideSessionBinding(input: {
  chosenClass: ScheduledClassCandidate | null;
  chosenClassroomId: string | null;
  chosenBatchId: string | null;
  scheduledMatch: ScheduledClassCandidate | null;
  remembered: { classroom_id: string; batch_id: string | null } | null;
}): SessionBinding {
  const { chosenClass, chosenClassroomId, chosenBatchId, scheduledMatch, remembered } = input;

  if (chosenClass) {
    return {
      kind: 'bound',
      source: 'chosen_class',
      classroomId: chosenClass.classroom_id,
      batchId: chosenClass.batch_id,
      scheduledClassId: chosenClass.id,
    };
  }
  if (chosenClassroomId) {
    const match = scheduledMatch && scheduledMatch.classroom_id === chosenClassroomId ? scheduledMatch : null;
    return {
      kind: 'bound',
      source: 'chosen_classroom',
      classroomId: chosenClassroomId,
      batchId: chosenBatchId ?? match?.batch_id ?? null,
      scheduledClassId: match?.id ?? null,
    };
  }
  if (scheduledMatch) {
    return {
      kind: 'bound',
      source: 'scheduled_class',
      classroomId: scheduledMatch.classroom_id,
      batchId: scheduledMatch.batch_id,
      scheduledClassId: scheduledMatch.id,
    };
  }
  if (remembered) {
    return {
      kind: 'bound',
      source: 'remembered',
      classroomId: remembered.classroom_id,
      batchId: remembered.batch_id,
      scheduledClassId: null,
    };
  }
  return { kind: 'choose' };
}

/**
 * May this teacher run a session for this binding? Mirrors staff-scope.ts:
 * internal staff run any class; an external teacher runs a scheduled class they
 * are the tutor of. Many class rows carry no tutor at all, so for those, and
 * for a classroom with no scheduled class, teaching in that classroom is enough.
 * The enrollment lookup runs only when the answer depends on it.
 */
export async function mayRunSession(
  caller: { internal: boolean; userId: string },
  binding: BoundSession,
  facts: { scheduledClassTeacherId: string | null; teachesClassroom: () => Promise<boolean> },
): Promise<boolean> {
  if (caller.internal) return true;
  if (binding.scheduledClassId && facts.scheduledClassTeacherId) {
    return facts.scheduledClassTeacherId === caller.userId;
  }
  return facts.teachesClassroom();
}
