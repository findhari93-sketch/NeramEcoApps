import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

/**
 * View as Student must not register a device or log time (PERF-0035).
 *
 * getToken hands out the impersonation token while a teacher views as a student,
 * and the server resolves that token as the student. So the teacher's computer
 * used to take the student's device slot, and every minute of the session was
 * logged as the student's active time.
 */

let auth: Record<string, unknown>;
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));
vi.mock('@/lib/device-fingerprint', () => ({
  getDeviceFingerprint: async () => 'fp-1',
  getDeviceCategory: () => 'desktop',
  getDeviceName: () => 'Chrome on Windows',
}));
vi.mock('@/lib/device-collector', () => ({
  collectDeviceInfo: () => ({ device_type: 'desktop', browser: 'Chrome', os: 'Windows', os_version: '11', screen_width: 1280, screen_height: 800, is_pwa: false }),
}));

import DeviceRegistrationProvider from './DeviceRegistrationProvider';

// getToken would redirect the page on an expired session, so the background
// heartbeat and registration must use the silent one (PERF-0054).
const getToken = vi.fn(async (): Promise<string> => {
  throw new Error('the redirecting getToken was used in the background');
});
const getTokenSilently = vi.fn(async () => 'tok');
let fetchSpy: ReturnType<typeof vi.fn<[string, RequestInit?], Promise<unknown>>>;
const calls = (url: string) => fetchSpy.mock.calls.filter(([u]) => u === url);

async function mount() {
  render(<DeviceRegistrationProvider><div /></DeviceRegistrationProvider>);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  fetchSpy = vi.fn<[string, RequestInit?], Promise<unknown>>(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url === '/api/devices/register' ? { device: { id: 'dev-new' } } : { ok: true }),
  }));
  vi.stubGlobal('fetch', fetchSpy);
  auth = {
    getToken,
    getTokenSilently,
    isStudent: true,
    loading: false,
    user: { id: 'stu-1' },
    impersonation: { active: false },
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DeviceRegistrationProvider', () => {
  it('registers a signed-in student\'s device', async () => {
    await mount();
    expect(calls('/api/devices/register')).toHaveLength(1);
  });

  it('registers nothing and logs no time while a teacher views as a student', async () => {
    auth.impersonation = { active: true };
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event('mousedown'));
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(calls('/api/devices/register')).toHaveLength(0);
    expect(calls('/api/devices/heartbeat')).toHaveLength(0);
  });

  it('does not reuse a device another account registered earlier in this tab', async () => {
    sessionStorage.setItem('neram_device_registered', 'stu-other:dev-other');
    await mount();
    expect(calls('/api/devices/register')).toHaveLength(1);
  });

  it('tracks time with the silent token getter, never the redirecting one', async () => {
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event('mousedown'));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(calls('/api/devices/heartbeat')).toHaveLength(1);
    expect(getToken).not.toHaveBeenCalled();
  });

  it('reuses this account\'s own registration instead of registering again', async () => {
    sessionStorage.setItem('neram_device_registered', 'stu-1:dev-mine');
    await mount();
    expect(calls('/api/devices/register')).toHaveLength(0);
  });
});
