import { test, expect } from '@playwright/test';
import {
  APP_URLS,
  PARENT_ACCOUNT,
  STUDENT_ACCOUNT,
  getTestAuthToken,
  injectParentAuthForPage,
} from '../utils/credentials';

/**
 * Class Standing on the parent portal.
 *
 * Three things are being defended here:
 *
 *   1. THE SAME NUMBER. A parent and a teacher must be shown byte-identical
 *      score and band for the same child. Two judgements about one student is
 *      the failure the parent-* modules exist to prevent, and it is worse when
 *      one of them reaches the family.
 *   2. THE GATE. resolveChildContext is the only thing standing between a
 *      parent and another family's child. MSAL means auth.uid() is always null,
 *      so there is NO row level security behind it. That makes the cross-child
 *      403 below the single most important assertion in this file.
 *   3. THE FLAG. parent.class-standing ships off, and off must mean absent from
 *      the payload, not hidden in the client.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const NOT_THEIR_CHILD = '00000000-0000-0000-0000-000000000000';

test.describe.configure({ timeout: 180_000 });

/** A real `par_` session, through the genuine provisioning path. */
async function parentSession(request: any) {
  const res = await request.post(`${NEXUS}/api/auth/parent/test-login`, {
    data: {
      studentEmail: STUDENT_ACCOUNT.email,
      loginId: PARENT_ACCOUNT.loginId,
      password: PARENT_ACCOUNT.password,
      mustChangePassword: false,
      reset: true,
    },
  });
  if (!res.ok()) return null;
  const data = await res.json();
  return data?.token ? data : null;
}

async function overview(request: any, token: string, studentId?: string) {
  const url = studentId
    ? `${NEXUS}/api/parent/overview?student=${studentId}`
    : `${NEXUS}/api/parent/overview`;
  let res = await request.get(url, { headers: { Authorization: `Bearer ${token}` } });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return res;
}

test.describe('Class Standing — the parent gate', () => {
  test('a parent cannot read another family s child', async ({ request }) => {
    const session = await parentSession(request);
    if (!session) {
      test.skip(true, 'parent test-login unavailable');
      return;
    }

    // There is no RLS behind resolveChildContext, so this assertion is the only
    // proof that the gate holds. It matters more than anything else here.
    const res = await overview(request, session.token, NOT_THEIR_CHILD);
    expect(res.status()).toBe(403);

    // Deliberately ambiguous: it must not confirm whether that student exists.
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(NOT_THEIR_CHILD);
  });

  test('an unauthenticated request is refused', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/parent/overview`);
    expect([401, 403]).toContain(res.status());
  });

  test('a staff token is not a parent token', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    // verifyMsToken defaults allowParent:false; the reverse must hold too, so a
    // Microsoft staff token cannot walk into the parent portal.
    const res = await overview(request, auth.testToken);
    expect(res.status()).not.toBe(200);
  });
});

test.describe('Class Standing — parent payload', () => {
  test('the flag decides, and off means absent rather than hidden', async ({ request }) => {
    const session = await parentSession(request);
    if (!session) {
      test.skip(true, 'parent test-login unavailable');
      return;
    }

    const res = await overview(request, session.token);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // The key must always exist so the page can tell "off" from "not loaded".
    expect(body).toHaveProperty('classStanding');

    if (body.classStanding === null) {
      // Flag off. Nothing about the standing may have leaked into the payload.
      const serialised = JSON.stringify(body);
      expect(serialised).not.toContain('effectiveWeight');
      expect(serialised).not.toContain('parentEvidence');
      test.info().annotations.push({
        type: 'note',
        description:
          'parent.class-standing is off, so the absence path was asserted. Switch it on at /teacher/admin/features to exercise the visible path.',
      });
    } else {
      expect(body.classStanding.components).toHaveLength(5);
      expect(body.classStanding.bandLabel).toBeTruthy();
    }
  });

  test('the legacy verdict still answers while it is being retired', async ({ request }) => {
    const session = await parentSession(request);
    if (!session) {
      test.skip(true, 'parent test-login unavailable');
      return;
    }

    const body = await (await overview(request, session.token)).json();
    // The adapter keeps the existing dashboard chip working for one release.
    expect(body.verdict).toBeTruthy();
    expect(['on_track', 'slipping', 'needs_attention', 'not_enough_data']).toContain(
      body.verdict.band,
    );
  });

  test('a parent and a teacher are told the same thing about the same child', async ({
    request,
  }) => {
    const session = await parentSession(request);
    const auth = await getTestAuthToken(request, 'teacher');
    if (!session || !auth) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    const parentBody = await (await overview(request, session.token)).json();
    if (!parentBody.classStanding) {
      test.skip(true, 'parent.class-standing is off, so there is nothing to compare');
      return;
    }

    const childId = parentBody.child.id;
    const classroomId = parentBody.child.classroom_id;

    const staffRes = await request.get(
      `${NEXUS}/api/students/${childId}/performance?classroom=${classroomId}&days=${parentBody.windowDays}`,
      { headers: { Authorization: `Bearer ${auth.testToken}` } },
    );
    expect(staffRes.status()).toBe(200);
    const staffStanding = (await staffRes.json()).classStanding;

    // Same number, same band. Only the wording may differ.
    expect(parentBody.classStanding.score).toBe(staffStanding.score);
    expect(parentBody.classStanding.band).toBe(staffStanding.band);
  });

  test('no peer comparison reaches a parent', async ({ request }) => {
    const session = await parentSession(request);
    if (!session) {
      test.skip(true, 'parent test-login unavailable');
      return;
    }

    const body = await (await overview(request, session.token)).json();
    const cs = body.classStanding;
    if (!cs) {
      test.skip(true, 'parent.class-standing is off');
      return;
    }

    const strings = [
      cs.headline,
      cs.detail,
      cs.bandLabel,
      ...cs.components.map((c: any) => c.parentEvidence),
    ];
    const banned = /\brank\b|\bpercentile\b|\bclass average\b|\btop \d|\bout of \d+ students\b/i;
    for (const s of strings) {
      expect(s, `peer comparison reached a parent: ${s}`).not.toMatch(banned);
      expect(s, `banned punctuation: ${s}`).not.toMatch(/—|--|&mdash;/);
    }

    // "At Risk" is staff wording. A parent gets the softer phrase for the same
    // band, because the number is identical and the framing is not.
    if (cs.band === 'at_risk') {
      expect(cs.bandLabel).toBe('Needs Support Now');
    }
  });
});

test.describe('Class Standing — parent dashboard', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the dashboard shows one answer at the top, whichever card it is', async ({ page }) => {
    // Inject FIRST and then read the payload through the page's own request
    // context. injectParentAuthForPage provisions with reset:true, which
    // recreates the parent user and invalidates any token minted earlier, so
    // fetching the overview before injecting would authenticate with a session
    // that no longer exists.
    if (!(await injectParentAuthForPage(page))) {
      test.skip(true, 'could not inject the parent session');
      return;
    }

    await page.goto(`${NEXUS}/parent/dashboard`, { waitUntil: 'domcontentloaded' });

    const res = await page.request.get(`${NEXUS}/api/parent/overview`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.classStanding) {
      await expect(page.getByText('Class Standing', { exact: true })).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByRole('button', { name: /Why this number/i })).toBeVisible();
    } else {
      // Flag off: the older verdict card still carries the headline.
      await expect(page.getByText(body.verdict.headline, { exact: false })).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText('Class Standing', { exact: true })).toHaveCount(0);
    }
  });
});
