// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { finishReauth, requestReauth, resetReauthForTests, subscribeReauth } from './admin-reauth';

describe('admin re-sign-in coordinator', () => {
  beforeEach(() => resetReauthForTests());

  it('answers null at once when no dialog is mounted (login page, SSR)', async () => {
    await expect(requestReauth()).resolves.toBeNull();
  });

  it('opens the dialog once for a burst of failing calls and gives every caller the new token', async () => {
    const listener = vi.fn();
    subscribeReauth(listener);
    const a = requestReauth();
    const b = requestReauth();
    const c = requestReauth();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(true);
    finishReauth('fresh');
    await expect(Promise.all([a, b, c])).resolves.toEqual(['fresh', 'fresh', 'fresh']);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('stays quiet for a short while after "Not now", then asks again', async () => {
    subscribeReauth(() => {});
    const first = requestReauth(1_000);
    finishReauth(null, 1_000);
    await expect(first).resolves.toBeNull();
    // A background poll right after must not reopen the dialog.
    await expect(requestReauth(5_000)).resolves.toBeNull();
    // A save half a minute later does.
    const later = requestReauth(40_000);
    finishReauth('fresh', 40_000);
    await expect(later).resolves.toBe('fresh');
  });

  it('asks again at once when the user clicks (Try again) right after "Not now"', async () => {
    const listener = vi.fn();
    subscribeReauth(listener);
    const first = requestReauth(1_000);
    finishReauth(null, 1_000);
    await expect(first).resolves.toBeNull();
    // The quiet spell is for background polls. A click means the user wants in.
    const retry = requestReauth(5_000, { userInitiated: true });
    expect(listener).toHaveBeenLastCalledWith(true);
    finishReauth('fresh', 5_000);
    await expect(retry).resolves.toBe('fresh');
  });

  it('tells a dialog that mounts mid-request that it should be open', () => {
    subscribeReauth(() => {});
    void requestReauth();
    const late = vi.fn();
    subscribeReauth(late);
    expect(late).toHaveBeenCalledWith(true);
  });

  it('never prompts an automated browser (E2E signs calls at the network layer)', async () => {
    const listener = vi.fn();
    subscribeReauth(listener);
    vi.stubGlobal('navigator', { webdriver: true });
    try {
      await expect(requestReauth()).resolves.toBeNull();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stops notifying a dialog after it unmounts', () => {
    const listener = vi.fn();
    const off = subscribeReauth(listener);
    off();
    void requestReauth();
    expect(listener).not.toHaveBeenCalled();
  });
});
