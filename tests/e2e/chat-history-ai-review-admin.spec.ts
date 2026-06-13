import { test, expect } from '@playwright/test';

/**
 * Phase C: AI Review on the admin Chat History dashboard.
 *
 * Two layers:
 *  1. API guard test, the /api/chatbot-logs/[id]/ai-review route exists and
 *     rejects an unknown conversation id with 404 (no Gemini call needed).
 *  2. UI flow test, with the list + ai-review endpoints mocked so it does not
 *     depend on the live Gemini key (currently quota-depleted) or seed data.
 *     If the dashboard redirects to Microsoft login (unauthenticated runner),
 *     the UI test skips, matching how other admin UI specs tolerate auth.
 *
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/chat-history-ai-review-admin.spec.ts
 */

const ADMIN_BASE = 'http://localhost:3013';

test.describe('Aintra AI Review @admin', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('ai-review route returns 404 for an unknown conversation', async ({ request }) => {
    const res = await request.post(
      `${ADMIN_BASE}/api/chatbot-logs/00000000-0000-0000-0000-000000000000/ai-review`,
      { failOnStatusCode: false }
    );
    // 404 = conversation not found (route reached and guarded).
    // 503 = GEMINI_API_KEY missing in this env, also an acceptable "guarded" outcome.
    expect([404, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('AI Review button grades an answer and pre-fills the correction', async ({ page }) => {
    const fakeConversation = {
      id: 'test-conv-1',
      session_id: 'sess-test-1',
      user_id: null,
      lead_name: 'Test Student',
      user_message: 'Does NATA have a pass mark?',
      ai_response: 'No, NATA has no minimum qualifying score.',
      source: 'general_chatbot',
      thumbs_up: null,
      admin_correction: null,
      promoted_to_kb: false,
      error: null,
      created_at: new Date().toISOString(),
    };

    // Mock the list endpoint so the grid has exactly our row.
    await page.route('**/api/chatbot-logs?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [fakeConversation], total: 1 }),
      })
    );

    // Mock the AI review endpoint with a deterministic verdict.
    await page.route('**/api/chatbot-logs/test-conv-1/ai-review', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verdict: 'wrong',
          reasoning: 'NATA does have qualifying marks: 60/200 overall.',
          suggestedCorrection: 'NATA does have qualifying marks. You need at least 60 out of 200 overall.',
          model: 'mock',
        }),
      })
    );

    await page.goto('/chat-history', { waitUntil: 'domcontentloaded' });

    // Tolerate the MS-login redirect on unauthenticated runners.
    if (/\/login|login\.microsoftonline\.com/.test(page.url())) {
      test.skip(true, 'Admin dashboard requires Microsoft auth in this environment');
    }

    const reviewBtn = page.getByRole('button', { name: /AI review this answer/i }).first();
    await expect(reviewBtn).toBeVisible({ timeout: 15000 });
    await reviewBtn.click();

    // Verdict + suggestion appear in the dialog.
    await expect(page.getByText(/AI verdict:/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/qualifying marks/i)).toBeVisible();

    // "Use this answer" copies the suggestion into the correction field.
    await page.getByRole('button', { name: /use this answer/i }).click();
    await expect(page.getByLabel('Better / Corrected Answer')).toHaveValue(/qualifying marks/i);
  });
});
