import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The backup sweep's contract.
 *
 * Almost every assertion here is about NOT doing work, because doing it wrong is
 * metered: videos.insert costs 1600 of a 10,000-unit daily quota and the units
 * are charged when the session OPENS, not when the bytes land. Six wasted starts
 * is a whole day of uploads gone.
 *
 * The two rules that carry the most weight, and that a refactor would most
 * easily break: a part-finished upload is always resumed before any new one is
 * started, and resumes are NOT capped, because finishing one costs nothing while
 * starting a new one costs 1600.
 */

const initiateUpload = vi.fn();
const uploadChunk = vi.fn();
const queryUploadOffset = vi.fn();
const resolveRecordingSource = vi.fn();
const fetchSlice = vi.fn();
const getUploadAccessToken = vi.fn();
const generateVideoMetaForClass = vi.fn();
const syncClassToLibrary = vi.fn();

vi.mock('@/lib/youtube-upload', async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    initiateUpload: (...a: unknown[]) => initiateUpload(...a),
    uploadChunk: (...a: unknown[]) => uploadChunk(...a),
    queryUploadOffset: (...a: unknown[]) => queryUploadOffset(...a),
  };
});
vi.mock('@/lib/recording-source', () => ({
  resolveRecordingSource: (...a: unknown[]) => resolveRecordingSource(...a),
  fetchSlice: (...a: unknown[]) => fetchSlice(...a),
}));
vi.mock('@/lib/youtube-oauth', () => ({
  getUploadAccessToken: (...a: unknown[]) => getUploadAccessToken(...a),
  YouTubeAuthError: class extends Error {
    revoked: boolean;
    constructor(m: string, r: boolean) { super(m); this.revoked = r; }
  },
}));
vi.mock('@/lib/class-video-meta-ai', () => ({
  generateVideoMetaForClass: (...a: unknown[]) => generateVideoMetaForClass(...a),
}));
vi.mock('@/lib/class-library-bridge', () => ({
  syncClassToLibrary: (...a: unknown[]) => syncClassToLibrary(...a),
}));
vi.mock('@/lib/class-absences', () => ({ istToday: () => '2026-07-30' }));

import {
  syncClassYouTubeBackups,
  uploadBudget,
  pacificDayStartUtc,
  MAX_UPLOAD_ATTEMPTS,
  MAX_NEW_UPLOADS_PER_DAY,
  MAX_NEW_UPLOADS_PER_RUN,
} from './youtube-backup-sync';

/** A class that ended long ago, so the grace period never excludes it. */
function endedClass(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    classroom_id: 'r1',
    teacher_id: 'u1',
    title: `Class ${id}`,
    description: null,
    summary_bullets: null,
    scheduled_date: '2026-07-20',
    start_time: '19:00:00',
    end_time: '20:30:00',
    recording_url: 'https://x.sharepoint.com/rec.mp4',
    youtube_url: null,
    ...over,
  };
}

function makeSupabase(classes: any[], uploads: any[], opts: { startedToday?: number } = {}) {
  const upserts: any[] = [];
  const updates: Record<string, any[]> = {};

  const classesChain: any = {};
  for (const m of ['select', 'not', 'is', 'neq', 'eq', 'gte', 'lte', 'order']) {
    classesChain[m] = vi.fn(() => classesChain);
  }
  classesChain.limit = vi.fn(async () => ({ data: classes, error: null }));

  const from = vi.fn((table: string) => {
    if (table === 'nexus_scheduled_classes') {
      return {
        ...classesChain,
        update: vi.fn((v: any) => {
          (updates[table] ||= []).push(v);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      };
    }

    if (table === 'nexus_class_video_uploads') {
      const chain: any = {
        upsert: vi.fn(async (row: any) => { upserts.push(row); return { error: null }; }),
        update: vi.fn((v: any) => {
          (updates[table] ||= []).push(v);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      };
      chain.select = vi.fn((_cols: string, o?: any) => {
        if (o?.head) {
          // The quota count query.
          return { gte: vi.fn(async () => ({ count: opts.startedToday ?? 0 })) };
        }
        const sub: any = {
          in: vi.fn(async () => ({ data: uploads, error: null })),
        };
        // The promotion pass chain: .eq().eq().not().limit()
        sub.eq = vi.fn(() => sub);
        sub.not = vi.fn(() => sub);
        sub.limit = vi.fn(async () => ({ data: [], error: null }));
        return sub;
      });
      return chain;
    }

    // nexus_class_video_meta and anything else
    const generic: any = {
      update: vi.fn((v: any) => {
        (updates[table] ||= []).push(v);
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
      upsert: vi.fn(async () => ({ error: null })),
    };
    generic.select = vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { yt_title: 'A title', yt_description: 'd', yt_tags: [] } })) })),
    }));
    return generic;
  });

  return { supabase: { from } as any, upserts, updates };
}

