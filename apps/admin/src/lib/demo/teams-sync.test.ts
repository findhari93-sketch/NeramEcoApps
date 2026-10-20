import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getSupabaseAdminClient: vi.fn(), logDemoRequestEvent: vi.fn() }));
vi.mock('./server', () => ({ loadDemoSettings: vi.fn() }));
vi.mock('@neram/auth', () => ({ getAppOnlyToken: vi.fn() }));

import { hasLiveTeamsMeeting, needsTeamsCheck } from './teams-sync';

// DEMO-JWQ8: 10:00 to 10:45 IST on 20 Oct.
const start = '2026-10-20T04:30:00.000Z';
const base = {
  status: 'approved' as const,
  scheduled_start: start,
  scheduled_minutes: 45,
  graph_event_id: 'AAMk1',
  organizer_upn: 'tamilselvan@neramclasses.com',
  teams_join_url: 'https://teams.microsoft.com/meet/1',
  teams_checked_at: null,
  recording_item_id: null,
  transcript_found_at: null,
  attendance_source: null,
};
const at = (iso: string) => new Date(iso);

describe('needsTeamsCheck', () => {
  it('waits until 10 minutes after the start', () => {
    expect(needsTeamsCheck(base, at('2026-10-20T04:35:00Z'))).toBe(false);
    expect(needsTeamsCheck(base, at('2026-10-20T04:40:00Z'))).toBe(true);
  });

  it('checks every 10 minutes right after the class, then every 30, then every 6 hours, for a week', () => {
    const checked = (iso: string) => ({ ...base, teams_checked_at: iso });
    expect(needsTeamsCheck(checked('2026-10-20T05:20:00Z'), at('2026-10-20T05:25:00Z'))).toBe(false);
    expect(needsTeamsCheck(checked('2026-10-20T05:20:00Z'), at('2026-10-20T05:30:00Z'))).toBe(true);
    expect(needsTeamsCheck(checked('2026-10-20T10:00:00Z'), at('2026-10-20T10:20:00Z'))).toBe(false);
    expect(needsTeamsCheck(checked('2026-10-20T10:00:00Z'), at('2026-10-20T10:30:00Z'))).toBe(true);
    expect(needsTeamsCheck(checked('2026-10-22T00:00:00Z'), at('2026-10-22T05:00:00Z'))).toBe(false);
    expect(needsTeamsCheck(checked('2026-10-22T00:00:00Z'), at('2026-10-22T06:00:00Z'))).toBe(true);
    expect(needsTeamsCheck(base, at('2026-10-27T05:00:00Z'))).toBe(false);
  });

  it('stops once the outcome is settled and the recording and transcript are in', () => {
    const later = at('2026-10-20T06:00:00Z');
    const done = { recording_item_id: 'item1', transcript_found_at: '2026-10-20T05:40:00Z' };
    expect(needsTeamsCheck({ ...base, status: 'attended', recording_item_id: 'item1' }, later)).toBe(true);
    expect(needsTeamsCheck({ ...base, status: 'attended', ...done }, later)).toBe(false);
    expect(needsTeamsCheck({ ...base, ...done }, later)).toBe(true);
  });

  it('keeps watching a Teams No-show for a late student, but not a staff one', () => {
    const done = { recording_item_id: 'item1', transcript_found_at: '2026-10-20T05:40:00Z' };
    expect(needsTeamsCheck({ ...base, status: 'no_show', attendance_source: 'teams', ...done }, at('2026-10-20T06:30:00Z'))).toBe(true);
    expect(needsTeamsCheck({ ...base, status: 'no_show', attendance_source: 'staff', ...done }, at('2026-10-20T06:30:00Z'))).toBe(false);
    expect(needsTeamsCheck({ ...base, status: 'no_show', attendance_source: 'teams', ...done }, at('2026-10-20T09:00:00Z'))).toBe(false);
  });

  it('skips cancelled, dry-run and non-desk meetings', () => {
    const later = at('2026-10-20T06:00:00Z');
    expect(needsTeamsCheck({ ...base, graph_event_id: 'cancelled:AAMk1' }, later)).toBe(false);
    expect(needsTeamsCheck({ ...base, graph_event_id: 'dry-run-DEMO-1' }, later)).toBe(false);
    expect(needsTeamsCheck({ ...base, status: 'cancelled' as never }, later)).toBe(false);
    expect(hasLiveTeamsMeeting({ ...base, organizer_upn: null })).toBe(false);
  });
});
