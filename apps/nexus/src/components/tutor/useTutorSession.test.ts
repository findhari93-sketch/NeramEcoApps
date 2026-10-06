import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { TutorEnvelope } from '@/lib/assistant/tutor/types';
import { NOT_READY, useTutorSession } from './useTutorSession';

const getToken = async () => 'tok';

function envelope(over: Partial<TutorEnvelope> = {}): TutorEnvelope {
  return {
    sessionId: 's1',
    phase: 'guided',
    blocks: [
      { id: 'b1', kind: 'step_progress', index: 1, total: 3 },
      { id: 'b2', kind: 'check_question', stepId: 'st1', md: 'Which is $x$?', choices: [{ id: 'a', md: '1' }, { id: 'b', md: '2' }] },
    ],
    chips: [{ label: 'Give me a hint', action: { type: 'hint' } }],
    llm: false,
    progress: { step: 1, total: 3 },
    hintsUsed: 0,
    ...over,
  };
}

function ok(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}
function fail(status: number, error: string): Promise<Response> {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error }) } as Response);
}

let fetchMock: Mock<[url: string, init?: RequestInit], Promise<Response>>;
const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

beforeEach(() => {
  fetchMock = vi.fn((_url: string, _init?: RequestInit) => ok(envelope()));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTutorSession', () => {
  it('start posts {type: start} once, with the question and a fresh id, and keeps the reply', async () => {
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    act(() => result.current.start());
    act(() => result.current.start());
    await waitFor(() => expect(result.current.turns).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/assistant/tutor/turn');
    expect(init?.cache).toBe('no-store');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const body = bodies()[0];
    expect(body.questionId).toBe('q1');
    expect(body.action).toEqual({ type: 'start' });
    expect(body.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.turns[0].who).toBe('tutor');
    expect(result.current.phase).toBe('guided');
    expect(result.current.progress).toEqual({ step: 1, total: 3 });
    expect(result.current.openCheck?.stepId).toBe('st1');
  });

  it('choose appends the student label, then the reply, under a new id per press', async () => {
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.pending).toBe(false));
    await act(() => result.current.send({ type: 'choose', stepId: 'st1', choiceId: 'b' }, 'B. 2'));
    expect(result.current.turns.map((t) => t.who)).toEqual(['tutor', 'student', 'tutor']);
    expect(result.current.turns[1].text).toBe('B. 2');
    const [first, second] = bodies();
    expect(second.action).toEqual({ type: 'choose', stepId: 'st1', choiceId: 'b' });
    expect(second.clientMessageId).not.toBe(first.clientMessageId);
  });

  it('resends once with the SAME clientMessageId when the network fails', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    await act(() => result.current.send({ type: 'hint' }, 'Give me a hint'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [a, b] = bodies();
    expect(b.clientMessageId).toBe(a.clientMessageId);
    expect(result.current.error).toBeNull();
    expect(result.current.turns.map((t) => t.who)).toEqual(['student', 'tutor']);
  });

  it('never resends an HTTP error; Retry sends again under a NEW id, without a second bubble', async () => {
    fetchMock.mockImplementationOnce(() => fail(409, 'Still working on your last tap.'));
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    await act(() => result.current.send({ type: 'hint' }, 'Give me a hint'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatchObject({ status: 409, message: 'Still working on your last tap.', retryable: true });
    await act(() => result.current.retry());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [a, b] = bodies();
    expect(b.action).toEqual({ type: 'hint' });
    expect(b.clientMessageId).not.toBe(a.clientMessageId);
    expect(result.current.error).toBeNull();
    expect(result.current.turns.filter((t) => t.who === 'student')).toHaveLength(1);
  });

  it('a 404 means no tutor for this question', async () => {
    fetchMock.mockImplementationOnce(() => fail(404, 'Not found'));
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.notReady).toBe(true));
    expect(result.current.error).toBeNull();
    expect(NOT_READY).toBe('The tutor is not ready for this question yet.');
  });

  it('marks a save at once, and takes it back if the save fails', async () => {
    fetchMock.mockImplementationOnce(() => fail(400, 'I can only save something I have shown you here.'));
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    let p: Promise<void>;
    act(() => {
      p = result.current.send({ type: 'save', ref: 'formula:st1' });
    });
    expect(result.current.saved.has('formula:st1')).toBe(true);
    await act(() => p);
    expect(result.current.saved.has('formula:st1')).toBe(false);
    expect(result.current.error?.retryable).toBe(false);
  });

  it('a save that answers with nothing keeps the chips and adds no empty turn', async () => {
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.turns).toHaveLength(1));
    fetchMock.mockImplementationOnce(() => ok(envelope({ blocks: [], chips: [] })));
    await act(() => result.current.send({ type: 'save', ref: 'formula:st1' }));
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.latest?.chips).toHaveLength(1);
    expect(result.current.saved.has('formula:st1')).toBe(true);
  });

  it('starts over for another question and drops a reply still in flight', async () => {
    let resolveLate!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveLate = r)));
    const { result, rerender } = renderHook(({ q }) => useTutorSession({ questionId: q, getToken }), { initialProps: { q: 'q1' } });
    act(() => result.current.start());
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ q: 'q2' });
    expect(result.current.pending).toBe(false);
    expect(result.current.started).toBe(false);
    await act(async () => {
      resolveLate({ ok: true, status: 200, json: () => Promise.resolve(envelope()) } as Response);
    });
    expect(result.current.turns).toHaveLength(0);
  });

  it('ignores a second press while one is in flight', async () => {
    const { result } = renderHook(() => useTutorSession({ questionId: 'q1', getToken }));
    await act(async () => {
      void result.current.send({ type: 'hint' }, 'Give me a hint');
      void result.current.send({ type: 'hint' }, 'Give me a hint');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
