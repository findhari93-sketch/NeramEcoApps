/** How a confirmed demo meets. Client-safe (no server imports). */
import type { DemoMeetingKind, DemoRequest } from '@neram/database';

/** For rows confirmed before meeting_kind existed too. */
export function meetingKindOf(r: Pick<DemoRequest, 'meeting_kind' | 'graph_event_id' | 'teams_join_url'>): DemoMeetingKind {
  if (r.meeting_kind) return r.meeting_kind;
  if (r.graph_event_id) return 'teams';
  return r.teams_join_url ? 'own_link' : 'later';
}

/**
 * The approved WhatsApp templates promise a Microsoft Teams class, so only a
 * Teams demo messages the student automatically.
 */
export function studentGetsDemoWhatsApp(r: Pick<DemoRequest, 'meeting_kind' | 'graph_event_id' | 'teams_join_url'>): boolean {
  return meetingKindOf(r) === 'teams';
}

export const MEETING_LABELS: Record<DemoMeetingKind, string> = {
  teams: 'Teams meeting',
  own_link: 'Own link',
  later: 'Link not added',
  in_person: 'In person',
};
