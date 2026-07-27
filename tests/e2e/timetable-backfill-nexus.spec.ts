import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Backfill from Teams: access control, preview being genuinely read-only, and
 * mobile layout.
 *
 * Deliberately does NOT assert a successful Graph sync, and never runs
 * `mode: 'apply'` with anything selected. CI has neither the Teams application
 * access policy nor the organizer's delegated token, so a green "attendance
 * synced" here would be a lie. What IS testable, and what would be expensive to
 * get wrong, is:
 *   - only staff can reach either endpoint
 *   - preview writes nothing (the whole premise of the tool)
 *   - the probe writes nothing either, in particular it does not spend any of
 *     the six attendance retries a class is allowed before the cron gives up
 *   - every failing diagnostics step explains itself
 *
 * Auth goes through the non-production `test_` token bypass in lib/ms-verify.ts,
 * because the tenant enforces MFA and Playwright cannot complete a real MS login.
 */

const NEXUS = APP_URLS.nexus;

interface Ctx {
  classroomId: string;
  classId: string | null;
}

/** A classroom linked to a Teams team, which is the only kind this tool works on. */
async function findTeamsClassroom(
  request: APIRequestContext,
  token: string,
): Promise<Ctx | null> {
  const res = await request.get(`${NEXUS}/api/classrooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;

  const classrooms = (await res.json())?.classrooms ?? [];
  for (const classroom of classrooms) {
    if (!classroom.ms_team_id) continue;
    const clsRes = await request.get(`${NEXUS}/api/timetable?classroom=${classroom.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const classes = clsRes.ok() ? ((await clsRes.json())?.classes ?? []) : [];
    return { classroomId: classroom.id, classId: classes[0]?.id ?? null };
  }
  return null;
}

/** How many classes the classroom holds right now, across every state. */
async function countClasses(
  request: APIRequestContext,
  token: string,
  classroomId: string,
): Promise<number> {
  const res = await request.get(`${NEXUS}/api/timetable?classroom=${classroomId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return -1;
  return ((await res.json())?.classes ?? []).length;
}

const WINDOW = { from: '2026-07-01', to: '2026-07-31' };

test.describe('Backfill from Teams', () => {
  test('a student is refused by both endpoints', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Nexus test-login unavailable');

    const ctx = await findTeamsClassroom(request, teacher!.testToken);
    test.skip(!ctx, 'No Teams-linked classroom found');

    const post = await request.post(`${NEXUS}/api/timetable/backfill`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { classroom_id: ctx!.classroomId, ...WINDOW, mode: 'preview' },
    });
    expect(post.status()).toBe(403);

    const probe = await request.get(
      `${NEXUS}/api/timetable/backfill/probe?classroom_id=${ctx!.classroomId}`,
      { headers: { Authorization: `Bearer ${student!.testToken}` } },
    );
    expect(probe.status()).toBe(403);
  });

  test('preview returns a plan and writes nothing', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findTeamsClassroom(request, auth!.testToken);
    test.skip(!ctx, 'No Teams-linked classroom found');

    const before = await countClasses(request, auth!.testToken, ctx!.classroomId);

    const res = await request.post(`${NEXUS}/api/timetable/backfill`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: { classroom_id: ctx!.classroomId, ...WINDOW, mode: 'preview' },
    });

    // A Graph outage in CI is allowed; a 403 or a wrong shape is not.
    test.skip(res.status() >= 500, 'Graph unavailable in this environment');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.mode).toBe('preview');
    expect(Array.isArray(body.rows)).toBe(true);
    expect(Array.isArray(body.orphans)).toBe(true);
    expect(body.summary).toBeDefined();
    expect(body.notifications_suppressed).toBe(true);

    // The load-bearing assertion: preview is read-only.
    const after = await countClasses(request, auth!.testToken, ctx!.classroomId);
    expect(after).toBe(before);
  });

  test('preview reports the status disagreement without acting on it', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findTeamsClassroom(request, auth!.testToken);
    test.skip(!ctx, 'No Teams-linked classroom found');

    const res = await request.post(`${NEXUS}/api/timetable/backfill`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: { classroom_id: ctx!.classroomId, ...WINDOW, mode: 'preview' },
    });
    test.skip(res.status() >= 500, 'Graph unavailable in this environment');
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const row of body.rows) {
      // Every row has to carry the comparison, present or not: a missing block
      // reads as "they agree", which is exactly the false-negative that let a
      // wrongly cancelled class sit unnoticed for a week.
      expect(row.reconcile).toBeDefined();
      expect(Array.isArray(row.reconcile.fills)).toBe(true);
      expect([null, 'restore', 'cancel_in_nexus']).toContain(row.reconcile.status_fix);
      // Preview proposes; it never records an outcome.
      expect(row.reconcile.result).toBeUndefined();
    }

    // A cancelled Nexus class with no Teams event is offered for restore, and
    // nothing else ever is.
    for (const orphan of body.orphans) {
      expect(orphan.can_restore).toBe(orphan.status === 'cancelled');
    }
  });

  test('a restore is refused for a class that is not a cancelled orphan', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findTeamsClassroom(request, auth!.testToken);
    test.skip(!ctx?.classId, 'No class found to aim at');

    const res = await request.post(`${NEXUS}/api/timetable/backfill`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {
        classroom_id: ctx!.classroomId,
        ...WINDOW,
        mode: 'apply',
        keys: [],
        restore_class_ids: [ctx!.classId],
      },
    });
    test.skip(res.status() >= 500, 'Graph unavailable in this environment');
    expect(res.status()).toBe(200);

    // Un-cancelling is the one write here that no Teams evidence backs, so it is
    // fenced to rows that really are cancelled and really have no event.
    const body = await res.json();
    const outcome = (body.restored_orphans ?? []).find(
      (r: { class_id: string }) => r.class_id === ctx!.classId,
    );
    if (outcome) expect(outcome.ok).toBe(false);
  });

  test('apply with nothing selected imports nothing', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findTeamsClassroom(request, auth!.testToken);
    test.skip(!ctx, 'No Teams-linked classroom found');

    const before = await countClasses(request, auth!.testToken, ctx!.classroomId);

    const res = await request.post(`${NEXUS}/api/timetable/backfill`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: { classroom_id: ctx!.classroomId, ...WINDOW, mode: 'apply', keys: [] },
    });

    test.skip(res.status() >= 500, 'Graph unavailable in this environment');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.summary.imported).toBe(0);
    expect(body.rows).toHaveLength(0);

    const after = await countClasses(request, auth!.testToken, ctx!.classroomId);
    expect(after).toBe(before);
  });

  test('the probe explains every failing step', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findTeamsClassroom(request, auth!.testToken);
    test.skip(!ctx, 'No Teams-linked classroom found');

    const res = await request.get(
      `${NEXUS}/api/timetable/backfill/probe?classroom_id=${ctx!.classroomId}&from=${WINDOW.from}&to=${WINDOW.to}`,
      { headers: { Authorization: `Bearer ${auth!.testToken}` } },
    );

    test.skip(res.status() >= 500, 'Graph unavailable in this environment');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.steps)).toBe(true);
    expect(body.steps.length).toBeGreaterThan(0);

    // A step that failed without saying why is worse than no step at all: that
    // is exactly how a missing Azure grant used to look like a class that had
    // not happened yet.
    for (const step of body.steps) {
      expect(typeof step.detail).toBe('string');
      expect(step.detail.length).toBeGreaterThan(0);
    }

    if (body.sample) {
      expect(Array.isArray(body.sample.attempts)).toBe(true);
      for (const a of body.sample.attempts) {
        expect(a).toHaveProperty('key');
        expect(a).toHaveProperty('status');
        expect(a).toHaveProperty('body');
      }
      expect(typeof body.sample.verdict).toBe('string');
    }
  });

  test('the probe does not spend an attendance retry', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findTeamsClassroom(request, auth!.testToken);
    test.skip(!ctx?.classId, 'No class found to measure against');

    const readAttempts = async (): Promise<number | null> => {
      const res = await request.post(`${NEXUS}/api/timetable/backfill`, {
        headers: { Authorization: `Bearer ${auth!.testToken}` },
        data: { classroom_id: ctx!.classroomId, ...WINDOW, mode: 'preview' },
      });
      if (!res.ok()) return null;
      const rows = (await res.json())?.rows ?? [];
      const row = rows.find((r: { class_id: string | null }) => r.class_id === ctx!.classId);
      return row?.attendance?.attempts ?? null;
    };

    const before = await readAttempts();
    test.skip(before === null, 'Class not present in the probe window');

    await request.get(
      `${NEXUS}/api/timetable/backfill/probe?classroom_id=${ctx!.classroomId}&from=${WINDOW.from}&to=${WINDOW.to}&class_id=${ctx!.classId}`,
      { headers: { Authorization: `Bearer ${auth!.testToken}` } },
    );

    // Six failures and the nightly cron abandons the class for good. A
    // diagnostic must never be the thing that burns them.
    expect(await readAttempts()).toBe(before);
  });

  test('mobile 375px: no horizontal scroll and reachable controls', async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${NEXUS}/teacher/timetable`);
    await page.waitForLoadState('networkidle');

    const menuButton = page.getByRole('button', { name: /more/i }).first();
    test.skip(!(await menuButton.isVisible().catch(() => false)), 'Timetable toolbar not rendered');
    await menuButton.click();

    const item = page.getByText('Backfill from Teams');
    test.skip(!(await item.isVisible().catch(() => false)), 'Classroom has no linked Teams team');
    await item.click();

    await expect(page.getByRole('heading', { name: 'Backfill from Teams' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    for (const name of ['Preview', 'Close']) {
      const box = await page.getByRole('button', { name, exact: true }).first().boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
