import { describe, it, expect, vi } from 'vitest';
import {
  classifyUploadResponse,
  buildContentRange,
  nextSliceBounds,
  buildInsertBody,
  stripAngleBrackets,
  initiateUpload,
  queryUploadOffset,
  uploadChunk,
  SLICE_BYTES,
  CHUNK_MULTIPLE,
  UPLOAD_PRIVACY_STATUS,
  YT_CATEGORY_EDUCATION,
} from './youtube-upload';
import { YT_TITLE_MAX, YT_DESCRIPTION_MAX } from './youtube-metadata';

/**
 * The resumable protocol, tested directly rather than through a live upload.
 *
 * Every expensive mistake in this feature is a misread status code, and none of
 * them announce themselves: a wrong offset produces a video that is corrupt in
 * the middle and still reports success, and a retried 403 spends another 1600 of
 * a 10,000-unit daily quota. So the classifier is pure and every branch is
 * asserted.
 */

describe('classifyUploadResponse', () => {
  it('reads the next offset from the 308 Range header, +1 because it is inclusive', () => {
    expect(classifyUploadResponse(308, 'bytes=0-8388607')).toEqual({ kind: 'resume', next: 8388608 });
  });

  it('treats a 308 with NO Range header as zero bytes held, not as "carry on"', () => {
    // Google sends this when it has nothing. Reading it as "keep going from
    // where I was" writes the rest of the file over an empty prefix.
    expect(classifyUploadResponse(308, null)).toEqual({ kind: 'resume', next: 0 });
  });

  it('falls back to zero when the Range header is malformed', () => {
    expect(classifyUploadResponse(308, 'bytes=weird')).toEqual({ kind: 'resume', next: 0 });
  });

  it.each([200, 201])('takes the video id off a %i', (status) => {
    expect(classifyUploadResponse(status, null, { id: 'abc12345678' }))
      .toEqual({ kind: 'done', videoId: 'abc12345678' });
  });

  it('refuses a 200 with no video id rather than reporting success', () => {
    expect(classifyUploadResponse(200, null, {}).kind).toBe('fatal');
  });

  it.each([404, 410])('treats %i as a dead session, which must not be retried blind', (status) => {
    expect(classifyUploadResponse(status, null)).toEqual({ kind: 'session_dead' });
  });

  it.each([500, 502, 503, 504])('treats %i as transient', (status) => {
    expect(classifyUploadResponse(status, null)).toEqual({ kind: 'retry', status });
  });

  it.each([
    'quotaExceeded',
    'dailyLimitExceeded',
    'uploadLimitExceeded',
    'rateLimitExceeded',
  ])('stops the run on 403 %s', (reason) => {
    expect(classifyUploadResponse(403, null, { error: { errors: [{ reason }] } }))
      .toEqual({ kind: 'quota', reason });
  });

  it('does NOT treat an ordinary 403 as a quota stop', () => {
    // youtubeSignupRequired means the account has no channel: a configuration
    // problem, not a reason to believe the day's quota is gone.
    const out = classifyUploadResponse(403, null, { error: { errors: [{ reason: 'youtubeSignupRequired' }] } });
    expect(out.kind).toBe('fatal');
  });

  it('treats a bare 429 as a rate-limit stop', () => {
    expect(classifyUploadResponse(429, null, {}).kind).toBe('quota');
  });

  it('treats 400 as fatal for this attempt, never as retryable', () => {
    const out = classifyUploadResponse(400, null, { error: { message: 'Invalid Content-Range' } });
    expect(out).toEqual({ kind: 'fatal', detail: 'Invalid Content-Range' });
  });
});

describe('buildContentRange', () => {
  it('writes an INCLUSIVE end index', () => {
    // 0-8388607, not 0-8388608. An off-by-one here shifts every later chunk.
    expect(buildContentRange(0, 8388608, 388157902)).toBe('bytes 0-8388607/388157902');
  });

  it('handles a final short chunk', () => {
    expect(buildContentRange(99, 1, 100)).toBe('bytes 99-99/100');
  });
});

