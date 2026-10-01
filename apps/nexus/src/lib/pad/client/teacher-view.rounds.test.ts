import { describe, expect, it } from 'vitest';
import { deriveConsoleView, groupParticipation, namesByAnswer, namesPreview, revealSummary, roundTitle, unansweredNames, waitingView } from './teacher-view';
import type { ParticipationRow, PromptCounts, TeacherSnapshot, WaitingStudent } from './types';

const waiting = (over: Partial<WaitingStudent>): WaitingStudent => ({
  student_id: 'x',
  name: 'X',
  reason: null,
  note: null,
  approval: null,
  nudged_at: null,
  pad_open: true,
  ...over,
});

const row = (over: Partial<ParticipationRow>): ParticipationRow => ({
  student_id: 'x',
  name: 'X',
  on_roster: true,
  participation: 'answered',
  result: null,
  answer: 'A',
  joined_mid_prompt: false,
  ...over,
});

describe('round console views', () => {
  it('counts the open question out of who joined, less the excused', () => {
    const snapshot = {
      session: { status: 'live' },
      readiness: { enrolled: 39, connected: 20, in_meeting: 0 },
      prompt: { id: 'p', state: 'open', answered_count: 15 },
      counts: { enrolled: 39, answered: 14, answered_off_roster: 1, joined: 22, answered_joined: 14, excused_joined: 2 },
    } as unknown as TeacherSnapshot;
    expect(deriveConsoleView(snapshot)).toMatchObject({ kind: 'open', answered: 14, enrolled: 20, offRoster: 1 });
  });

  it('falls back to the class list for a server without joined counts', () => {
    const snapshot = {
      session: { status: 'live' },
      readiness: { enrolled: 39, connected: 20, in_meeting: 0 },
      prompt: { id: 'p', state: 'open', answered_count: 15 },
      counts: { enrolled: 39, answered: 14, answered_off_roster: 0 },
    } as unknown as TeacherSnapshot;
    expect(deriveConsoleView(snapshot)).toMatchObject({ answered: 14, enrolled: 39 });
  });

  it('orders the waiting list the way a teacher acts on it', () => {
    const view = waitingView([
      waiting({ student_id: '1', name: 'Zara' }),
      waiting({ student_id: '2', name: 'Bala', reason: 'cant_see' }),
      waiting({ student_id: '3', name: 'Asha', reason: 'dont_know', approval: 'rejected' }),
      waiting({ student_id: '4', name: 'Chitra', reason: 'tech_problem', approval: 'approved' }),
      waiting({ student_id: '5', name: 'Arun' }),
    ]);
    expect(view.waiting.map((w) => w.name)).toEqual(['Bala', 'Asha', 'Arun', 'Zara']);
    expect(view.excused.map((w) => w.name)).toEqual(['Chitra']);
    expect(view).toMatchObject({ nudgeable: 2, undecided: 1 });
    expect(waitingView(undefined)).toEqual({ waiting: [], excused: [], nudgeable: 0, undecided: 0 });
  });

  it('lists who picked each letter, every letter in order', () => {
    const rows = [
      row({ student_id: '1', name: 'Ravi', answer: 'B' }),
      row({ student_id: '2', name: 'Asha', answer: 'B' }),
      row({ student_id: '3', participation: 'silent', answer: null }),
    ];
    const groups = namesByAnswer({ answer_type: 'mcq', option_count: 4 }, rows);
    expect(groups.map((g) => [g.value, g.count])).toEqual([
      ['A', 0],
      ['B', 2],
      ['C', 0],
      ['D', 0],
    ]);
    expect(groups[1].names.map((n) => n.name)).toEqual(['Asha', 'Ravi']);
  });

  it('orders typed answers by how many gave them', () => {
    const rows = [row({ student_id: '1', answer: '12' }), row({ student_id: '2', answer: '14' }), row({ student_id: '3', answer: '14' })];
    expect(namesByAnswer({ answer_type: 'numeric', option_count: null }, rows).map((g) => g.value)).toEqual(['14', '12']);
  });

  it('separates silent and excused students, and groups excused apart after reveal', () => {
    const rows = [
      row({ student_id: '1', participation: 'silent', answer: null }),
      row({ student_id: '2', participation: 'excused', answer: null }),
      row({ student_id: '3', participation: 'absent', answer: null }),
    ];
    const out = unansweredNames(rows);
    expect(out.silent.map((r) => r.student_id)).toEqual(['1']);
    expect(out.excused.map((r) => r.student_id)).toEqual(['2']);
    expect(groupParticipation(rows, false).excused.map((r) => r.student_id)).toEqual(['2']);
  });

  it('shows an Excused tile only when someone was excused', () => {
    const counts = { enrolled: 5, answered: 3, silent: 1, absent: 1, correct: 2, incorrect: 1, answered_off_roster: 0 } as PromptCounts;
    expect(revealSummary(counts, false).map((i) => i.key)).toEqual(['correct', 'incorrect', 'silent', 'absent']);
    expect(revealSummary({ ...counts, excused: 1 }, false).map((i) => i.key)).toEqual(['correct', 'incorrect', 'silent', 'excused', 'absent']);
  });

  it('keeps a names tooltip short', () => {
    expect(namesPreview([])).toBe('Nobody');
    expect(namesPreview([{ name: 'Asha' }])).toBe('Asha');
    expect(namesPreview([{ name: 'Asha' }, { name: 'Ravi' }, { name: 'Zara' }])).toBe('Asha, Ravi and Zara');
    expect(namesPreview([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 2)).toBe('A, B and 1 more');
    expect(roundTitle(2)).toBe('Round 2');
    expect(roundTitle(null)).toBe('Answer Pad');
  });
});
