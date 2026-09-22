// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TeacherPrompt, TeacherSnapshot } from './client/types';
import { STAGE_TOP_ANSWERS, stageView } from './stage';

function prompt(overrides: Partial<TeacherPrompt> = {}): TeacherPrompt {
  return {
    id: 'p1',
    sequence: 3,
    answer_type: 'mcq',
    option_count: 4,
    state: 'open',
    version: 1,
    correct_keys: null,
    ungraded: false,
    label: '38',
    question_text: null,
    image_url: null,
    option_texts: null,
    opened_at: '2026-09-11T10:00:00Z',
    closed_at: null,
    revealed_at: null,
    answered_count: 19,
    last_nudged_at: null,
    ...overrides,
  };
}

function snap(overrides: Partial<TeacherSnapshot> = {}): TeacherSnapshot {
  return {
    ok: true,
    role: 'teacher',
    server_time: '2026-09-11T10:00:05Z',
    session: {
      id: 's1',
      status: 'live',
      room_code: '999071',
      hint_topic: 'pad-hint-x',
      teacher_topic: 'pad-teacher-secret',
      classroom_id: 'c1',
      classroom_name: 'NATA Evening Batch',
      scheduled_class_id: 'sc1',
      batch_id: 'b1',
      meeting_id: 'meeting-1',
      created_at: '2026-09-11T09:55:00Z',
      ended_at: null,
      presence_basis: 'meeting',
      bot_in_meeting: true,
    },
    readiness: { enrolled: 31, connected: 28, in_meeting: 29 },
    prompt: prompt(),
    counts: { enrolled: 31, answered: 23, silent: 5, absent: 3, correct: 15, incorrect: 8, answered_off_roster: 1 },
    groups: [
      { value: 'B', count: 15 },
      { value: 'A', count: 6 },
      { value: 'D', count: 2 },
    ],
    skips: { total: 0, by_reason: {} },
    history: [
      {
        id: 'p0',
        sequence: 2,
        label: 'Warm up',
        answer_type: 'yesno',
        option_count: null,
        state: 'revealed',
        ungraded: true,
        correct_keys: null,
        opened_at: '2026-09-11T09:58:00Z',
        answered: 20,
        correct: 0,
      },
    ],
    ...overrides,
  };
}

const leaks = (value: unknown) => {
  const text = JSON.stringify(value);
  return ['pad-teacher-secret', '999071', 'meeting-1', 'c1', 'b1', 'sc1', 'Warm up'].filter((secret) => text.includes(secret));
};

describe('stageView', () => {
  it('shows only the answered count while a question is open, with no breakdown and nothing private', () => {
    const view = stageView(snap());
    expect(view).toEqual({
      server_time: '2026-09-11T10:00:05Z',
      session: { id: 's1', status: 'live', classroom_name: 'NATA Evening Batch', hint_topic: 'pad-hint-x' },
      prompt: { id: 'p1', sequence: 3, label: '38', state: 'open', version: 1, answer_type: 'mcq', answered: 23, enrolled: 31, reveal: null },
    });
    expect(leaks(view)).toEqual([]);
  });

  it('still withholds the breakdown after closing, even with a key chosen', () => {
    const view = stageView(snap({ prompt: prompt({ state: 'closed', version: 2, correct_keys: ['B'] }) }));
    expect(view.prompt?.reveal).toBeNull();
    expect(JSON.stringify(view)).not.toContain('"B"');
  });

  it('after REVEAL shows every choice, zero counts included, with the key and the correct and incorrect totals', () => {
    const view = stageView(snap({ prompt: prompt({ state: 'revealed', version: 4, correct_keys: ['B'] }) }));
    expect(view.prompt?.reveal).toEqual({
      ungraded: false,
      correct_keys: ['B'],
      distribution: [
        { value: 'A', count: 6 },
        { value: 'B', count: 15 },
        { value: 'C', count: 0 },
        { value: 'D', count: 2 },
      ],
      others: 0,
      correct: 15,
      incorrect: 8,
    });
    expect(leaks(view)).toEqual([]);
  });

  it('shows a poll as a breakdown with no key and no right or wrong', () => {
    const view = stageView(
      snap({ prompt: prompt({ answer_type: 'yesno', option_count: null, state: 'revealed', ungraded: true }), groups: [{ value: 'yes', count: 18 }] }),
    );
    expect(view.prompt?.reveal).toEqual({
      ungraded: true,
      correct_keys: [],
      distribution: [
        { value: 'yes', count: 18 },
        { value: 'no', count: 0 },
      ],
      others: 0,
      correct: 0,
      incorrect: 0,
    });
  });

  it('ranks typed numbers, most given first, and sums the rest', () => {
    const groups = Array.from({ length: STAGE_TOP_ANSWERS + 2 }, (_, i) => ({ value: String(10 + i), count: i + 1 }));
    const view = stageView(snap({ prompt: prompt({ answer_type: 'numeric', option_count: null, state: 'revealed', correct_keys: ['17'] }), groups }));
    const reveal = view.prompt?.reveal;
    expect(reveal?.distribution.map((row) => row.value)).toEqual(['17', '16', '15', '14', '13', '12']);
    expect(reveal?.others).toBe(1 + 2);
  });

  it('never shows the words students typed for a text question, only the key and the totals', () => {
    const view = stageView(
      snap({
        prompt: prompt({ answer_type: 'text', option_count: null, state: 'revealed', correct_keys: ['vanishing point'] }),
        groups: [
          { value: 'vanishing point', count: 12 },
          { value: 'asha says hi', count: 1 },
        ],
      }),
    );
    expect(view.prompt?.reveal).toMatchObject({ correct_keys: ['vanishing point'], distribution: [], others: 0, correct: 15 });
    expect(JSON.stringify(view)).not.toContain('asha');
  });

  it('has no prompt before the first question', () => {
    expect(stageView(snap({ prompt: null, counts: null, groups: [] })).prompt).toBeNull();
  });
});
