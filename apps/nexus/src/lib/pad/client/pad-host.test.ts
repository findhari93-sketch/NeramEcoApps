// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserHost, cachedTokenGetter, consolePopOut, frameFromTeams, readTestHost, stageSharing, themeFromTeams, tokenExpiresAt } from './pad-host';

/** A JWT-shaped string, base64url over UTF-8 as Entra issues them (names are not always ASCII). */
function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

afterEach(() => {
  delete window.__PAD_TEST_HOST__;
  vi.unstubAllEnvs();
});

describe('Teams context mapping', () => {
  it('maps the Teams theme, treating anything unknown as light', () => {
    expect(themeFromTeams('dark')).toBe('dark');
    expect(themeFromTeams('contrast')).toBe('contrast');
    for (const theme of ['default', '', null, undefined, 'sepia']) expect(themeFromTeams(theme)).toBe('light');
  });

  it('maps the frame context, treating anything unknown as other', () => {
    for (const frame of ['sidePanel', 'meetingStage', 'content', 'settings'] as const) expect(frameFromTeams(frame)).toBe(frame);
    for (const frame of ['remove', 'task', '', null, undefined]) expect(frameFromTeams(frame)).toBe('other');
  });
});

describe('tokenExpiresAt', () => {
  it('reads exp from a base64url payload', () => {
    expect(tokenExpiresAt(jwt({ exp: 1_800_000_000, name: 'Ñandú ✓' }))).toBe(1_800_000_000_000);
  });

  it('answers null for anything it cannot read', () => {
    for (const token of ['', 'opaque', 'a.%%%.c', jwt({ name: 'no expiry' }), jwt({ exp: 'soon' })]) {
      expect(tokenExpiresAt(token)).toBeNull();
    }
  });
});

