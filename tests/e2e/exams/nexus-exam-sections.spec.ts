import { test, expect } from '@playwright/test';
import { TEACHER_ACCOUNT, APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';

/**
 * Sections are real, persisted data rather than a guess thrown away at upload.
 *
 * Covers Phase 0: a teacher can see and correct which section every question of
 * a paper sits in, and a student cannot reach any of it.
 */

test.describe('Question paper sections', () => {
  test('AC1: the sections API returns runs for a paper', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'No teacher token available in this environment');

    const papers = await request.get(`${APP_URLS.nexus}/api/question-bank/papers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(papers.ok()).toBeTruthy();
    const paperList = (await papers.json())?.data?.papers ?? (await papers.json())?.data ?? [];
    test.skip(!Array.isArray(paperList) || paperList.length === 0, 'No papers uploaded yet');

    const paperId = paperList[0].id;
    const res = await request.get(
      `${APP_URLS.nexus}/api/question-bank/papers/${paperId}/sections`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toHaveProperty('questions');
    expect(body.data).toHaveProperty('runs');
    expect(body.data).toHaveProperty('unsectioned');
    expect(Array.isArray(body.data.runs)).toBeTruthy();
  });

  test('AC2: a section change persists', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'No teacher token available in this environment');

    const papers = await request.get(`${APP_URLS.nexus}/api/question-bank/papers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const paperList = (await papers.json())?.data?.papers ?? [];
    test.skip(!Array.isArray(paperList) || paperList.length === 0, 'No papers uploaded yet');
    const paperId = paperList[0].id;

    const before = await (
      await request.get(`${APP_URLS.nexus}/api/question-bank/papers/${paperId}/sections`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const first = before.data.questions?.[0];
    test.skip(!first, 'That paper has no questions');

    const original = first.section;
    const target = original === 'aptitude' ? 'drawing' : 'aptitude';

    const patched = await request.patch(
      `${APP_URLS.nexus}/api/question-bank/papers/${paperId}/sections`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { updates: [{ question_id: first.id, section: target }] },
      },
    );
    expect(patched.ok()).toBeTruthy();
    const after = await patched.json();
    expect(after.data.questions.find((q: any) => q.id === first.id).section).toBe(target);

    // Put it back so the fixture paper is unchanged for the next run.
    await request.patch(`${APP_URLS.nexus}/api/question-bank/papers/${paperId}/sections`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { updates: [{ question_id: first.id, section: original }] },
    });
  });

  test('AC3: an unknown section is rejected rather than coerced', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'No teacher token available in this environment');

    const papers = await request.get(`${APP_URLS.nexus}/api/question-bank/papers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const paperList = (await papers.json())?.data?.papers ?? [];
    test.skip(!Array.isArray(paperList) || paperList.length === 0, 'No papers uploaded yet');

    const res = await request.patch(
      `${APP_URLS.nexus}/api/question-bank/papers/${paperList[0].id}/sections`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { updates: [{ question_id: '00000000-0000-0000-0000-000000000000', section: 'nonsense' }] },
      },
    );
    // A typo that silently became 'aptitude' would be a paper marked wrong for
    // the rest of its life.
    expect(res.status()).toBe(400);
  });

  test('unauthorized: a student is denied the sections route', async ({ request }) => {
    const token = await getTestAuthToken(request, 'student');
    test.skip(!token, 'No student token available in this environment');

    const res = await request.get(
      `${APP_URLS.nexus}/api/question-bank/papers/00000000-0000-0000-0000-000000000000/sections`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect([401, 403, 404]).toContain(res.status());
  });

  test('mobile: the paper workspace has no horizontal overflow', async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/question-bank/papers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await assertNoHorizontalOverflow(page);
  });
});
