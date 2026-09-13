/**
 * Hold a drawing review, then hand it back.
 *
 * The rule this guards is the one the founder said he would not bend: nothing
 * reaches a student without a human release. On a held assignment, Complete
 * finishes the review and tells nobody; the student's own view of the drawing
 * does not change until the hand-back.
 *
 * Also covers the rolling shape. Late joiners keep submitting, so a second
 * hand-back later must find only what has been held since, and an assignment
 * that never opted in must behave exactly as it always did.
 *
 * Owns its fixture: one held assignment, one submission, deleted afterwards.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing hold and hand back', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let assignmentId: string | null = null;
  let submissionId: string | null = null;
  let teacherToken = '';
  let studentToken = '';

  const th = () => ({ Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' });
  const sh = () => ({ Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' });

  /** What the student themselves can see of their drawing. */
  const studentView = async (request: APIRequestContext) => {
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers: sh() });
    expect(res.ok(), 'the student can read their own drawing').toBeTruthy();
    return (await res.json()).submission as { status: string; tutor_feedback: string | null };
  };

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      if (submissionId) {
        await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers }).catch(() => {});
      }
      if (assignmentId) {
        await api.delete(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers }).catch(() => {});
      }
    } finally {
      await api.dispose();
    }
  });

  test('setup: a held assignment and a submission to review', async ({ request }) => {
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
        title: `E2E hand back ${Date.now()}`,
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

    const preflight = await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(),
    });
    test.skip(preflight.status() === 503, 'Hold and release is not migrated in this environment');
    // A new assignment starts exactly as every existing one behaves.
    expect((await preflight.json()).assignment.mode).toBe('immediate');

    const mode = await request.put(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { mode: 'held' },
    });
    expect(mode.ok(), 'the teacher can opt this assignment into holding').toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    expect(uploaded.ok()).toBeTruthy();

    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: sh(),
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: (await uploaded.json()).url },
    });
    expect(submitted.ok()).toBeTruthy();
    submissionId = (await submitted.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('Complete on a held assignment finishes the review and tells nobody', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');

    const res = await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/review`, {
      headers: th(),
      data: { action: 'complete', tutor_rating: 4, tutor_feedback: 'Held feedback the student must not see yet' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.held).toBe(true);
    expect(body.intent).toBe('complete');
    expect(body.held_count).toBe(1);
    // Nothing was delivered, so there is no delivery receipt to report.
    expect(body.delivery).toBeUndefined();

    // THE RULE: from the student's side, nothing has happened.
    const view = await studentView(request);
    expect(view.status).toBe('submitted');
  });

  test('the preflight shows what is waiting and allows the hand-back', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(),
    });
    expect(res.ok()).toBeTruthy();
    const pre = await res.json();
    expect(pre.counts).toMatchObject({ held: 1, complete: 1, redo: 0 });
    expect(pre.canRelease).toBe(true);
    expect(pre.blockers).toEqual([]);
    expect(pre.summary).toMatch(/^1 drawing\b/);
  });

  test('the assignment page offers the hand-back', async ({ page }) => {
    test.skip(!assignmentId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Hold reviews until I hand them back')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('1 waiting to hand back')).toBeVisible({ timeout: 30_000 });
    const handBack = page.getByRole('button', { name: 'Hand back', exact: true });
    await expect(handBack).toBeVisible();
    const box = await handBack.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('handing back makes the review real for the student', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');

    const released = await request.post(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { kind: 'all' },
    });
    expect(released.ok()).toBeTruthy();
    const body = await released.json();
    expect(body.released).toBe(1);
    expect(body.batch_id).toBeTruthy();

    // Released, and only now visible.
    const view = await studentView(request);
    expect(view.status).toBe('completed');
    expect(view.tutor_feedback).toBe('Held feedback the student must not see yet');

    // Announcing is its own pass, and it runs to the end.
    const notify = await request.post(`${APP_URLS.nexus}/api/drawing/release-batches/${body.batch_id}/notify`, {
      headers: th(),
    });
    expect(notify.ok()).toBeTruthy();
    const n = await notify.json();
    expect(n.remaining).toBe(0);
    expect(n.total).toBe(1);
  });

  test('a second hand-back finds nothing left, rather than resending', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const pre = await (await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(),
    })).json();
    expect(pre.counts.held).toBe(0);
    expect(pre.canRelease).toBe(false);

    const again = await request.post(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { kind: 'all' },
    });
    expect(again.status()).toBe(409);
  });

  test('switching back to immediate never fires what is held', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    // Send the round back for a redo, held again.
    const redo = await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/review`, {
      headers: th(), data: { action: 'redo' },
    });
    expect((await redo.json()).held).toBe(true);

    const mode = await request.put(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { mode: 'immediate' },
    });
    expect(mode.ok()).toBeTruthy();

    // Flipping the setting released nothing: the student still sees the old
    // completed round, not a redo, until someone hands it back.
    const view = await studentView(request);
    expect(view.status).toBe('completed');
    const pre = await (await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(),
    })).json();
    expect(pre.counts).toMatchObject({ held: 1, redo: 1 });
  });

  test('rejects a single hand-back that names more than one drawing', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const res = await request.post(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: th(), data: { kind: 'single', submission_ids: [submissionId, submissionId + 'x'] },
    });
    expect(res.status()).toBe(400);
  });

  test('a student cannot hand anything back', async ({ request }) => {
    test.skip(!assignmentId, 'Setup did not complete');
    const res = await request.post(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/release`, {
      headers: sh(), data: { kind: 'all' },
    });
    expect(res.status()).toBe(403);
  });
});
