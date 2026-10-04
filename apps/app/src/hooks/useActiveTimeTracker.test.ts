import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveTimeTracker } from './useActiveTimeTracker';

/**
 * The tracker counts locally and talks to the server rarely.
 *
 * It used to POST every 60s from every open student tab. Now the interval is
 * 5 minutes, and the seconds counted since the last send go out with
 * sendBeacon (or a keepalive fetch) when the tab is hidden or the page is torn
 * down, so a short visit still lands and nothing is counted twice.
 */

const OPTS = { deviceId: 'dev-1', idToken: 'tok', sessionId: 'sess-1' };

let visibility: DocumentVisibilityState = 'visible';
const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
const beaconMock = vi.fn((_url: string, _body?: BodyInit | null) => true);

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

function sentPayloads(): Array<{ via: 'fetch' | 'beacon'; body: Record<string, unknown>; keepalive?: boolean }> {
  const out: Array<{ via: 'fetch' | 'beacon'; body: Record<string, unknown>; keepalive?: boolean }> = [];
  for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
    out.push({ via: 'fetch', body: JSON.parse(String(init.body)), keepalive: init.keepalive });
  }
  for (const [, body] of beaconMock.mock.calls) out.push({ via: 'beacon', body: JSON.parse(String(body)) });
  return out;
}

const totalSeconds = (p: Record<string, unknown>) => Number(p.activeSeconds) + Number(p.idleSeconds);

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  fetchMock.mockClear();
  beaconMock.mockClear();
  beaconMock.mockImplementation(() => true);
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: beaconMock });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useActiveTimeTracker', () => {
  it('does not send every minute any more', async () => {
    renderHook(() => useActiveTimeTracker(OPTS));
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('sends one batch of five minutes of counted time', async () => {
    renderHook(() => useActiveTimeTracker(OPTS));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [payload] = sentPayloads();
    expect(totalSeconds(payload.body)).toBe(300);
    expect(payload.body).toMatchObject({ deviceId: 'dev-1', idToken: 'tok', sessionId: 'sess-1' });
  });

  it('flushes what it has counted with sendBeacon when the tab is hidden', async () => {
    renderHook(() => useActiveTimeTracker(OPTS));
    await vi.advanceTimersByTimeAsync(42_000);
    setVisibility('hidden');
    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(beaconMock.mock.calls[0][0]).toBe('/api/devices/heartbeat');
    expect(totalSeconds(sentPayloads()[0].body)).toBe(42);
  });

  it('flushes on pagehide, and never sends the same seconds twice', async () => {
    renderHook(() => useActiveTimeTracker(OPTS));
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden'); // fires right after pagehide on a real close
    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(totalSeconds(sentPayloads()[0].body)).toBe(30);
  });

  it('keeps counting after a hide and show, and the next batch has only the new time', async () => {
    renderHook(() => useActiveTimeTracker(OPTS));
    await vi.advanceTimersByTimeAsync(20_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000); // hidden: not counted
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 80_000);
    const payloads = sentPayloads();
    expect(payloads).toHaveLength(2);
    expect(totalSeconds(payloads.find((p) => p.via === 'beacon')!.body)).toBe(20);
    expect(totalSeconds(payloads.find((p) => p.via === 'fetch')!.body)).toBe(220);
  });

  it('falls back to a keepalive fetch when sendBeacon refuses', async () => {
    beaconMock.mockImplementation(() => false);
    renderHook(() => useActiveTimeTracker(OPTS));
    await vi.advanceTimersByTimeAsync(10_000);
    setVisibility('hidden');
    const fetched = sentPayloads().filter((p) => p.via === 'fetch');
    expect(fetched).toHaveLength(1);
    expect(fetched[0].keepalive).toBe(true);
    expect(totalSeconds(fetched[0].body)).toBe(10);
  });

  it('falls back to a keepalive fetch when sendBeacon is missing', async () => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: undefined });
    renderHook(() => useActiveTimeTracker(OPTS));
    await vi.advanceTimersByTimeAsync(10_000);
    window.dispatchEvent(new Event('pagehide'));
    const fetched = sentPayloads().filter((p) => p.via === 'fetch');
    expect(fetched).toHaveLength(1);
    expect(fetched[0].keepalive).toBe(true);
  });

  it('sends nothing when nothing was counted', async () => {
    renderHook(() => useActiveTimeTracker(OPTS));
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    expect(beaconMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
