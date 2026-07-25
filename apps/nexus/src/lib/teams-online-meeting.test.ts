import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveOnlineMeeting } from './teams-online-meeting';

// App-only token path is exercised via the mocked fetch below; stub the token so
// the app-only branch runs without real Azure creds.
vi.mock('@/lib/graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'app-token'),
}));

const AAMK_EVENT_ID = 'AAMkAGExNjgzOGVhLTYzMGQtNGVmYS1hODFlLTFiMjg5ZDI0ZWI4Yg==';
const ONLINE_MEETING_ID = 'MSpkYzE3Njc0Yy04MWQ5KjBmZjQ3M2E2LTA5YjMtNGY';
const JOIN_URL = 'https://teams.microsoft.com/l/meetup-join/xyz';

/**
 * Route the mocked fetch by which onlineMeetings collection is queried:
 *   - `me/onlineMeetings`        → the caller (delegated)
 *   - `users/{oid}/onlineMeetings` → the organizer (app-only)
 */
function mockGraph(handlers: { me?: string | null; user?: string | null }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const isUser = url.includes('/users/');
      const id = isUser ? handlers.user : handlers.me;
      if (id === undefined || id === null) {
        return { ok: id === null ? true : false, json: async () => ({ value: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ value: [{ id }] }) } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveOnlineMeeting', () => {
  it('resolves via the delegated /me path when the caller is the organizer', async () => {
    mockGraph({ me: ONLINE_MEETING_ID });
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: ONLINE_MEETING_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r?.meetingId).toBe(ONLINE_MEETING_ID);
    expect(r?.artifactBase).toBe(`me/onlineMeetings/${ONLINE_MEETING_ID}`);
    expect(r?.token).toBe('deleg');
  });

  it('falls back to app-only /users/{oid} for a group/channel meeting the teacher did not personally organize', async () => {
    // /me finds nothing (organizer is the Team), but the app-only organizer path does.
    mockGraph({ me: null, user: ONLINE_MEETING_ID });
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r?.meetingId).toBe(ONLINE_MEETING_ID);
    expect(r?.artifactBase).toBe(`users/oid-123/onlineMeetings/${ONLINE_MEETING_ID}`);
    expect(r?.token).toBe('app-token');
  });

  it('returns null when neither path resolves an Outlook-event-id meeting', async () => {
    mockGraph({ me: null, user: null });
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r).toBeNull();
  });

  it('falls back to the stored id for a link_only meeting (already an onlineMeeting id, no join URL)', async () => {
    mockGraph({});
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: ONLINE_MEETING_ID,
      joinUrl: null,
      organizerOid: null,
    });
    expect(r?.meetingId).toBe(ONLINE_MEETING_ID);
    expect(r?.artifactBase).toBe(`me/onlineMeetings/${ONLINE_MEETING_ID}`);
  });
});
