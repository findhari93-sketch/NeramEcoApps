import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import NexusStatusPoller from './NexusStatusPoller';

/**
 * The onboarding card waits for Nexus approval, which takes minutes to days.
 * It used to ask every 10s, from every open tab, visible or not. Now it asks
 * once a minute while the tab is visible, stops while hidden, and checks at
 * once when the student comes back (usually from the Nexus tab it opened).
 */

let visibility: DocumentVisibilityState = 'visible';
let nextStatus = 'in_progress';
const fetchMock = vi.fn(
  async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ status: nextStatus }), { status: 200 }),
);
const getIdToken = vi.fn(async () => 'tok');

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

const statusCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/nexus-status').length;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  nextStatus = 'in_progress';
  fetchMock.mockClear();
  getIdToken.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPoller(onApproved = vi.fn()) {
  render(<NexusStatusPoller initialStatus="in_progress" getIdToken={getIdToken} onApproved={onApproved} isActive />);
  return onApproved;
}

describe('NexusStatusPoller', () => {
  it('checks once a minute, not every 10 seconds', async () => {
    renderPoller();
    await act(() => vi.advanceTimersByTimeAsync(59_000));
    expect(statusCalls()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(statusCalls()).toBe(1);
  });

  it('does not poll while the tab is hidden', async () => {
    renderPoller();
    act(() => setVisibility('hidden'));
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(statusCalls()).toBe(0);
  });

  it('checks immediately when the tab becomes visible again, then resumes the minute cadence', async () => {
    renderPoller();
    act(() => setVisibility('hidden'));
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    await act(async () => setVisibility('visible'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(statusCalls()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(statusCalls()).toBe(2);
  });

  it('stops polling and reports approval', async () => {
    nextStatus = 'approved';
    const onApproved = renderPoller();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(onApproved).toHaveBeenCalled();
    const after = statusCalls();
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(statusCalls()).toBe(after);
  });
});
