import { describe, expect, it } from 'vitest';
import { consoleStatus, consoleTitle, foldAnswers, hereSummary, stacksAnswerLabels } from './teacher-view';
import type { TeacherPrompt, TeacherSnapshot } from './types';

const session = (overrides: Partial<TeacherSnapshot['session']> = {}) =>
  ({ title: null, classroom_name: 'JEE B.Arch Session 1', presence_basis: 'app', bot_in_meeting: false, ...overrides }) as TeacherSnapshot['session'];

describe('consoleTitle', () => {
  it("shows the class's own title, then the classroom, then the pad", () => {
    expect(consoleTitle(session({ title: 'JEE preparation' }))).toBe('JEE preparation');
    expect(consoleTitle(session())).toBe('JEE B.Arch Session 1');
    expect(consoleTitle(session({ title: '  ', classroom_name: null }))).toBe('Answer Pad');
  });
});

describe('hereSummary', () => {
  it('counts who is here, and says whether the meeting list is counting', () => {
    expect(
      hereSummary({ session: session({ bot_in_meeting: true }), readiness: { enrolled: 39, joined: 18, opened: 12, connected: 9, in_meeting: 15 } }),
    ).toEqual({ here: 18, opened: 12, connected: 9, enrolled: 39, meetingList: true });
    // From a server that does not send joined yet: those with the pad open.
    expect(hereSummary({ session: session(), readiness: { enrolled: 30, connected: 25, in_meeting: 0 } })).toEqual({
      here: 25,
      opened: null,
      connected: 25,
      enrolled: 30,
      meetingList: false,
    });
  });
});

describe('consoleStatus', () => {
  const p = { id: 'p1', sequence: 32, label: null } as TeacherPrompt;
  it('names the round and where it is, in one short line', () => {
    expect(consoleStatus(1, { kind: 'ready' })).toBe('Round 1');
    expect(consoleStatus(2, { kind: 'open', prompt: p, answered: 0, enrolled: 0, offRoster: 0 })).toBe('Round 2 · Question 32 open');
    expect(consoleStatus(2, { kind: 'closed', prompt: { ...p, label: '32' }, decided: false })).toBe('Round 2 · Q.32 closed');
    expect(consoleStatus(1, { kind: 'ended' })).toBe('Round 1 ended');
  });
});

describe('answer bars on a narrow panel', () => {
  it('stacks a typed answer above its bar, and keeps a letter beside it', () => {
    expect(stacksAnswerLabels(['A', 'B', 'Yes', '12'])).toBe(false);
    expect(stacksAnswerLabels(['vector', '1. it is scalar only depends on magnitude'])).toBe(true);
  });

  it('shows the top six typed answers and folds the rest, never folding letters', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `answer ${i}`);
    expect(foldAnswers('text', rows)).toEqual({ shown: rows.slice(0, 6), folded: rows.slice(6) });
    // One more than the limit is not worth a button.
    expect(foldAnswers('text', rows.slice(0, 7)).folded).toEqual([]);
    expect(foldAnswers('mcq', rows).folded).toEqual([]);
  });
});