/** A full, immediate, one-chunk success. */
function succeedInOneChunk() {
  resolveRecordingSource.mockResolvedValue({ downloadUrl: 'https://dl', size: 100, itemId: 'i1', name: 'r.mp4' });
  fetchSlice.mockResolvedValue(new Uint8Array(100));
  initiateUpload.mockResolvedValue({ ok: true, sessionUri: 'https://upload/s' });
  uploadChunk.mockResolvedValue({ kind: 'done', videoId: 'vid1' });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUploadAccessToken.mockResolvedValue('access-token');
  generateVideoMetaForClass.mockResolvedValue({ status: 'generated', warnings: [] });
  syncClassToLibrary.mockResolvedValue({});
  succeedInOneChunk();
});

describe('pure quota arithmetic', () => {
  it('never exceeds the per-day cap', () => {
    expect(uploadBudget(5, 5, 3)).toBe(0);
    expect(uploadBudget(4, 5, 3)).toBe(1);
  });

  it('never goes negative when the day is already over budget', () => {
    expect(uploadBudget(9, 5, 3)).toBe(0);
  });

  it('is capped per run even on a fresh day', () => {
    expect(uploadBudget(0, 5, 3)).toBe(3);
  });

  it('leaves quota headroom rather than spending all 10000', () => {
    // 5 x 1600 = 8000, so retries and the promotion pass still fit.
    expect(MAX_NEW_UPLOADS_PER_DAY * 1600).toBeLessThan(10000);
    expect(MAX_NEW_UPLOADS_PER_RUN).toBeLessThanOrEqual(MAX_NEW_UPLOADS_PER_DAY);
  });
});

describe('pacificDayStartUtc', () => {
  it('resolves to midnight Pacific, not midnight UTC or IST', () => {
    // 2026-07-30T06:00Z is 23:00 on 2026-07-29 in Los Angeles (PDT, UTC-7),
    // so the day boundary is the 29th at 07:00Z.
    expect(pacificDayStartUtc(new Date('2026-07-30T06:00:00Z'))).toBe('2026-07-29T07:00:00.000Z');
  });

  it('handles winter, when Pacific is UTC-8', () => {
    expect(pacificDayStartUtc(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01-15T08:00:00.000Z');
  });

  it('round-trips back to the same Pacific calendar day', () => {
    const iso = pacificDayStartUtc(new Date('2026-11-01T09:00:00Z'));
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(iso));
    expect(day).toBe('2026-11-01');
  });
});

describe('syncClassYouTubeBackups, what it refuses to do', () => {
  it('never re-uploads a class already backed up', async () => {
    const { supabase } = makeSupabase([endedClass('c1')], [{ class_id: 'c1', status: 'ok', attempts: 0, bytes_uploaded: 0 }]);
    const s = await syncClassYouTubeBackups(supabase);
    expect(s.due).toBe(0);
    expect(initiateUpload).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'skipped'])('never retries a class marked %s', async (status) => {
    const { supabase } = makeSupabase([endedClass('c1')], [{ class_id: 'c1', status, attempts: 1, bytes_uploaded: 0 }]);
    expect((await syncClassYouTubeBackups(supabase)).due).toBe(0);
  });

  it('stops trying once a class has hit the attempt cap', async () => {
    const { supabase } = makeSupabase(
      [endedClass('c1')],
      [{ class_id: 'c1', status: 'pending', attempts: MAX_UPLOAD_ATTEMPTS, bytes_uploaded: 0 }],
    );
    expect((await syncClassYouTubeBackups(supabase)).due).toBe(0);
  });

  it('waits out the grace period: Teams has not finished writing a 300 MB mp4', async () => {
    // Ends "now", so the 120 minute grace excludes it.
    const now = new Date();
    const today = new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const { supabase } = makeSupabase(
      [endedClass('c1', { scheduled_date: today, end_time: '23:59:00' })],
      [],
    );
    expect((await syncClassYouTubeBackups(supabase)).due).toBe(0);
  });

  it('does nothing at all when there are no candidates', async () => {
    const { supabase } = makeSupabase([], []);
    const s = await syncClassYouTubeBackups(supabase);
    expect(s.candidates).toBe(0);
    expect(getUploadAccessToken).not.toHaveBeenCalled();
  });
});

describe('syncClassYouTubeBackups, quota discipline', () => {
  it('stops opening new sessions at the per-run cap', async () => {
    const classes = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => endedClass(id));
    const { supabase } = makeSupabase(classes, []);

    const s = await syncClassYouTubeBackups(supabase);

    expect(s.started).toBe(MAX_NEW_UPLOADS_PER_RUN);
    expect(initiateUpload).toHaveBeenCalledTimes(MAX_NEW_UPLOADS_PER_RUN);
  });

  it('opens nothing when the day’s cap is already spent', async () => {
    const { supabase } = makeSupabase([endedClass('c1')], [], { startedToday: MAX_NEW_UPLOADS_PER_DAY });
    const s = await syncClassYouTubeBackups(supabase);

    expect(s.started).toBe(0);
    expect(initiateUpload).not.toHaveBeenCalled();
  });

  it('aborts the whole run on quotaExceeded and counts NO attempt against the class', async () => {
    initiateUpload.mockResolvedValue({ ok: false, quotaReason: 'quotaExceeded' });
    const { supabase, upserts } = makeSupabase([endedClass('c1'), endedClass('c2')], []);

    const s = await syncClassYouTubeBackups(supabase);

    expect(s.quotaBlocked).toBe(true);
    expect(initiateUpload).toHaveBeenCalledTimes(1); // stopped, did not try c2
    // A quota stop is a property of the day. Counting it would retire classes
    // from the queue for something that was never their fault.
    expect(upserts.some((u) => u.attempts !== undefined)).toBe(false);
  });

  it('reports a revoked grant without touching any attempt counter', async () => {
    const { YouTubeAuthError } = await import('@/lib/youtube-oauth');
    getUploadAccessToken.mockRejectedValue(new (YouTubeAuthError as any)('revoked', true));
    const { supabase, upserts } = makeSupabase([endedClass('c1')], []);

    const s = await syncClassYouTubeBackups(supabase);

    expect(s.reasons.oauth_revoked).toBe(1);
    expect(upserts).toHaveLength(0);
  });
});

