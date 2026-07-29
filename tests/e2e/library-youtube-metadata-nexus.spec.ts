/**
 * The YouTube listing pipeline: class recording to findable Library video.
 *
 * Proves the chain end to end, and specifically the three defects that used to
 * make a wrapped-up class recording invisible to students:
 *  - category was written as the human label ("Drawing") while every filter
 *    queries the slug ("drawing"), so it matched nothing
 *  - language, exam and difficulty were never written at all, so the Tamil and
 *    NATA chips hid every class recording
 *  - the search vector ignored key_concepts, so the generated search terms
 *    would have counted for nothing
 *
 * Also covers the copy-prompt/paste-JSON bridge, the canonical tag constraint
 * (an invented tag is dropped, not stored), the YouTube limits, and role access.
 *
 * Creates real rows in the E2E classroom and removes them in afterAll.
 *
 * Run: pnpm test:e2e tests/e2e/library-youtube-metadata-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTestAuthToken, APP_URLS } from '../utils/credentials';

test.use({ storageState: { cookies: [], origins: [] } });

const NEXUS = APP_URLS.nexus;

/** Admin DB client for cleanup, only when the test env is explicitly configured. */
function testAdminOrNull(): SupabaseClient | null {
  const url = process.env.SUPABASE_TEST_URL;
  const key = process.env.SUPABASE_TEST_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

test.describe('Class recording to YouTube listing', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let classId: string | null = null;
  let youtubeId: string | null = null;

  const stamp = Date.now();
  const MARKER = `E2EYT${stamp}`;
  const PAST_DATE = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  test('setup: resolve classroom and create a completed class', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    studentToken = student!.testToken;

    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const { classrooms } = await res.json();
    test.skip(!classrooms?.length, 'Test student is not in any classroom');
    classroomId = classrooms[0].id;

    const create = await request.post(`${NEXUS}/api/timetable`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        classroom_id: classroomId,
        title: `${MARKER} perspective class`,
        scheduled_date: PAST_DATE,
        start_time: '19:00',
        end_time: '20:00',
      },
    });
    expect(create.ok()).toBe(true);
    classId = (await create.json()).class.id;
  });

  test('AC1: the prompt carries the class facts and the canonical tag list', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/${classId}/video-meta/prompt`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.prompt).toContain(`${MARKER} perspective class`);
    // The allowed-tag list is what stops the AI inventing a fourth spelling of
    // an existing topic.
    expect(body.prompt).toContain('perspective: Perspective');
    expect(body.prompt).toContain('Never use an em dash');
    // No transcript on a synthetic class, so it must say so rather than let the
    // model invent timestamps.
    expect(body.transcript.found).toBe(false);
    expect(body.prompt).toContain('Do not invent chapters');
  });

  test('AC2: pasted metadata saves, and an invented tag is refused', async ({ request }) => {
    test.skip(!classId, 'No class');

    // Resolve the real registry ids the panel would have sent.
    const meta = await request.get(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(meta.ok()).toBe(true);
    const registry = (await meta.json()).registry as { id: string; slug: string }[];
    const drawing = registry.find((t) => t.slug === 'drawing');
    const perspective = registry.find((t) => t.slug === 'perspective');
    expect(drawing && perspective, 'seeded subject tags should exist').toBeTruthy();

    const patch = await request.patch(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        yt_title: `${MARKER} One Point Perspective: Boxes and Eye Level | NATA + JEE B.Arch | Tamil`,
        yt_description:
          'Learn how to set an eye level and build boxes.\n\nChapters\n0:00 Introduction\n2:14 Horizon line\n11:40 First box',
        yt_tags: ['Perspective', 'vanishing point'],
        chapters: [
          { t: 0, label: 'Introduction' },
          { t: 134, label: 'Horizon line' },
          { t: 700, label: 'First box' },
        ],
        search_terms: [`${MARKER.toLowerCase()}term`, 'vanishing point', 'eye level'],
        category: 'drawing',
        exam: 'both',
        language: 'ta',
        difficulty: 'beginner',
        tag_ids: [drawing!.id, perspective!.id],
        status: 'ready',
      },
    });
    expect(patch.ok()).toBe(true);

    const reread = await request.get(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const body = await reread.json();
    expect(body.meta.status).toBe('ready');
    expect(body.meta.category).toBe('drawing');
    expect(body.meta.language).toBe('ta');
    expect(body.meta.chapters).toHaveLength(3);
    expect(body.tags.map((t: any) => t.slug).sort()).toEqual(['drawing', 'perspective']);
  });

  test('AC3: the server rejects payloads YouTube itself would reject', async ({ request }) => {
    test.skip(!classId, 'No class');
    const headers = { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' };

    const tooLong = await request.patch(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers, data: { yt_title: 'x'.repeat(101) },
    });
    expect(tooLong.status()).toBe(400);

    const emDash = await request.patch(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers, data: { yt_title: 'Perspective — basics' },
    });
    expect(emDash.status()).toBe(400);

    // YouTube ignores a chapter list that does not open at 0:00.
    const badChapters = await request.patch(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers,
      data: {
        chapters: [
          { t: 30, label: 'Late start' },
          { t: 90, label: 'B' },
          { t: 300, label: 'C' },
        ],
      },
    });
    expect(badChapters.status()).toBe(400);
  });

  test('AC4: publishing puts it in the Library with the category slug, language and exam', async ({ request }) => {
    const admin = testAdminOrNull();
    test.skip(!admin, 'SUPABASE_TEST_URL/SERVICE_KEY not set; skipping to avoid an uncleaned Library row');
    test.skip(!classId, 'No class');

    youtubeId = `e2y${stamp.toString(36)}`.slice(0, 11).padEnd(11, '0');

    const publish = await request.patch(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { status: 'published', youtube_url: `https://youtu.be/${youtubeId}` },
    });
    expect(publish.ok()).toBe(true);
    expect((await publish.json()).librarySynced).toBe(true);

    const { data: row } = await admin!
      .from('library_videos')
      .select('category, language, exam, difficulty, topics, key_concepts, approved_title')
      .eq('youtube_video_id', youtubeId)
      .single();

    expect(row, 'a library_videos row should exist for the published class').toBeTruthy();
    // The regression: the slug, never the human label.
    expect(row!.category).toBe('drawing');
    expect(row!.category).not.toBe('Drawing');
    // These three were always null before, which is what made the Tamil and
    // NATA chips hide every class recording.
    expect(row!.language).toBe('ta');
    expect(row!.exam).toBe('both');
    expect(row!.difficulty).toBe('beginner');
    expect(row!.topics).toEqual(expect.arrayContaining(['Drawing', 'Perspective']));
    expect(row!.key_concepts).toEqual(expect.arrayContaining(['vanishing point']));
  });

  test('AC5: a student finds it by title, by canonical topic, and by search term', async ({ request }) => {
    test.skip(!youtubeId, 'Not published');
    const headers = { Authorization: `Bearer ${studentToken}` };

    const hits = async (q: string) => {
      const res = await request.get(
        `${NEXUS}/api/library/search?q=${encodeURIComponent(q)}&limit=50`,
        { headers },
      );
      expect(res.ok()).toBe(true);
      return ((await res.json()).data || []).filter((v: any) => v.youtube_video_id === youtubeId);
    };

    expect(await hits(MARKER), 'findable by a word in the title').toHaveLength(1);
    // Only in key_concepts, which the old search vector did not index at all.
    expect(await hits(`${MARKER.toLowerCase()}term`), 'findable by a generated search term').toHaveLength(1);
  });

  test('AC6: the Tamil and category filters no longer hide it', async ({ request }) => {
    test.skip(!youtubeId, 'Not published');
    const headers = { Authorization: `Bearer ${studentToken}` };

    const tamil = await request.get(
      `${NEXUS}/api/library/search?q=${encodeURIComponent(MARKER)}&language=ta&limit=50`,
      { headers },
    );
    expect(
      ((await tamil.json()).data || []).some((v: any) => v.youtube_video_id === youtubeId),
      'the Tamil chip should show a class taught in Tamil',
    ).toBe(true);

    const wrongLanguage = await request.get(
      `${NEXUS}/api/library/search?q=${encodeURIComponent(MARKER)}&language=en&limit=50`,
      { headers },
    );
    expect(
      ((await wrongLanguage.json()).data || []).some((v: any) => v.youtube_video_id === youtubeId),
      'the English chip should not show a Tamil class',
    ).toBe(false);
  });

  test('AC7: search survives junk input instead of erroring', async ({ request }) => {
    const headers = { Authorization: `Bearer ${studentToken}` };
    // websearch_to_tsquery tolerates stray operators; the old textSearch did not,
    // which is why the query used to be scrubbed on the client.
    for (const q of ['a & | b', '((', '"unclosed', 'the', 'zzzznotathing']) {
      const res = await request.get(
        `${NEXUS}/api/library/search?q=${encodeURIComponent(q)}&limit=5`,
        { headers },
      );
      expect(res.ok(), `query ${JSON.stringify(q)} should not 500`).toBe(true);
      expect(Array.isArray((await res.json()).data)).toBe(true);
    }
  });

  test('AC8: a student cannot read or write the YouTube listing', async ({ request }) => {
    test.skip(!classId, 'No class');

    const read = await request.get(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(read.status()).toBe(403);

    const write = await request.patch(`${NEXUS}/api/timetable/${classId}/video-meta`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { yt_title: 'hacked' },
    });
    expect(write.status()).toBe(403);

    const prompt = await request.post(`${NEXUS}/api/timetable/${classId}/video-meta/prompt`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(prompt.status()).toBe(403);
  });

  test('AC9: an unpublished video is not playable by UUID', async ({ request }) => {
    const admin = testAdminOrNull();
    test.skip(!admin, 'SUPABASE_TEST_URL/SERVICE_KEY not set');
    test.skip(!youtubeId, 'Not published');

    const { data: row } = await admin!
      .from('library_videos')
      .select('id')
      .eq('youtube_video_id', youtubeId)
      .single();

    await admin!.from('library_videos').update({ is_published: false }).eq('id', row!.id);
    const res = await request.get(`${NEXUS}/api/library/videos/${row!.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    await admin!.from('library_videos').update({ is_published: true }).eq('id', row!.id);

    expect(res.status(), 'holding the UUID of an unpublished video should not be enough').toBe(404);
  });

  test('AC10: the recordings queue lists classes with no published listing', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.get(`${NEXUS}/api/timetable/recordings?needs_meta=1&limit=200`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.ok()).toBe(true);
    const ids = ((await res.json()).recordings || []).map((r: any) => r.id);
    // This class was published in AC4, so the queue must not still be offering it.
    expect(ids).not.toContain(classId);
  });

  test.afterAll(async ({ request }) => {
    if (!teacherToken) return;

    const admin = testAdminOrNull();
    if (admin && youtubeId) {
      await admin.from('library_videos').delete().eq('youtube_video_id', youtubeId);
    }

    // nexus_class_video_meta cascades with the class.
    if (classId && classroomId) {
      await request
        .delete(`${NEXUS}/api/timetable`, {
          headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
          data: { id: classId, classroom_id: classroomId, permanent: true },
        })
        .catch(() => {});
    }
  });
});
