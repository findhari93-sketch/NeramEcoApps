import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Class Standing on the teacher-facing student profile.
 *
 * Two rules matter more than the rest, and both are about what the number must
 * NOT do:
 *
 *   1. It must never be a leaderboard. No rank, no percentile, no class average
 *      anywhere on the card or in the breakdown. The moment it carries a
 *      position in the class it stops being a support tool.
 *   2. An unmeasured component must show that it was left out, not a 0%. A
 *      component scored at zero and a component we never measured look identical
 *      on a bar chart and mean completely different things.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

test.describe.configure({ timeout: 180_000 });

async function getWarm(request: any, url: string, headers: Record<string, string> = {}) {
  let res = await request.get(url, { headers });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers });
  }
  return res;
}

async function context(request: any) {
  const auth = await getTestAuthToken(request, 'teacher');
  if (!auth) return null;
  const classroom = auth.classrooms?.[0];
  if (!classroom) return null;
  const res = await getWarm(request, `${NEXUS}/api/students?classroom=${classroom.id}`, {
    Authorization: `Bearer ${auth.testToken}`,
  });
  if (res.status() !== 200) return null;
  const student = (await res.json()).students?.[0];
  if (!student) return null;
  return { auth, classroomId: classroom.id, student };
}

async function standing(request: any, ctx: any) {
  const res = await getWarm(
    request,
    `${NEXUS}/api/students/${ctx.student.id}/performance?classroom=${ctx.classroomId}`,
    { Authorization: `Bearer ${ctx.auth.testToken}` },
  );
  expect(res.status()).toBe(200);
  return (await res.json()).classStanding;
}

test.describe('Class Standing — contract', () => {
  test('the payload is complete and internally consistent', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const cs = await standing(request, ctx);
    expect(cs).toBeTruthy();

    expect([
      'excelling',
      'on_track',
      'needs_support',
      'at_risk',
      'settling_in',
      'not_enough_data',
    ]).toContain(cs.band);
    expect(cs.bandLabel).toBeTruthy();
    expect(cs.headline).toBeTruthy();

    // Always all five, including the ones we could not measure.
    expect(cs.components).toHaveLength(5);
    expect(cs.components.map((c: any) => c.key)).toEqual([
      'attendance',
      'assignments',
      'tests',
      'catchup',
      'punctuality',
    ]);

    if (cs.score === null) {
      // Declining to judge means declining entirely: no component may claim a
      // score while the headline says there is not enough to go on.
      expect(['settling_in', 'not_enough_data']).toContain(cs.band);
      for (const c of cs.components) {
        expect(c.measured).toBe(false);
        expect(c.score).toBeNull();
      }
    } else {
      expect(cs.score).toBeGreaterThanOrEqual(0);
      expect(cs.score).toBeLessThanOrEqual(100);

      // Renormalisation: the effective weights of what was measured cover the
      // whole score, so nothing is silently counted as zero.
      const measured = cs.components.filter((c: any) => c.measured);
      const weightSum = measured.reduce((a: number, c: any) => a + c.effectiveWeight, 0);
      expect(Math.abs(weightSum - 100)).toBeLessThanOrEqual(2);

      const contribSum = cs.components.reduce(
        (a: number, c: any) => a + (c.contribution ?? 0),
        0,
      );
      expect(Math.abs(contribSum - cs.score)).toBeLessThanOrEqual(2);
    }
  });

  test('an unmeasured component is named, never scored zero', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const cs = await standing(request, ctx);

    for (const key of cs.unavailable) {
      const c = cs.components.find((x: any) => x.key === key);
      expect(c.measured).toBe(false);
      expect(c.score).toBeNull();
      expect(c.effectiveWeight).toBe(0);
      // It must still explain itself, or the reader assumes it scored zero.
      expect(c.evidence.length).toBeGreaterThan(0);
    }
  });

  test('no leaderboard wording anywhere in the payload', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const cs = await standing(request, ctx);

    const strings = [
      cs.headline,
      cs.detail,
      cs.bandLabel,
      ...cs.components.flatMap((c: any) => [c.label, c.evidence, c.parentEvidence]),
    ];
    const banned = /\brank\b|\bpercentile\b|\bclass average\b|\btop \d|\bout of \d+ students\b/i;
    for (const s of strings) {
      expect(s, `leaderboard wording: ${s}`).not.toMatch(banned);
    }
  });

  test('no output string uses an em dash or a double dash', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const cs = await standing(request, ctx);
    const strings = [
      cs.headline,
      cs.detail,
      cs.bandLabel,
      ...cs.components.flatMap((c: any) => [c.label, c.evidence, c.parentEvidence]),
    ];
    for (const s of strings) {
      expect(s, `banned punctuation: ${s}`).not.toMatch(/—|--|&mdash;/);
    }
  });
});

test.describe('Class Standing — card', () => {
  test('the card renders and its number matches the API', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const cs = await standing(request, ctx);
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await page.goto(`${NEXUS}/teacher/students/${ctx.student.id}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Class Standing', { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(cs.bandLabel, { exact: false }).first()).toBeVisible();

    if (cs.score !== null) {
      await expect(page.getByText(String(cs.score), { exact: true }).first()).toBeVisible();
    }
  });

  test('the breakdown lists all five components and states the bands', async ({
    page,
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await page.goto(`${NEXUS}/teacher/students/${ctx.student.id}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Class Standing', { exact: true })).toBeVisible({
      timeout: 120_000,
    });

    await page.getByRole('button', { name: /Why this number/i }).click();

    for (const label of [
      'Attendance',
      'Assignments',
      'Tests',
      'Catching up',
      'Punctuality',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/Excelling from 85/i)).toBeVisible();
    await expect(page.getByText(/Not a rank/i)).toBeVisible();
  });

  test('the page shows no rank or class average to a teacher', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await page.goto(`${NEXUS}/teacher/students/${ctx.student.id}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Class Standing', { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await page.getByRole('button', { name: /Why this number/i }).click();

    const body = await page.locator('body').innerText();
    // "Not a rank" is the disclaimer and is allowed; a real ranking is not.
    expect(body).not.toMatch(/rank \d+ of \d+/i);
    expect(body).not.toMatch(/\bpercentile\b/i);
    expect(body).not.toMatch(/class average/i);
  });
});
