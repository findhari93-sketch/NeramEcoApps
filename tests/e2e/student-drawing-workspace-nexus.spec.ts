/**
 * The student's drawing assignment workspace, and what reaches the student.
 *
 * Two things are guarded here.
 *
 * 1. NOTHING UNSENT REACHES THE STUDENT. A teacher's draft save and a held
 *    review both write the review onto the drawing row while its status still
 *    says submitted. The student routes used to return that row as stored, so a
 *    student could read feedback before it was handed back. Checked through the
 *    API, which is the boundary, with a unique token per stage.
 *
 * 2. THE WORKSPACE. The drawing is a fixed stage and the panel scrolls beside
 *    it (below it on a phone); the drawing appears once even while the teacher's
 *    walkthrough replays; the numbered notes link to their pins; earlier attempts
 *    switch in place from `?attempt=N`.
 *
 * Owns its fixture: one assignment, two attempts, deleted afterwards (drawings
 * first, so their voice audio leaves storage too). The browser half skips when
 * the harness cannot sign the student in, the same way the other student specs do.
 *
 * Run: PW_APPS=nexus pnpm test:e2e tests/e2e/student-drawing-workspace-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { readFileSync } from 'node:fs';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';
const RUN = Date.now().toString(36);
const DRAFT_TOKEN = `DRAFT-${RUN}-not-for-the-student`;
const HELD_TOKEN = `HELD-${RUN}-keep-one-eye-level`;
const REGION = { id: `r-${RUN}`, x: 0.2, y: 0.25, width: 0.3, height: 0.25, comment: 'Vanishing lines drift here' };

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Student drawing workspace', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let assignmentId: string | null = null;
  let firstId: string | null = null;
  let secondId: string | null = null;
  let firstImage = '';
  let teacherToken = '';
  let studentToken = '';

  const th = () => ({ Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' });
  const sh = () => ({ Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' });

  const studentAssignment = async (request: APIRequestContext) => {
    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers: sh() });
    expect(res.ok(), 'the student can open the assignment').toBeTruthy();
    const raw = await res.text();
    return { raw, body: JSON.parse(raw) };
  };

  const studentSubmission = async (request: APIRequestContext, id: string) => {
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${id}`, { headers: sh() });
    expect(res.ok(), 'the student can read their own drawing').toBeTruthy();
    return res.text();
  };

  const uploadAndSubmit = async (request: APIRequestContext) => {
    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    expect(uploaded.ok(), 'the student can upload a drawing').toBeTruthy();
    const url = (await uploaded.json()).url as string;
    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: sh(),
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: url },
    });
    expect(submitted.ok(), 'the student can hand the drawing in').toBeTruthy();
    return { id: (await submitted.json()).submission?.id as string, url };
  };

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}`, 'Content-Type': 'application/json' };
      for (const id of [secondId, firstId].filter(Boolean) as string[]) {
        await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${id}`, { headers }).catch(() => {});
      }
      if (assignmentId) {
        await api.delete(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers }).catch(() => {});
      }
    } finally {
      await api.dispose();
    }
  });

  test('setup: a fresh drawing assignment with one attempt', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    studentToken = student!.testToken;

    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');

    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: th(),
      data: {
        action: 'create',
        classroom_id: classroomId,
        title: `E2E workspace ${RUN}`,
        instructions: 'Draw three cubes in two point perspective.',
        assignment_type: 'drawing',
        evaluation_type: 'stars',
      },
    });
    expect(created.ok()).toBeTruthy();
    assignmentId = (await created.json()).assignment?.id ?? null;
    expect(assignmentId).toBeTruthy();
    // 'reopen' publishes quietly; 'publish' would announce a fixture to a class.
    expect((await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: th(), data: { action: 'reopen' },
    })).ok()).toBeTruthy();

    const first = await uploadAndSubmit(request);
    firstId = first.id;
    firstImage = first.url;
    expect(firstId).toBeTruthy();
  });

  test('a draft review, scores and a draft voice note stay with the teacher', async ({ request }) => {
    test.skip(!firstId, 'Setup did not complete');

    const draft = await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/review`, {
      headers: th(),
      data: { action: 'draft', tutor_feedback: DRAFT_TOKEN, tutor_rating: 2, ai_overlay_annotations: [REGION] },
    });
    expect(draft.ok()).toBeTruthy();

    const rubric = await request.put(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/rubric`, {
      headers: th(), data: { bands: { composition: 3, proportion: 2 } },
    });
    test.skip(rubric.status() === 503, 'Drawing evaluation is not migrated in this environment');
    expect(rubric.ok()).toBeTruthy();

    // A walkthrough note, saved as a draft. Fake audio is fine: only the strokes
    // and the delivery rules are under test.
    const bytes = Buffer.from('e2e voice note bytes');
    const mint = await request.post(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/voice-feedback`, {
      headers: th(), data: { mime: 'audio/webm;codecs=opus', size_bytes: bytes.length },
    });
    expect(mint.ok()).toBeTruthy();
    const { signedUrl, path } = await mint.json();
    expect((await request.put(signedUrl, {
      headers: { 'Content-Type': 'audio/webm', 'x-upsert': 'false' }, data: bytes,
    })).ok()).toBeTruthy();
    const saved = await request.put(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/voice-feedback`, {
      headers: th(),
      data: {
        path, mime: 'audio/webm;codecs=opus', duration_ms: 4200, size_bytes: bytes.length,
        sketch: { v: 1, w: 512, h: 512, ops: [{ t: 100, k: 'stroke', id: 's1', c: '#FF0000', wd: 0.005, p: [[0, 0.1, 0.1], [80, 0.4, 0.5]] }] },
      },
    });
    expect(saved.ok()).toBeTruthy();

    const { raw, body } = await studentAssignment(request);
    expect(raw, 'the draft text is nowhere in the payload').not.toContain(DRAFT_TOKEN);
    expect(raw).not.toContain(REGION.comment);
    const latest = body.drawing_submission;
    expect(latest.released).toBe(false);
    expect(latest.tutor_rating).toBeNull();
    expect(latest).not.toHaveProperty('ai_feedback');
    expect(latest).not.toHaveProperty('ai_draft_status');
    expect(latest).not.toHaveProperty('is_gallery_visible');
    expect(body.rubric).toBeNull();
    expect(body.voice_by_submission[firstId!]).toBeUndefined();

    expect(await studentSubmission(request, firstId!)).not.toContain(DRAFT_TOKEN);
  });

  test('a held redo stays hidden until it is handed back, then all of it arrives', async ({ request }) => {
    test.skip(!firstId, 'Setup did not complete');

    const mode = await request.put(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { mode: 'held' },
    });
    test.skip(mode.status() === 503, 'Hold and release is not migrated in this environment');
    expect(mode.ok()).toBeTruthy();

    const redo = await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/review`, {
      headers: th(),
      data: { action: 'redo', tutor_feedback: HELD_TOKEN, tutor_rating: 3, ai_overlay_annotations: [REGION] },
    });
    expect(redo.ok()).toBeTruthy();
    expect((await redo.json()).held).toBe(true);

    const held = await studentAssignment(request);
    expect(held.raw).not.toContain(HELD_TOKEN);
    expect(held.body.drawing_submission.released).toBe(false);
    expect(await studentSubmission(request, firstId!)).not.toContain(HELD_TOKEN);

    const released = await request.post(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { kind: 'all' },
    });
    expect(released.ok()).toBeTruthy();
    // Back to the everyday mode, so the rest of the run behaves like most classes.
    await request.put(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { mode: 'immediate' },
    });

    const { body } = await studentAssignment(request);
    const attempt = body.drawing_submission;
    expect(attempt.released).toBe(true);
    expect(attempt.status).toBe('redo');
    expect(attempt.tutor_feedback).toBe(HELD_TOKEN);
    expect(attempt.ai_overlay_annotations?.[0]?.comment).toBe(REGION.comment);
    expect(body.submit_mode).toBe('redo');

    const scores = body.rubric?.by_submission?.[firstId!];
    expect(scores, 'the handed-back scores reach the student').toBeTruthy();
    expect(scores.bands).toMatchObject({ composition: 3, proportion: 2 });
    expect(Object.keys(scores).sort()).toEqual(['bands', 'overall']);
    expect(body.rubric.criteria.map((c: { key: string }) => c.key)).toContain('composition');

    const voice = body.voice_by_submission[firstId!];
    expect(voice?.url).toMatch(/^https?:\/\//);
    expect(voice?.sketch?.v).toBe(1);
  });

  test('setup: the student redraws, so there are two attempts', async ({ request }) => {
    test.skip(!firstId, 'Setup did not complete');
    const second = await uploadAndSubmit(request);
    secondId = second.id;

    const { body } = await studentAssignment(request);
    expect(body.drawing_attempts).toHaveLength(2);
    expect(body.drawing_submission.id).toBe(secondId);
    expect(body.drawing_submission.released).toBe(false);
  });

  const openWorkspace = async (page: Page, query = '') => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Student auth injection failed');
    await page.goto(`${APP_URLS.nexus}/student/assignments/${assignmentId}${query}`, { waitUntil: 'domcontentloaded' });
    // Every fresh context is a first visit, so the welcome tour opens, and while
    // a MUI dialog is open the rest of the app is aria-hidden: getByRole finds
    // nothing behind it. Wait on plain text, then close the tour.
    await Promise.race([
      page.getByText('The brief', { exact: true }).first()
        .waitFor({ state: 'attached', timeout: 90_000 }).catch(() => {}),
      page.waitForURL(/login\.microsoftonline\.com/, { timeout: 90_000 }).catch(() => {}),
    ]);
    test.skip(/login\.microsoftonline\.com|\/login(\?|$)/.test(page.url()), 'Harness could not inject browser auth for this route');
    const skipTour = page.getByRole('dialog').getByRole('button', { name: 'Skip' });
    if (await skipTour.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) {
      await skipTour.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    const anchor = page.getByRole('complementary', { name: 'Feedback and brief' });
    await expect(anchor).toBeVisible({ timeout: 30_000 });
    return anchor;
  };

  /** For a visual review: WORKSPACE_SHOTS_DIR=<dir> saves each screen the spec reaches. */
  const shot = async (page: Page, name: string) => {
    const dir = process.env.WORKSPACE_SHOTS_DIR;
    if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
  };

  const drawingImages = (page: Page) =>
    page.locator('main img').evaluateAll(
      (imgs, src) => imgs.filter((img) => (img as HTMLImageElement).getAttribute('src') === src).length,
      firstImage,
    );

  const documentScrolls = (page: Page) =>
    page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollHeight - el.clientHeight;
    });

  test('desktop: an earlier attempt opens from the link with its full review', async ({ page }) => {
    test.skip(!secondId, 'Setup did not complete');
    await page.setViewportSize({ width: 1280, height: 800 });
    const rail = await openWorkspace(page, '?attempt=1');

    await expect(rail.getByText(HELD_TOKEN)).toBeVisible();
    await expect(rail.getByText('Listen first')).toBeVisible();
    await expect(rail.getByText('How you scored')).toBeVisible();
    await expect(rail.getByText('This is attempt 1. You have a newer one.')).toBeVisible();
    await shot(page, 'desktop-attempt-1');

    // One drawing on screen, before and during the walkthrough replay.
    expect(await drawingImages(page)).toBe(1);
    const slider = rail.getByRole('slider', { name: 'Voice note position' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('region', { name: 'Walkthrough replay' })).toBeVisible();
    expect(await drawingImages(page)).toBe(1);
    await shot(page, 'desktop-walkthrough');
    await page.getByRole('button', { name: 'Close walkthrough replay' }).click();

    // A note in the list lights up its pin on the drawing.
    const note = rail.getByRole('button', { name: /Note 1: Vanishing lines drift here/ });
    await note.click();
    await expect(note).toHaveAttribute('aria-pressed', 'true');
    await shot(page, 'desktop-note-picked');
    await expect(page.getByRole('button', { name: /^Note 1: Vanishing lines drift here$/ })).toHaveAttribute('aria-pressed', 'true');

    // The screen itself does not scroll; the panel does, and the drawing stays put.
    expect(await documentScrolls(page)).toBeLessThanOrEqual(1);
    const stage = page.getByRole('region', { name: 'Your drawing' });
    const before = await stage.boundingBox();
    await rail.evaluate(() => {
      const body = document.querySelector('aside[aria-label="Feedback and brief"] > div');
      if (body) body.scrollTop = body.scrollHeight;
    });
    expect(await stage.boundingBox()).toEqual(before);
    await assertNoHorizontalOverflow(page);
  });

  test('desktop: switching to the newest attempt shows it waiting for review', async ({ page }) => {
    test.skip(!secondId, 'Setup did not complete');
    await page.setViewportSize({ width: 1280, height: 800 });
    const rail = await openWorkspace(page, '?attempt=1');

    await page.getByRole('button', { name: /Attempt 2, latest/ }).click();
    await expect(page).not.toHaveURL(/attempt=/);
    await expect(rail.getByText('Your teacher has not reviewed this yet')).toBeVisible();
    await expect(rail.getByText(HELD_TOKEN)).toHaveCount(0);
    // The newest drawing is on the stage and actually loaded, not a blank stage.
    const newest = page.getByRole('img', { name: 'Your drawing, attempt 2' });
    await expect(newest).toBeVisible();
    await expect.poll(() => newest.evaluate((img) => (img as HTMLImageElement).naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    await shot(page, 'desktop-awaiting');
    expect(await drawingImages(page)).toBe(0);
  });

  test('a link to an attempt that does not exist opens the newest', async ({ page }) => {
    test.skip(!secondId, 'Setup did not complete');
    const rail = await openWorkspace(page, '?attempt=99');
    await expect(page).not.toHaveURL(/attempt=/, { timeout: 15_000 });
    await expect(rail.getByText('Your teacher has not reviewed this yet')).toBeVisible();
  });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 375, height: 667 },
  ]) {
    test(`phone ${viewport.width}x${viewport.height}: the drawing stays in view while the panel scrolls`, async ({ page }) => {
      test.skip(!secondId, 'Setup did not complete');
      await page.setViewportSize(viewport);
      const rail = await openWorkspace(page, '?attempt=1');

      await shot(page, `phone-${viewport.height}-top`);
      const stage = page.getByRole('region', { name: 'Your drawing' });
      const before = await stage.boundingBox();
      expect(before!.y).toBeGreaterThanOrEqual(0);
      expect(before!.y + before!.height).toBeLessThanOrEqual(viewport.height);

      await rail.evaluate(() => {
        const body = document.querySelector('aside[aria-label="Feedback and brief"] > div');
        if (body) body.scrollTop = body.scrollHeight;
      });
      expect(await stage.boundingBox()).toEqual(before);
      await shot(page, `phone-${viewport.height}-scrolled`);
      expect(await documentScrolls(page)).toBeLessThanOrEqual(1);
      await assertNoHorizontalOverflow(page);
      expect(await drawingImages(page)).toBe(1);

      for (const control of [
        page.getByRole('region', { name: 'Your drawing' }).getByRole('button', { name: 'Back' }),
        page.getByRole('button', { name: /Showing attempt 1 of 2/ }),
        rail.getByRole('button', { name: /Note 1:/ }),
        rail.getByRole('button', { name: 'The brief' }),
      ]) {
        const box = await control.boundingBox();
        expect(box, 'control is on screen').toBeTruthy();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
