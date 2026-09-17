// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isNewerSnapshot, mergeSnapshot, type OrderedSnapshot } from './snapshot-merge';

function snap(overrides: {
  id?: string;
  status?: 'live' | 'ended';
  sequence?: number | null;
  version?: number;
  time?: string;
  label?: string;
}): OrderedSnapshot & { label: string } {
  return {
    label: overrides.label ?? 'snapshot',
    server_time: overrides.time ?? '2026-09-10T10:00:00.000Z',
    session: { id: overrides.id ?? 'session-1', status: overrides.status ?? 'live' },
    prompt: overrides.sequence === null ? null : { sequence: overrides.sequence ?? 1, version: overrides.version ?? 1 },
  };
}

describe('isNewerSnapshot', () => {
  it('takes the first snapshot a screen receives', () => {
    expect(isNewerSnapshot(snap({}), null)).toBe(true);
    expect(isNewerSnapshot(snap({}), undefined)).toBe(true);
  });

  it('never lets a late OPEN overwrite the CLOSE that followed it', () => {
    const closed = snap({ version: 2, time: '2026-09-10T10:00:05Z' });
    const staleOpen = snap({ version: 1, time: '2026-09-10T10:00:01Z' });
    expect(isNewerSnapshot(staleOpen, closed)).toBe(false);
    expect(isNewerSnapshot(closed, staleOpen)).toBe(true);
  });

  it('puts the next question ahead of any version of the previous one', () => {
    const q1Revealed = snap({ sequence: 1, version: 5 });
    const q2Open = snap({ sequence: 2, version: 1 });
    expect(isNewerSnapshot(q2Open, q1Revealed)).toBe(true);
    expect(isNewerSnapshot(q1Revealed, q2Open)).toBe(false);
  });

  it('puts a prompt ahead of the idle session before the first ASK', () => {
    expect(isNewerSnapshot(snap({ sequence: 1 }), snap({ sequence: null }))).toBe(true);
    expect(isNewerSnapshot(snap({ sequence: null }), snap({ sequence: 1 }))).toBe(false);
  });

  it('uses the database clock when only the counts moved', () => {
    const earlier = snap({ time: '2026-09-10T10:00:01.100Z' });
    const later = snap({ time: '2026-09-10T10:00:01.300Z' });
    expect(isNewerSnapshot(later, earlier)).toBe(true);
    expect(isNewerSnapshot(earlier, later)).toBe(false);
  });

  it('keeps an ended session ended, whatever a slower response says', () => {
    const ended = snap({ status: 'ended', version: 3, time: '2026-09-10T10:05:00Z' });
    const lateLive = snap({ status: 'live', version: 4, time: '2026-09-10T10:06:00Z' });
    expect(isNewerSnapshot(lateLive, ended)).toBe(false);
  });

  it('always takes a snapshot of a different session', () => {
    const replacement = snap({ id: 'session-2', sequence: null, time: '2026-09-10T09:00:00Z' });
    expect(isNewerSnapshot(replacement, snap({ status: 'ended', sequence: 7 }))).toBe(true);
  });

  it('treats an unreadable server time as the oldest possible', () => {
    expect(isNewerSnapshot(snap({ time: 'garbage' }), snap({ time: '2026-09-10T10:00:00Z' }))).toBe(false);
    expect(isNewerSnapshot(snap({ time: '2026-09-10T10:00:00Z' }), snap({ time: 'garbage' }))).toBe(true);
  });

  it('replaces on an exact tie, which changes nothing a student could notice', () => {
    expect(isNewerSnapshot(snap({}), snap({}))).toBe(true);
  });
});

describe('mergeSnapshot', () => {
  it('returns the snapshot to keep, never a mixture', () => {
    const current = snap({ version: 2, label: 'current' });
    expect(mergeSnapshot(current, snap({ version: 1, label: 'late' })).label).toBe('current');
    expect(mergeSnapshot(current, snap({ version: 3, label: 'newer' })).label).toBe('newer');
    expect(mergeSnapshot(null, snap({ label: 'first' })).label).toBe('first');
  });
});
