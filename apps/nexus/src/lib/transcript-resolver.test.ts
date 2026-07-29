import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The ladder's contract, rung by rung.
 *
 * The two behaviours worth protecting hardest are the ones that were broken:
 * the automatic rungs must run with no delegated token at all (otherwise nothing
 * can ever fetch a transcript from a cron or from a teacher whose scopes are
 * short), and the Teams artifact rung must go through resolveOnlineMeetingDetailed
 * rather than pasting `teams_meeting_id` into a /me/onlineMeetings URL, which is
 * an Outlook event id for every channel meeting and 400s every time.
 */

const getAppOnlyToken = vi.fn();
const fetchTranscriptFromSharePoint = vi.fn();
const resolveOnlineMeetingDetailed = vi.fn();
const resolveOrganizerOid = vi.fn();

vi.mock('@/lib/graph-app-token', () => ({ getAppOnlyToken: () => getAppOnlyToken() }));
vi.mock('@/lib/sharepoint-transcript', () => ({
  fetchTranscriptFromSharePoint: (...args: unknown[]) => fetchTranscriptFromSharePoint(...args),
}));
vi.mock('@/lib/teams-online-meeting', () => ({
  resolveOnlineMeetingDetailed: (...args: unknown[]) => resolveOnlineMeetingDetailed(...args),
  resolveOrganizerOid: (...args: unknown[]) => resolveOrganizerOid(...args),
}));

import { resolveTranscript } from './transcript-resolver';

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Today we are drawing a one point perspective.
`;

beforeEach(() => {
  getAppOnlyToken.mockReset().mockResolvedValue('app-token');
  fetchTranscriptFromSharePoint.mockReset();
  resolveOnlineMeetingDetailed.mockReset().mockResolvedValue({ meeting: null, failure: 'meeting_not_found' });
  resolveOrganizerOid.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTranscript', () => {
  it('prefers what a human handed over, without touching Graph', async () => {
    const result = await resolveTranscript({
      cls: { id: 'c1', recording_url: 'https://sp/rec.mp4' },
      transcriptText: '  we drew cubes  ',
    });

    expect(result.source).toBe('pasted');
    expect(result.entries[0].text).toBe('we drew cubes');
    expect(getAppOnlyToken).not.toHaveBeenCalled();
    expect(fetchTranscriptFromSharePoint).not.toHaveBeenCalled();
  });

  it('parses an uploaded .vtt before any lookup', async () => {
    const result = await resolveTranscript({ cls: { id: 'c1' }, vttContent: VTT });
    expect(result.source).toBe('vtt');
    expect(fetchTranscriptFromSharePoint).not.toHaveBeenCalled();
  });

  it('reads the SharePoint recording app-only, with no signed-in user', async () => {
    fetchTranscriptFromSharePoint.mockResolvedValue(VTT);

    const result = await resolveTranscript({
      cls: { id: 'c1', recording_url: 'https://sp/rec.mp4' },
      msToken: null,
    });

    expect(result.source).toBe('sharepoint');
    expect(result.entries).toHaveLength(1);
    expect(fetchTranscriptFromSharePoint).toHaveBeenCalledWith('https://sp/rec.mp4', 'app-token');
  });

  it('retries with the delegated token only when the app was refused', async () => {
    fetchTranscriptFromSharePoint
      .mockRejectedValueOnce(new Error('NO_ACCESS'))
      .mockResolvedValueOnce(VTT);

    const result = await resolveTranscript({
      cls: { id: 'c1', recording_url: 'https://sp/rec.mp4' },
      msToken: 'user-token',
    });

    expect(result.source).toBe('sharepoint');
    expect(fetchTranscriptFromSharePoint).toHaveBeenNthCalledWith(2, 'https://sp/rec.mp4', 'user-token');
  });

  it('does not retry a recording that simply has no transcript', async () => {
    fetchTranscriptFromSharePoint.mockRejectedValue(new Error('NO_TRANSCRIPT'));

    const result = await resolveTranscript({
      cls: { id: 'c1', recording_url: 'https://sp/rec.mp4' },
      msToken: 'user-token',
    });

    expect(fetchTranscriptFromSharePoint).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('none');
    expect(result.sharepointError).toBe('NO_TRANSCRIPT');
  });

  it('uses the cached transcript_url before anything else costs a lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(VTT, { status: 200 })),
    );

    const result = await resolveTranscript({
      cls: { id: 'c1', transcript_url: 'https://graph/transcript', recording_url: 'https://sp/rec.mp4' },
    });

    expect(result.source).toBe('cached_url');
    expect(fetchTranscriptFromSharePoint).not.toHaveBeenCalled();
  });

  it('falls past a stale cached URL instead of giving up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gone', { status: 404 })),
    );
    fetchTranscriptFromSharePoint.mockResolvedValue(VTT);

    const result = await resolveTranscript({
      cls: { id: 'c1', transcript_url: 'https://graph/stale', recording_url: 'https://sp/rec.mp4' },
    });

    expect(result.source).toBe('sharepoint');
  });

  it('resolves the meeting properly instead of using teams_meeting_id as an onlineMeeting id', async () => {
    resolveOnlineMeetingDetailed.mockResolvedValue({
      meeting: {
        meetingId: 'real-online-meeting-id',
        artifactBase: 'users/organizer-oid/onlineMeetings/real-online-meeting-id',
        token: 'app-token',
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/transcripts')) {
        return new Response(JSON.stringify({ value: [{ transcriptContentUrl: 'https://graph/content' }] }), {
          status: 200,
        });
      }
      return new Response(VTT, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    const supabase = { from: vi.fn().mockReturnValue({ update }) };

    const result = await resolveTranscript({
      cls: {
        id: 'c1',
        // An Outlook event id, which is what a channel meeting stores here.
        teams_meeting_id: 'AAMkAGI2THVSaGFsbG93ZWQ=',
        online_meeting_id: 'real-online-meeting-id',
        teams_meeting_join_url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.tacv2/0',
        organizer_ms_oid: 'organizer-oid',
      },
      supabase,
    });

    expect(result.source).toBe('graph_live');
    expect(resolveOnlineMeetingDetailed).toHaveBeenCalledWith(
      expect.objectContaining({ knownOnlineMeetingId: 'real-online-meeting-id' }),
    );
    // Nothing may address /me/onlineMeetings/{outlook event id}.
    for (const [url] of fetchMock.mock.calls as Array<[string]>) {
      expect(url).not.toContain('me/onlineMeetings/AAMk');
    }
    // And the resolved URL is cached so the next call comes in at the cheap rung.
    expect(supabase.from).toHaveBeenCalledWith('nexus_scheduled_classes');
    expect(update).toHaveBeenCalledWith({ transcript_url: 'https://graph/content' });
  });

  it('reports why the meeting rung produced nothing', async () => {
    resolveOnlineMeetingDetailed.mockResolvedValue({
      meeting: null,
      failure: 'access_policy_missing',
    });

    const result = await resolveTranscript({
      cls: { id: 'c1', teams_meeting_join_url: 'https://teams/join' },
    });

    expect(result.source).toBe('none');
    expect(result.meetingFailure).toBe('access_policy_missing');
  });

  it('is a normal empty answer, not a throw, when there is nothing anywhere', async () => {
    const result = await resolveTranscript({ cls: { id: 'c1' } });
    expect(result).toMatchObject({ entries: [], source: 'none' });
  });
});