describe('syncClassYouTubeBackups, resumes come first and are not capped', () => {
  const liveSession = (id: string) => ({
    class_id: id,
    status: 'uploading',
    attempts: 0,
    upload_session_uri: 'https://upload/live',
    session_started_at: new Date().toISOString(),
    bytes_uploaded: 50,
    file_size: 100,
  });

  it('resumes an in-flight upload without spending another 1600 units', async () => {
    const { supabase } = makeSupabase([endedClass('c1')], [liveSession('c1')]);

    const s = await syncClassYouTubeBackups(supabase);

    expect(s.resumed).toBe(1);
    expect(s.completed).toBe(1);
    // The whole point: no new session was opened.
    expect(initiateUpload).not.toHaveBeenCalled();
  });

  it('resumes from the stored offset, not from zero', async () => {
    const { supabase } = makeSupabase([endedClass('c1')], [liveSession('c1')]);
    await syncClassYouTubeBackups(supabase);

    // fetchSlice(downloadUrl, start, length, fetch)
    expect(fetchSlice.mock.calls[0][1]).toBe(50);
  });

  it('runs resumes even when the day’s new-upload budget is exhausted', async () => {
    const { supabase } = makeSupabase(
      [endedClass('c1')],
      [liveSession('c1')],
      { startedToday: MAX_NEW_UPLOADS_PER_DAY },
    );

    const s = await syncClassYouTubeBackups(supabase);
    expect(s.resumed).toBe(1);
    expect(s.completed).toBe(1);
  });

  it('treats a session older than 24h as dead and starts fresh', async () => {
    const stale = {
      ...liveSession('c1'),
      session_started_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
    };
    const { supabase } = makeSupabase([endedClass('c1')], [stale]);

    const s = await syncClassYouTubeBackups(supabase);
    expect(s.resumed).toBe(0);
    expect(initiateUpload).toHaveBeenCalledTimes(1);
  });

  it('does the resume before the fresh start, whatever order they arrived in', async () => {
    const { supabase } = makeSupabase(
      [endedClass('fresh'), endedClass('resume')],
      [liveSession('resume')],
    );

    await syncClassYouTubeBackups(supabase);

    // The resume's slice fetch happens before the fresh class opens a session.
    expect(fetchSlice.mock.invocationCallOrder[0])
      .toBeLessThan(initiateUpload.mock.invocationCallOrder[0]);
  });
});

