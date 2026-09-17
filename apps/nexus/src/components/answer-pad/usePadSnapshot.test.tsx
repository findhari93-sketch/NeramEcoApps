import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import { usePadSnapshot, type SnapshotShape } from './usePadSnapshot';

/**
 * The hook every pad screen trusts for the truth: it must touch presence on a
 * student's first fetch only, never let a late answer replace a newer one,
 * refetch when Teams or the network comes back, and follow Realtime hints.
 */

const mocks = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    hint: null as null | (() => void),
    status: null as null | ((status: string) => void),
  };
  channel.on.mockImplementation((_type: string, _filter: unknown, handler: () => void) => {
    channel.hint = handler;
    return channel;
  });
  channel.subscribe.mockImplementation((callback: (status: string) => void) => {
    channel.status = callback;
    return channel;
  });
  return {
    padFetch: vi.fn(),
    channel,
    client: { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok') },
  };
});

vi.mock('@neram/database', () => ({ getSupabaseBrowserClient: () => mocks.client }));

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));

const resumeHandlers = new Set<() => void>();
const host: PadHost = {
  kind: 'test',
  meeting: null,
  frame: 'sidePanel',
  theme: 'light',
  getToken: async () => 'token',
  onResume: (handler) => {
    resumeHandlers.add(handler);
    return () => resumeHandlers.delete(handler);
  },
  onThemeChange: () => () => undefined,
};

function snapshot(version: number, overrides: Partial<SnapshotShape> = {}): SnapshotShape {
  return {
    server_time: `2026-09-10T10:00:0${version}Z`,
    session: { id: 's1', status: 'live', hint_topic: 'pad-student', teacher_topic: 'pad-teacher' },
    prompt: { id: 'p1', sequence: 1, version, state: 'open' },
    ...overrides,
  };
}

const paths = () => mocks.padFetch.mock.calls.map(([, path]) => path as string);

beforeEach(() => {
  resumeHandlers.clear();
  mocks.padFetch.mockReset();
  mocks.client.channel.mockClear();
  mocks.channel.hint = null;
  mocks.channel.status = null;
});

describe('usePadSnapshot', () => {
  it("records a student's presence on the first fetch only", async () => {
    mocks.padFetch.mockResolvedValue(snapshot(1));
    const { result } = renderHook(() => usePadSnapshot({ host, sessionId: 's1', role: 'student' }));

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    await act(() => result.current.refresh());

    expect(paths()[0]).toBe('/api/pad/sessions/s1/snapshot?touch=1');
    expect(paths()[paths().length - 1]).toBe('/api/pad/sessions/s1/snapshot');
  });

  it('keeps the newer snapshot when an older answer arrives late', async () => {
    mocks.padFetch.mockResolvedValueOnce(snapshot(2)).mockResolvedValueOnce(snapshot(1));
    const { result } = renderHook(() => usePadSnapshot({ host, sessionId: 's1', role: 'teacher' }));

    await waitFor(() => expect(result.current.snapshot?.prompt?.version).toBe(2));
    await act(() => result.current.refresh());
    expect(mocks.padFetch).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot?.prompt?.version).toBe(2);
  });

  it('refetches when Teams brings the panel back and when the network returns', async () => {
    mocks.padFetch.mockResolvedValue(snapshot(1));
    const { result } = renderHook(() => usePadSnapshot({ host, sessionId: 's1', role: 'student' }));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    const before = mocks.padFetch.mock.calls.length;

    act(() => resumeHandlers.forEach((handler) => handler()));
    await waitFor(() => expect(mocks.padFetch.mock.calls.length).toBe(before + 1));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(mocks.padFetch.mock.calls.length).toBe(before + 2));
  });

  it("follows the teacher's own topic, and refetches on every hint", async () => {
    mocks.padFetch.mockResolvedValue(snapshot(1));
    const { result } = renderHook(() => usePadSnapshot({ host, sessionId: 's1', role: 'teacher' }));

    await waitFor(() => expect(mocks.client.channel).toHaveBeenCalledWith('pad-teacher'));
    act(() => mocks.channel.status?.('SUBSCRIBED'));
    await waitFor(() => expect(result.current.realtime).toBe('subscribed'));

    const before = mocks.padFetch.mock.calls.length;
    act(() => mocks.channel.hint?.());
    await waitFor(() => expect(mocks.padFetch.mock.calls.length).toBeGreaterThan(before));
  });

  it("a student listens on the students' topic, never the teacher's", async () => {
    mocks.padFetch.mockResolvedValue(snapshot(1));
    renderHook(() => usePadSnapshot({ host, sessionId: 's1', role: 'student' }));
    await waitFor(() => expect(mocks.client.channel).toHaveBeenCalledWith('pad-student'));
    expect(mocks.client.channel).not.toHaveBeenCalledWith('pad-teacher');
  });

  it('keeps the last snapshot on screen when the network drops, and says so', async () => {
    mocks.padFetch.mockResolvedValueOnce(snapshot(1)).mockRejectedValueOnce(new PadClientError(0, 'OFFLINE', 'No connection'));
    const { result } = renderHook(() => usePadSnapshot({ host, sessionId: 's1', role: 'student' }));

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    await act(() => result.current.refresh());

    expect(result.current.error?.offline).toBe(true);
    expect(result.current.snapshot?.prompt?.version).toBe(1);
  });
});
