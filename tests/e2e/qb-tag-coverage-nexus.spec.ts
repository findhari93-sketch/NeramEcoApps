import { test, expect, type APIRequestContext } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

/**
 * Question Bank > Tag coverage (Nexus).
 *
 * API: the three routes refuse a caller with no token (401) and a student
 * (403); the count_only shape the test builder's bank picker reads stays
 * exactly { tag, total, high_confidence_total }; and a seeded question goes
 * through accept and dismiss and leaves the queue each time.
 *
 * UI: the review screen at 375px has no sideways scroll and every decision
 * button is at least 44px tall.
 *
 * The seeded question is written through the bank's own API (so it lands in
 * whatever database the server under test uses) and deleted in afterAll.
 */

const NEXUS = APP_URLS.nexus;
const COVERAGE = '/api/question-bank/tag-coverage';
const SUGGESTIONS = '/api/question-bank/tag-coverage/suggestions';
const TOPIC = 'islamic_architecture';
// Present on both staging and production (staging has no indian_architecture).
const SECOND_TOPIC = 'general_architecture_knowledge';
const MARKER = `E2E-TAGCOV-${Date.now()}`;

let teacherToken = '';
let studentToken = '';
let seededId = '';
let topicId = '';
let secondTopicId = '';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Page through the queue (strong matches first) until the seeded question turns up, or give up. */
async function findInQueue(request: APIRequestContext, slug: string, id: string): Promise<any | null> {
  for (let offset = 0; offset < 1000; offset += 50) {
    const res = await request.get(`${SUGGESTIONS}?tag=${slug}&limit=50&offset=${offset}`, { headers: auth(teacherToken) });
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    const hit = data.items.find((i: any) => i.id === id);
    if (hit) return hit;
    if (data.items.length < 50) return null;
  }
  return null;
}

test.describe('Question Bank tag coverage: API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: NEXUS });

  test.beforeAll(async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-tests-hub-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    teacherToken = (await t.json()).testToken;

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-tests-hub-student@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    studentToken = (await s.json()).testToken;

    const created = await request.post('/api/question-bank/questions', {
      headers: auth(teacherToken),
      data: {
        question_text: `${MARKER}: Which Mughal emperor built the Taj Mahal, with a white marble dome, beside a mosque with four minarets?`,
        question_format: 'MCQ',
        options: [
          { id: 'a', text: 'Shah Jahan' },
          { id: 'b', text: 'Akbar' },
          { id: 'c', text: 'Babur' },
          { id: 'd', text: 'Aurangzeb' },
        ],
        correct_answer: 'a',
        difficulty: 'MEDIUM',
        exam_relevance: 'NATA',
        categories: [],
        status: 'draft',
        is_active: false,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    seededId = (await created.json()).data.id;
    expect(seededId).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (!seededId) return;
    await request.patch('/api/question-bank/questions/bulk-update', {
      headers: auth(teacherToken),
      data: { action: 'delete', question_ids: [seededId], force: true },
    });
  });

  test('no token is refused with 401 on every route', async ({ request }) => {
    expect((await request.get(COVERAGE)).status()).toBe(401);
    expect((await request.get(`${SUGGESTIONS}?tag=${TOPIC}`)).status()).toBe(401);
    expect((await request.post(SUGGESTIONS, { data: { action: 'accept', pairs: [] } })).status()).toBe(401);
  });

  test('a student is refused with 403', async ({ request }) => {
    expect((await request.get(COVERAGE, { headers: auth(studentToken) })).status()).toBe(403);
    expect((await request.get(`${SUGGESTIONS}?tag=${TOPIC}&count_only=1`, { headers: auth(studentToken) })).status()).toBe(403);
    expect(
      (await request.post(SUGGESTIONS, { headers: auth(studentToken), data: { action: 'dismiss', pairs: [] } })).status(),
    ).toBe(403);
  });

  test('coverage summary has the documented shape', async ({ request }) => {
    const res = await request.get(COVERAGE, { headers: auth(teacherToken) });
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(typeof data.total).toBe('number');
    expect(data.tagged + data.untagged).toBe(data.total);
    expect(Array.isArray(data.topics)).toBe(true);
    const topic = data.topics.find((t: any) => t.slug === TOPIC);
    const second = data.topics.find((t: any) => t.slug === SECOND_TOPIC);
    expect(topic, `${TOPIC} is a coverage topic`).toBeTruthy();
    expect(second, `${SECOND_TOPIC} is a coverage topic`).toBeTruthy();
    topicId = topic.tag_id;
    secondTopicId = second.tag_id;
    for (const t of data.topics) {
      expect(['subject', 'theme']).toContain(t.group_type);
      expect(typeof t.tagged_count).toBe('number');
      expect(typeof t.suggestion_count).toBe('number');
    }
    // Biggest gap first.
    const counts = data.topics.map((t: any) => t.suggestion_count);
    expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a));
  });

  test('count_only returns exactly tag, total and high_confidence_total', async ({ request }) => {
    for (const query of [`tag=${TOPIC}`, `tag_id=${topicId}`]) {
      const res = await request.get(`${SUGGESTIONS}?${query}&count_only=1`, { headers: auth(teacherToken) });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(['data']);
      expect(Object.keys(body.data).sort()).toEqual(['high_confidence_total', 'tag', 'total']);
      expect(Object.keys(body.data.tag).sort()).toEqual(['id', 'label', 'slug']);
      expect(body.data.tag.slug).toBe(TOPIC);
      expect(body.data.total).toBeGreaterThanOrEqual(body.data.high_confidence_total);
    }
  });

  test('an unknown tag is a 404 and a missing tag is a 400', async ({ request }) => {
    expect((await request.get(`${SUGGESTIONS}?tag=no_such_topic_e2e`, { headers: auth(teacherToken) })).status()).toBe(404);
    expect((await request.get(SUGGESTIONS, { headers: auth(teacherToken) })).status()).toBe(400);
  });

  test('the seeded question is suggested with its matched words', async ({ request }) => {
    const hit = await findInQueue(request, TOPIC, seededId);
    expect(hit, 'seeded question is in the Islamic Architecture queue').toBeTruthy();
    expect(hit.confidence).toBe('high');
    expect(hit.matched_terms).toEqual(expect.arrayContaining(['mughal', 'taj mahal', 'mosque']));
    expect(typeof hit.source_label).toBe('string');
    expect(Array.isArray(hit.also_suggested)).toBe(true);
  });

  test('accept tags it and takes it out of the queue', async ({ request }) => {
    const res = await request.post(SUGGESTIONS, {
      headers: auth(teacherToken),
      data: { action: 'accept', pairs: [{ question_id: seededId, tag_id: topicId }] },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.accepted).toBe(1);
    expect(await findInQueue(request, TOPIC, seededId)).toBeNull();
  });

  test('dismiss keeps it out of another topic for good', async ({ request }) => {
    expect(await findInQueue(request, SECOND_TOPIC, seededId), 'suggested for the second topic first').toBeTruthy();
    const res = await request.post(SUGGESTIONS, {
      headers: auth(teacherToken),
      data: { action: 'dismiss', pairs: [{ question_id: seededId, tag_id: secondTopicId }] },
    });
    // 503 means the dismissals migration is not applied to this database yet.
    test.skip(res.status() === 503, 'nexus_qb_tag_suggestion_dismissals is not applied to this database');
    expect(res.status()).toBe(200);
    expect((await res.json()).data.dismissed).toBe(1);
    expect(await findInQueue(request, SECOND_TOPIC, seededId)).toBeNull();
  });

  test('a bad body is a 400, not a 500', async ({ request }) => {
    const empty = await request.post(SUGGESTIONS, { headers: auth(teacherToken), data: { action: 'accept', pairs: [] } });
    expect(empty.status()).toBe(400);
    const unknown = await request.post(SUGGESTIONS, { headers: auth(teacherToken), data: { action: 'explode' } });
    expect(unknown.status()).toBe(400);
  });
});

