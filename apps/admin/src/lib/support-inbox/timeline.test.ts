// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SupportTicketActivity, SupportTicketComment } from '@neram/database';
import { activityText, buildTimeline, timeAgo } from './timeline';
import { REPLY_TEMPLATES, applyTemplate } from './reply-templates';

const comment = (id: string, at: string, over: Partial<SupportTicketComment> = {}): SupportTicketComment => ({
  id,
  ticket_id: 't',
  user_id: 'u',
  user_name: 'Priya',
  is_admin: false,
  is_internal: false,
  content: `message ${id}`,
  created_at: at,
  ...over,
});

const act = (id: string, at: string, action: SupportTicketActivity['action'], over: Partial<SupportTicketActivity> = {}): SupportTicketActivity => ({
  id,
  ticket_id: 't',
  actor_id: 's1',
  actor_name: 'Hari',
  action,
  old_status: null,
  new_status: null,
  reason: null,
  metadata: {},
  visible_to_student: true,
  created_at: at,
  ...over,
});

describe('buildTimeline', () => {
  it('merges messages and activity oldest first', () => {
    const items = buildTimeline(
      [comment('c2', '2026-10-16T10:00:00Z'), comment('c1', '2026-10-16T08:00:00Z', { is_admin: true, is_internal: true, user_name: 'Hari' })],
      [act('a1', '2026-10-16T07:00:00Z', 'created', { actor_name: 'Priya' }), act('a2', '2026-10-16T09:00:00Z', 'started')],
      'Priya'
    );
    expect(items.map((i) => i.id)).toEqual(['a-a1', 'c-c1', 'a-a2', 'c-c2']);
    const note = items[1];
    expect(note.kind === 'message' && note.internal && note.side === 'staff').toBe(true);
    expect(items[0].kind === 'event' && items[0].text).toBe('Priya raised this ticket');
  });

  it('shows a composer move\'s words once, not on both the message and the event', () => {
    const items = buildTimeline(
      [comment('c1', '2026-10-16T10:00:03Z', { is_admin: true, content: 'Fixed the loader, please check.' })],
      [act('a1', '2026-10-16T10:00:01Z', 'resolved', { reason: 'Fixed the loader, please check.', metadata: { resolution_code: 'fixed' } })]
    );
    const event = items.find((i) => i.kind === 'event');
    expect(event?.kind === 'event' && event.reason).toBeNull();
    expect(event?.kind === 'event' && event.text).toBe('Hari resolved this as Fixed, waiting for confirmation');
  });

  it('keeps a reason that has no matching message', () => {
    const items = buildTimeline([], [act('a1', '2026-10-16T10:00:00Z', 'closed', { reason: 'Covered elsewhere', metadata: { resolution_code: 'duplicate' } })]);
    expect(items[0].kind === 'event' && items[0].reason).toBe('Covered elsewhere');
  });

  it('marks staff-only activity', () => {
    const items = buildTimeline([], [act('a1', '2026-10-16T10:00:00Z', 'priority_changed', { visible_to_student: false, metadata: { from: 'low', to: 'high' } })]);
    expect(items[0].kind === 'event' && items[0].staffOnly).toBe(true);
    expect(items[0].kind === 'event' && items[0].text).toBe('Hari changed priority from Low to High');
  });
});

describe('activityText', () => {
  it('describes the cron close', () => {
    expect(activityText(act('a', 'x', 'auto_closed', { actor_id: null, actor_name: 'Neram Support', metadata: { resolution_code: 'no_response' } })).text).toBe(
      'Closed on its own: no reply in time'
    );
  });
  it('tells self-assignment apart', () => {
    expect(activityText(act('a', 'x', 'assigned', { metadata: { assignee_id: 's1', assignee_name: 'Hari' } })).text).toBe('Hari took this ticket');
    expect(activityText(act('a', 'x', 'assigned', { metadata: { assignee_id: 's2', assignee_name: 'Priya' } })).text).toBe('Hari assigned this to Priya');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  it('reads naturally', () => {
    expect(timeAgo('2026-10-17T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-17T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-10-17T07:00:00Z', now)).toBe('5 h ago');
    expect(timeAgo('2026-10-14T12:00:00Z', now)).toBe('3 d ago');
    expect(timeAgo(null, now)).toBe('');
  });
});

describe('reply templates', () => {
  it('have no em dashes or double dashes', () => {
    for (const t of REPLY_TEMPLATES) {
      expect(t.text + t.label).not.toMatch(/—|--/);
    }
  });
  it('applyTemplate fills an empty draft and appends to a written one', () => {
    const t = REPLY_TEMPLATES[0];
    expect(applyTemplate('', t)).toBe(t.text);
    expect(applyTemplate('Hi  ', t)).toBe(`Hi\n\n${t.text}`);
  });
});
