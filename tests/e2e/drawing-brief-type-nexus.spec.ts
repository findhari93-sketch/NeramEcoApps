/**
 * Brief types: tagging an assignment, and who may switch evaluation on.
 *
 * Guards:
 *  - perspective construction exists, and every brief type reports what is left
 *    before it can be switched on, as counts and sentences;
 *  - tagging an assignment gives its drawings the brief's fifth criterion, and
 *    clearing the tag keeps the shared four scores already given;
 *  - the tag is set from the assignment page;
 *  - a non-admin cannot write band wording or switch a brief type on.
 *
 * The activation refusals themselves (placeholder bands, fewer than five
 * anchors) are table-tested in apps/nexus/src/lib/drawing-brief-readiness.test.ts:
 * the E2E tenant has no admin account to reach them through the API, and
 * switching a real brief type on in a shared environment is not a test's call.
 *
 * Owns its fixture: one drawing assignment and one submission.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';
const PERSPECTIVE = '3d_composition.perspective_construction';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing brief types', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let assignmentId: string | null = null;
  let submissionId: string | null = null;
  let teacherToken: string | null = null;
  let perspectiveId: string | null = null;

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      if (submissionId) await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers }).catch(() => {});
      if (assignmentId) await api.delete(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers }).catch(() => {});
    } finally {
      await api.dispose();
    }
  });

  const th = () => ({ Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' });
  const criteriaKeys = async (request: APIRequestContext) => {
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/rubric`, { headers: th() });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    return { keys: (body.criteria as Array<{ key: string }>).map((c) => c.key), bands: body.bands as Record<string, number> };
  };

  test('setup: an untagged drawing assignment with one submission', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');

    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: th(),
      data: { action: 'create', classroom_id: classroomId, title: `E2E brief type ${Date.now()}`, assignment_type: 'drawing', evaluation_type: 'stars' },
    });
    expect(created.ok()).toBeTruthy();
    assignmentId = (await created.json()).assignment?.id ?? null;
    expect((await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers: th(), data: { action: 'reopen' } })).ok()).toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      multipart: { file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) }, bucket: 'drawing-uploads' },
    });
    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: (await uploaded.json()).url },
    });
    expect(submitted.ok()).toBeTruthy();
    submissionId = (await submitted.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('perspective construction exists, and readiness is counted in words', async ({ request }) => {
    test.skip(!teacherToken, 'Setup did not complete');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/brief-types`, { headers: th() });
    test.skip(res.status() === 503, `Brief types not migrated here: ${await res.text()}`);
    expect(res.ok()).toBeTruthy();
    const briefs = (await res.json()).brief_types as Array<{ id: string; key: string; readiness: { bandsTotal: number; blockers: string[]; ready: boolean } }>;
    const perspective = briefs.find((b) => b.key === PERSPECTIVE);
    expect(perspective, 'the perspective construction brief type is seeded').toBeTruthy();
    perspectiveId = perspective!.id;
    expect(perspective!.readiness.bandsTotal).toBe(25);
    if (!perspective!.readiness.ready) {
      expect(perspective!.readiness.blockers.length).toBeGreaterThan(0);
      for (const b of perspective!.readiness.blockers) expect(b).toMatch(/[a-z]{3,}.*\./i);
    }
  });

  test('tagging gives the fifth criterion, and clearing keeps the shared four', async ({ request }) => {
    test.skip(!perspectiveId || !submissionId, 'Setup did not complete');
    expect((await criteriaKeys(request)).keys).toEqual(['composition', 'proportion', 'tonal_quality', 'line_quality']);

    const tag = await request.put(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/brief-type`, { headers: th(), data: { brief_type_id: perspectiveId } });
    expect(tag.ok()).toBeTruthy();
    expect((await criteriaKeys(request)).keys).toContain('depth_perspective');

    const scored = await request.put(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/rubric`, {
      headers: th(), data: { bands: { composition: 3, depth_perspective: 2 } },
    });
    expect(scored.ok()).toBeTruthy();

    const clear = await request.put(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/brief-type`, { headers: th(), data: { brief_type_id: null } });
    expect(clear.ok()).toBeTruthy();
    const after = await criteriaKeys(request);
    expect(after.keys).not.toContain('depth_perspective');
    expect(after.bands.composition).toBe(3);
  });

  test('the brief is tagged from the assignment page', async ({ page, request }) => {
    test.skip(!perspectiveId || !assignmentId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });
    const picker = page.getByTestId('assignment-brief-picker');
    await expect(picker).toBeVisible({ timeout: 90_000 });
    await picker.getByLabel('Brief type').click();
    await page.getByRole('option', { name: 'Perspective construction' }).click();
    await expect(picker).toContainText('Saved.');
    await expect.poll(async () => {
      const res = await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/brief-type`, { headers: th() });
      return (await res.json()).brief_type_id;
    }, { timeout: 30_000 }).toBe(perspectiveId);
  });

  test('a non-admin cannot write band wording or switch a brief type on', async ({ request }) => {
    test.skip(!perspectiveId, 'Setup did not complete');
    const detail = await request.get(`${APP_URLS.nexus}/api/drawing/brief-types/${encodeURIComponent(PERSPECTIVE)}`, { headers: th() });
    expect(detail.ok()).toBeTruthy();
    const body = await detail.json();
    test.skip(body.can_edit === true, 'The E2E teacher is an admin here, so the refusal cannot be observed');
    expect((await request.put(`${APP_URLS.nexus}/api/drawing/brief-types/${encodeURIComponent(PERSPECTIVE)}`, {
      headers: th(), data: { criterion_key: 'composition', band_descriptions: { '1': 'x' } },
    })).status()).toBe(403);
    expect((await request.post(`${APP_URLS.nexus}/api/drawing/brief-types/${encodeURIComponent(PERSPECTIVE)}/activate`, {
      headers: th(), data: { active: true },
    })).status()).toBe(403);
  });

  test('a student cannot tag an assignment or read brief types', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student || !assignmentId, 'Setup did not complete');
    const headers = { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' };
    expect((await request.get(`${APP_URLS.nexus}/api/drawing/brief-types`, { headers })).status()).toBe(403);
    expect((await request.put(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/brief-type`, { headers, data: { brief_type_id: null } })).status()).toBe(403);
  });
});