test.describe('Question Bank tag coverage: phone', () => {
  const VIEWPORT = { width: 375, height: 812 };
  const HOOK_TIMEOUT_MS = 120_000;
  test.use({ viewport: VIEWPORT, baseURL: NEXUS });
  test.describe.configure({ timeout: HOOK_TIMEOUT_MS });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(HOOK_TIMEOUT_MS);
    await injectAuthForPage(page, 'teacher');
  });

  test('no sideways scroll and 44px decision buttons at 375px', async ({ page }) => {
    await page.goto(`/teacher/question-bank/tag-coverage?tag=${TOPIC}&from=/teacher/question-bank`);
    await expect(page.getByRole('heading', { name: 'Tag coverage' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/% of the bank is tagged/)).toBeVisible({ timeout: 60_000 });

    // Either a card to review or the finished state; both are valid on a live bank.
    const decisions = page.getByRole('group', { name: 'Decide on this question' });
    const finished = page.getByText(/Every suggestion for .* is reviewed|You have been through every suggestion/);
    await expect(decisions.or(finished)).toBeVisible({ timeout: 60_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal overflow at 375px').toBeLessThanOrEqual(0);

    if (await decisions.isVisible()) {
      for (const name of [/^Skip/, /^Not this topic/, /^(Accept|Save tags)/]) {
        const box = await decisions.getByRole('button', { name }).boundingBox();
        expect(box, String(name)).toBeTruthy();
        expect(box!.height, String(name)).toBeGreaterThanOrEqual(44);
      }
      // The bar sits above the 64px bottom navigation, not under it.
      const bar = await decisions.boundingBox();
      expect(bar!.y + bar!.height).toBeLessThanOrEqual(VIEWPORT.height - 64 + 1);
    }

    const back = page.getByRole('link', { name: /back/i }).first();
    await expect(back).toHaveAttribute('href', '/teacher/question-bank');
  });
});
