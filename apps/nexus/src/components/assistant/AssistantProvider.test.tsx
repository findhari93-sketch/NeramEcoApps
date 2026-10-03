import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { Envelope } from './client';

const postTurn = vi.fn();
const confirmActionRequest = vi.fn();
const cancelActionRequest = vi.fn();
const newThread = vi.fn();
const loadThread = vi.fn();
const swrMutate = vi.fn();
let pathname = '/student/dashboard';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    postTurn: (...a: unknown[]) => postTurn(...a),
    confirmActionRequest: (...a: unknown[]) => confirmActionRequest(...a),
    cancelActionRequest: (...a: unknown[]) => cancelActionRequest(...a),
    newThread: (...a: unknown[]) => newThread(...a),
    loadThread: (...a: unknown[]) => loadThread(...a),
  };
});

vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>();
  return { ...actual, useSWRConfig: () => ({ mutate: swrMutate }) };
});

vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({
    isStudent: true,
    isFeatureEnabled: () => true,
    getToken: async () => 'tok',
    tokenReady: true,
    parentSession: { active: false },
  }),
}));

vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
const captureScreenshot = vi.fn(async () => null);
vi.mock('@/lib/capture-screenshot', () => ({ captureScreenshot: () => captureScreenshot() }));
vi.mock('@/components/issues/ReportIssueDialog', () => ({ default: () => null }));

import { AssistantHttpError } from './client';
import { AssistantProvider, useAssistant, type AssistantContextValue } from './AssistantProvider';

let ctx: AssistantContextValue;
function Probe() {
  ctx = useAssistant();
  return null;
}

function mount() {
  return render(
    <AssistantProvider>
      <Probe />
    </AssistantProvider>,
  );
}

const env = (over: Partial<Envelope> = {}): Envelope => ({
  reply: 'ok', suggestions: [], links: [], action: null, mode: 'general', threadId: 't1', ...over,
});

beforeEach(() => {
  sessionStorage.clear();
  postTurn.mockReset();
  confirmActionRequest.mockReset();
  cancelActionRequest.mockReset();
  newThread.mockReset();
  loadThread.mockReset();
  loadThread.mockResolvedValue([]);
  swrMutate.mockReset();
  captureScreenshot.mockClear();
  pathname = '/student/dashboard';
});
afterEach(() => cleanup());

