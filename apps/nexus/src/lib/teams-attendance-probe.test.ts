import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseChannelJoinUrl, probeAttendanceStrategies } from './teams-attendance-probe';

const THREAD = '19:EMRG-7AiVM6ZpFfIf2rBGeFbPMeMC-BZHE8m8EUeaaU1@thread.tacv2';
const ORGANIZER = 'f51c6475-0c5e-4ba5-9876-474668f381ec';
const PROD_JOIN_URL =
  'https://teams.microsoft.com/l/meetup-join/19%3aEMRG-7AiVM6ZpFfIf2rBGeFbPMeMC-BZHE8m8EUeaaU1%40thread.tacv2/1784526278019' +
  '?context=%7b%22Tid%22%3a%2234f1037a-2491-4c77-a011-f0c12e275c57%22%2c%22Oid%22%3a%22f51c6475-0c5e-4ba5-9876-474668f381ec%22%7d';

/** The exact body production stores for the app-only refusal. */
const POLICY_403 =
  '{"error":{"code":"forbidden","message":"No application access policy found for this app aa039c70-50d2-4c91-bd0e-5675df5e50ff on the user","innerError":{"date":"2026-07-26T11:59:56"}}}';

afterEach(() => {
  vi.unstubAllGlobals();
});

function res(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}

describe('parseChannelJoinUrl', () => {
  it('pulls thread, message id, oid and tenant out of the real prod URL', () => {
    expect(parseChannelJoinUrl(PROD_JOIN_URL)).toEqual({
      threadId: THREAD,
      messageId: '1784526278019',
      organizerOid: ORGANIZER,
      tenantId: '34f1037a-2491-4c77-a011-f0c12e275c57',
    });
  });

  it('survives a URL with no context param', () => {
    const bare = `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent(THREAD)}/1784526278019`;
    expect(parseChannelJoinUrl(bare)).toMatchObject({ threadId: THREAD, messageId: '1784526278019', organizerOid: null });
  });

  it('returns nulls for a non-meeting URL', () => {
    expect(parseChannelJoinUrl('https://example.com/')).toEqual({
      threadId: null,
      messageId: null,
      organizerOid: null,
      tenantId: null,
    });
  });
});

describe('probeAttendanceStrategies', () => {
  const baseInput = {
    appToken: 'app-token',
    delegatedToken: 'delegated-token',
    callerOid: ORGANIZER,
    organizerOid: ORGANIZER,
    joinUrl: PROD_JOIN_URL,
    knownOnlineMeetingId: null,
  };

  it('preserves a Graph 403 body character for character', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(403, POLICY_403)));

    const { attempts } = await probeAttendanceStrategies(baseInput);
    const appOnly = attempts.find((a) => a.key === 'app_joinurl');
    expect(appOnly?.status).toBe(403);
    expect(appOnly?.body).toBe(POLICY_403);
  });

  it('records every strategy, not just the first that works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(403, POLICY_403)));

    const { attempts } = await probeAttendanceStrategies(baseInput);
    expect(attempts.map((a) => a.key)).toEqual([
      'app_joinurl',
      'me_joinurl',
      'me_chatinfo_v1',
      'me_chatinfo_msg_beta',
      'app_chatinfo',
    ]);
  });

  it('skips the delegated strategies, rather than failing them, for a non-organizer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(403, POLICY_403));
    vi.stubGlobal('fetch', fetchMock);

    const { attempts, callerIsOrganizer, verdict } = await probeAttendanceStrategies({
      ...baseInput,
      callerOid: '5b3c917c-7d27-4bda-b009-26460aee806c',
    });

    expect(callerIsOrganizer).toBe(false);
    const me = attempts.find((a) => a.key === 'me_joinurl');
    expect(me?.skipped).toMatch(/not this meeting's organizer/);
    expect(me?.status).toBeNull();
    expect(attempts.some((a) => a.key.startsWith('me_chatinfo'))).toBe(false);
    expect(verdict).toMatch(/Sign in as the organizer/);
  });

  it('follows a successful lookup with an attendanceReports call', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/users/')) return res(403, POLICY_403);
      if (url.includes('/attendanceReports')) {
        return res(200, { value: [{ id: 'report-1', totalParticipantCount: 21 }] });
      }
      return res(200, { value: [{ id: 'meeting-1' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { winner, verdict } = await probeAttendanceStrategies(baseInput);
    expect(winner?.key).toBe('winner_reports');
    expect(winner?.reportCount).toBe(1);
    expect(verdict).toMatch(/worked \(HTTP 200/);
  });

  it('names the real conclusion when the organizer token is accepted but matches nothing', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/users/')) return res(403, POLICY_403);
      return res(200, { value: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { winner, verdict } = await probeAttendanceStrategies(baseInput);
    expect(winner).toBeNull();
    expect(verdict).toMatch(/not addressable through/);
    expect(verdict).toMatch(/@thread\.tacv2/);
  });

  it('probes the cached meeting id on both identities when one is stored', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(403, POLICY_403)));

    const { attempts } = await probeAttendanceStrategies({
      ...baseInput,
      knownOnlineMeetingId: 'MSpmNTFj',
    });
    expect(attempts.map((a) => a.key)).toContain('cached_reports_delegated');
    expect(attempts.map((a) => a.key)).toContain('cached_reports_app');
  });

  it('reports a missing token as a skip instead of pretending it failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { value: [] })));

    const { attempts } = await probeAttendanceStrategies({ ...baseInput, appToken: null });
    const appOnly = attempts.find((a) => a.key === 'app_joinurl');
    expect(appOnly?.skipped).toBe('No app-only token available');
    expect(appOnly?.status).toBeNull();
  });
});
