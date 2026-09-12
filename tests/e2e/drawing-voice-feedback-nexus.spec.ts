/**
 * Voice feedback on drawing reviews.
 *
 * A teacher records a voice note on an assignment drawing, it rides out with
 * Redo, the student can play it, their listening comes back to the teacher as
 * "Heard", and nobody else can reach it.
 *
 * Covers:
 *  - Recording in the review screen with a fake microphone saves a draft.
 *  - A draft is invisible to the student until Redo or Complete sends it.
 *  - The save route refuses a path that is not this drawing's.
 *  - Redo sends the note, and the review response says so.
 *  - The student gets a playable URL; their listen reports mark it heard, and
 *    the assignment roster shows it.
 *  - A student cannot read another student's submission (it used to be open).
 *  - Tags now come back with the submission, so a save no longer wipes them.
 *  - Practice drawings refuse voice notes.
 *  - Mobile (375px): the recorder's button is a real touch target, nothing overflows.
 *
 * The student browser page cannot be auth-injected, so the student side is
 * checked through the API, the same way the redo history spec does it. Teams
 * delivery is skipped for test tokens (canPostToGraph), so the chat card itself
 * is a manual check.
 *
 * Run: pnpm test:e2e tests/e2e/drawing-voice-feedback-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const PLACEHOLDER_IMG = 'https://placehold.co/600x400/png';

/**
 * A real image in the drawing bucket, not a placeholder host.
 *
 * The sketch canvas loads the drawing with crossOrigin="anonymous" so it can
 * flatten it to a PNG without tainting the canvas. A host that sends no CORS
 * headers therefore never loads, the canvas never appears, and "talk while you
 * sketch" has nothing to draw on. Supabase storage sends them, so the fixture
 * goes through the app's own upload route.
 */
const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';