describe('AssistantProvider', () => {
  it('a stale confirm (410) keeps the assistant enabled and shows the message', async () => {
    postTurn.mockResolvedValue(env({ action: { id: 'a1', confirmToken: 'ct' } as unknown as Envelope['action'] }));
    confirmActionRequest.mockRejectedValue(new AssistantHttpError('That action has expired. Ask me again.', 410));
    mount();
    await act(async () => { await ctx.send('hello'); });
    expect(ctx.pendingAction).not.toBeNull();
    await act(async () => { await ctx.confirm(); });
    expect(ctx.enabled).toBe(true);
    expect(ctx.pendingAction).toBeNull();
    expect(ctx.messages[ctx.messages.length - 1].text).toBe('That action has expired. Ask me again.');
  });

  it('a send refused with 404 disables the assistant', async () => {
    postTurn.mockRejectedValue(new AssistantHttpError('not found', 404));
    mount();
    expect(ctx.enabled).toBe(true);
    await act(async () => { await ctx.send('hello'); });
    expect(ctx.enabled).toBe(false);
  });

  it('two synchronous sends call postTurn once', async () => {
    postTurn.mockResolvedValue(env());
    mount();
    await act(async () => {
      void ctx.send('a');
      void ctx.send('b');
    });
    expect(postTurn).toHaveBeenCalledTimes(1);
  });

  it('a reply that arrives after newChat is dropped', async () => {
    let release: (e: Envelope) => void = () => {};
    postTurn.mockReturnValue(new Promise<Envelope>((r) => { release = r; }));
    newThread.mockResolvedValue('new-thread');
    mount();
    let sending: Promise<void> = Promise.resolve();
    await act(async () => { sending = ctx.send('hello'); });
    await act(async () => { await ctx.newChat(); });
    await act(async () => { release(env({ reply: 'late', threadId: 'old-thread' })); await sending; });
    expect(ctx.messages).toHaveLength(0);
    expect(sessionStorage.getItem('nexus-assistant-thread')).toBe('new-thread');
    expect(ctx.busy).toBe(false);
  });

  it('after newChat, a message sent before the new thread id arrives starts a fresh thread, and keeps it', async () => {
    sessionStorage.setItem('nexus-assistant-thread', 'old-thread');
    let releaseThread: (id: string) => void = () => {};
    newThread.mockReturnValue(new Promise<string>((r) => { releaseThread = r; }));
    postTurn.mockResolvedValue(env({ threadId: 'fresh' }));
    mount();
    let starting: Promise<void> = Promise.resolve();
    await act(async () => { starting = ctx.newChat(); });
    await act(async () => { await ctx.send('Remind me'); });
    expect(postTurn.mock.calls[0][1]).toMatchObject({ threadId: null, text: 'Remind me' });
    await act(async () => { releaseThread('unused'); await starting; });
    expect(sessionStorage.getItem('nexus-assistant-thread')).toBe('fresh');
  });

  it('after a failed newChat, the next message does not go to the old thread', async () => {
    sessionStorage.setItem('nexus-assistant-thread', 'old-thread');
    newThread.mockRejectedValue(new Error('offline'));
    postTurn.mockResolvedValue(env({ threadId: 'fresh' }));
    mount();
    await act(async () => { await ctx.newChat(); });
    await act(async () => { await ctx.send('hello'); });
    expect(postTurn.mock.calls[0][1]).toMatchObject({ threadId: null });
  });

  it('a cancel that fails on the network says so', async () => {
    postTurn.mockResolvedValue(env({ action: { id: 'a1', confirmToken: 'ct' } as unknown as Envelope['action'] }));
    cancelActionRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    mount();
    await act(async () => { await ctx.send('hello'); });
    await act(async () => { await ctx.cancel(); });
    expect(ctx.error).toMatch(/Could not cancel/);
  });

  it('a confirmed action revalidates the brief card', async () => {
    postTurn.mockResolvedValue(env({ action: { id: 'a1', confirmToken: 'ct' } as unknown as Envelope['action'] }));
    confirmActionRequest.mockResolvedValue({ ok: true, reply: 'Done.', links: [], threadId: 't1' });
    mount();
    await act(async () => { await ctx.send('hello'); });
    await act(async () => { await ctx.confirm(); });
    expect(swrMutate).toHaveBeenCalledWith('/api/assistant/brief');
  });

  it('on the first open after a reload, the kept thread is shown instead of the menu', async () => {
    sessionStorage.setItem('nexus-assistant-thread', 'kept');
    loadThread.mockResolvedValue([
      { id: 'u1', role: 'user', text: 'Remind me', envelope: null },
      { id: 'a1', role: 'assistant', text: 'When should I remind you?', envelope: env({ reply: 'When should I remind you?', suggestions: [{ label: 'Tomorrow', send: 'Tomorrow' }], threadId: 'kept' }) },
    ]);
    mount();
    expect(loadThread).not.toHaveBeenCalled();
    await act(async () => { ctx.openPanel(); });
    await act(async () => { await Promise.resolve(); });
    expect(loadThread.mock.calls[0][1]).toBe('kept');
    expect(ctx.messages.map((m) => m.text)).toEqual(['Remind me', 'When should I remind you?']);
    expect(ctx.suggestions).toEqual([{ label: 'Tomorrow', send: 'Tomorrow' }]);
    expect(ctx.loadingHistory).toBe(false);
    // Once per page session.
    await act(async () => { ctx.closePanel(); });
    await act(async () => { ctx.openPanel(); });
    expect(loadThread).toHaveBeenCalledTimes(1);
  });

  it('a kept thread that cannot be loaded is forgotten, and the assistant stays on', async () => {
    sessionStorage.setItem('nexus-assistant-thread', 'gone');
    loadThread.mockRejectedValue(new AssistantHttpError('Not found', 404));
    postTurn.mockResolvedValue(env({ threadId: 'fresh' }));
    mount();
    await act(async () => { ctx.openPanel(); });
    await act(async () => { await Promise.resolve(); });
    expect(ctx.enabled).toBe(true);
    expect(sessionStorage.getItem('nexus-assistant-thread')).toBeNull();
    await act(async () => { await ctx.send('hello'); });
    expect(postTurn.mock.calls[0][1]).toMatchObject({ threadId: null });
  });

  it('navigating to another page closes the panel', async () => {
    const view = mount();
    await act(async () => { ctx.openPanel(); });
    expect(ctx.open).toBe(true);
    pathname = '/student/timetable';
    view.rerender(
      <AssistantProvider>
        <Probe />
      </AssistantProvider>,
    );
    expect(ctx.open).toBe(false);
  });

  it('a double tap on Report a problem captures one screenshot', async () => {
    vi.useFakeTimers();
    try {
      mount();
      let a: Promise<void> = Promise.resolve();
      let b: Promise<void> = Promise.resolve();
      act(() => { a = ctx.reportProblem(); b = ctx.reportProblem(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); await a; await b; });
      expect(captureScreenshot).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
