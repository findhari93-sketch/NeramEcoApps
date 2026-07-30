import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The ladder's contract, rung by rung.
 *
 * The behaviours worth protecting hardest are the ones that were broken:
 *
 *  - Every transcript content request must name `text/vtt`. Node's fetch sends
 *    `Accept: * / *` by default and Graph answers `400 Invalid format`, which is
 *    what made the cached-URL and artifact rungs fail for every class ever asked
 *    about. A regression here is invisible: a failed fetch is a normal
 *    fall-through, so the only symptom is "no transcript found" forever.
 *  - Anything found must be stored, and a stored copy must short-circuit the
 *    whole ladder. That is what keeps the running cost at one Graph call per
 *    class rather than one per button press.
 *  - The automatic rungs must run with no delegated token at all, otherwise
 *    nothing can fetch a transcript from a cron.
 *  - The Teams artifact rung must go through resolveOnlineMeetingDetailed rather
 *    than pasting `teams_meeting_id` into a /me/onlineMeetings URL, which is an
 *    Outlook event id for every channel meeting and 400s every time.
 *  - When one meeting id holds several transcripts, which is what a recurring
 *    meeting produces, the one nearest this class's start must win.
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

import {
  resolveTranscript,
  recordTranscriptFailure,
  MAX_TRANSCRIPT_ATTEMPTS,
} from './transcript-resolver';

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Today we are drawing a one point perspective.
`;

/**
 * A Supabase stand-in covering the three shapes this module uses: reading the
 * stored transcript, upserting it, and caching transcript_url on the class.
 */
function makeSupabase(stored?: { vtt: string; status: string } | null, attempts = 0) {
  const upsert = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
  const from = vi.fn((table: string) => {
    if (table === 'nexus_class_transcripts') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: stored ? { ...stored, attempts } : { attempts } }),
          }),
        }),
        upsert,
      };
    }
    return { update };
  });
  return { supabase: { from } as any, upsert, update, from };
}

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

    const { supabase, update, from, upsert } = makeSupabase(null);

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
    expect(from).toHaveBeenCalledWith('nexus_scheduled_classes');
    expect(update).toHaveBeenCalledWith({ transcript_url: 'https://graph/content' });
    // The text itself is stored too, which is what actually makes it cheap.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'graph_live', status: 'ok' }),
      { onConflict: 'class_id' },
    );
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

  it('reads the stored copy and touches neither Graph nor a token', async () => {
    const { supabase } = makeSupabase({ vtt: VTT, status: 'ok' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveTranscript({
      cls: {
        id: 'c1',
        transcript_url: 'https://graph/transcript',
        recording_url: 'https://sp/rec.mp4',
        online_meeting_id: 'm',
      },
      supabase,
    });

    expect(result.source).toBe('stored');
    expect(result.entries).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAppOnlyToken).not.toHaveBeenCalled();
    expect(fetchTranscriptFromSharePoint).not.toHaveBeenCalled();
  });

  it('asks Graph for text/vtt, because the default Accept makes it 400', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(VTT, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { supabase } = makeSupabase(null);

    const result = await resolveTranscript({
      cls: { id: 'c1', transcript_url: 'https://graph/transcript' },
      supabase,
    });

    expect(result.source).toBe('cached_url');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('$format=text/vtt');
    expect(init?.headers).toMatchObject({ Accept: 'text/vtt' });
  });

  it('does not double up $format when the stored URL already carries one', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(VTT, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { supabase } = makeSupabase(null);

    await resolveTranscript({
      cls: { id: 'c1', transcript_url: 'https://graph/transcript?$format=text/vtt' },
      supabase,
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url.match(/\$format/g)).toHaveLength(1);
  });

  it('stores what it finds, so the next call is free', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(VTT, { status: 200 })),
    );
    const { supabase, upsert } = makeSupabase(null);

    await resolveTranscript({
      cls: { id: 'c1', transcript_url: 'https://graph/transcript' },
      supabase,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        class_id: 'c1',
        vtt: VTT,
        segments: 1,
        source: 'cached_url',
        status: 'ok',
        attempts: 0,
      }),
      { onConflict: 'class_id' },
    );
  });

  it('still answers when the store refuses, and says so loudly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(VTT, { status: 200 })),
    );
    const { supabase, upsert } = makeSupabase(null);
    // PostgREST hands back an error rather than throwing, which is exactly how an
    // unwritten table stays invisible.
    upsert.mockResolvedValue({ error: { message: 'relation does not exist' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await resolveTranscript({
      cls: { id: 'c1', transcript_url: 'https://graph/transcript' },
      supabase,
    });

    expect(result.source).toBe('cached_url');
    expect(result.entries).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('STORE FAILED'),
      'relation does not exist',
    );
    spy.mockRestore();
  });

  it('lets a fresh upload overwrite the stored copy', async () => {
    const stale = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nthe wrong class\n';
    const { supabase, upsert } = makeSupabase({ vtt: stale, status: 'ok' });

    const result = await resolveTranscript({ cls: { id: 'c1' }, vttContent: VTT, supabase });

    expect(result.source).toBe('vtt');
    expect(result.entries[0].text).toContain('one point perspective');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'vtt', status: 'ok' }),
      { onConflict: 'class_id' },
    );
  });

  it('picks the occurrence that belongs to this class, not the first in the list', async () => {
    resolveOnlineMeetingDetailed.mockResolvedValue({
      meeting: { artifactBase: 'users/o/onlineMeetings/m', token: 'app-token' },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/transcripts')) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 'a',
                createdDateTime: '2026-07-21T13:30:00Z',
                transcriptContentUrl: 'https://graph/last-week',
              },
              {
                id: 'b',
                createdDateTime: '2026-07-28T13:30:00Z',
                transcriptContentUrl: 'https://graph/this-class',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(VTT, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { supabase } = makeSupabase(null);

    const result = await resolveTranscript({
      cls: {
        id: 'c1',
        online_meeting_id: 'm',
        organizer_ms_oid: 'o',
        // 7 pm IST is 13:30 UTC, so transcript 'b' sits right on the class start.
        scheduled_date: '2026-07-28',
        start_time: '19:00:00',
      },
      supabase,
    });

    expect(result.source).toBe('graph_live');
    const fetched = fetchMock.mock.calls.map(([u]) => String(u));
    expect(fetched.some((u) => u.startsWith('https://graph/this-class'))).toBe(true);
    expect(fetched.some((u) => u.startsWith('https://graph/last-week'))).toBe(false);
  });

  it('refuses a transcript that cannot belong to this class', async () => {
    resolveOnlineMeetingDetailed.mockResolvedValue({
      meeting: { artifactBase: 'users/o/onlineMeetings/m', token: 'app-token' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            value: [
              { id: 'a', createdDateTime: '2026-05-01T13:30:00Z', transcriptContentUrl: 'https://graph/a' },
              { id: 'b', createdDateTime: '2026-06-01T13:30:00Z', transcriptContentUrl: 'https://graph/b' },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const { supabase } = makeSupabase(null);

    const result = await resolveTranscript({
      cls: {
        id: 'c1',
        online_meeting_id: 'm',
        organizer_ms_oid: 'o',
        scheduled_date: '2026-07-28',
        start_time: '19:00:00',
      },
      supabase,
    });

    expect(result.source).toBe('none');
    expect(result.meetingFailure).toBe('no_transcript_matches_this_class');
  });
});

describe('recordTranscriptFailure', () => {
  it('stays pending while there are attempts left', async () => {
    const { supabase, upsert } = makeSupabase(null, 0);

    const status = await recordTranscriptFailure(supabase, 'c1', 'NO_TRANSCRIPT');

    expect(status).toBe('pending');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ class_id: 'c1', status: 'pending', attempts: 1 }),
      { onConflict: 'class_id' },
    );
  });

  it('goes terminal once attempts run out, so nothing retries forever', async () => {
    const { supabase, upsert } = makeSupabase(null, MAX_TRANSCRIPT_ATTEMPTS - 1);

    const status = await recordTranscriptFailure(supabase, 'c1', 'NO_TRANSCRIPT');

    expect(status).toBe('unavailable');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unavailable', attempts: MAX_TRANSCRIPT_ATTEMPTS }),
      { onConflict: 'class_id' },
    );
  });
});