describe('syncClassYouTubeBackups, on success', () => {
  it('persists the session URI BEFORE any byte moves', async () => {
    const { supabase, upserts } = makeSupabase([endedClass('c1')], []);
    await syncClassYouTubeBackups(supabase);

    const first = upserts[0];
    expect(first.upload_session_uri).toBe('https://upload/s');
    expect(first.status).toBe('uploading');
    expect(first.bytes_uploaded).toBe(0);
    // 1600 units are already spent at this point; the row is the only receipt.
    expect(upserts[0].session_started_at).toBeTruthy();
  });

  it('does NOT publish to students, because the video is private', async () => {
    const { supabase, updates } = makeSupabase([endedClass('c1')], []);
    await syncClassYouTubeBackups(supabase);

    // Writing youtube_url here would give students a dead player, and the
    // Library bridge hard-codes privacy_status 'unlisted', which would be a lie.
    expect(updates['nexus_scheduled_classes']).toBeUndefined();
    expect(syncClassToLibrary).not.toHaveBeenCalled();
  });

  it('parks the listing at ready, so it stays in the needs-attention queue', async () => {
    const { supabase, updates } = makeSupabase([endedClass('c1')], []);
    await syncClassYouTubeBackups(supabase);

    expect(updates['nexus_class_video_meta']).toContainEqual({ status: 'ready' });
  });

  it('records the video id and clears the spent session', async () => {
    const { supabase, updates } = makeSupabase([endedClass('c1')], []);
    const s = await syncClassYouTubeBackups(supabase);

    expect(s.completed).toBe(1);
    const done = updates['nexus_class_video_uploads'].find((u: any) => u.status === 'ok');
    expect(done.youtube_video_id).toBe('vid1');
    expect(done.upload_session_uri).toBeNull();
    expect(done.privacy_status).toBe('private');
  });

  it('generates the listing before opening the session, since the snippet goes in it', async () => {
    const { supabase } = makeSupabase([endedClass('c1')], []);
    await syncClassYouTubeBackups(supabase);

    expect(generateVideoMetaForClass.mock.invocationCallOrder[0])
      .toBeLessThan(initiateUpload.mock.invocationCallOrder[0]);
  });

  it('uploads anyway when the metadata step failed, rather than losing the recording', async () => {
    generateVideoMetaForClass.mockResolvedValue({ status: 'failed', reason: 'gemini_429' });
    const { supabase } = makeSupabase([endedClass('c1')], []);

    const s = await syncClassYouTubeBackups(supabase);
    // Teams deletes the source in six months. A mediocre title beats no video.
    expect(s.completed).toBe(1);
  });
});

describe('syncClassYouTubeBackups, partial and failed transfers', () => {
  it('leaves a run that ran out of clock resumable, not failed', async () => {
    resolveRecordingSource.mockResolvedValue({ downloadUrl: 'https://dl', size: 10_000_000, itemId: 'i', name: 'r' });
    fetchSlice.mockResolvedValue(new Uint8Array(1000));
    uploadChunk.mockResolvedValue({ kind: 'resume', next: 1000 });

    // 5s: enough for the sweep to enter the loop and open the session, but under
    // the 8s a first chunk is pessimistically assumed to take, so the transfer
    // bails before sending. A budget of 1ms would instead race the outer loop's
    // own deadline check and prove nothing about the transfer.
    const { supabase } = makeSupabase([endedClass('c1')], []);
    const s = await syncClassYouTubeBackups(supabase, { budgetMs: 5000 });

    expect(s.partial).toBe(1);
    expect(s.failed).toBe(0);
    // The session is paid for and must survive for the next run to resume.
    expect(uploadChunk).not.toHaveBeenCalled();
  });

  it('clears a dead session so the next run starts clean instead of resuming it', async () => {
    uploadChunk.mockResolvedValue({ kind: 'session_dead' });
    const { supabase, updates } = makeSupabase([endedClass('c1')], []);

    const s = await syncClassYouTubeBackups(supabase);

    expect(s.failed).toBe(1);
    expect(updates['nexus_class_video_uploads']).toContainEqual({
      upload_session_uri: null, bytes_uploaded: 0,
    });
  });

  it('goes terminal at the attempt cap rather than retrying forever', async () => {
    initiateUpload.mockResolvedValue({ ok: false, error: 'boom' });
    const { supabase, upserts } = makeSupabase(
      [endedClass('c1')],
      [{ class_id: 'c1', status: 'pending', attempts: MAX_UPLOAD_ATTEMPTS - 1, bytes_uploaded: 0 }],
    );

    const s = await syncClassYouTubeBackups(supabase);

    expect(s.exhausted).toBe(1);
    expect(upserts.at(-1).status).toBe('unavailable');
  });

  it('survives a class whose recording cannot be resolved', async () => {
    resolveRecordingSource.mockRejectedValue(new Error('RECORDING_SIZE_UNKNOWN'));
    const { supabase } = makeSupabase([endedClass('c1')], []);

    const s = await syncClassYouTubeBackups(supabase);
    expect(s.failed).toBe(1);
    expect(s.reasons.RECORDING_SIZE_UNKNOWN).toBe(1);
  });
});

describe('syncClassYouTubeBackups, dry run', () => {
  it('reports the plan and spends nothing', async () => {
    const { supabase, upserts } = makeSupabase([endedClass('c1'), endedClass('c2')], []);

    const s = await syncClassYouTubeBackups(supabase, { dryRun: true });

    expect(s.dryRun?.fresh).toEqual(['c1', 'c2']);
    expect(s.started).toBe(0);
    expect(initiateUpload).not.toHaveBeenCalled();
    expect(getUploadAccessToken).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });
});