describe('cachedTokenGetter', () => {
  it('reuses a token until five minutes before it expires, then asks again', async () => {
    let clock = 1_000_000;
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce(jwt({ exp: (1_000_000 + 60 * 60_000) / 1000 }))
      .mockResolvedValueOnce(jwt({ exp: (1_000_000 + 2 * 60 * 60_000) / 1000 }));
    const getToken = cachedTokenGetter(fetchToken, () => clock);

    const first = await getToken();
    clock += 54 * 60_000;
    expect(await getToken()).toBe(first);
    expect(fetchToken).toHaveBeenCalledTimes(1);

    clock += 2 * 60_000;
    expect(await getToken()).not.toBe(first);
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it('shares one request between screens asking at the same moment', async () => {
    const fetchToken = vi.fn(async () => jwt({ exp: Date.now() / 1000 + 3600 }));
    const getToken = cachedTokenGetter(fetchToken);
    const tokens = await Promise.all([getToken(), getToken(), getToken()]);
    expect(new Set(tokens).size).toBe(1);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure, so the next ask tries Teams again', async () => {
    const fetchToken = vi.fn().mockRejectedValueOnce(new Error('consent required')).mockResolvedValueOnce(jwt({ exp: Date.now() / 1000 + 3600 }));
    const getToken = cachedTokenGetter(fetchToken);
    await expect(getToken()).rejects.toThrow('consent required');
    await expect(getToken()).resolves.toMatch(/\./);
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });
});

describe('readTestHost', () => {
  it('uses the host Playwright injects, outside production', async () => {
    window.__PAD_TEST_HOST__ = { token: 'test_abc', meeting: { meetingId: 'm1', chatId: '19:meeting_x@thread.v2' }, theme: 'dark' };
    const host = readTestHost(window);
    expect(host).toMatchObject({ kind: 'test', frame: 'sidePanel', theme: 'dark', meeting: { meetingId: 'm1', chatId: '19:meeting_x@thread.v2', channelId: null } });
    await expect(host!.getToken()).resolves.toBe('test_abc');

    const resumed = vi.fn();
    const stop = host!.onResume(resumed);
    window.dispatchEvent(new Event('pad-test-resume'));
    stop();
    window.dispatchEvent(new Event('pad-test-resume'));
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('ignores a missing or malformed injection', () => {
    expect(readTestHost(window)).toBeNull();
    window.__PAD_TEST_HOST__ = { token: '' };
    expect(readTestHost(window)).toBeNull();
    expect(readTestHost(undefined)).toBeNull();
  });

  it('is inert in a production build, whatever the page contains', () => {
    vi.stubEnv('NODE_ENV', 'production');
    window.__PAD_TEST_HOST__ = { token: 'test_abc' };
    expect(readTestHost(window)).toBeNull();
  });
});

describe('stageSharing', () => {
  type Done = (error: unknown, result: unknown) => void;

  function fakeTeams(overrides: Record<string, unknown> = {}) {
    const meeting = {
      getAppContentStageSharingCapabilities: vi.fn((done: Done) => done(null, { doesAppHaveSharePermission: true })),
      getAppContentStageSharingState: vi.fn((done: Done) => done(null, { isAppSharing: false })),
      shareAppContentToStage: vi.fn((done: Done) => done(null, true)),
      stopSharingAppContentToStage: vi.fn((done: Done) => done(null, true)),
      ...overrides,
    };
    return { meeting, teams: { meeting } as unknown as Parameters<typeof stageSharing>[0] };
  }

  it("turns TeamsJS's callbacks into answers the console can await", async () => {
    const { meeting, teams } = fakeTeams();
    const stage = stageSharing(teams)!;

    await expect(stage.canShare()).resolves.toBe(true);
    await expect(stage.isSharing()).resolves.toBe(false);
    await expect(stage.share('https://nexus.neramclasses.com/pad/stage')).resolves.toBeUndefined();
    expect(meeting.shareAppContentToStage).toHaveBeenCalledWith(expect.any(Function), 'https://nexus.neramclasses.com/pad/stage');
    await expect(stage.stop()).resolves.toBeUndefined();
    expect(meeting.stopSharingAppContentToStage).toHaveBeenCalledTimes(1);
  });

  it('rejects when Teams reports an error, and treats a missing answer as no', async () => {
    const refused = stageSharing(fakeTeams({ shareAppContentToStage: (done: Done) => done({ errorCode: 1000 }, null) }).teams)!;
    await expect(refused.share('https://nexus.neramclasses.com/pad/stage')).rejects.toEqual({ errorCode: 1000 });

    const silent = stageSharing(fakeTeams({ getAppContentStageSharingCapabilities: (done: Done) => done(null, null) }).teams)!;
    await expect(silent.canShare()).resolves.toBe(false);
  });

  it('is absent where the Teams client has no meeting sharing functions', () => {
    expect(stageSharing(fakeTeams({ shareAppContentToStage: undefined }).teams)).toBeUndefined();
    expect(stageSharing({} as unknown as Parameters<typeof stageSharing>[0])).toBeUndefined();
  });
});

describe('browserHost', () => {
  it('hands out the Nexus token and refuses when nobody is signed in', async () => {
    await expect(browserHost(async () => 'nexus-token').getToken()).resolves.toBe('nexus-token');
    await expect(browserHost(async () => null).getToken()).rejects.toThrow('Not signed in');
    expect(browserHost(async () => 'x')).toMatchObject({ kind: 'browser', meeting: null, frame: 'content' });
  });
});

describe('consolePopOut', () => {
  const APP_ID = '7b1e4f0a-3c52-4d8e-9a61-2f9c0b7d5e43';
  type Teams = Parameters<typeof consolePopOut>[0];

  function fakeTeams(supported = true, open: (...args: unknown[]) => Promise<void> = vi.fn(async () => undefined)) {
    const teams = {
      stageView: { isSupported: () => supported, open, StageViewOpenMode: { popout: 'popout', modal: 'modal', popoutWithChat: 'popoutWithChat' } },
    };
    return { teams: teams as unknown as Teams, open };
  }

  const desktop = { app: { appId: { toString: () => APP_ID }, host: { clientType: 'desktop' } }, chat: { id: '19:meeting_abc@thread.v2' } };

  it("opens the running session's console in its own Teams window on desktop", async () => {
    const { teams, open } = fakeTeams();
    const popOut = consolePopOut(teams, desktop, 'https://nexus.neramclasses.com/');
    expect(popOut).toBeTypeOf('function');
    await popOut!('11111111-1111-4111-8111-111111111111');
    expect(open).toHaveBeenCalledWith({
      appId: APP_ID,
      contentUrl: 'https://nexus.neramclasses.com/pad/teams/console?session=11111111-1111-4111-8111-111111111111',
      websiteUrl: 'https://nexus.neramclasses.com/pad',
      title: 'Answer Pad',
      threadId: '19:meeting_abc@thread.v2',
      openMode: 'popout',
    });
  });

  it('waits only briefly, since Teams may answer only when the window closes', async () => {
    vi.useFakeTimers();
    try {
      const { teams } = fakeTeams(true, () => new Promise<void>(() => undefined));
      const done = vi.fn();
      const pending = consolePopOut(teams, desktop, 'https://nexus.neramclasses.com')!('s1').then(done);
      await vi.advanceTimersByTimeAsync(1_500);
      await pending;
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is absent on Teams web or mobile, without an app id, or where stage views are unsupported', () => {
    expect(consolePopOut(fakeTeams().teams, { ...desktop, app: { ...desktop.app, host: { clientType: 'web' } } }, 'https://x.test')).toBeUndefined();
    expect(consolePopOut(fakeTeams().teams, { ...desktop, app: { host: { clientType: 'desktop' } } }, 'https://x.test')).toBeUndefined();
    expect(consolePopOut(fakeTeams(false).teams, desktop, 'https://x.test')).toBeUndefined();
  });
});
