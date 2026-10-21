import { describe, it, expect } from 'vitest';
import { buildToolsChat, type ToolsChatRow } from './build';

let n = 0;
const row = (over: Partial<ToolsChatRow>): ToolsChatRow => ({
  id: `m${n++}`,
  thread_id: 't1',
  user_id: null,
  anon_id: 'anon_1',
  role: 'user',
  text: '',
  cards: [],
  tool_calls: null,
  error: null,
  response_ms: null,
  created_at: '2026-10-20T10:00:00Z',
  ...over,
});

describe('Tools chat view', () => {
  const rows: ToolsChatRow[] = [
    row({ text: 'My cutoff? CBSE 450, NATA 120', created_at: '2026-10-20T10:00:00Z' }),
    row({
      role: 'assistant',
      text: 'Your cutoff is 300.',
      tool_calls: [{ name: 'calculate_cutoff', ok: true }],
      response_ms: 4000,
      created_at: '2026-10-20T10:00:05Z',
    }),
    row({ text: 'Which colleges?', created_at: '2026-10-20T10:01:00Z' }),
    row({
      role: 'assistant',
      text: '',
      tool_calls: [{ name: 'predict_colleges', ok: false }],
      error: 'EMPTY_REPLY',
      created_at: '2026-10-20T10:01:05Z',
    }),
    row({ text: 'And KEAM?', error: 'SIGNUP_REQUIRED', created_at: '2026-10-20T10:02:00Z' }),
    row({ thread_id: 't2', user_id: 'u1', anon_id: null, text: 'Exam dates?', created_at: '2026-10-21T09:00:00Z' }),
    row({
      thread_id: 't2',
      user_id: 'u1',
      anon_id: null,
      role: 'assistant',
      text: 'Not announced yet.',
      tool_calls: [{ name: 'exam_dates', ok: true }],
      response_ms: 2000,
      created_at: '2026-10-21T09:00:03Z',
    }),
  ];

  it('rolls messages into threads, newest first', () => {
    const v = buildToolsChat(rows);
    expect(v.threads.map((t) => t.id)).toEqual(['t2', 't1']);
    expect(v.threads[1]).toMatchObject({
      firstQuestion: 'My cutoff? CBSE 450, NATA 120',
      lastQuestion: 'And KEAM?',
      questions: 3,
      answers: 1,
      failed: 1,
      gated: 1,
      tools: ['calculate_cutoff', 'predict_colleges'],
      anonId: 'anon_1',
    });
  });

  it('counts the totals staff watch', () => {
    expect(buildToolsChat(rows).stats).toEqual({
      threads: 2,
      questions: 4,
      answers: 2,
      signedInThreads: 1,
      guestThreads: 1,
      gatedQuestions: 1,
      failedAnswers: 1,
      medianMs: 3000,
    });
  });

  it('ranks tools by use and lists the ones that could not answer', () => {
    const v = buildToolsChat(rows);
    expect(v.tools[0]).toMatchObject({ calls: 1 });
    expect(v.tools.find((t) => t.name === 'predict_colleges')).toEqual({ name: 'predict_colleges', calls: 1, failed: 1 });
    expect(v.missing).toEqual([{ name: 'predict_colleges', count: 1 }]);
  });

  it('is empty without rows', () => {
    expect(buildToolsChat([]).stats).toMatchObject({ threads: 0, questions: 0, medianMs: null });
  });
});
