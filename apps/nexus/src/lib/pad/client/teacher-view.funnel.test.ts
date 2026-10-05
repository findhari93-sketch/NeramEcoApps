import { describe, expect, it } from 'vitest';
import { classFunnel, funnelGroupLabel, funnelItems, funnelStats } from './teacher-view';
import type { TeacherSnapshot, WaitingStudent } from './types';

type Input = Parameters<typeof classFunnel>[0];

const waitingRow = (student_id: string, over: Partial<WaitingStudent> = {}): WaitingStudent => ({
  student_id,
  name: student_id.toUpperCase(),
  reason: null,
  note: null,
  approval: null,
  nudged_at: null,
  pad_open: true,
  ...over,
});

function input(over: Partial<Input> = {}): Input {
  return {
    readiness: { enrolled: 8, joined: 5, connected: 3, in_meeting: 4 },
    session: { bot_in_meeting: true, presence_basis: 'meeting' } as TeacherSnapshot['session'],
    people: {
      joined: [
        { student_id: 'a', name: 'Asha', source: 'both' },
        { student_id: 'b', name: 'Bala', source: 'pad' },
        { student_id: 'c', name: 'Chitra', source: 'meeting' },
        { student_id: 'd', name: 'Dev', source: 'both' },
        { student_id: 'e', name: 'Esha', source: 'meeting' },
      ],
      not_joined: [
        { student_id: 'f', name: 'Farah' },
        { student_id: 'g', name: 'Gita' },
        { student_id: 'h', name: 'Hari' },
      ],
      away: [{ student_id: 'g', name: 'Gita', reason_code: 'clash', label: 'Away until 12 Oct' }],
      cant_use_pad: [{ student_id: 'e', name: 'Esha' }],
    },
    // a answered; b has not; c is in the meeting only; d gave a reason that was accepted.
    waiting: [waitingRow('b'), waitingRow('c', { pad_open: false }), waitingRow('d', { reason: 'cant_see', approval: 'approved' }), waitingRow('e')],
    prompt: { state: 'open' } as TeacherSnapshot['prompt'],
    ...over,
  };
}

const ids = (rows: Array<{ student_id: string }>) => rows.map((row) => row.student_id);

describe('classFunnel', () => {
  it('puts every student on the class list in exactly one group', () => {
    const funnel = classFunnel(input());
    expect(ids(funnel.groups.answered)).toEqual(['a']);
    expect(ids(funnel.groups.waiting)).toEqual(['b']);
    expect(ids(funnel.groups.no_pad)).toEqual(['c']);
    expect(ids(funnel.groups.excused)).toEqual(['d', 'e']);
    expect(funnel.groups.excused.find((p) => p.student_id === 'e')?.marked).toBe(true);
    expect(ids(funnel.groups.not_here)).toEqual(['f', 'h']);
    expect(funnel.groups.away).toEqual([{ student_id: 'g', name: 'Gita', group: 'away', awayLabel: 'Away until 12 Oct' }]);
  });

  it('counts the class, the expected, the meeting and the pad for the strip', () => {
    const funnel = classFunnel(input());
    expect(funnel).toMatchObject({ enrolled: 8, away: 1, expected: 7, inMeeting: 4, withPad: 3, answered: 1, asking: true });
    expect(funnelItems(funnel)).toEqual(['7 expected', '4 in meeting', '3 with pad', '1 answered']);
  });

  it("draws the strip's numbers with the bar layer each one matches", () => {
    expect(funnelStats(classFunnel(input()))).toEqual([
      { value: '7', label: 'expected', part: null },
      { value: '4', label: 'in meeting', part: 'no_pad' },
      { value: '3', label: 'with pad', part: 'waiting' },
      { value: '1', label: 'answered', part: 'answered' },
    ]);
    const unknown = classFunnel(input({ prompt: null, session: { bot_in_meeting: false, presence_basis: 'app' } as TeacherSnapshot['session'] }));
    expect(funnelStats(unknown).map((stat) => `${stat.value} ${stat.label}`)).toEqual(['8 in class', '7 expected', '? in meeting', '3 with pad']);
  });

  it('says it does not know the meeting count when Teams is not sharing it, never 0', () => {
    const funnel = classFunnel(input({ session: { bot_in_meeting: false, presence_basis: 'app' } as TeacherSnapshot['session'] }));
    expect(funnel.inMeeting).toBeNull();
    expect(funnelItems(funnel)).toContain('meeting ?');
  });

  it('with no question on screen shows the class size and "pad open", not answered', () => {
    const funnel = classFunnel(input({ prompt: null, waiting: [] }));
    expect(funnel.asking).toBe(false);
    expect(ids(funnel.groups.answered)).toEqual([]);
    expect(ids(funnel.groups.waiting)).toEqual(['a', 'b', 'd']);
    expect(funnelItems(funnel)).toEqual(['8 in class', '7 expected', '4 in meeting', '3 with pad']);
    expect(funnelGroupLabel('waiting', false)).toBe('Pad open');
    expect(funnelGroupLabel('waiting', true)).toBe('Not answered');
  });

  it('counts an away student who came anyway as here, not away', () => {
    const funnel = classFunnel(
      input({ people: { ...input().people!, away: [{ student_id: 'a', name: 'Asha', reason_code: null, label: 'Away until 12 Oct' }] } }),
    );
    expect(funnel.away).toBe(0);
    expect(funnel.expected).toBe(8);
    expect(ids(funnel.groups.answered)).toEqual(['a']);
  });

  it('lists reasons waiting for a decision first', () => {
    const funnel = classFunnel(
      input({
        people: { joined: [{ student_id: 'a', name: 'Asha', source: 'pad' }, { student_id: 'z', name: 'Zara', source: 'pad' }], not_joined: [] },
        waiting: [waitingRow('a'), waitingRow('z', { reason: 'need_time' })],
      }),
    );
    expect(ids(funnel.groups.waiting)).toEqual(['z', 'a']);
  });

  it('survives an older server with no people lists', () => {
    const funnel = classFunnel(input({ people: undefined, waiting: undefined }));
    expect(funnel).toMatchObject({ expected: 8, inMeeting: 0, withPad: 0, answered: 0 });
    // Who is waiting is still known, and they are here with the pad.
    const older = classFunnel(input({ people: undefined, waiting: [waitingRow('b'), waitingRow('c')] }));
    expect(ids(older.groups.waiting)).toEqual(['b', 'c']);
    expect(older.withPad).toBe(2);
  });
});
