/**
 * Can students present in the meeting a round is running in, and can we stop it?
 *
 * The console asks once when a round starts. A student who presses Teams' own
 * Share replaces the teacher's screen share (2026-09-30), and the only control
 * over that is the meeting's "Who can present". The pad's Teams SSO token
 * cannot call Graph, so this reads and writes with the app-only token on the
 * organizer's meeting, which needs OnlineMeetings.ReadWrite.All.
 */

import { getAppOnlyToken } from '@/lib/graph-app-token';
import {
  applyMeetingOptions,
  findOnlineMeetingId,
  readAllowedPresenters,
  type AllowedPresenters,
} from '@/lib/meeting-options';
import { TtlCache } from '@/lib/ttl-cache';
import { padDb } from './sessions';

export type PresenterState = 'locked' | 'open' | 'unknown';

export interface PresenterCheck {
  state: PresenterState;
  allowedPresenters: AllowedPresenters | null;
  /** Whether a POST can lock it. False when we could not find or read the meeting. */
  canFix: boolean;
}

interface MeetingRef {
  ownerOid: string;
  meetingId: string | null;
  joinUrl: string | null;
}

/** Five minutes: the console asks at round start, and Teams settings rarely move mid-class. */
const checkCache = new TtlCache<PresenterCheck>(5 * 60_000, 200);

/** Test seam. */
export function __clearPresenterCache(): void {
  checkCache.clear();
}

const UNKNOWN: PresenterCheck = { state: 'unknown', allowedPresenters: null, canFix: false };

async function meetingFor(sessionId: string): Promise<MeetingRef | null> {
  const db = padDb();
  const { data: session, error } = await db
    .from('pad_sessions')
    .select('scheduled_class_id, teacher_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session?.scheduled_class_id) return null;

  const { data: cls, error: clsError } = await db
    .from('nexus_scheduled_classes')
    .select('online_meeting_id, organizer_ms_oid, teams_meeting_join_url, teams_meeting_url')
    .eq('id', session.scheduled_class_id)
    .maybeSingle();
  if (clsError) throw clsError;
  if (!cls) return null;

  let ownerOid: string | null = cls.organizer_ms_oid ?? null;
  if (!ownerOid) {
    // The class has not been through attendance sync yet; the teacher who
    // scheduled it is usually the organizer.
    const { data: teacher } = await db.from('users').select('ms_oid').eq('id', session.teacher_id).maybeSingle();
    ownerOid = teacher?.ms_oid ?? null;
  }
  if (!ownerOid) return null;
  return {
    ownerOid,
    meetingId: cls.online_meeting_id ?? null,
    joinUrl: cls.teams_meeting_join_url || cls.teams_meeting_url || null,
  };
}

function stateOf(allowed: AllowedPresenters | null): PresenterState {
  if (!allowed) return 'unknown';
  return allowed === 'organizer' ? 'locked' : 'open';
}

/**
 * Read (and, with `lock`, fix) who may present. Never throws for a Graph
 * problem: an unreadable meeting is `unknown`, and the console then shows the
 * manual path in Teams' Meeting options.
 */
export async function checkSessionPresenters(sessionId: string, options: { lock?: boolean } = {}): Promise<PresenterCheck> {
  if (!options.lock) {
    const cached = checkCache.get(sessionId);
    if (cached) return cached;
  }

  const ref = await meetingFor(sessionId);
  if (!ref) return UNKNOWN;

  let result: PresenterCheck = UNKNOWN;
  try {
    const token = await getAppOnlyToken();
    const owner = { kind: 'user' as const, oid: ref.ownerOid };
    const meetingId = ref.meetingId || (ref.joinUrl ? await findOnlineMeetingId(token, owner, ref.joinUrl) : null);
    if (!meetingId) return UNKNOWN;

    if (options.lock) {
      const applied = await applyMeetingOptions(token, owner, meetingId, { allowedPresenters: 'organizer' });
      if (!applied.presenters) {
        console.error(`[pad] could not lock presenters for session ${sessionId}: Graph ${applied.status}`);
      }
    }
    const read = await readAllowedPresenters(token, owner, meetingId);
    result = { state: stateOf(read.allowedPresenters), allowedPresenters: read.allowedPresenters, canFix: read.allowedPresenters !== null };
  } catch (err) {
    console.error('[pad] presenter check failed:', err);
    return UNKNOWN;
  }

  checkCache.set(sessionId, result);
  return result;
}
