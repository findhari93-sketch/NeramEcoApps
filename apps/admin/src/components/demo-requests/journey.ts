/**
 * The demo desk works per student, not per request row: one student can have
 * a cancelled first request and a live second one. Tabs follow where the
 * student is in the journey (spec: Demo desk v3, 2026-10-16).
 */
import type { DemoFollowUpRow, DemoRequest } from '@neram/database';

export { meetingKindOf, MEETING_LABELS } from '@/lib/demo/meeting';

export type DeskStage = 'to_call' | 'scheduled' | 'after_demo' | 'joined' | 'closed';

export const DESK_STAGES: Array<{ id: DeskStage; label: string; hint: string }> = [
  { id: 'to_call', label: 'To call', hint: 'Not called yet, or called with no time fixed' },
  { id: 'scheduled', label: 'Scheduled', hint: 'Demo time fixed' },
  { id: 'after_demo', label: 'After demo', hint: 'Follow up until they join or say no' },
  { id: 'joined', label: 'Joined', hint: 'Enrolled after the demo' },
  { id: 'closed', label: 'Closed', hint: 'Not interested, cancelled, or follow-up stopped' },
];

const OPEN_FOLLOW_UP = new Set(['pending', 'scheduled', 'attempted']);
const ACTIVE = new Set<DemoRequest['status']>(['pending', 'contacted', 'approved']);

export function isFollowUpOpen(f: Pick<DemoFollowUpRow, 'status'> | null | undefined): boolean {
  return !!f && OPEN_FOLLOW_UP.has(f.status);
}

/**
 * Where this request's student is.
 * `joinedOn` is undefined when the person has no student profile.
 */
export function stageOf(
  r: Pick<DemoRequest, 'status'>,
  followUp: Pick<DemoFollowUpRow, 'status' | 'call_outcome'> | null | undefined,
  joinedOn: string | null | undefined,
): DeskStage {
  if (joinedOn !== undefined) return 'joined';
  switch (r.status) {
    case 'pending':
    case 'contacted':
      return 'to_call';
    case 'approved':
      return 'scheduled';
    case 'attended':
    case 'no_show':
      if (followUp && followUp.status === 'completed') return followUp.call_outcome === 'joined' ? 'joined' : 'closed';
      return 'after_demo';
    default:
      return 'closed';
  }
}

export interface DeskPerson {
  key: string;
  /** The request the desk works on. */
  current: DemoRequest;
  /** Older requests of the same student, newest first. */
  history: DemoRequest[];
}

const newest = (a: DemoRequest, b: DemoRequest) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

/**
 * One entry per student (user_id, else phone). The current request is the
 * newest open one if any, else the newest. A closed old request never hides a
 * live one.
 */
export function groupByPerson(requests: DemoRequest[]): DeskPerson[] {
  const groups = new Map<string, DemoRequest[]>();
  for (const r of requests) {
    const key = r.user_id ? `u:${r.user_id}` : `p:${(r.phone || r.id).replace(/\D/g, '').slice(-10) || r.id}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const people: DeskPerson[] = [];
  groups.forEach((rows, key) => {
    const sorted = [...rows].sort(newest);
    const current = sorted.find((r) => ACTIVE.has(r.status)) ?? sorted[0];
    people.push({ key, current, history: sorted.filter((r) => r.id !== current.id) });
  });
  return people;
}

const t = (s: string | null | undefined, fallback = Number.MAX_SAFE_INTEGER) => (s ? new Date(s).getTime() : fallback);

/** Order within a tab: what needs a human first. */
export function sortPeople(
  stage: DeskStage,
  people: DeskPerson[],
  followUps: Record<string, DemoFollowUpRow>,
  joinedAt: Record<string, string>,
): DeskPerson[] {
  const copy = [...people];
  const c = (p: DeskPerson) => p.current;
  switch (stage) {
    case 'to_call':
      // Due call-backs first, then whoever has waited longest.
      return copy.sort((a, b) => t(c(a).next_contact_at) - t(c(b).next_contact_at) || t(c(a).created_at) - t(c(b).created_at));
    case 'scheduled':
      return copy.sort((a, b) => t(c(a).scheduled_start) - t(c(b).scheduled_start));
    case 'after_demo':
      // Not started first (needs a date), then the earliest due call.
      return copy.sort((a, b) => {
        const fa = followUps[c(a).id];
        const fb = followUps[c(b).id];
        const da = isFollowUpOpen(fa) ? t(fa!.scheduled_callback_at) : -1;
        const db = isFollowUpOpen(fb) ? t(fb!.scheduled_callback_at) : -1;
        return da - db;
      });
    case 'joined': {
      const j = (p: DeskPerson) => t((p.current.user_id && joinedAt[p.current.user_id]) || p.current.updated_at, 0);
      return copy.sort((a, b) => j(b) - j(a));
    }
    default:
      return copy.sort((a, b) => t(c(b).updated_at, 0) - t(c(a).updated_at, 0));
  }
}

/** Why a closed entry is closed, in a few words. */
export function closedReason(r: DemoRequest, followUp: DemoFollowUpRow | null | undefined): string {
  if (followUp && followUp.status === 'completed' && followUp.call_outcome !== 'joined') {
    const why = (followUp.call_notes || '').replace(/^Reason:\s*/i, '').split('. ')[0];
    return `Follow-up stopped${why ? `: ${why}` : ''}`;
  }
  if (r.status === 'rejected') return `Not interested${r.rejection_reason ? `: ${r.rejection_reason}` : ''}`;
  if (r.status === 'cancelled') return r.cancel_reason || 'Cancelled';
  return '';
}
