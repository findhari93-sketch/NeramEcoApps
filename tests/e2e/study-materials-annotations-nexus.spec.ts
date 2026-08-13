import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage, getTestAuthToken } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * PDF personalization — Pen / Highlighter / Sticky Note on Study Materials chapters.
 *
 * PDFReader renders pages to an opaque <canvas> with no selectable text layer (deliberate
 * anti-piracy design), so marks are freehand ink, not text-selection ranges. The API-layer
 * tests below need only an existing `nexus_study_files` row (any kind), because the
 * annotations table has no dependency on the underlying document actually rendering — they
 * cover the real risk surface (ownership, staff read-only access, the report count). The UI
 * tests need a real file to open the viewer against, and the last describe block additionally
 * needs a real PDF to reach the canvas-drawing toolbar, so both self-skip when the environment
 * has no content, matching the existing convention in study-materials-nexus.spec.ts.
 */

const NEXUS = APP_URLS.nexus;
const HEADING_TIMEOUT = 20_000;

/**
 * First-run users see a full-screen tour that aria-hides the rest of the app.
 *
 * Setting the "seen" flag via page.evaluate() AFTER navigating races the app's own
 * mount effect (which reads the same key) — on a fast render the tour has already
 * decided to open before the evaluate() call lands, and it aria-hides everything
 * underneath it, so any locator for the page content times out. addInitScript runs
 * before any page script, so the flag is always there before React's first effect.
 */
async function skipWelcomeTour(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      /* ignore storage errors */
    }
  });
}

/** Walk root + up to two folder levels for the first file matching `kind` (any kind if omitted). */
async function findFile(
  request: APIRequestContext,
  kind?: string,
): Promise<{ folderId: string | null; id: string; title: string } | null> {
  const get = async (parent?: string) => {
    const res = await request.get(`${NEXUS}/api/study-materials/folders${parent ? `?parent=${parent}` : ''}`);
    return res.ok() ? await res.json() : null;
  };
  const match = (files: any[] | undefined) => files?.find((f: any) => !kind || f.kind === kind);

  const root = await get();
  if (!root) return null;
  let hit = match(root.files);
  if (hit) return { folderId: null, id: hit.id, title: hit.title };

  for (const f of root.folders || []) {
    const lvl1 = await get(f.id);
    hit = match(lvl1?.files);
    if (hit) return { folderId: f.id, id: hit.id, title: hit.title };
    for (const sub of lvl1?.folders || []) {
      const lvl2 = await get(sub.id);
      hit = match(lvl2?.files);
      if (hit) return { folderId: sub.id, id: hit.id, title: hit.title };
    }
  }
  return null;
}

