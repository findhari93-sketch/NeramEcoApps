/**
 * Where the Answer Pad is running, and how it gets a token there.
 *
 *   teams    inside a Teams meeting (side panel or stage): TeamsJS for the
 *            meeting, the theme, resume events and the SSO token
 *   browser  the /pad room-code page, signed in to Nexus as usual
 *   test     non-production only: a host injected by Playwright as
 *            window.__PAD_TEST_HOST__, so a full class can be driven without Teams
 *
 * Screens depend on this interface only, never on TeamsJS directly.
 */

import type { TeamsMeetingContext } from '../session-binding';

export type PadHostKind = 'teams' | 'browser' | 'test';
export type PadTheme = 'light' | 'dark' | 'contrast';
export type PadFrame = 'sidePanel' | 'meetingStage' | 'content' | 'settings' | 'other';

/** Putting a pad page on the meeting screen for everyone. Only Teams meetings have it. */
export interface PadStageSharing {
  /** Whether this person may share to the meeting screen: organizers and presenters. */
  canShare(): Promise<boolean>;
  /** Whether this app is on the meeting screen now. */
  isSharing(): Promise<boolean>;
  /** Share a page on the pad's own domain. */
  share(url: string): Promise<void>;
  stop(): Promise<void>;
}

export interface PadHost {
  kind: PadHostKind;
  meeting: TeamsMeetingContext | null;
  frame: PadFrame;
  theme: PadTheme;
  /** A bearer token for /api/pad, reused until shortly before it expires. */
  getToken(): Promise<string>;
  /** Teams brought a cached tab back; the screen should refetch. Returns an unsubscribe. */
  onResume(handler: () => void): () => void;
  onThemeChange(handler: (theme: PadTheme) => void): () => void;
  /** Absent outside a Teams meeting. */
  stage?: PadStageSharing;
}

export interface InjectedTestHost {
  token: string;
  meeting?: Partial<TeamsMeetingContext> | null;
  frame?: PadFrame;
  theme?: PadTheme;
}

declare global {
  interface Window {
    __PAD_TEST_HOST__?: InjectedTestHost;
  }
}

const INIT_TIMEOUT_MS = 5_000;
/** Ask Teams for a fresh token this long before the current one expires. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
/** When a token cannot be read, assume it lasts this long. */
const UNKNOWN_TOKEN_LIFETIME_MS = 10 * 60_000;

export function themeFromTeams(theme: string | null | undefined): PadTheme {
  if (theme === 'dark') return 'dark';
  if (theme === 'contrast') return 'contrast';
  return 'light';
}

export function frameFromTeams(frameContext: string | null | undefined): PadFrame {
  switch (frameContext) {
    case 'sidePanel':
    case 'meetingStage':
    case 'content':
    case 'settings':
      return frameContext;
    default:
      return 'other';
  }
}