describe('nextSliceBounds', () => {
  it('is a 256 KB multiple for every slice but the last', () => {
    expect(SLICE_BYTES % CHUNK_MULTIPLE).toBe(0);
    const { length } = nextSliceBounds(0, SLICE_BYTES * 3);
    expect(length % CHUNK_MULTIPLE).toBe(0);
  });

  it('gives the remainder on the last slice and marks it', () => {
    const total = SLICE_BYTES + 1234;
    expect(nextSliceBounds(SLICE_BYTES, total)).toEqual({
      start: SLICE_BYTES, length: 1234, last: true,
    });
  });

  it('never asks for bytes past the end', () => {
    const { length } = nextSliceBounds(100, 100);
    expect(length).toBe(0);
  });
});

describe('buildInsertBody', () => {
  const base = { title: 'Perspective', description: 'A class.', tags: ['drawing'] };

  it('uploads as the one privacy constant, with the kids audience declared', () => {
    const body = buildInsertBody(base) as any;
    expect(body.status.privacyStatus).toBe(UPLOAD_PRIVACY_STATUS);
    // Omitting this leaves the video "audience not set", which blocks the
    // teacher's one-click flip to unlisted.
    expect(body.status.selfDeclaredMadeForKids).toBe(false);
    expect(body.snippet.categoryId).toBe(YT_CATEGORY_EDUCATION);
  });

  it('is the ONLY place privacy is decided, so the audit flip is one constant', () => {
    const body = buildInsertBody(base) as any;
    const serialized = JSON.stringify(body);
    const occurrences = serialized.split(UPLOAD_PRIVACY_STATUS).length - 1;
    expect(occurrences).toBe(1);
  });

  it('strips angle brackets, which YouTube rejects outright', () => {
    const body = buildInsertBody({
      ...base,
      title: 'Angles <b>bold</b>',
      description: 'See <this>',
    }) as any;
    expect(body.snippet.title).not.toMatch(/[<>]/);
    expect(body.snippet.description).not.toMatch(/[<>]/);
    expect(body.snippet.title).toBe('Angles bbold/b');
  });

  it('enforces YouTube’s length caps', () => {
    const body = buildInsertBody({
      ...base,
      title: 'A'.repeat(300),
      description: 'B'.repeat(9000),
    }) as any;
    expect(body.snippet.title.length).toBe(YT_TITLE_MAX);
    expect(body.snippet.description.length).toBe(YT_DESCRIPTION_MAX);
  });

  it('stamps the class date on a listing that was stored without one', () => {
    // The path that matters for every listing written before dates existed.
    const body = buildInsertBody({ ...base, classDate: '2026-07-20' }) as any;
    expect(body.snippet.title).toBe('Perspective (20 Jul 26)');
  });

  it('does not double-stamp a title that already carries its date', () => {
    const body = buildInsertBody({
      ...base,
      title: 'Perspective (20 Jul 26)',
      classDate: '2026-07-20',
    }) as any;
    expect(body.snippet.title).toBe('Perspective (20 Jul 26)');
  });

  it('keeps the date on an over-long title, because the cap cut is a tail cut', () => {
    // The regression this ordering exists to prevent: slicing to 100 first and
    // appending after would be fine, but appending first and slicing after would
    // amputate exactly the date the title was stamped with.
    const body = buildInsertBody({
      ...base,
      title: 'A'.repeat(300),
      classDate: '2026-07-20',
    }) as any;
    expect(body.snippet.title.length).toBe(YT_TITLE_MAX);
    expect(body.snippet.title.endsWith('(20 Jul 26)')).toBe(true);
  });

  it('declares a mixed Tamil and English class as Tamil audio', () => {
    expect((buildInsertBody({ ...base, language: 'ta_en' }) as any).snippet.defaultAudioLanguage).toBe('ta');
    expect((buildInsertBody({ ...base, language: 'en' }) as any).snippet.defaultAudioLanguage).toBe('en');
  });

  it('omits the audio language when the class never declared one', () => {
    expect((buildInsertBody(base) as any).snippet).not.toHaveProperty('defaultAudioLanguage');
  });
});

