import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { Envelope } from './client';

const postTurn = vi.fn();
const confirmActionRequest = vi.fn();
const cancelActionRequest = vi.fn();
const newThread = vi.fn();

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    postTurn: (...a: unknown[]) => postTurn(...a),
    confirmActionRequest: (...a: unknown[]) => confirmActionRequest(...a),
    cancelActionRequest: (...a: unknown[]) => cancelActionRequest(...a),
    newThread: (...a: unknown[]) => newThread(...a),
  };
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

vi.mock('next/navigation', () => ({ usePathname: () => '/student/dashboard' }));
vi.mock('@/lib/capture-screenshot', () => ({ captureScreenshot: vi.fn(async () => null) }));
vi.mock('@/components/issues/ReportIssueDialog', () => ({ default: () => null }));

import { AssistantHttpError } from './client';
import { AssistantProvider, useAssistant, type AssistantContextValue } from './AssistantProvider';

let ctx: AssistantContextValue;
function Probe() {
  ctx = useAssistant();
  return null;
}

function mount() {
  render(
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
});
