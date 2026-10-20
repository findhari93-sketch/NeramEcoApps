/**
 * Pure parts of the demo Teams check, safe to import in client components:
 * the stored shapes, merging attendance, matching recordings to a demo.
 */

import type { DemoRequest } from '@neram/database';
import type { DemoVerdict } from './demo-verdict';

export interface DemoAttendee {
  name: string;
  email: string | null;
  role: string | null;
  /** Neram staff (our tenant, our domain, or a demo team member). */
  staff: boolean;
  seconds: number;
  firstJoin: string | null;
  lastLeave: string | null;
  /** Every join and leave, all reports merged. Older checks did not store these. */
  intervals?: Array<{ join: string; leave: string }>;
}

export interface DemoRecordingFile {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  createdAt: string;
  size: number;
  durationMs: number | null;
}

/** The demo_class_registrations columns this module owns (migration 20261214090000). */
export interface DemoTeamsFields {
  teams_meeting_id: string | null;
  teams_attendance: DemoAttendee[] | null;
  teams_checked_at: string | null;
  teams_check_note: string | null;
  recording_candidates: DemoRecordingFile[] | null;
  recording_drive_id: string | null;
  recording_item_id: string | null;
  recording_name: string | null;
  recording_web_url: string | null;
  recording_picked_by: string | null;
  recording_picked_at: string | null;
  attendance_source: 'teams' | 'staff' | null;
  teams_verdict: DemoVerdict | null;
  transcript_found_at: string | null;
}

export type DemoWithTeams = DemoRequest & Partial<DemoTeamsFields>;

export interface GraphAttendanceRecord {
  emailAddress?: string | null;
  totalAttendanceInSeconds?: number | null;
  role?: string | null;
  identity?: { id?: string | null; displayName?: string | null; tenantId?: string | null } | null;
  attendanceIntervals?: Array<{ joinDateTime?: string | null; leaveDateTime?: string | null }> | null;
}

// Not 'presenter': when the meeting options did not apply, Teams makes every guest a presenter.
const STAFF_ROLES = new Set(['organizer', 'coorganizer']);
const ORG_DOMAIN = '@neramclasses.com';

/** One row per person across every report of the meeting (a test run and the real class both count). */
export function mergeAttendance(
  records: GraphAttendanceRecord[],
  opts: { orgTenantId: string | null; staffEmails: string[] },
): DemoAttendee[] {
  const staffEmails = new Set(opts.staffEmails.map((e) => e.toLowerCase()));
  const byKey = new Map<string, DemoAttendee>();
  for (const r of records) {
    const email = r.emailAddress?.trim().toLowerCase() || null;
    const name = r.identity?.displayName?.trim() || email || 'Guest';
    const key = r.identity?.id || email || name.toLowerCase();
    const joins = (r.attendanceIntervals ?? []).map((i) => i.joinDateTime).filter(Boolean) as string[];
    const leaves = (r.attendanceIntervals ?? []).map((i) => i.leaveDateTime).filter(Boolean) as string[];
    const spans = (r.attendanceIntervals ?? [])
      .filter((i) => i.joinDateTime && i.leaveDateTime)
      .map((i) => ({ join: i.joinDateTime!, leave: i.leaveDateTime! }));
    const staff =
      (!!email && (email.endsWith(ORG_DOMAIN) || staffEmails.has(email))) ||
      (!!opts.orgTenantId && r.identity?.tenantId === opts.orgTenantId) ||
      STAFF_ROLES.has((r.role || '').toLowerCase());
    const prev = byKey.get(key);
    const first = [prev?.firstJoin, ...joins].filter(Boolean).sort()[0] ?? null;
    const last = [prev?.lastLeave, ...leaves].filter(Boolean).sort().pop() ?? null;
    byKey.set(key, {
      name: prev?.name ?? name,
      email: prev?.email ?? email,
      role: prev?.role ?? r.role ?? null,
      staff: (prev?.staff ?? false) || staff,
      seconds: (prev?.seconds ?? 0) + Math.max(0, r.totalAttendanceInSeconds ?? 0),
      firstJoin: first,
      lastLeave: last,
      intervals: [...(prev?.intervals ?? []), ...spans].sort((a, b) => a.join.localeCompare(b.join)),
    });
  }
  return [...byKey.values()].sort((a, b) => Number(a.staff) - Number(b.staff) || b.seconds - a.seconds);
}

/** People outside Neram who were in the meeting: the student, parents, or someone who opened the link. */
export function guestsWhoJoined(list: DemoAttendee[] | null | undefined): DemoAttendee[] {
  return (list ?? []).filter((a) => !a.staff && a.seconds > 0);
}

export interface GraphDriveItem {
  id: string;
  name: string;
  webUrl: string;
  createdDateTime: string;
  size?: number;
  file?: { mimeType?: string } | null;
  video?: { duration?: number } | null;
  parentReference?: { driveId?: string } | null;
}

/**
 * Recordings of this demo: Teams names the file after the meeting subject,
 * which carries the booking ref ("Neram Demo · Priya R (Class 12) · DEMO-4K7Q-20261020_100212-Meeting Recording.mp4").
 */
export function demoRecordingCandidates(items: GraphDriveItem[], ref: string): DemoRecordingFile[] {
  const needle = ref.trim().toLowerCase();
  if (!needle) return [];
  return items
    .filter((i) => (i.file?.mimeType?.startsWith('video/') || /\.mp4$/i.test(i.name)) && i.name.toLowerCase().includes(needle))
    .map((i) => ({
      driveId: i.parentReference?.driveId ?? '',
      itemId: i.id,
      name: i.name,
      webUrl: i.webUrl,
      createdAt: i.createdDateTime,
      size: i.size ?? 0,
      durationMs: typeof i.video?.duration === 'number' ? i.video.duration : null,
    }))
    .filter((f) => f.driveId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A Teams meeting the desk created and still owns (not cancelled, not a dry run). */
export function hasLiveTeamsMeeting(r: Pick<DemoWithTeams, 'graph_event_id' | 'organizer_upn' | 'teams_join_url'>): boolean {
  const id = r.graph_event_id || '';
  return !!id && !id.startsWith('cancelled:') && !id.startsWith('dry-run-') && !!r.organizer_upn && !!r.teams_join_url;
}
