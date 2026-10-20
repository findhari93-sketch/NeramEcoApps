// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';

/**
 * Instant UPI is offered only while a watcher is alive. Pinned: a heartbeat
 * records the source; health is "any source seen within the window"; a silence
 * rings the staff bell once, and again only after the watcher came back.
 */
const bell = vi.fn(async () => undefined);
vi.mock('../../queries/notifications', () => ({ createAdminNotification: (...a: unknown[]) => bell(...(a as [])) }));

import { recordHeartbeat, watcherHealth, notifySilence } from './health';

const NOW = new Date('2026-10-21T04:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000).toISOString();

let db: FakeDb;
beforeEach(() => {
  db = fakeDb({ watcher_heartbeats: [] });
  bell.mockClear();
});

describe('recordHeartbeat', () => {
  it('creates and then refreshes a source row, clearing any silence notice', async () => {
    await recordHeartbeat(db.client, { source: 'sms:office-phone', appVersion: '1.2', now: NOW });
    expect(db.rows('watcher_heartbeats')[0]).toMatchObject({ source: 'sms:office-phone', last_seen_at: NOW.toISOString(), app_version: '1.2' });
    db.rows('watcher_heartbeats')[0].silent_notified_at = minutesAgo(30);
    const later = new Date(NOW.getTime() + 60 * 1000);
    await recordHeartbeat(db.client, { source: 'sms:office-phone', now: later, event: true });
    expect(db.rows('watcher_heartbeats')).toHaveLength(1);
    expect(db.rows('watcher_heartbeats')[0]).toMatchObject({ last_seen_at: later.toISOString(), last_event_at: later.toISOString(), silent_notified_at: null });
  });
});

describe('watcherHealth', () => {
  it('is healthy when any source was seen within the window', async () => {
    db = fakeDb({ watcher_heartbeats: [{ source: 'sms:office-phone', last_seen_at: minutesAgo(25) }, { source: 'email', last_seen_at: minutesAgo(3) }] });
    const h = await watcherHealth(db.client, 10, NOW);
    expect(h.healthy).toBe(true);
    expect(h.sources.map((s) => [s.source, s.minutesAgo])).toEqual([['sms:office-phone', 25], ['email', 3]]);
  });
  it('is unhealthy with no heartbeat at all, or only stale ones', async () => {
    expect((await watcherHealth(db.client, 10, NOW)).healthy).toBe(false);
    db = fakeDb({ watcher_heartbeats: [{ source: 'email', last_seen_at: minutesAgo(11) }] });
    expect((await watcherHealth(db.client, 10, NOW)).healthy).toBe(false);
  });
});

describe('notifySilence', () => {
  it('rings once per silence and marks the source', async () => {
    db = fakeDb({ watcher_heartbeats: [{ source: 'email', last_seen_at: minutesAgo(15), silent_notified_at: null }, { source: 'sms:office-phone', last_seen_at: minutesAgo(2) }] });
    const first = await notifySilence(db.client, { silentAfterMinutes: 10, now: NOW });
    expect(first).toEqual(['email']);
    expect(bell).toHaveBeenCalledTimes(1);
    expect((bell.mock.calls[0] as any[])[0].title).toMatch(/silent/i);
    expect(db.rows('watcher_heartbeats')[0].silent_notified_at).toBeTruthy();
    const second = await notifySilence(db.client, { silentAfterMinutes: 10, now: NOW });
    expect(second).toEqual([]);
    expect(bell).toHaveBeenCalledTimes(1);
  });
});

describe('watcherHealth: the SMS watcher decides Instant UPI', () => {
  it('reports smsHealthy only when a sms:* source is fresh, even while the Gmail script is alive', async () => {
    db = fakeDb({ watcher_heartbeats: [{ source: 'sms:office-phone', last_seen_at: minutesAgo(25) }, { source: 'email', last_seen_at: minutesAgo(3) }] });
    const h = await watcherHealth(db.client, 10, NOW);
    expect(h.healthy).toBe(true);
    expect(h.smsHealthy).toBe(false);
    db = fakeDb({ watcher_heartbeats: [{ source: 'sms:office-phone', last_seen_at: minutesAgo(2) }] });
    expect((await watcherHealth(db.client, 10, NOW)).smsHealthy).toBe(true);
  });
});
