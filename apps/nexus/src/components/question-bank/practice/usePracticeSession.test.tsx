import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { NexusQBQuestionListItem } from '@neram/database';
import { usePracticeSession, type PracticeContext, type UsePracticeSessionOptions } from './usePracticeSession';

const CTX: PracticeContext = { exam: 'JEE_PAPER_2', year: 2014, session: null, shift: null, section: null, paperSource: null };
const FILTERS = {};
const noopApply = () => {};
const getToken = async () => 'tok';

function listItem(id: string, n: number): NexusQBQuestionListItem {
  return {
    id,
    display_order: n,
    section_order: null,
    sources: [],
    attempt_summary: null,
    question_text: `Question ${n}`,
    categories: [],
    difficulty: 'MEDIUM',
    question_format: 'MCQ',
  } as unknown as NexusQBQuestionListItem;
}

/** A drawing printed as "attempt any one of two": one row, two things to practise. */
function splitItem(id: string, n: number): NexusQBQuestionListItem {
  return {
    ...listItem(id, n),
    question_format: 'DRAWING_PROMPT',
    drawing_parts: {
      mode: 'any_one',
      items: [
        { id: 'a', key: 'a', label: 'A', text: `Question ${n}, option A` },
        { id: 'b', key: 'b', label: 'B', text: `Question ${n}, option B` },
      ],
    },
  } as unknown as NexusQBQuestionListItem;
}

const LIST = [listItem('a', 1), listItem('b', 2), listItem('c', 3)];

/** No year, so the list pages instead of arriving whole. */
const EXAM_CTX: PracticeContext = { ...CTX, year: null };

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response);
}

/** Resolve a detail request by hand, to land responses out of order. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

let fetchMock: Mock<[url: string, init?: RequestInit], Promise<Response>>;
let detailGate: Map<string, ReturnType<typeof deferred<Response>>>;

beforeEach(() => {
  detailGate = new Map();
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/question-bank/questions?')) return json({ data: { questions: LIST, total: LIST.length } });
    const attempt = url.match(/questions\/(\w+)\/attempt$/);
    if (attempt && init?.method === 'POST') {
      return json({ data: { isCorrect: true, attempt: { id: 'att', created_at: '2026-09-22T10:00:00Z' }, correct_answer: 'x' } });
    }
    const detail = url.match(/questions\/(\w+)\?/);
    if (detail) {
      const id = detail[1];
      const gate = detailGate.get(id);
      const body = { data: { id, question_text: `Q ${id}`, attempts: [], options: [], correct_answer: 'x' } };
      if (gate) return gate.promise.then(() => json(body));
      return json(body);
    }
    return json({}, false);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(over: Partial<UsePracticeSessionOptions> = {}) {
  const options: UsePracticeSessionOptions = {
    classroomId: 'room',
    authSettled: true,
    getToken,
    ctx: CTX,
    filters: FILTERS,
    applyFilterParams: noopApply,
    layout: 'panes',
    initialQid: null,
    ...over,
  };
  return renderHook(() => usePracticeSession(options));
}

const detailCalls = (id: string) =>
  fetchMock.mock.calls.filter(([url]) => typeof url === 'string' && url.startsWith(`/api/question-bank/questions/${id}?`)).length;

describe('usePracticeSession', () => {
  it('loads a paper whole, numbered by the paper', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions.map((q) => q.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.numbers.get('c')).toBe(3);
    const listUrl = fetchMock.mock.calls[0][0] as string;
    expect(new URLSearchParams(listUrl.split('?')[1]).get('page_size')).toBe('100');
  });

  it('opens the first question on two panes, and fetches the next one ahead', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.detail?.id).toBe('a'));
    await waitFor(() => expect(detailCalls('b')).toBe(1));
  });

  it('keeps the reader closed on a phone until a question is chosen', async () => {
    const { result } = setup({ layout: 'reader' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentId).toBeNull();
  });

  it('opens a shared question once the list lands', async () => {
    const { result } = setup({ layout: 'reader', initialQid: 'c' });
    await waitFor(() => expect(result.current.currentId).toBe('c'));
  });

  it('drops a detail that lands after the student moved on', async () => {
    const slow = deferred<Response>();
    detailGate.set('a', slow);
    const { result } = setup({ layout: 'reader' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.open('a'));
    act(() => result.current.open('c'));
    await waitFor(() => expect(result.current.detail?.id).toBe('c'));

    await act(async () => {
      slow.resolve({} as Response);
      await slow.promise;
    });
    expect(result.current.currentId).toBe('c');
    expect(result.current.detail?.id).toBe('c');
  });

  it('does not fetch a question twice in one visit', async () => {
    const { result } = setup({ layout: 'reader' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.open('a'));
    await waitFor(() => expect(result.current.detail?.id).toBe('a'));
    act(() => result.current.open('c'));
    await waitFor(() => expect(result.current.detail?.id).toBe('c'));
    act(() => result.current.open('a'));
    // Cached: it shows in the same render, with no second request.
    expect(result.current.detail?.id).toBe('a');
    expect(detailCalls('a')).toBe(1);
  });

  it('marks the list the moment an answer lands', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.detail?.id).toBe('a'));
    let verdict: { isCorrect: boolean } | undefined;
    await act(async () => {
      verdict = await result.current.submit('a', 'x');
    });
    expect(verdict?.isCorrect).toBe(true);
    expect(result.current.questions[0].attempt_summary?.last_was_correct).toBe(true);
    expect(result.current.progress).toEqual({ total: 3, answered: 1, right: 1 });
    expect(result.current.priorAnswer('a')).toEqual({ selected: 'x', isCorrect: true });
    expect(result.current.detail?.attempts?.[0]?.id).toBe('att');
  });

  it('throws when the answer was not saved, and records nothing', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.detail?.id).toBe('a'));
    fetchMock.mockImplementationOnce(() => json({ error: 'nope' }, false));
    await expect(act(() => result.current.submit('a', 'x'))).rejects.toThrow();
    expect(result.current.questions[0].attempt_summary).toBeNull();
    expect(result.current.priorAnswer('a')).toBeNull();
  });

  it('says so when the list fails, rather than showing an empty paper', async () => {
    fetchMock.mockImplementation(() => json({}, false));
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
  });
  it('counts what is on screen, not the rows behind it', async () => {
    // Two either-or drawings are four things to practise. The header read
    // "Showing 4 of 2 questions" while the server's row count stood in for a
    // total the rest of the screen measures in practice items.
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/question-bank/questions?')
        ? json({ data: { questions: [splitItem('a', 1), splitItem('b', 2)], total: 2 } })
        : json({ data: { id: 'a', question_text: 'Q a', attempts: [], options: [] } }),
    );
    const { result } = setup({ ctx: EXAM_CTX, layout: 'reader' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions.map((q) => q.id)).toEqual(['a~a', 'a~b', 'b~a', 'b~b']);
    expect(result.current.total).toBe(4);
  });

  it('pages by question row, so a split drawing does not end the list early', async () => {
    // One row of the two splits: three things to practise out of three rows.
    // Comparing the four-item list with the three-row total said there was
    // nothing more to load, and the third question was unreachable.
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/question-bank/questions?')
        ? json({ data: { questions: [splitItem('a', 1), listItem('b', 2)], total: 3 } })
        : json({ data: { id: 'a', question_text: 'Q a', attempts: [], options: [] } }),
    );
    const { result } = setup({ ctx: EXAM_CTX, layout: 'reader' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions).toHaveLength(3);
    expect(result.current.hasMore).toBe(true);
  });
});
