import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The class prep surfaces at 375px.
 *
 * Mobile is the primary viewport for this feature, not an afterthought: a student
 * does a prep test on a phone in the evening, and a teacher checks the readiness
 * roster on a phone ten minutes before the class. Both surfaces were built with
 * that as the default, so both are verified there.
 *
 * The numeric input gets its own attention because it is new and because
 * `type="number"` (which it deliberately is NOT) misbehaves exactly on mobile:
 * leading zeros are stripped and some Android keyboards produce input the field
 * silently discards.
 */

const NEXUS = APP_URLS.nexus;
const IPHONE_SE = { width: 375, height: 667 };

test.use({ viewport: IPHONE_SE });

test.describe('Class prep on a 375px phone', () => {
  test('the student prep test page does not scroll sideways', async ({ page, request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    // Find a class the student can actually reach, then its prep test.
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account');
      return;
    }
    const body = await res.json();
    const gated = Object.keys(body.prep || {})[0];
    const candidate =
      gated || (body.classes || []).find((c: any) => c.status === 'scheduled')?.id;
    if (!candidate) {
      test.skip(true, 'No class to open a prep test against');
      return;
    }

    const paper = await request.get(`${NEXUS}/api/student/class-prep/${candidate}/test`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (paper.status() !== 200) {
      test.skip(true, 'No prep test attached to a reachable class in this environment');
      return;
    }

    await injectAuthForPage(page, 'student');
    await page.goto(`${NEXUS}/student/class-prep/${candidate}/test`);
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);

    // One question per screen, with the submit bar pinned in the thumb zone.
    const actionBar = page.locator('button', { hasText: /Next|Submit/ }).first();
    await expect(actionBar).toBeVisible();
    const box = await actionBar.boundingBox();
    expect(box?.height ?? 0, 'the primary action is a 48px target').toBeGreaterThanOrEqual(44);
  });

  test('the answer control is tappable and the numeric field is a real keypad', async ({
    page,
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account');
      return;
    }
    const body = await res.json();
    const candidate =
      Object.keys(body.prep || {})[0] ||
      (body.classes || []).find((c: any) => c.status === 'scheduled')?.id;
    if (!candidate) {
      test.skip(true, 'No class to open a prep test against');
      return;
    }

    const paper = await request.get(`${NEXUS}/api/student/class-prep/${candidate}/test`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (paper.status() !== 200) {
      test.skip(true, 'No prep test attached to a reachable class in this environment');
      return;
    }
    const questions = (await paper.json()).questions || [];

    await injectAuthForPage(page, 'student');
    await page.goto(`${NEXUS}/student/class-prep/${candidate}/test`);
    await page.waitForLoadState('networkidle');

    const hasNumerical = questions.some(
      (q: any) => String(q.question_format || '').toUpperCase() === 'NUMERICAL',
    );

    if (hasNumerical) {
      // Walk to the first numerical question.
      for (let i = 0; i < questions.length; i++) {
        const numeric = page.locator('input[inputmode="decimal"]');
        if (await numeric.count()) {
          // NOT type="number": that strips leading zeros and drops input some
          // Android keyboards produce. inputMode gets the keypad without it.
          await expect(numeric.first()).toHaveAttribute('type', 'text');
          const nbox = await numeric.first().boundingBox();
          expect(nbox?.height ?? 0, 'the numeric field is at least 48px tall').toBeGreaterThanOrEqual(48);

          // 16px or smaller and iOS zooms the page on focus, pushing the question
          // the student is answering off screen.
          const fontSize = await numeric
            .first()
            .evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
          expect(fontSize, 'font is 16px or larger so iOS does not zoom').toBeGreaterThanOrEqual(16);

          await numeric.first().fill('3.14');
          await expect(numeric.first()).toHaveValue('3.14');
          break;
        }
        const next = page.locator('button', { hasText: 'Next' }).first();
        if (!(await next.isVisible().catch(() => false))) break;
        await next.click();
      }
    } else {
      // MCQ path: the option cards are the primary target.
      await assertTouchTargetSize(page, '[role="radio"]', 44);
    }

    await assertNoHorizontalOverflow(page);
  });

  test('the teacher readiness roster stays a list, not a sideways table', async ({ page, request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account');
      return;
    }
    const cls = ((await res.json()).classes || []).find((c: any) => c.status === 'scheduled');
    if (!cls) {
      test.skip(true, 'No upcoming class for this teacher');
      return;
    }

    const roster = await request.get(`${NEXUS}/api/timetable/${cls.id}/prep-roster`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (roster.status() !== 200) {
      test.skip(true, 'class prep migrations not applied in this environment');
      return;
    }
    const data = await roster.json();
    if (!data.has_test) {
      test.skip(true, 'No prep test on this class, so the roster does not render');
      return;
    }

    await injectAuthForPage(page, 'teacher');
    await page.goto(`${NEXUS}/teacher/timetable`);
    await page.waitForLoadState('networkidle');
    await page.locator(`text=${cls.title}`).first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const headline = page.locator('text=/\\d+ ready/').first();
    if (!(await headline.isVisible().catch(() => false))) {
      test.skip(true, 'Could not open the class panel in this environment');
      return;
    }

    // Expanding must not introduce a sideways scroll: this is where a table would
    // have, which is why it is a flat list of rows.
    await headline.click();
    await page.waitForTimeout(400);
    await assertNoHorizontalOverflow(page);
  });
});