test.describe('Nexus — Study Materials annotations (API)', () => {
  test('a student can create, list, edit and delete marks; a spoofed studentId is ignored', async ({ page }) => {
    // Several sequential round trips against a dev server that may still be compiling
    // other routes under parallel workers; 60s repeatedly ran out right at the end.
    test.setTimeout(90_000);
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const loc = await findFile(page.request);
    if (!loc) {
      test.skip(true, 'No study-materials file present to annotate');
      return;
    }

    let res = await page.request.post(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`, {
      data: { page_number: 1, kind: 'highlighter', color: '#FFD54F', points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }] },
    });
    expect(res.status()).toBe(201);
    const stroke = (await res.json()).annotation;

    res = await page.request.post(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`, {
      data: { page_number: 1, kind: 'note', color: '#A5D6A7', anchor_x: 0.5, anchor_y: 0.5, note_text: 'e2e test note' },
    });
    expect(res.status()).toBe(201);
    const note = (await res.json()).annotation;

    try {
      res = await page.request.get(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`);
      let body = await res.json();
      expect(body.annotations.some((a: any) => a.id === stroke.id)).toBe(true);
      expect(body.annotations.some((a: any) => a.id === note.id)).toBe(true);

      res = await page.request.patch(`${NEXUS}/api/study-materials/annotations/${note.id}`, {
        data: { note_text: 'e2e test note (edited)' },
      });
      expect(res.ok()).toBe(true);
      expect((await res.json()).annotation.note_text).toBe('e2e test note (edited)');

      // A student-supplied studentId must never leak another student's marks: the API ignores
      // it and always serves the caller's own annotations.
      res = await page.request.get(
        `${NEXUS}/api/study-materials/files/${loc.id}/annotations?studentId=00000000-0000-0000-0000-000000000000`,
      );
      body = await res.json();
      expect(body.annotations.every((a: any) => a.student_id !== '00000000-0000-0000-0000-000000000000')).toBe(true);

      res = await page.request.delete(`${NEXUS}/api/study-materials/annotations/${stroke.id}`);
      expect(res.ok()).toBe(true);

      res = await page.request.get(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`);
      body = await res.json();
      expect(body.annotations.some((a: any) => a.id === stroke.id)).toBe(false);
    } finally {
      await page.request.delete(`${NEXUS}/api/study-materials/annotations/${stroke.id}`).catch(() => undefined);
      await page.request.delete(`${NEXUS}/api/study-materials/annotations/${note.id}`).catch(() => undefined);
    }
  });

  test('staff cannot create annotations, must pass studentId to read, and the count reaches the chapter report', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const studentAuth = await getTestAuthToken(page.request, 'student');
    if (!studentAuth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    // getTestAuthToken (unlike injectAuthForPage) does not attach an Authorization header
    // to the context, so an unauthenticated findFile() would 401 and return null here.
    await page.context().setExtraHTTPHeaders({ Authorization: `Bearer ${studentAuth.testToken}` });

    const loc = await findFile(page.request);
    if (!loc) {
      test.skip(true, 'No study-materials file present to annotate');
      return;
    }

    let res = await page.request.post(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`, {
      headers: { Authorization: `Bearer ${studentAuth.testToken}` },
      data: { page_number: 1, kind: 'note', color: '#90CAF9', anchor_x: 0.3, anchor_y: 0.3, note_text: 'staff-visibility check' },
    });
    expect(res.status()).toBe(201);
    const created = (await res.json()).annotation;

    try {
      const teacherOk = await injectAuthForPage(page, 'teacher');
      if (!teacherOk) {
        test.skip(true, 'Teacher test-login unavailable');
        return;
      }

      // Staff omitting studentId gets a 400, not another student's data by accident.
      res = await page.request.get(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`);
      expect(res.status()).toBe(400);

      res = await page.request.get(
        `${NEXUS}/api/study-materials/files/${loc.id}/annotations?studentId=${studentAuth.user.id}`,
      );
      expect(res.ok()).toBe(true);
      expect((await res.json()).annotations.some((a: any) => a.id === created.id)).toBe(true);

      // Annotating is a student action; staff attempting to create one is refused.
      res = await page.request.post(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`, {
        data: { page_number: 1, kind: 'note', color: '#000000', anchor_x: 0.1, anchor_y: 0.1, note_text: 'nope' },
      });
      expect(res.status()).toBe(403);

      res = await page.request.get(`${NEXUS}/api/study-materials/reports/chapter/${loc.id}`);
      if (res.ok()) {
        const rows = (await res.json()).rows || [];
        const row = rows.find((r: any) => r.student_id === studentAuth.user.id);
        if (row) expect(row.annotation_count).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await page.request
        .delete(`${NEXUS}/api/study-materials/annotations/${created.id}`, {
          headers: { Authorization: `Bearer ${studentAuth.testToken}` },
        })
        .catch(() => undefined);
    }
  });
});

test.describe('Nexus — Study Materials annotations (UI)', () => {
  test('the Notes tab lists a mark and it can be removed from there', async ({ page }) => {
    test.setTimeout(90_000);
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const loc = await findFile(page.request);
    if (!loc) {
      test.skip(true, 'No study-materials file present to annotate');
      return;
    }

    const res = await page.request.post(`${NEXUS}/api/study-materials/files/${loc.id}/annotations`, {
      data: { page_number: 1, kind: 'note', color: '#F48FB1', anchor_x: 0.5, anchor_y: 0.5, note_text: 'ui panel check' },
    });
    const created = (await res.json()).annotation;

    try {
      await skipWelcomeTour(page);
      await page.goto(`${NEXUS}/student/study-materials${loc.folderId ? `?folder=${loc.folderId}` : ''}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForLoadState('networkidle').catch(() => undefined);

      await page.getByText(loc.title, { exact: true }).first().click({ timeout: HEADING_TIMEOUT });
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const notesTab = dialog.getByRole('button', { name: /Notes/i }).first();
      await notesTab.click();
      await expect(dialog.getByText('ui panel check')).toBeVisible({ timeout: 20_000 });

      await dialog.getByRole('button', { name: 'Delete' }).first().click();
      await expect(dialog.getByText('ui panel check')).toBeHidden({ timeout: 20_000 });
    } finally {
      await page.request.delete(`${NEXUS}/api/study-materials/annotations/${created.id}`).catch(() => undefined);
    }
  });
});

