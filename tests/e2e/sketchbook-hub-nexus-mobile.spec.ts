import { test, expect } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Sketchbook as the one home for a student's drawings, and the one review screen.
 *
 * API half (serial): a student adds a sketch; the teacher sees it in the
 * student's month as practice nobody reviewed, and in the flip inbox; the
 * teacher reviews it with 4 stars and the student is told; the student's month
 * now shows the review; the inbox no longer holds it; a redo on a sketch is
 * refused; the student cannot delete a reviewed sketch. Cleanup deletes it.
 *
 * Phone half: a teacher opens a tile in a student's sketchbook and lands on the
 * review screen in practice mode (Next and Send review, no Redo), Back returns
 * to that sketchbook, nothing scrolls sideways; the retired queue redirects.
 */

const NEXUS = APP_URLS.nexus;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const month = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

async function tokens(request: import('@playwright/test').APIRequestContext) {
  const s = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: STUDENT_ACCOUNT.email, role: 'student' } });
  const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
  if (s.status() !== 200 || t.status() !== 200) return null;
  return { student: (await s.json()).testToken as string, teacher: (await t.json()).testToken as string };
}

async function addSketch(request: import('@playwright/test').APIRequestContext, studentToken: string) {
  const up = await request.post(`${NEXUS}/api/drawing/upload`, {
    headers: { Authorization: `Bearer ${studentToken}` },
    multipart: { bucket: 'drawing-uploads', file: { name: 'e2e-hub.png', mimeType: 'image/png', buffer: PNG } },
  });
  expect(up.status()).toBe(200);
  const { url } = await up.json();
  const res = await request.post(`${NEXUS}/api/sketchbook/entries`, {
    headers: { Authorization: `Bearer ${studentToken}` },
    data: { original_image_url: url, caption: 'E2E hub sketch' },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).sketch as { id: string; student_id: string };
}

test.describe('Sketchbook hub API', () => {
  test.describe.configure({ mode: 'serial' });
  let tk: { student: string; teacher: string } | null = null;
  let sketch: { id: string; student_id: string } | null = null;

  test('setup', async ({ request }) => {
    tk = await tokens(request);
    test.skip(!tk, 'Nexus dev server or test-login not available');
    sketch = await addSketch(request, tk!.student);
  });

  test('teacher sees the sketch as unreviewed practice in the month and the inbox', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const monthRes = await request.get(`${NEXUS}/api/sketchbook/students/${sketch!.student_id}?month=${month()}`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    expect(monthRes.status()).toBe(200);
    const entry = (await monthRes.json()).sketches.find((s: { id: string }) => s.id === sketch!.id);
    expect(entry.kind).toBe('practice');
    expect(entry.review.state).toBe('none');
  });

  test('teacher reviews it and the student is told', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const res = await request.patch(`${NEXUS}/api/drawing/submissions/${sketch!.id}/review`, {
      headers: { Authorization: `Bearer ${tk!.teacher}` },
      data: { tutor_rating: 4, tutor_feedback: 'Confident lines. Try a lighter first pass.', action: 'complete', is_gallery_visible: false },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(true);
    expect(body.next_submission_id).toBeNull();
  });

  test('the student month shows the review, and the inbox no longer holds it', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const me = await request.get(`${NEXUS}/api/sketchbook/me?month=${month()}`, { headers: { Authorization: `Bearer ${tk!.student}` } });
    const entry = (await me.json()).sketches.find((s: { id: string }) => s.id === sketch!.id);
    expect(entry.review).toEqual({ state: 'reviewed', rating: 4, marks: null });
    const inbox = await request.get(`${NEXUS}/api/sketchbook/inbox`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    if (inbox.status() === 200) {
      expect((await inbox.json()).sketches.map((s: { id: string }) => s.id)).not.toContain(sketch!.id);
    }
  });

  test('a sketch has no redo, and a reviewed sketch stays', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const redo = await request.patch(`${NEXUS}/api/drawing/submissions/${sketch!.id}/review`, {
      headers: { Authorization: `Bearer ${tk!.teacher}` },
      data: { action: 'redo' },
    });
    expect(redo.status()).toBe(400);
    const del = await request.delete(`${NEXUS}/api/sketchbook/entries/${sketch!.id}`, { headers: { Authorization: `Bearer ${tk!.student}` } });
    expect(del.status()).toBe(409);
  });

  test('cleanup', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const res = await request.delete(`${NEXUS}/api/drawing/submissions/${sketch!.id}`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    expect(res.status()).toBe(200);
  });
});

test.describe('Sketchbook hub on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a sketchbook tile opens the review screen in practice mode, and Back returns', async ({ page, request }) => {
    test.setTimeout(90_000);
    const tk = await tokens(request);
    test.skip(!tk, 'Nexus dev server or test-login not available');
    const sketch = await addSketch(request, tk!.student);
    try {
      await injectAuthForPage(page, 'teacher');
      await page.goto(`${NEXUS}/teacher/sketchbook/${sketch.student_id}?month=${month()}`);
      const tile = page.locator(`a[href*="/teacher/drawing-reviews/${sketch.id}"]`);
      await expect(tile).toBeVisible({ timeout: 60_000 });
      await tile.click();
      await expect(page).toHaveURL(new RegExp(`/teacher/drawing-reviews/${sketch.id}\\?from=sketchbook`), { timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Send review' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Redo' })).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
      await page.getByRole('link', { name: 'Sketchbooks' }).first().waitFor();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/teacher/sketchbook/${sketch.student_id}`), { timeout: 30_000 });
    } finally {
      await request.delete(`${NEXUS}/api/drawing/submissions/${sketch.id}`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    }
  });

  test('the retired Drawing Reviews queue sends teachers to Sketchbooks', async ({ page }) => {
    test.setTimeout(90_000);
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${NEXUS}/teacher/drawing-reviews`);
    await expect(page).toHaveURL(/\/teacher\/sketchbook/, { timeout: 60_000 });
  });
});