describe('stripAngleBrackets', () => {
  it('survives an empty value', () => {
    expect(stripAngleBrackets('')).toBe('');
    expect(stripAngleBrackets(undefined as any)).toBe('');
  });
});

describe('initiateUpload', () => {
  const snippet = { title: 't', description: 'd', tags: [] };

  it('reads the session URI from the Location HEADER, not the body', async () => {
    const f = vi.fn(async () =>
      new Response('', { status: 200, headers: { location: 'https://upload/session/1' } }));

    const out = await initiateUpload('tok', snippet, 1000, f as any);
    expect(out).toEqual({ ok: true, sessionUri: 'https://upload/session/1' });

    const init = (f.mock.calls[0] as any)[1];
    expect(init.headers['X-Upload-Content-Length']).toBe('1000');
    expect(init.headers['X-Upload-Content-Type']).toBe('video/mp4');
  });

  it('fails when Google answers 200 with no Location', async () => {
    const f = vi.fn(async () => new Response('', { status: 200 }));
    const out = await initiateUpload('tok', snippet, 1000, f as any);
    expect(out.ok).toBe(false);
  });

  it('surfaces a quota refusal separately, so the run stops instead of retrying', async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 }));

    const out = await initiateUpload('tok', snippet, 1000, f as any);
    expect(out).toEqual({ ok: false, quotaReason: 'quotaExceeded' });
  });
});

describe('uploadChunk', () => {
  it('sends no Authorization header: the session URI is already authorised', async () => {
    const f = vi.fn(async () => new Response('', { status: 308, headers: { range: 'bytes=0-9' } }));
    await uploadChunk('https://upload/s', new Uint8Array(10), 0, 100, f as any);

    const headers = (f.mock.calls[0] as any)[1].headers;
    expect(headers).not.toHaveProperty('Authorization');
    expect(headers['Content-Range']).toBe('bytes 0-9/100');
  });

  it('never sets Content-Length by hand', async () => {
    const f = vi.fn(async () => new Response('', { status: 308, headers: { range: 'bytes=0-9' } }));
    await uploadChunk('https://upload/s', new Uint8Array(10), 0, 100, f as any);
    // A hand-set value that disagrees with the body is a corrupt upload.
    expect((f.mock.calls[0] as any)[1].headers).not.toHaveProperty('Content-Length');
  });

  it('reports the server’s offset even when it is LOWER than what we sent', async () => {
    // The silent-corruption case: we sent 8 MiB from 0, Google kept 4 MiB.
    const f = vi.fn(async () => new Response('', { status: 308, headers: { range: 'bytes=0-4194303' } }));
    const out = await uploadChunk('https://upload/s', new Uint8Array(8388608), 0, 99999999, f as any);
    expect(out).toEqual({ kind: 'resume', next: 4194304 });
  });
});

describe('queryUploadOffset', () => {
  it('asks with a bodyless PUT and a star range', async () => {
    const f = vi.fn(async () => new Response('', { status: 308, headers: { range: 'bytes=0-511' } }));
    const out = await queryUploadOffset('https://upload/s', 1024, f as any);

    expect((f.mock.calls[0] as any)[1].headers['Content-Range']).toBe('bytes */1024');
    expect((f.mock.calls[0] as any)[1]).not.toHaveProperty('body');
    expect(out).toEqual({ kind: 'resume', next: 512 });
  });

  it('discovers an upload that actually finished', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 'vid123' }), { status: 200 }));
    expect(await queryUploadOffset('https://upload/s', 1024, f as any))
      .toEqual({ kind: 'done', videoId: 'vid123' });
  });
});