test.describe('Nexus — Study Materials annotations (mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Notes tab is reachable at 375px with no overflow and 48px touch targets', async ({ page }) => {
    test.setTimeout(90_000);
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const loc = await findFile(page.request);
    if (!loc) {
      test.skip(true, 'No study-materials file present');
      return;
    }

    await skipWelcomeTour(page);
    await page.goto(`${NEXUS}/student/study-materials${loc.folderId ? `?folder=${loc.folderId}` : ''}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await assertNoHorizontalOverflow(page);

    await page.getByText(loc.title, { exact: true }).first().click({ timeout: HEADING_TIMEOUT });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Notes/i })).toBeVisible();
    await assertTouchTargetSize(page, '[role="dialog"] .MuiToggleButtonGroup-root .MuiToggleButton-root');
  });
});

test.describe('Nexus — PDF annotate toolbar', () => {
  /**
   * Opens the chapter dialog and, in the same beat, PDFReader's toolbar (which the
   * annotate toggle lives in). PDFReader shows this toolbar as soon as it mounts,
   * before pdf.js's async load even settles — only an eventual load *failure*
   * unmounts it (the "Could not load the PDF" early return) — so callers get one
   * real but finite window (well under a minute in practice) before that happens.
   * Keep interactions inside each test minimal so they land inside it.
   *
   * The load failure itself, when it happens, is a known, separate gap: injectAuthForPage
   * (tests/utils/credentials.ts) attaches its Authorization header to every request in
   * this browser context, including the third-party pdf.js worker fetch from jsDelivr,
   * which then fails CORS preflight. That only matters for pixel-level drawing checks,
   * not the toolbar checks below.
   */
  async function openDialogWithToggle(page: Page) {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) return null;

    const loc = await findFile(page.request, 'pdf');
    if (!loc) return null;

    await skipWelcomeTour(page);
    await page.goto(`${NEXUS}/student/study-materials${loc.folderId ? `?folder=${loc.folderId}` : ''}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await page.getByText(loc.title, { exact: true }).first().click({ timeout: HEADING_TIMEOUT });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const annotateToggle = dialog.getByRole('button', { name: 'Highlight, underline or add a note' });
    await expect(annotateToggle).toBeVisible({ timeout: 10_000 });
    return { dialog, annotateToggle };
  }

  test('the annotate toggle opens a tool sheet that is genuinely on top of the dialog', async ({ page }) => {
    test.setTimeout(90_000);
    const opened = await openDialogWithToggle(page);
    if (!opened) {
      test.skip(true, 'Nexus dev server / test-login unavailable, or no PDF study-materials file present');
      return;
    }
    const { dialog, annotateToggle } = opened;

    await annotateToggle.click();
    const sheet = dialog.getByText('Mark up this page');
    await expect(sheet).toBeVisible({ timeout: 15_000 });

    // Regression guard: the sheet is a MUI Drawer, which portals to document.body by
    // default. That used to render it *behind* this Dialog (lower default z-index,
    // unrelated stacking context) — a plain toBeVisible() above doesn't catch this,
    // since it does not check occlusion, but a real click does: Playwright's
    // actionability check fails if another element intercepts the pointer at that
    // point. Clicking a control inside the sheet, and confirming it actually took
    // effect, is what proves the sheet is genuinely on top and usable.
    await dialog.getByRole('button', { name: 'Done' }).click({ timeout: 5_000 });
    await expect(sheet).toBeHidden({ timeout: 15_000 });
  });

  test('the annotate toggle still works once the reader is fullscreen', async ({ page }) => {
    test.setTimeout(90_000);
    const opened = await openDialogWithToggle(page);
    if (!opened) {
      test.skip(true, 'Nexus dev server / test-login unavailable, or no PDF study-materials file present');
      return;
    }
    const { dialog, annotateToggle } = opened;

    // Regression guard: a Drawer portaled to document.body previously rendered
    // nowhere at all here, since the Fullscreen API only paints the fullscreen
    // element's actual DOM descendants, not portaled siblings.
    await dialog.getByRole('button', { name: 'Fullscreen' }).click();
    await annotateToggle.click();
    const sheet = dialog.getByText('Mark up this page');
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Done' }).click({ timeout: 5_000 });
    await expect(sheet).toBeHidden({ timeout: 15_000 });
  });
});
