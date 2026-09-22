import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useActiveTimeTracker } from './useActiveTimeTracker';

/**
 * The student activity heartbeat (PERF-0033, PERF-0034, PERF-0036).
 *
 * Measured on prod before this: 54% of a week's device_activity_logs rows held no
 * active time, because hidden and idle tabs kept posting. The page-hide flush went
 * out as a sendBeacon with no Authorization header, which the route always refuses.
 * And every heartbeat asked for the student's location, so the browser's permission
 * prompt appeared about a minute in with no explanation.
 */

let visibility: DocumentVisibilityState = 'visible';
let permission: PermissionState = 'prompt';
const getCurrentPosition = vi.fn((ok: PositionCallback) =>
  ok({ coords: { latitude: 13, longitude: 80, accuracy: 20 } } as GeolocationPosition),
);
const sendBeacon = vi.fn(() => true);
let fetchSpy: ReturnType<typeof vi.fn<[string, RequestInit?], Promise<unknown>>>;

const heartbeats = () =>
  fetchSpy.mock.calls
    .filter(([url]) => url === '/api/devices/heartbeat')
    .map(([, init]) => ({ init: init as RequestInit, body: JSON.parse((init as RequestInit).body as string) }));

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

const touch = () => window.dispatchEvent(new Event('mousedown'));

/** Let the tracker's async work (token, permission check, fetch) settle. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function mountTracker() {
  const getToken = vi.fn(async () => 'tok');
  const hook = renderHook(() => useActiveTimeTracker({ deviceId: 'dev-1', getToken }));
  return { getToken, ...hook };
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  permission = 'prompt';
  getCurrentPosition.mockClear();
  sendBeacon.mockClear();
  fetchSpy = vi.fn<[string, RequestInit?], Promise<unknown>>(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  vi.stubGlobal('fetch', fetchSpy);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: permission })) },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useActiveTimeTracker', () => {
  it('sends a heartbeat for a minute with activity in it', async () => {
    mountTracker();
    touch();
    await advance(60_000);
    expect(heartbeats()).toHaveLength(1);
    expect(heartbeats()[0].body.activeSeconds).toBeGreaterThan(0);
  });

  it('sends nothing for minutes with no activity, and carries that idle time into the next one', async () => {
    mountTracker();
    await advance(60_000); // the first 15s after opening count as active
    expect(heartbeats()).toHaveLength(1);

    await advance(120_000); // two idle minutes
    expect(heartbeats()).toHaveLength(1);

    touch();
    await advance(60_000);
    expect(heartbeats()).toHaveLength(2);
    const { body } = heartbeats()[1];
    expect(body.activeSeconds).toBeGreaterThan(0);
    expect(body.idleSeconds).toBeGreaterThanOrEqual(120);
  });

  it('stops counting and posting while the tab is hidden', async () => {
    mountTracker();
    touch();
    await advance(10_000);
    setVisibility('hidden');
    await flush();
    const afterHide = heartbeats().length;

    await advance(10 * 60_000);
    expect(heartbeats()).toHaveLength(afterHide);

    // Coming back starts the clock again, and none of the hidden time is reported.
    setVisibility('visible');
    touch();
    await advance(60_000);
    expect(heartbeats()).toHaveLength(afterHide + 1);
    const { body } = heartbeats()[afterHide];
    expect(body.activeSeconds + body.idleSeconds).toBeLessThanOrEqual(60);
  });

  it('flushes on page hide with the Authorization header the route requires', async () => {
    mountTracker();
    await flush();
    touch();
    await advance(10_000);
    setVisibility('hidden');
    await flush();

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(heartbeats()).toHaveLength(1);
    const { init, body } = heartbeats()[0];
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(body.activeSeconds).toBeGreaterThan(0);
  });

  it('never asks for location on its own, so no permission prompt appears', async () => {
    permission = 'prompt';
    mountTracker();
    touch();
    await advance(60_000);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(heartbeats()).toHaveLength(1);
    expect(heartbeats()[0].body.location).toBeNull();
  });

  it('still reads location when the student has already allowed it', async () => {
    permission = 'granted';
    mountTracker();
    touch();
    await advance(60_000);
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(heartbeats()[0].body.location).toMatchObject({ latitude: 13, longitude: 80 });
  });
});
