import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Generating a class wrap-up, and the tags it comes back with.
 *
 * Two behaviours are under test, both of which used to fail silently.
 *
 * 1. Asking for a tag that already exists must return that tag, not a 409. The
 *    wrap-up panel derives a slug from an AI label, so it collides constantly:
 *    "One Point Perspective" and "One-Point Perspective" are the same slug. The
 *    old route answered 409, the panel showed "that tag already exists", removed
 *    the suggestion chip, and attached nothing at all.
 *
 * 2. Generate must answer with a resolved tag set: `auto_tag_ids` for registry
 *    tags to tick on immediately, `tags` for the rows behind them, and
 *    `suggested_tags` for genuinely new ideas only. When there is no transcript
 *    it must say WHICH step came up empty rather than one generic line.
 *
 * Generation itself runs on a shared AI key and against Microsoft Graph, so the
 * happy path is asserted as a contract (the shape is right whichever branch is
 * taken) rather than by requiring a real transcript to exist in the environment
 * the suite happens to run against.
 *
 * Everything self-skips when the dev server or the test accounts are unavailable,
 * following the convention in class-prep-nexus.spec.ts.
 */

const NEXUS = APP_URLS.nexus;

test.describe.configure({ mode: 'serial' });

/**
 * POST, retrying once on a 404.
 *
 * A Next dev server serves `/_not-found` for a request that lands while it is
 * recompiling, so a cold run can see a 404 from a route that exists and answered
 * a moment earlier. Retrying once tells that apart from a route that is really
 * missing, which would 404 both times.
 */
async function postJson(request: any, token: string | null, path: string, data: unknown) {
  const send = () =>
    request.post(`${NEXUS}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      data,
      timeout: 60_000,
    });
  let res = await send();
  if (res.status() === 404) {
    await new Promise((r) => setTimeout(r, 3000));
    res = await send();
  }
  return res;
}

test.describe('Class wrap-up tags', () => {
  let teacherToken: string | null = null;
  let studentToken: string | null = null;
  /** A class that has already ended, which is the only kind that can be wrapped up. */
  let pastClassId: string | null = null;

  test('setup: a teacher token and a class that has ended', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    if (!teacher) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    teacherToken = teacher.testToken;
    studentToken = (await getTestAuthToken(request, 'student'))?.testToken ?? null;

    const res = await request.get(`${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const classes = (await res.json()).classes || [];
    pastClassId = classes.filter((c: any) => c.scheduled_date < today).at(-1)?.id ?? null;
  });

  test('asking for a tag that exists returns it instead of 409', async ({ request }) => {
    if (!teacherToken) {
      test.skip(true, 'setup did not produce a teacher token');
      return;
    }
    const label = 'One Point Perspective';

    const first = await postJson(request, teacherToken, '/api/question-bank/tags', {
      group_type: 'theme',
      label,
      find_or_create: true,
    });
    expect([200, 201]).toContain(first.status());
    const firstTag = (await first.json()).data;
    expect(firstTag?.id).toBeTruthy();
    expect(firstTag.slug).toBe('one_point_perspective');

    // The second call is the one that used to 409 and lose the tag.
    const second = await postJson(request, teacherToken, '/api/question-bank/tags', {
      group_type: 'theme',
      label: 'One-Point Perspective',
      find_or_create: true,
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.created).toBe(false);
    expect(secondBody.data.id).toBe(firstTag.id);
  });

  test('a plain create still reports a duplicate, so the registry screen can warn', async ({ request }) => {
    if (!teacherToken) {
      test.skip(true, 'setup did not produce a teacher token');
      return;
    }
    const res = await postJson(request, teacherToken, '/api/question-bank/tags', {
      group_type: 'theme',
      label: 'One Point Perspective',
    });
    expect(res.status()).toBe(409);
  });

  test('a student cannot create tags', async ({ request }) => {
    if (!studentToken) {
      test.skip(true, 'no student token in this environment');
      return;
    }
    const res = await postJson(request, studentToken, '/api/question-bank/tags', {
      group_type: 'theme',
      label: 'Student Made This',
      find_or_create: true,
    });
    // 400 is the honest answer here, not a slip: verifyQBAccess refuses a
    // student who names no classroom before any staff check runs, because
    // without a classroom there is nothing to authorise against. What matters
    // is that find_or_create did not become a way around the staff gate.
    expect([400, 401, 403]).toContain(res.status());

    const tags = await request.get(`${NEXUS}/api/question-bank/tags?group=theme`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const labels = ((await tags.json()).data || []).map((t: any) => t.label);
    expect(labels).not.toContain('Student Made This');
  });

  test('generate answers with resolved tags, or says exactly what is missing', async ({ request }) => {
    if (!teacherToken || !pastClassId) {
      test.skip(true, 'setup found no past class');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/${pastClassId}/summarize`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {},
      timeout: 90_000,
    });

    // 429/503 mean the shared AI key is busy or unset. Not a failure of this code.
    if ([429, 503].includes(res.status())) {
      test.skip(true, 'AI unavailable in this environment');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();

    if (body.needs_manual) {
      // The old message was one generic line for every cause. Whatever the
      // blocker is, the teacher is told which one it is.
      expect(body.message).toMatch(/recording|transcript/i);
      expect(body.message).not.toBe('No transcript found yet.');
      return;
    }

    expect(Array.isArray(body.auto_tag_ids)).toBe(true);
    expect(Array.isArray(body.tags)).toBe(true);
    expect(Array.isArray(body.suggested_tags)).toBe(true);

    // Every auto-applied id has its registry row alongside it, so the panel can
    // draw the chip without inventing one with an empty slug.
    for (const id of body.auto_tag_ids) {
      const row = body.tags.find((t: any) => t.id === id);
      expect(row, `no registry row returned for auto tag ${id}`).toBeTruthy();
      expect(row.slug).toBeTruthy();
    }

    // Anything left as a suggestion is genuinely absent from the registry.
    const availableRes = await request.get(`${NEXUS}/api/timetable/${pastClassId}/wrap-up`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const available = (await availableRes.json()).availableTags || [];
    const slugs = new Set(available.map((t: any) => t.slug));
    for (const s of body.suggested_tags) {
      const slug = String(s.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      expect(slugs.has(slug), `"${s.label}" was suggested as new but already exists`).toBe(false);
    }
  });

  test('a student cannot generate a wrap-up', async ({ request }) => {
    if (!studentToken || !pastClassId) {
      test.skip(true, 'no student token or no past class');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/${pastClassId}/summarize`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test('an unauthenticated caller cannot generate a wrap-up', async ({ request }) => {
    if (!pastClassId) {
      test.skip(true, 'setup found no past class');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/${pastClassId}/summarize`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });
});
