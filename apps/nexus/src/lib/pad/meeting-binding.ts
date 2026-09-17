/**
 * Which Nexus class is this Teams meeting?
 *
 * The Answer Pad opens inside a meeting, and Teams tells the tab about the
 * meeting (its id, its chat thread), never about the Nexus class. Nexus already
 * stores each scheduled class's join URL, and the path of that URL carries the
 * same chat thread, so the class is found by thread. A recurring meeting, and
 * every meeting posted in one channel, reuses a thread for weeks, which is why
 * the IST date and the start time decide between instances.
 *
 * Everything here is pure except findScheduledClassForMeeting, which only loads
 * the day's candidates.
 */

export interface MeetingRef {
  /** The chat thread, e.g. 19:meeting_...@thread.v2 or 19:...@thread.tacv2. */
  threadId: string;
  /** Channel meetings only: the channel post the meeting belongs to. */
  messageId: string | null;
}

export interface ScheduledClassCandidate {
  id: string;
  classroom_id: string;
  batch_id: string | null;
  teacher_id: string | null;
  /** YYYY-MM-DD, the IST date the class runs on. */
  scheduled_date: string;
  /** HH:MM or HH:MM:SS, IST. */
  start_time: string | null;
  end_time: string | null;
  teams_meeting_join_url: string | null;
  teams_meeting_url: string | null;
}

export const CLASS_BINDING_COLUMNS =
  'id, classroom_id, batch_id, teacher_id, scheduled_date, start_time, end_time, teams_meeting_join_url, teams_meeting_url';

const THREAD = /19:[^\s#;/?]+@thread\.[a-z0-9]+/i;
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
/** A class that ran late last night still matches this long after it ended. */
const OVERNIGHT_GRACE_MINUTES = 6 * 60;
/** Counted as running from this long before the start (setting up). */
const EARLY_MINUTES = 30;
/** And until this long after the end (overrunning). */
const OVERRUN_MINUTES = 60;

/**
 * From a Teams join URL, for example
 * https://teams.microsoft.com/l/meetup-join/19%3ameeting_...%40thread.v2/0?context=...
 * A channel meeting has the channel post id where a standalone meeting has 0.
 */
export function meetingRefFromJoinUrl(joinUrl: string | null | undefined): MeetingRef | null {
  if (!joinUrl) return null;

  let segments: string[];
  try {
    segments = new URL(joinUrl).pathname.split('/');
  } catch {
    return null;
  }
  const at = segments.indexOf('meetup-join');
  if (at < 0 || !segments[at + 1]) return null;

  let thread: string;
  try {
    thread = decodeURIComponent(segments[at + 1]);
  } catch {
    return null;
  }
  const match = THREAD.exec(thread);
  if (!match) return null;

  const message = segments[at + 2];
  return { threadId: match[0], messageId: message && /^\d+$/.test(message) && message !== '0' ? message : null };
}

/**
 * From what TeamsJS reports inside a meeting. chat.id carries the thread
 * directly (plus ;messageid= for a channel meeting); meeting.id is base64 of a
 * string that embeds it. Formats differ between meeting kinds and clients, so
 * every source is tried in turn and the first thread found wins.
 */
export function meetingRefFromTeamsContext(context: {
  meetingId?: string | null;
  chatId?: string | null;
  channelId?: string | null;
}): MeetingRef | null {
  const sources: string[] = [];
  if (context.chatId) sources.push(context.chatId);
  if (context.meetingId) {
    sources.push(context.meetingId);
    sources.push(Buffer.from(context.meetingId, 'base64').toString('utf-8'));
  }
  if (context.channelId) sources.push(context.channelId);

  for (const source of sources) {
    const thread = THREAD.exec(source);
    if (!thread) continue;
    const message = /messageid=(\d+)/i.exec(source);
    return { threadId: thread[0], messageId: message && message[1] !== '0' ? message[1] : null };
  }
  return null;
}

/** The IST calendar date (YYYY-MM-DD) of an instant. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function istMinutes(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function minutesOf(time: string | null): number | null {
  const match = time ? /^(\d{1,2}):(\d{2})/.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * The scheduled class this meeting is, or null.
 *
 * A candidate matches on the same thread, and on the same channel post when
 * both sides know it, on the IST date of `now`, or the day before for a class
 * that ran past midnight. Among several, the one running now wins, then the one
 * nearest in time, then the lowest id so the answer never flickers.
 */
export function pickScheduledClass(
  candidates: readonly ScheduledClassCandidate[],
  ref: MeetingRef,
  now: Date,
): ScheduledClassCandidate | null {
  const today = istDate(now);
  const yesterday = istDate(new Date(now.getTime() - DAY_MS));
  const nowMinutes = istMinutes(now);
  const thread = ref.threadId.toLowerCase();

  const scored: Array<{ candidate: ScheduledClassCandidate; distance: number }> = [];
  for (const candidate of candidates) {
    if (candidate.scheduled_date !== today && candidate.scheduled_date !== yesterday) continue;

    const classRef = meetingRefFromJoinUrl(candidate.teams_meeting_join_url || candidate.teams_meeting_url);
    if (!classRef || classRef.threadId.toLowerCase() !== thread) continue;
    if (ref.messageId && classRef.messageId && ref.messageId !== classRef.messageId) continue;

    // Place the class on a timeline where today's midnight is 0.
    const dayShift = candidate.scheduled_date === today ? 0 : -24 * 60;
    const rawStart = minutesOf(candidate.start_time) ?? 0;
    let rawEnd = minutesOf(candidate.end_time) ?? rawStart + 60;
    if (rawEnd < rawStart) rawEnd += 24 * 60; // ends after midnight
    const start = rawStart + dayShift;
    const end = rawEnd + dayShift;

    if (dayShift < 0 && end + OVERNIGHT_GRACE_MINUTES < nowMinutes) continue;

    const running = nowMinutes >= start - EARLY_MINUTES && nowMinutes <= end + OVERRUN_MINUTES;
    const distance = running ? 0 : Math.min(Math.abs(nowMinutes - start), Math.abs(nowMinutes - end));
    scored.push({ candidate, distance });
  }

  scored.sort((a, b) => a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id));
  return scored[0]?.candidate ?? null;
}

/** Load today's and yesterday's classes and pick the one this meeting is. */
export async function findScheduledClassForMeeting(
  supabase: any,
  ref: MeetingRef,
  now: Date = new Date(),
): Promise<ScheduledClassCandidate | null> {
  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(CLASS_BINDING_COLUMNS)
    .in('scheduled_date', [istDate(new Date(now.getTime() - DAY_MS)), istDate(now)]);
  if (error) throw error;
  return pickScheduledClass((data || []) as ScheduledClassCandidate[], ref, now);
}
