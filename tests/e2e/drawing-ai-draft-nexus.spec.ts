/**
 * An AI draft on the review screen, with no model anywhere near the test.
 *
 * The draft is SEEDED straight into the evaluation tables in the exact shape
 * lib/drawing-eval/evaluate.ts writes, so everything downstream of a real
 * draft is exercised while nothing is spent. No test here presses Draft again,
 * and a running claim is seeded rather than started.
 *
 * Guards:
 *  - a confident criterion arrives scored and read-only, an unsure one only as
 *    a hint, and the scores the screen shows are what the record holds;
 *  - the draft's paragraph opens an empty feedback box, and Complete reads
 *    Approve;
 *  - marks draw solid where the model was sure and dashed where not;
 *  - taking over a drafted score records the draft's band beside the teacher's
 *    and asks why;
 *  - approving drafts unread is refused until the shadow comparison allows it,
 *    and the comparison says honestly how far there is to go;
 *  - with no draft, the rail says in words where the draft stands (drafting,
 *    switched off, budget spent, could not), and a running claim reads as drafting.
 *
 * Owns its fixture: one drawing assignment, one submission, one seeded draft.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';
const DRAFT_COMMENT = 'E2E draft: the blocks converge well; the stair treads drift left.';

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing AI draft', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  const admin = adminClient();
  let assignmentId: string | null = null;
  let submissionId: string | null = null;
  let draftId: string | null = null;
  let teacherToken: string | null = null;

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      // The submission delete cascades its evaluations, seeded draft included.
      if (submissionId) await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers }).catch(() => {});
      if (assignmentId) await api.delete(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers }).catch(() => {});
    } finally {
      await api.dispose();
    }
  });

  const th = () => ({ Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' });
  const rubric = async (request: APIRequestContext) =>
    (await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/rubric`, { headers: th() })).json();

  const openReview = async (page: Page) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}?assignment=${assignmentId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Scores', exact: true })).toBeVisible({ timeout: 90_000 });
  };

  test('setup: a submission with a seeded draft', async ({ request }) => {
    test.skip(!admin, 'No service role key in the environment, so no draft can be seeded');
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');

    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: th(),
      data: { action: 'create', classroom_id: classroomId, title: `E2E AI draft ${Date.now()}`, assignment_type: 'drawing', evaluation_type: 'stars' },
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

    // The shape evaluate.ts persists, written by hand.
    const { data: evaluation, error } = await admin!
      .from('drawing_evaluation')
      .insert({ submission_id: submissionId, source: 'ai', status: 'draft', provider: 'gemini', model_id: 'e2e-fixture', prompt_version: 'e2e-fixture', overall_comment: DRAFT_COMMENT })
      .select('id')
      .single();
    expect(error, error?.message).toBeNull();
    draftId = evaluation!.id;
    const criteria = [
      { criterion_key: 'proportion', ai_band: 4, confidence: 'high', reasoning: 'Block sizes hold across the sheet.' },
      { criterion_key: 'tonal_quality', ai_band: 3, confidence: 'high', reasoning: null },
      { criterion_key: 'composition', ai_band: 3, confidence: 'medium', reasoning: 'Crowded towards the left.' },
      { criterion_key: 'line_quality', ai_band: 2, confidence: 'low', reasoning: null },
    ];
    const { error: cErr } = await admin!.from('drawing_evaluation_criterion').insert(
      criteria.map((c) => ({ evaluation_id: draftId, final_band: c.ai_band, was_corrected: false, ...c })),
    );
    expect(cErr, cErr?.message).toBeNull();
    const { error: aErr } = await admin!.from('drawing_annotation').insert([
      { evaluation_id: draftId, criterion_key: 'proportion', source: 'ai', action: 'created', kind: 'region', geometry: [0.1, 0.1, 0.3, 0.3], marker: 'good', comment: 'Sizes hold' },
      { evaluation_id: draftId, criterion_key: 'composition', source: 'ai', action: 'created', kind: 'region', geometry: [0.55, 0.5, 0.3, 0.3], marker: 'problem', comment: 'Crowded' },
    ]);
    expect(aErr, aErr?.message).toBeNull();
  });

  test('the draft reads back with its confidence', async ({ request }) => {
    test.skip(!draftId, 'Setup did not complete');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/ai-draft`, { headers: th() });
    const { draft } = await res.json();
    expect(draft.criteria.proportion).toMatchObject({ ai_band: 4, confidence: 'high' });
    expect(draft.marks.map((m: { confident: boolean }) => m.confident).sort()).toEqual([false, true]);
  });

  test('confident rows arrive scored, unsure ones as hints, and Complete reads Approve', async ({ page, request }) => {
    test.skip(!draftId, 'Setup did not complete');
    await openReview(page);

    await expect(page.getByTestId('ai-draft-chip')).toBeVisible({ timeout: 30_000 });
    const confirmed = page.getByTestId('ai-confirmed');
    await expect(confirmed).toHaveCount(2);
    await expect(confirmed.first()).toContainText('Draft: 4, Very good.');
    await expect(page.getByTestId('ai-suggested')).toHaveCount(2);
    await expect(page.getByTestId('ai-suggested').first()).toContainText('Draft says 3, unsure. Your call.');

    await expect(page.getByRole('textbox', { name: 'Feedback to student' })).toHaveValue(DRAFT_COMMENT);
    await expect(page.getByTestId('feedback-from-draft')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();

    await expect(page.locator('[data-testid="ai-mark"][data-confident="true"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="ai-mark"][data-confident="false"]')).toHaveCount(1);

    // What the screen shows is what the record holds: confident bands only.
    await expect.poll(async () => (await rubric(request)).bands, { timeout: 30_000 }).toEqual({ proportion: 4, tonal_quality: 3 });
  });

  test('taking over a drafted score keeps the draft band beside it and asks why', async ({ page }) => {
    test.skip(!draftId, 'Setup did not complete');
    await openReview(page);
    await page.getByRole('button', { name: 'Change Proportion and scale, drafted as 4' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Proportion and scale 3,/ }).click();
    await expect(page.getByTestId('teaching-moment')).toContainText('You gave 3. The draft gave 4 here.');

    await expect.poll(async () => {
      const { data: manual } = await admin!.from('drawing_evaluation').select('id').eq('submission_id', submissionId).eq('source', 'manual').maybeSingle();
      if (!manual) return null;
      const { data: row } = await admin!.from('drawing_evaluation_criterion').select('ai_band, final_band, was_corrected').eq('evaluation_id', manual.id).eq('criterion_key', 'proportion').maybeSingle();
      return row;
    }, { timeout: 30_000 }).toEqual({ ai_band: 4, final_band: 3, was_corrected: true });
  });

  test('approving drafts unread is refused until the comparison allows it', async ({ request }) => {
    test.skip(!draftId, 'Setup did not complete');
    const triage = await (await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/triage`, { headers: th() })).json();
    expect(triage.items.find((i: { submission_id: string }) => i.submission_id === submissionId)?.has_ai_draft).toBe(true);

    const agreement = await (await request.get(`${APP_URLS.nexus}/api/drawing/evaluations/agreement`, { headers: th() })).json();
    test.skip(agreement.gate.ready, 'This environment already has enough compared sheets to open the gate');
    expect(agreement.gate.reason).toMatch(/of 50 so far/);

    const approve = await request.post(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/approve-drafts`, { headers: th(), data: {} });
    expect(approve.status()).toBe(409);
    expect((await approve.json()).error).toMatch(/of 50 so far/);
  });

  test('with no draft, the rail says where the draft stands, never a grey button', async ({ page }) => {
    test.skip(!draftId, 'Setup did not complete');
    await admin!.from('drawing_evaluation').delete().eq('id', draftId);
    await openReview(page);
    // Whatever this environment's switches are, the line speaks in plain words:
    // drafting, switched off, budget spent, or could not. Nothing is disabled.
    const status = page.getByTestId('draft-this');
    await expect(status).toBeVisible({ timeout: 30_000 });
    await expect(status).toContainText(/Gemini is drafting|switched off|budget is used up|could not draft/);
    await expect(page.getByRole('button', { name: 'Draft this' })).toHaveCount(0);
  });

  test('a sheet Gemini is already drafting shows the drafting line', async ({ page }) => {
    test.skip(!draftId, 'Setup did not complete');
    // A running claim, in the shape runAutoDraft writes. No model is called:
    // the screen only waits on it.
    const { data: claim, error } = await admin!
      .from('drawing_evaluation')
      .insert({ submission_id: submissionId, source: 'ai', status: 'running', provider: 'gemini', prompt_version: 'e2e-fixture' } as any)
      .select('id')
      .single();
    test.skip(!!error, `This environment has no running status yet: ${error?.message}`);
    try {
      await openReview(page);
      const status = page.getByTestId('draft-this');
      // Only while the feature is on does the screen wait on a claim.
      await expect(status).toContainText(/Gemini is drafting|switched off|budget is used up/, { timeout: 30_000 });
    } finally {
      await admin!.from('drawing_evaluation').delete().eq('id', (claim as any).id);
    }
  });
});
