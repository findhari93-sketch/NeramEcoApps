// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Finding one paper's solution videos on the channel.
 *
 * Read through the channel owner's existing grant (the one the class-recording
 * backup uses), a few pages of uploads per call so the browser can show
 * progress, and only the titles that belong to this paper come back.
 */

type Result = { data?: unknown; error?: unknown; count?: number | null };

const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  token: vi.fn(),
  results: new Map<string, Result>(),
}));

function chain(table: string) {
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const result = mocks.results.get(table) ?? { data: null, error: null };
          return (resolve: (v: Result) => void) => resolve(result);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock('@/lib/qb-auth', () => ({ verifyQBStaff: (...a: unknown[]) => mocks.staff(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => chain(table) }),
}));
vi.mock('@/lib/youtube-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/youtube-oauth')>();
  return { ...actual, getUploadAccessToken: (...a: unknown[]) => mocks.token(...a) };
});

import { GET } from './route';
import { YouTubeAuthError } from '@/lib/youtube-oauth';

const req = (qs = '') =>
  new NextRequest(`http://localhost/api/question-bank/papers/p2014/youtube-videos${qs}`, {
    headers: { Authorization: 'Bearer t' },
  });
const params = { params: { id: 'p2014' } };

function page(titles: string[], nextPageToken?: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      nextPageToken,
      items: titles.map((title, i) => ({
        snippet: { title, publishedAt: `2026-09-22T10:0${i}:00Z`, resourceId: { videoId: `vid${title.length}${i}` } },
      })),
    }),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mocks.staff.mockResolvedValue({ ok: true, caller: { id: 't1', user_type: 'teacher' } });
  mocks.token.mockResolvedValue('access-token');
  mocks.results = new Map<string, Result>([
    ['nexus_qb_original_papers', { data: { id: 'p2014', exam_type: 'JEE_PAPER_2', year: 2014, session: null, shift: null }, count: 1 }],
    [
      'nexus_youtube_credentials',
      {
        data: {
          youtube_channel_id: 'UCMit-KIy5J9MTfxTuOZshbA',
          youtube_channel_title: 'neramClasses',
          scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload',
          revoked_at: null,
        },
      },
    ],
  ]);
});

describe('GET /api/question-bank/papers/[id]/youtube-videos', () => {
  it("returns only this paper's solution videos, and where to carry on from", async () => {
    fetchMock.mockResolvedValueOnce(
      page(
        [
          'Q no 22 - JEE 2014 Solution Video - Math Solution',
          'Q no 22 - JEE 2015 Solution Video - Math Solution',
          'JEE 2014 full paper analysis',
          'Deleted video',
        ],
        'NEXT',
      ),
    );
    fetchMock.mockResolvedValueOnce(page(['Q no 31 - JEE 2014 Solution Video - Aptitude Solution']));

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.videos.map((v: { title: string }) => v.title)).toEqual([
      'Q no 22 - JEE 2014 Solution Video - Math Solution',
      'Q no 31 - JEE 2014 Solution Video - Aptitude Solution',
    ]);
    expect(data.checked).toBe(5);
    expect(data.nextPageToken).toBeNull();
    expect(data.channelTitle).toBe('neramClasses');
    expect(JSON.stringify(data)).not.toContain('access-token');

    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain('playlistId=UUMit-KIy5J9MTfxTuOZshbA');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer access-token');
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=NEXT');
  });

  it('stops after five pages and hands back the token to carry on', async () => {
    for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(page(['Other video'], `T${i}`));
    const { data } = await (await GET(req('?pageToken=START'), params)).json();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[0][0])).toContain('pageToken=START');
    expect(data.nextPageToken).toBe('T4');
  });

  it('says YouTube is not connected when there is no grant', async () => {
    mocks.results.set('nexus_youtube_credentials', { data: null });
    const res = await GET(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('not_connected');
  });

  it('says so when the grant cannot read videos', async () => {
    mocks.results.set('nexus_youtube_credentials', {
      data: { youtube_channel_id: 'UCx', scope: 'https://www.googleapis.com/auth/youtube.upload', revoked_at: null },
    });
    expect((await GET(req(), params)).status).toBe(409);
  });

  it('says so when the grant has been revoked', async () => {
    mocks.token.mockRejectedValue(new YouTubeAuthError('invalid_grant', true));
    expect((await GET(req(), params)).status).toBe(409);
  });

  it('reports a YouTube failure as such', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const res = await GET(req(), params);
    expect(res.status).toBe(502);
  });

  it("also returns titles that fit the teacher's sample, which the built-in rules cannot read", async () => {
    mocks.results.set('nexus_qb_original_papers', {
      data: { id: 'p2019', exam_type: 'JEE_PAPER_2', year: 2019, session: 'Session 2', shift: 'afternoon' },
      count: 3,
    });
    fetchMock.mockResolvedValueOnce(
      page([
        'Q no 9 | Session 2 AN 2019 B.Arch | Math explained',
        'Q no 9 | Session 1 AN 2019 B.Arch | Math explained',
        'Q no 50 - JEE 2019 Solution Video Session 2 AN - Aptitude Solution',
      ]),
    );
    const sample = encodeURIComponent('Q no 5 | Session 2 AN 2019 B.Arch | Aptitude explained');
    const { data } = await (await GET(req(`?sample=${sample}`), params)).json();
    expect(data.videos.map((v: { title: string }) => v.title)).toEqual([
      'Q no 9 | Session 2 AN 2019 B.Arch | Math explained',
      'Q no 50 - JEE 2019 Solution Video Session 2 AN - Aptitude Solution',
    ]);
    expect(data.videos[0].parsed).toMatchObject({ number: 9, section: 'math', year: 2019 });
    expect(data.sampleKey).toBe('session 2 an 2019 b arch explained');
  });

  it('ignores a sample that does not name the year', async () => {
    fetchMock.mockResolvedValueOnce(page(['Q no 9 - Math explained']));
    const { data } = await (await GET(req(`?sample=${encodeURIComponent('Q no 5 - Aptitude explained')}`), params)).json();
    expect(data.videos).toEqual([]);
    expect(data.sampleKey).toBeNull();
  });

  it('says the daily limit is used up, not that the connection is broken, when YouTube runs out of quota', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }),
    });
    const res = await GET(req(), params);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain('daily limit');
  });

  it('refuses a student', async () => {
    mocks.staff.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await GET(req(), params)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