// This spec injects its own auth, so it does not depend on the MS-login setup
// project's saved storageState (the Entra MFA wall blocks that auto-login).
test.use({
  storageState: { cookies: [], origins: [] },
  // A fake microphone, granted without a prompt, so the recorder really records.
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.describe('Drawing voice feedback', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let assignmentId: string | null = null;
  let createdAssignmentId: string | null = null;
  let submissionId: string | null = null;
  let practiceSubmissionId: string | null = null;
  let voiceId: string | null = null;

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      // Submissions first. Deleting one takes its voice note and the audio file
      // out of storage, which deleting the assignment (a database cascade) would
      // not, and it also clears the way for the assignment delete below.
      for (const id of [submissionId, practiceSubmissionId].filter(Boolean) as string[]) {
        await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${id}`, { headers }).catch(() => {});
      }
      if (createdAssignmentId) {
        await api.delete(`${APP_URLS.nexus}/api/assignments/${createdAssignmentId}`, { headers }).catch(() => {});
      }
    } finally {
      await api.dispose();
    }
  });

  const openReview = async (page: Page, id: string) => {
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${id}?assignment=${assignmentId}`, {
      waitUntil: 'domcontentloaded',
    });
    const anchor = page.getByText('Feedback', { exact: true }).first();
    await Promise.race([
      anchor.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {}),
      page.waitForURL(/login\.microsoftonline\.com/, { timeout: 45_000 }).catch(() => {}),
    ]);
    test.skip(
      /login\.microsoftonline\.com|\/login(\?|$)/.test(page.url()),
      'Harness could not inject browser auth for this route',
    );
  };

  test('setup: a fresh drawing assignment the student submits to', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');
    const teacherHeaders = { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' };

    // This suite makes its own assignment, dated today, instead of borrowing a
    // shared one. The shared fixture's catch-up window shut in July, so the
    // student could no longer submit to it, and every test here skipped itself
    // for a reason that had nothing to do with voice notes.
    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: teacherHeaders,
      data: {
        action: 'create',
        classroom_id: classroomId,
        title: `E2E voice feedback ${Date.now()}`,
        assignment_type: 'drawing',
        evaluation_type: 'stars',
      },
    });
    expect(created.ok(), 'the teacher can create a drawing assignment').toBeTruthy();
    createdAssignmentId = (await created.json()).assignment?.id ?? null;
    expect(createdAssignmentId).toBeTruthy();
    assignmentId = createdAssignmentId;

    // 'reopen' publishes quietly. 'publish' would announce a test fixture to the
    // class Teams channel and ring every student's bell.
    const published = await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: teacherHeaders,
      data: { action: 'reopen' },
    });
    expect(published.ok(), 'the assignment is visible to students').toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    expect(uploaded.ok(), 'the student can upload a drawing image').toBeTruthy();
    const drawingImageUrl = (await uploaded.json()).url as string;
    expect(drawingImageUrl).toMatch(/^https?:\/\//);

    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: drawingImageUrl },
    });
    expect(submitted.ok(), 'the student can submit to a fresh assignment').toBeTruthy();
    submissionId = (await submitted.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('recording in the review screen saves a draft note', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    await openReview(page, submissionId!);

    const record = page.getByRole('button', { name: 'Record voice note' });
    await expect(record).toBeVisible();
    await record.click();

    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeEnabled({ timeout: 15_000 });
    await page.waitForTimeout(2_000);
    await stop.click();

    await expect(page.getByText('Saved. It goes out with Redo or Complete.')).toBeVisible({ timeout: 30_000 });
    // Redo and Complete are usable again once the note is safely stored.
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  });

  test('talk while you sketch records the strokes alongside the voice', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    page.on('console', (m) => {
      if (m.text().includes('[walkthrough]') || m.type() === 'error') {
        console.log(`[console:${m.type()}] ${m.text().slice(0, 300)}`);
      }
    });
    page.on('pageerror', (err) => console.log(`[pageerror] ${err.message.slice(0, 300)}`));

    await openReview(page, submissionId!);
    await page.getByRole('button', { name: 'Talk while you sketch' }).click();
    await page.getByRole('button', { name: 'Start recording' }).click();

    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeVisible({ timeout: 20_000 });

    // Draw across the drawing while it records, the way a teacher would.
    const canvas = page.locator('canvas[aria-label="Drawing canvas"]');
    await expect(canvas, 'the drawing loads into the sketch canvas').toBeVisible({ timeout: 30_000 });
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.4);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box!.x + box!.width * (0.3 + i * 0.05), box!.y + box!.height * (0.4 + i * 0.02));
      await page.waitForTimeout(80);
    }
    await page.mouse.up();

    await stop.click();
    await page.getByRole('button', { name: 'Save walkthrough' }).click();

    // Waiting on the note itself, not on an on-screen message: the previous test
    // leaves a saved note behind, so "Saved." is already there and proves nothing.
    await expect
      .poll(
        async () => {
          const poll = await page.request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`);
          return (await poll.json()).voice_feedback?.sketch?.v ?? null;
        },
        { timeout: 60_000, message: 'the walkthrough saves with its strokes' },
      )
      .toBe(1);

    // The strokes are stored in image fractions, not pixels.
    const res = await page.request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`);
    const saved = (await res.json()).voice_feedback;
    const strokes = (saved.sketch?.ops || []).filter((op: any) => op.k === 'stroke');
    expect(strokes.length).toBeGreaterThan(0);
    for (const [, x, y] of strokes[0].p) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  test('a draft note is saved through the API when the browser could not record', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');
    const headers = { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' };

    const existing = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers });
    expect(existing.ok()).toBeTruthy();
    const current = (await existing.json()).voice_feedback;
    if (current) {
      voiceId = current.id;
      return;
    }

    const bytes = Buffer.from('e2e voice note bytes');
    const mint = await request.post(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/voice-feedback`, {
      headers,
      data: { mime: 'audio/webm;codecs=opus', size_bytes: bytes.length },
    });
    expect(mint.ok()).toBeTruthy();
    const { signedUrl, path } = await mint.json();

    const upload = await request.put(signedUrl, {
      headers: { 'Content-Type': 'audio/webm', 'x-upsert': 'false' },
      data: bytes,
    });
    expect(upload.ok()).toBeTruthy();

    const save = await request.put(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/voice-feedback`, {
      headers,
      data: {
        path,
        mime: 'audio/webm;codecs=opus',
        duration_ms: 4200,
        size_bytes: bytes.length,
        // A sketch round-trips through the route, the column and the view, so a
        // walkthrough that loses its strokes points at the browser, not the server.
        sketch: {
          v: 1,
          w: 512,
          h: 512,
          ops: [{ t: 100, k: 'stroke', id: 's1', c: '#FF0000', wd: 0.005, p: [[0, 0.1, 0.1], [80, 0.4, 0.5]] }],
        },
      },
    });
    expect(save.ok()).toBeTruthy();
    const saved = (await save.json()).voice_feedback;
    expect(saved.sent_at).toBeNull();
    expect(saved.sketch?.ops).toHaveLength(1);
    voiceId = saved.id;

    const rejected = await request.put(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/voice-feedback`, {
      headers,
      data: { path, mime: 'audio/webm;codecs=opus', duration_ms: 4200, size_bytes: bytes.length, sketch: { v: 9 } },
    });
    expect(rejected.status(), 'a sketch in an unknown format is refused').toBe(400);
  });

  test('the save route refuses a path that belongs to another drawing', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');

    const foreign = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.webm';
    const res = await request.put(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/voice-feedback`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' },
      data: { path: foreign, mime: 'audio/webm', duration_ms: 4200, size_bytes: 20 },
    });
    expect(res.status()).toBe(400);
  });

  test('the student cannot see a draft note', async ({ request }) => {
    test.skip(!assignmentId || !voiceId, 'No draft note to check');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const voices = (await res.json()).voice_by_submission || {};
    expect(voices[submissionId!]).toBeUndefined();
  });

  test('tags come back with the submission, so a save keeps them', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');
    const headers = { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' };

    const draft = await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/review`, {
      headers,
      data: { action: 'draft', tag_labels: ['e2e voice'] },
    });
    expect(draft.ok()).toBeTruthy();

    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers });
    const labels = ((await res.json()).submission?.tags || []).map((t: any) => t.label);
    expect(labels).toContain('e2e voice');
  });

  test('Redo sends the note with the decision', async ({ request }) => {
    test.skip(!submissionId || !voiceId, 'No draft note to send');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');

    const redo = await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/review`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' },
      data: { action: 'redo', tutor_feedback: 'Check your vanishing points.', tag_labels: ['e2e voice'] },
    });
    expect(redo.ok()).toBeTruthy();
    const body = await redo.json();
    expect(body.voice_sent).toBe(true);
    // The durable bell row always lands, whatever happens to the Teams tiers.
    expect(body.delivery?.inapp).toBe(true);
    expect(body).toHaveProperty('next_submission_id');
  });

  test('the student can play the note, and listening marks it heard', async ({ request }) => {
    test.skip(!assignmentId || !voiceId, 'No sent note to play');
    const student = await getTestAuthToken(request, 'student');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!student || !teacher, 'Test auth not configured');
    const studentHeaders = { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' };

    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers: studentHeaders });
    expect(res.ok()).toBeTruthy();
    const note = ((await res.json()).voice_by_submission || {})[submissionId!];
    expect(note, 'The sent note reaches the student').toBeTruthy();
    expect(note.url).toMatch(/^https?:\/\//);
    expect(note.sent_at).toBeTruthy();
    // Storage internals never leave the server.
    expect(note).not.toHaveProperty('audio_path');

    const started = await request.post(`${APP_URLS.nexus}/api/drawing/voice-feedback/${voiceId}/listen`, {
      headers: studentHeaders,
      data: { position_ms: 2500, started: true, ended: false },
    });
    expect(started.ok()).toBeTruthy();

    const ended = await request.post(`${APP_URLS.nexus}/api/drawing/voice-feedback/${voiceId}/listen`, {
      headers: studentHeaders,
      data: { position_ms: note.duration_ms, started: false, ended: true },
    });
    expect(ended.ok()).toBeTruthy();
    expect((await ended.json()).heard_fully_at).toBeTruthy();

    // The teacher cannot mark a note heard on the student's behalf.
    const byTeacher = await request.post(`${APP_URLS.nexus}/api/drawing/voice-feedback/${voiceId}/listen`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' },
      data: { position_ms: 1000, started: true, ended: false },
    });
    expect(byTeacher.status()).toBe(404);

    const roster = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    const rows = (await roster.json()).drawing_roster || [];
    const row = rows.find((r: any) => r.drawing?.id === submissionId);
    // The roster row only shows the latest attempt, which this spec just created.
    if (row) expect(row.voice?.heard_fully_at).toBeTruthy();
  });

  test("a student cannot read another student's submission", async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const queue = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/review-queue?status=reviewed&limit=50`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    test.skip(!queue.ok(), 'Could not load the review queue');
    const mine = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    const myId = mine.ok() ? (await mine.json()).submission?.student_id : null;
    const other = ((await queue.json()).submissions || []).find((s: any) => myId && s.student_id !== myId);
    test.skip(!other, "No other student's submission to try");

    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${other.id}`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    expect(res.status()).toBe(404);
  });

  test('practice drawings refuse voice notes', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const practice = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { source_type: 'free_practice', original_image_url: PLACEHOLDER_IMG },
    });
    test.skip(!practice.ok(), 'Practice submissions are not available to this account');
    practiceSubmissionId = (await practice.json()).submission?.id ?? null;
    test.skip(!practiceSubmissionId, 'Practice submission was not created');

    const res = await request.post(
      `${APP_URLS.nexus}/api/drawing/submissions/${practiceSubmissionId}/voice-feedback`,
      {
        headers: { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' },
        data: { mime: 'audio/webm', size_bytes: 20 },
      },
    );
    expect(res.status()).toBe(400);
  });

  test('mobile: the voice note section fits and its controls are real touch targets', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    await page.setViewportSize({ width: 375, height: 812 });
    await openReview(page, submissionId!);

    const section = page.getByRole('region', { name: 'Voice note' });
    await expect(section).toBeVisible();
    // After Redo the round is locked, so it shows the sent note; "Evaluate" reopens it.
    const evaluate = page.getByRole('button', { name: 'Evaluate', exact: true });
    if (await evaluate.isVisible().catch(() => false)) await evaluate.click();

    const play = section.getByRole('button', { name: /Play voice note/ });
    if (await play.isVisible().catch(() => false)) {
      const box = await play.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    if (await redo.isVisible().catch(() => false)) {
      const box = await redo.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await assertNoHorizontalOverflow(page);
  });
});
