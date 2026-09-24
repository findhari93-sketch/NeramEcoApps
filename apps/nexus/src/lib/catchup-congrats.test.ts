import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./nudge-delivery', () => ({
  sendNudge: vi.fn(async () => ({ results: [], counts: {} })),
  plainToHtmlWithLink: (t: string) => `<p>${t}</p>`,
}));

let flagOverrides: Record<string, boolean> = {};
vi.mock('@neram/database', () => ({
  getNexusSetting: vi.fn(async () => ({ value: flagOverrides })),
  istTodayYmd: () => '2026-09-24',
}));

let backlog: any = null;
vi.mock('./catchup-cohort', () => ({
  loadClassroomBacklog: vi.fn(async () => new Map(backlog ? [['s1', backlog]] : [])),
}));

import { sendNudge } from './nudge-delivery';
import {
  congratulateClears,
  itemClearedMessage,
  allClearMessage,
  isQuick,
} from './catchup-congrats';

const NOW = new Date('2026-09-24T10:00:00Z');

interface Fx {
  claimable?: any[];
  classes?: any[];
  celebrations?: any[];
  claimError?: any;
}

function fakeSupabase(fx: Fx) {
  const inserts: { table: string; row: any }[] = [];
  let claimCalls = 0;
  const api = {
    inserts,
    get claimCalls() {
      return claimCalls;
    },
    from(table: string) {
      const b: any = {
        _update: false,
        update() {
          b._update = true;
          return b;
        },
        select: () => b,
        eq: () => b,
        is: () => b,
        not: () => b,
        in: () => b,
        insert(row: any) {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        then(resolve: any) {
          if (table === 'nexus_class_absences' && b._update) {
            claimCalls += 1;
            if (fx.claimError) return resolve({ data: null, error: fx.claimError });
            // A second claim finds nothing: the first one stamped them.
            const rows = claimCalls === 1 ? fx.claimable || [] : [];
            return resolve({ data: rows, error: null });
          }
          if (table === 'nexus_scheduled_classes') return resolve({ data: fx.classes || [], error: null });
          if (table === 'nexus_catchup_celebrations') return resolve({ data: fx.celebrations || [], error: null });
          return resolve({ data: [], error: null });
        },
      };
      return b;
    },
  };
  return api;
}

const CLS = { id: 'c1', title: 'Pritzker Prize', scheduled_date: '2026-09-22' };

function openBacklog(open: number, blocked = 0) {
  return { studentId: 's1', items: [], resolved: [], openCount: open, blockedOnUs: blocked, ownOpen: open, clock: {} };
}

function clearBacklog(items: any[]) {
  return {
    studentId: 's1',
    items,
    resolved: items.map(() => ({ status: 'done' })),
    openCount: 0,
    blockedOnUs: 0,
    ownOpen: 0,
    clock: {},
  };
}

beforeEach(() => {
  vi.mocked(sendNudge).mockClear();
  flagOverrides = {};
  backlog = null;
});

describe('messages', () => {
  it('names one class, says it was quick, counts what is left', () => {
    expect(
      itemClearedMessage([{ title: 'Pritzker Prize', scheduled_date: '2026-09-22', caught_up_at: '2026-09-23T10:00:00Z' }], 2, 0),
    ).toBe('Nice work, {firstName}. You caught up on "Pritzker Prize" (22 Sep). That was quick. 2 classes left on your list.');
  });

  it('batches several and explains a list held up by us', () => {
    const s = itemClearedMessage(
      [
        { title: 'A', scheduled_date: '2026-09-01', caught_up_at: '2026-09-23T10:00:00Z' },
        { title: 'B', scheduled_date: '2026-09-02', caught_up_at: '2026-09-23T10:00:00Z' },
      ],
      0,
      1,
    );
    expect(s).toContain('You caught up on 2 classes: "A", "B".');
    expect(s).not.toContain('quick');
    expect(s).toContain('waiting on us');
  });

  it('the all-clear message is bigger and says so', () => {
    expect(allClearMessage(9, 6)).toContain('all 9 classes you missed');
    expect(allClearMessage(9, 6)).toContain('Most of them within 2 days');
    expect(allClearMessage(1, 1)).toContain('the class you missed');
  });

  it('quick means within two days of the class, in IST', () => {
    expect(isQuick({ title: null, scheduled_date: '2026-09-20', caught_up_at: '2026-09-22T17:00:00Z' })).toBe(true);
    // 21:00 UTC on the 22nd is the 23rd in India: three days.
    expect(isQuick({ title: null, scheduled_date: '2026-09-20', caught_up_at: '2026-09-22T21:00:00Z' })).toBe(false);
  });
});

describe('congratulateClears', () => {
  it('sends one item message for a fresh clear, and nothing on a second call', async () => {
    const sb = fakeSupabase({
      claimable: [{ id: 'a1', scheduled_class_id: 'c1', caught_up_at: '2026-09-24T09:00:00Z' }],
      classes: [CLS],
    });
    backlog = openBacklog(2);
    const first = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(first).toMatchObject({ claimed: 1, messaged: 'item' });
    expect(sendNudge).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendNudge).mock.calls[0][0];
    expect(call.eventType).toBe('catchup_item_cleared');
    expect(call.studentIds).toEqual(['s1']);
    // A system message: no teacher named, no group post.
    expect(call.teacher).toBeUndefined();
    expect(call.group).toBeUndefined();

    const second = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(second).toMatchObject({ claimed: 0, messaged: 'none' });
    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it('claims a stale clear silently', async () => {
    const sb = fakeSupabase({
      claimable: [{ id: 'a1', scheduled_class_id: 'c1', caught_up_at: '2026-09-10T09:00:00Z' }],
      classes: [CLS],
    });
    const r = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(r).toMatchObject({ claimed: 1, messaged: 'none', skipped: 'stale' });
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('sends only the big message when the clear empties the list, and records it', async () => {
    const sb = fakeSupabase({
      claimable: [{ id: 'a1', scheduled_class_id: 'c1', caught_up_at: '2026-09-24T09:00:00Z' }],
      classes: [CLS],
    });
    backlog = clearBacklog([{ kind: 'no_show', class: CLS, caught_up_at: '2026-09-24T09:00:00Z' }]);
    const r = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(r.messaged).toBe('all_clear');
    expect(sendNudge).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendNudge).mock.calls[0][0].eventType).toBe('catchup_all_clear');
    expect(sb.inserts).toHaveLength(1);
    expect(sb.inserts[0]).toMatchObject({ table: 'nexus_catchup_celebrations', row: { source: 'auto', student_id: 's1' } });
  });

  it('does not repeat the big message when already congratulated for this slate', async () => {
    const sb = fakeSupabase({
      claimable: [{ id: 'a1', scheduled_class_id: 'c1', caught_up_at: '2026-09-24T09:00:00Z' }],
      classes: [CLS],
      celebrations: [
        { id: 'x', student_id: 's1', source: 'auto', last_cleared_at: '2026-09-24T09:00:00Z', celebrated_at: '2026-09-24T09:01:00Z' },
      ],
    });
    backlog = clearBacklog([{ kind: 'no_show', class: CLS, caught_up_at: '2026-09-24T09:00:00Z' }]);
    const r = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(r.messaged).toBe('item');
    expect(sb.inserts).toHaveLength(0);
  });

  it('fires the big message again after clearing a new class since the last one', async () => {
    const sb = fakeSupabase({
      claimable: [{ id: 'a2', scheduled_class_id: 'c1', caught_up_at: '2026-09-24T09:00:00Z' }],
      classes: [CLS],
      celebrations: [
        { id: 'x', student_id: 's1', source: 'auto', last_cleared_at: '2026-09-15T09:00:00Z', celebrated_at: '2026-09-15T09:01:00Z' },
      ],
    });
    backlog = clearBacklog([{ kind: 'no_show', class: CLS, caught_up_at: '2026-09-24T09:00:00Z' }]);
    const r = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(r.messaged).toBe('all_clear');
  });

  it('sends nothing, and claims nothing, when the switch is off', async () => {
    flagOverrides = { 'staff.catchup-auto-congrats': false };
    const sb = fakeSupabase({ claimable: [{ id: 'a1', scheduled_class_id: 'c1', caught_up_at: '2026-09-24T09:00:00Z' }] });
    const r = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(r).toMatchObject({ messaged: 'none', skipped: 'switched off' });
    expect(sb.claimCalls).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('never throws when the column is missing', async () => {
    const sb = fakeSupabase({ claimError: { code: '42703', message: 'column does not exist' } });
    const r = await congratulateClears(sb, { studentId: 's1', classroomId: 'r1', now: NOW });
    expect(r.messaged).toBe('none');
    expect(sendNudge).not.toHaveBeenCalled();
  });
});