/** Milliseconds since the epoch at which a JWT expires, or null when it cannot be read. */
export function tokenExpiresAt(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    // base64url over UTF-8: atob alone would garble a non-ASCII name in the payload.
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return typeof json?.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** A token getter that asks `fetchToken` again only near expiry, and shares one request between callers. */
export function cachedTokenGetter(fetchToken: () => Promise<string>, now: () => number = Date.now): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  return async () => {
    if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > now()) return cached.token;
    if (!pending) {
      pending = fetchToken()
        .then((token) => {
          cached = { token, expiresAt: tokenExpiresAt(token) ?? now() + UNKNOWN_TOKEN_LIFETIME_MS };
          return token;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
}

/** The Playwright host, never in a production build. */
export function readTestHost(win: Window | undefined): PadHost | null {
  if (process.env.NODE_ENV === 'production') return null;
  const injected = win?.__PAD_TEST_HOST__;
  if (!injected || typeof injected.token !== 'string' || !injected.token) return null;

  const meeting = injected.meeting
    ? { meetingId: injected.meeting.meetingId ?? null, chatId: injected.meeting.chatId ?? null, channelId: injected.meeting.channelId ?? null }
    : null;

  return {
    kind: 'test',
    meeting: meeting && (meeting.meetingId || meeting.chatId || meeting.channelId) ? meeting : null,
    frame: injected.frame ?? 'sidePanel',
    theme: injected.theme ?? 'light',
    getToken: async () => injected.token,
    onResume: (handler) => {
      win!.addEventListener('pad-test-resume', handler);
      return () => win!.removeEventListener('pad-test-resume', handler);
    },
    onThemeChange: () => () => undefined,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type TeamsJs = typeof import('@microsoft/teams-js');

/** A TeamsJS callback as a promise: an error rejects, anything else resolves with the result. */
function settle<T>(run: (done: (error: unknown, result: T | null) => void) => void): Promise<T | null> {
  return new Promise((resolve, reject) => {
    run((error, result) => (error ? reject(error) : resolve(result)));
  });
}

/** Share to the meeting screen through TeamsJS (Apps for Teams meeting stage). Undefined where the client has no meeting APIs. */
export function stageSharing(teams: TeamsJs): PadStageSharing | undefined {
  // TeamsJS's meeting module has no isSupported(); a client without these functions cannot share.
  const meeting = teams.meeting as Partial<TeamsJs['meeting']> | undefined;
  const capabilities = meeting?.getAppContentStageSharingCapabilities;
  const sharingState = meeting?.getAppContentStageSharingState;
  const shareToStage = meeting?.shareAppContentToStage;
  const stopSharing = meeting?.stopSharingAppContentToStage;
  if (!capabilities || !sharingState || !shareToStage || !stopSharing) return undefined;

  return {
    canShare: async () => Boolean((await settle<{ doesAppHaveSharePermission: boolean }>((done) => capabilities(done)))?.doesAppHaveSharePermission),
    isSharing: async () => Boolean((await settle<{ isAppSharing: boolean }>((done) => sharingState(done)))?.isAppSharing),
    share: async (url) => {
      await settle<boolean>((done) => shareToStage(done, url));
    },
    stop: async () => {
      await settle<boolean>((done) => stopSharing(done));
    },
  };
}

/**
 * Connect to Teams, or resolve null when the page is not running inside it.
 * TeamsJS is loaded on demand so the browser pages never download it.
 */
export async function connectTeamsHost(): Promise<PadHost | null> {
  const teams = await import('@microsoft/teams-js');
  try {
    await withTimeout(teams.app.initialize(), INIT_TIMEOUT_MS);
  } catch {
    return null;
  }

  const context = await teams.app.getContext();
  const resumeHandlers = new Set<() => void>();
  const themeHandlers = new Set<(theme: PadTheme) => void>();

  teams.app.registerOnThemeChangeHandler((theme) => {
    for (const handler of themeHandlers) handler(themeFromTeams(theme));
  });

  // Cached tabs: Teams keeps the panel alive while hidden and says when it returns.
  try {
    teams.app.lifecycle.registerBeforeSuspendOrTerminateHandler(async () => undefined);
    teams.app.lifecycle.registerOnResumeHandler(() => {
      for (const handler of resumeHandlers) handler();
      void teams.app.notifySuccess();
    });
  } catch {
    // This client does not cache tabs; visibility changes still trigger refetches.
  }

  void teams.app.notifySuccess();

  const frame = frameFromTeams(context.page?.frameContext);
  return {
    kind: 'teams',
    meeting: {
      meetingId: context.meeting?.id ?? null,
      chatId: context.chat?.id ?? null,
      channelId: context.channel?.id ?? null,
    },
    frame,
    theme: themeFromTeams(context.app?.theme),
    // Only the side panel can put something on the meeting screen, and only in a meeting.
    stage: frame === 'sidePanel' && context.meeting?.id ? stageSharing(teams) : undefined,
    getToken: cachedTokenGetter(() => teams.authentication.getAuthToken()),
    onResume: (handler) => {
      resumeHandlers.add(handler);
      return () => resumeHandlers.delete(handler);
    },
    onThemeChange: (handler) => {
      themeHandlers.add(handler);
      return () => themeHandlers.delete(handler);
    },
  };
}

/** The /pad room-code page: a top-level Nexus page with the usual sign-in. */
export function browserHost(getToken: () => Promise<string | null>): PadHost {
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return {
    kind: 'browser',
    meeting: null,
    frame: 'content',
    theme: prefersDark ? 'dark' : 'light',
    getToken: async () => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      return token;
    },
    onResume: () => () => undefined,
    onThemeChange: () => () => undefined,
  };
}
