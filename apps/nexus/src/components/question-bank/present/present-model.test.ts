import { describe, expect, it } from 'vitest';
import type { TeacherSnapshot } from '@/lib/pad/client/types';
import type { DeckItem } from '@/lib/qb-present/deck';
import { correctIndexes, gridStatuses, optionCounts, safeBackHref, stageView } from './present-model';

const item = (id: string, plan: DeckItem['plan'] = { type: 'mcq', optionCount: 4, hasKey: true }): DeckItem => ({
  id,
  label: '38',
  section: 'math_mcq',
  format: 'MCQ',
  text: 'Which is a dome?',
  image_url: null,
  options: [],
  parts: [],
  plan,
});

const LIVE = { kind: 'live', sessionId: 's1' } as const;

function snapshot(prompt: Partial<NonNullable<TeacherSnapshot['prompt']>> | null, history: TeacherSnapshot['history'] = []): TeacherSnapshot {
  return {
    ok: true,
    role: 'teacher',
    server_time: '2026-10-01T10:00:00.000Z',
    session: {} as TeacherSnapshot['session'],
    readiness: { enrolled: 30, joined: 22, connected: 20, in_meeting: 25 },
    prompt: prompt
      ? ({
          id: 'p1',
          sequence: 1,
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
          opened_at: '2026-10-01T09:59:30.000Z',
          closed_at: null,
          revealed_at: null,
          answered_count: 18,
          last_nudged_at: null,
          closes_at: '2026-10-01T10:00:30.000Z',
          time_limit_s: 60,
          qb_question_id: 'q1',
          suggested_keys: ['B'],
          ...prompt,
        } as TeacherSnapshot['prompt'])
      : null,
    counts: prompt ? ({ joined: 22, answered_joined: 18 } as TeacherSnapshot['counts']) : null,
    groups: [
      { value: 'B', count: 12 },
      { value: 'A', count: 6 },
    ],
    skips: { total: 0, by_reason: {} },
    history,
  };
}

const entry = (over: Partial<TeacherSnapshot['history'][number]> = {}): TeacherSnapshot['history'][number] => ({
  id: 'p1',
  sequence: 1,
  label: '38',
  answer_type: 'mcq',
  option_count: 4,
  state: 'open',
  ungraded: false,
  correct_keys: null,
  opened_at: '2026-10-01T09:59:30.000Z',
  answered: 18,
  correct: 0,
  qb_question_id: 'q1',
  ...over,
});

describe('stageView', () => {
  it('a question not yet asked starts the pad, or moves on when the pad is not connected', () => {
    expect(stageView(item('q1'), snapshot(null), LIVE, false)).toMatchObject({ phase: 'ready', primary: 'start', promptId: null });
    expect(stageView(item('q1'), null, { kind: 'none' }, false).primary).toBe('next');
    expect(stageView(item('q1', { type: 'show', optionCount: null, hasKey: false }), null, LIVE, false).primary).toBe('next');
    expect(stageView(item('q1'), null, { kind: 'off' }, true).primary).toBe('none');
  });

  it('while open: Close, the deadline and the live count, and never a key or the spread', () => {
    const view = stageView(item('q1'), snapshot({ state: 'open' }, [entry()]), LIVE, false);
    expect(view).toMatchObject({
      phase: 'open',
      primary: 'close',
      closesAt: '2026-10-01T10:00:30.000Z',
      answered: 18,
      joined: 22,
      distribution: null,
      revealedKeys: null,
    });
  });

  it('the count leaves out excused students, as the console does', () => {
    const snap = snapshot({ state: 'open' }, [entry()]);
    snap.counts = { joined: 22, answered_joined: 18, excused_joined: 2 } as TeacherSnapshot['counts'];
    expect(stageView(item('q1'), snap, LIVE, false)).toMatchObject({ answered: 18, joined: 20 });
  });

  it('once closed: Reveal, the spread, still no key though the bank has one', () => {
    const view = stageView(item('q1'), snapshot({ state: 'closed' }, [entry({ state: 'closed' })]), LIVE, false);
    expect(view).toMatchObject({ phase: 'closed', primary: 'reveal', canReveal: true, closesAt: null, revealedKeys: null });
    expect(view.distribution).toHaveLength(2);
    expect(JSON.stringify(view)).not.toContain('suggested');
  });

  it('once revealed: the key, and Next', () => {
    const view = stageView(
      item('q1'),
      snapshot({ state: 'revealed', correct_keys: ['B'] }, [entry({ state: 'revealed', correct_keys: ['B'] })]),
      LIVE,
      false,
    );
    expect(view).toMatchObject({ phase: 'revealed', primary: 'next', revealedKeys: ['B'] });
    expect([...correctIndexes(view)]).toEqual([1]);
  });

  it('needs a key at Reveal when neither the bank nor the teacher has one', () => {
    const view = stageView(item('q1'), snapshot({ state: 'closed', suggested_keys: null }, [entry({ state: 'closed' })]), LIVE, false);
    expect(view.canReveal).toBe(false);
  });

  it('notices a question opened from the Teams console', () => {
    const view = stageView(item('q2'), snapshot({ id: 'p9', state: 'open', label: '12', sequence: 4, qb_question_id: null }), LIVE, false);
    expect(view.otherOpen).toEqual({ promptId: 'p9', label: '12', sequence: 4 });
    expect(view.phase).toBe('ready');
  });

  it('an earlier question asked again later reads from its own prompt', () => {
    const snap = snapshot({ id: 'p2', state: 'open', qb_question_id: 'q2' }, [entry({ id: 'p1', state: 'revealed', correct_keys: ['C'] }), entry({ id: 'p2', qb_question_id: 'q2' })]);
    const view = stageView(item('q1'), snap, LIVE, false);
    expect(view).toMatchObject({ phase: 'revealed', isCurrentPrompt: false, revealedKeys: ['C'], distribution: null });
  });
});

describe('helpers', () => {
  it('marks asked and revealed questions with their percent right', () => {
    const map = gridStatuses([item('q1'), item('q2'), item('q3')], snapshot(null, [
      entry({ id: 'p1', qb_question_id: 'q1', state: 'revealed', answered: 20, correct: 15 }),
      entry({ id: 'p2', qb_question_id: 'q2', state: 'closed' }),
    ]));
    expect(map.get('q1')).toEqual({ state: 'revealed', percent: 75 });
    expect(map.get('q2')).toEqual({ state: 'asked' });
    expect(map.get('q3')).toEqual({ state: 'new' });
  });

  it('counts each option for the spread bars', () => {
    expect(optionCounts({ distribution: [{ value: 'B', count: 12 }, { value: 'A', count: 6 }] }, 4)).toEqual({ counts: [6, 12, 0, 0], total: 18 });
    expect(optionCounts({ distribution: null }, 4)).toBeNull();
  });

  it('only goes back inside the teacher app', () => {
    expect(safeBackHref('/teacher/question-bank/papers/abc?stage=2', null)).toBe('/teacher/question-bank/papers/abc?stage=2');
    expect(safeBackHref('https://evil.test', 'p1')).toBe('/teacher/question-bank/papers/p1');
    expect(safeBackHref('//evil.test', null)).toBe('/teacher/question-bank');
  });
});
