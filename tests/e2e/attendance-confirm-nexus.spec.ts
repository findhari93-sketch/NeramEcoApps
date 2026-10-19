import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Confirm who is coming: ask, chase, record.
 *
 * The day forecast reads "~23 of 41 likely" against "33 of 33 expected". Staff
 * ask the students who often miss to confirm, the office calls whoever stays
 * silent, and either side records the answer. These tests cover:
 *
 *  - the staff API: status per student, role gates, and a 404 for a class that
 *    is not in the classroom;
 *  - the follow-up sheet at 375px: opens from a day card as a bottom sheet,
 *    fits the screen, 44px targets;
 *  - the student's one-tap page in ask mode, against a mocked context so it does
 *    not depend on what staging happens to have scheduled.
 *
 * Nothing here sends a real Teams message or writes a real answer: every POST
 * is intercepted. Staging is shared, and a test that messaged real students
 * would be worse than no test.
 */

// A cold dev server compiles each route on first hit, which alone can pass 30s.
test.describe.configure({ timeout: 180_000 });

async function signIn(page: any, role: 'teacher' | 'student') {
  await injectAuthForPage(page, role);
  await page.evaluate(() => {
    localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
  });
}

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test.describe('confirmations API', () => {
  let token = '';
  let classroomId = '';
  let classId = '';

  test.beforeAll(async ({ request }) => {
    test.setTimeout(180_000);
    token = (await getTestAuthToken(request, 'teacher'))?.testToken || '';
    const rooms = await request.get('/api/classrooms', { headers: { Authorization: `Bearer ${token}` } });
    if (rooms.ok()) classroomId = (await rooms.json()).classrooms?.[0]?.id || '';
    if (!classroomId) return;
    const today = istToday();
    const range = await request.get(
      `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=${addDays(today, -30)}&end=${addDays(today, 30)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (range.ok()) classId = (await range.json()).classes?.[0]?.class_id || '';
  });

  test('lists every expected student with one status each, and counts add up', async ({ request }) => {
    test.skip(!classId, 'No class in this environment');
    const res = await request.get(`/api/timetable/${classId}/confirmations?classroom_id=${classroomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const statuses = ['coming', 'not_coming', 'away', 'no_reply', 'not_asked'];
    for (const s of body.students) expect(statuses).toContain(s.status);
    const total = Object.values(body.counts as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total).toBe(body.students.length);
  });

  test('the range payload carries confirmed and asked ids', async ({ request }) => {
    test.skip(!classId, 'No class in this environment');
    const today = istToday();
    const res = await request.get(
      `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=${addDays(today, -30)}&end=${addDays(today, 30)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await res.json();
    expect(Array.isArray(body.classes[0].confirmed_ids)).toBe(true);
    expect(Array.isArray(body.classes[0].asked_ids)).toBe(true);
  });

  test('a class from another classroom is a 404', async ({ request }) => {
    test.skip(!classroomId, 'No classroom in this environment');
    const res = await request.get(
      `/api/timetable/00000000-0000-0000-0000-000000000000/confirmations?classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(404);
  });

  test('no token is a 401, and a student is refused', async ({ request }) => {
    test.skip(!classId, 'No class in this environment');
    const anon = await request.get(`/api/timetable/${classId}/confirmations?classroom_id=${classroomId}`);
    expect(anon.status()).toBe(401);

    const student = (await getTestAuthToken(request, 'student'))?.testToken || '';
    test.skip(!student, 'No student token in this environment');
    const res = await request.get(`/api/timetable/${classId}/confirmations?classroom_id=${classroomId}`, {
      headers: { Authorization: `Bearer ${student}` },
    });
    expect([401, 403]).toContain(res.status());
  });
});

/**
 * Staging has no classes to follow up most days, so the sheet is driven from a
 * fixture: one class tonight, a roll of twelve, two away, one stepped out, and
 * three students whose record says they often miss. The page, the forecast,
 * the day card and the sheet are all real; only three reads are canned.
 */
const ROSTER = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `reg-${i}`, name: `Regular ${i + 1}`, present: 10 })),
  { id: 'patchy-a', name: 'Anitha Rao', present: 1 },
  { id: 'patchy-b', name: 'Bharath K', present: 3 },
  { id: 'patchy-c', name: 'Chitra M', present: 4 },
  { id: 'away-1', name: 'Deepa S', present: 8 },
  { id: 'away-2', name: 'Eswar P', present: 9 },
  { id: 'out-1', name: 'Farhan A', present: 7 },
];
const FIXTURE_CLASS = '33333333-3333-4333-8333-333333333333';
const REASONS = { unwell: 0, family: 0, clash: 0, other: 0 };

async function mockFollowUp(page: any, opts: { asked?: boolean } = {}) {
  const today = istToday();
  const posts: any[] = [];

  await page.route('**/api/attendance/standing**', (route: any) => {
    const roomId = new URL(route.request().url()).searchParams.get('classroom_id');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        classroom_id: roomId,
        range: { from: addDays(today, -30), to: today },
        paused_hidden: 0,
        unmeasured_classes: 0,
        students: ROSTER.map((r) => ({
          id: r.id,
          name: r.name,
          avatar_url: null,
          study_stage: null,
          enrolled_at: '2025-01-01T00:00:00Z',
          batch_id: null,
          standing: 'keeping_up',
          reasons: [],
          rate: r.present * 10,
          present: r.present,
          counted: 10,
          away: 0,
          unexplained: 0,
          open_backlog: 0,
          blocked_on_us: 0,
          last_seen_at: null,
          never_entered: false,
          away_now: null,
        })),
      }),
    });
  });

  const tonight = {
    summary: { attending: 9, not_attending: 1, total: 10, on_roll: 12, away: 2 },
    away_ids: ['away-1', 'away-2'],
    declined_ids: ['out-1'],
    also_declined_ids: [],
    reason_tally: { ...REASONS, unwell: 1 },
    away_tally: { ...REASONS, clash: 2 },
    confirmed_ids: [],
    asked_ids: opts.asked ? ['patchy-a', 'patchy-b'] : [],
  };

  await page.route('**/api/timetable/rsvp-dashboard**', (route: any) => {
    const u = new URL(route.request().url());
    const start = u.searchParams.get('start') || today;
    const end = u.searchParams.get('end') || today;
    const days: any[] = [];
    for (let d = start; d <= end && days.length < 75; d = addDays(d, 1)) {
      days.push(
        d === today
          ? { date: d, measured: false, present: 0, class_ids: [FIXTURE_CLASS], ...tonight }
          : {
              date: d,
              measured: false,
              present: 0,
              class_ids: [],
              summary: { attending: 12, not_attending: 0, total: 12, on_roll: 12, away: 0 },
              away_ids: [],
              declined_ids: [],
              also_declined_ids: [],
              reason_tally: REASONS,
              away_tally: REASONS,
            },
      );
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        range: { start, end },
        classes: [
          {
            class_id: FIXTURE_CLASS,
            title: 'Building materials chapter',
            scheduled_date: today,
            start_time: '23:00:00',
            end_time: '23:59:00',
            batch_id: null,
            status: 'scheduled',
            attendance_synced_at: null,
            present: 0,
            ...tonight,
          },
        ],
        days,
        roster_total: 12,
        away_students: [
          { id: 'away-1', name: 'Deepa S', avatar_url: null, windows: [] },
          { id: 'away-2', name: 'Eswar P', avatar_url: null, windows: [] },
        ],
        declined_students: [{ id: 'out-1', name: 'Farhan A', avatar_url: null }],
      }),
    });
  });

  const statusOf = (id: string) =>
    id.startsWith('away')
      ? 'away'
      : id === 'out-1'
        ? 'not_coming'
        : opts.asked && (id === 'patchy-a' || id === 'patchy-b')
          ? 'no_reply'
          : 'not_asked';

  await page.route('**/api/timetable/*/confirmations**', (route: any) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, asked: 3, skipped: 0, counts: { unreached: 0 } }),
      });
    }
    const students = ROSTER.map((r) => ({
      id: r.id,
      name: r.name,
      avatar_url: null,
      phone: '9000000000',
      status: statusOf(r.id),
      reason: r.id.startsWith('away') ? 'Away until 24 Oct: exam clash' : r.id === 'out-1' ? 'Feeling unwell' : null,
      asked_at: statusOf(r.id) === 'no_reply' ? new Date(Date.now() - 4 * 3600_000).toISOString() : null,
      confirmed_at: null,
      confirmed_by_name: null,
      last_called_at: null,
      last_called_by_name: null,
      call_note: null,
      call_count: 0,
    }));
    const counts: Record<string, number> = { coming: 0, not_coming: 0, away: 0, no_reply: 0, not_asked: 0 };
    for (const st of students) counts[st.status] += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        class: {
          id: FIXTURE_CLASS,
          title: 'Building materials chapter',
          scheduled_date: today,
          start_time: '23:00:00',
          end_time: '23:59:00',
        },
        open: true,
        can_record: true,
        can_ask: true,
        students,
        counts,
      }),
    });
  });

  return posts;
}

async function openMonth(page: any) {
  await signIn(page, 'teacher');
  await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
  await page.waitForLoadState('networkidle');
  await page.getByTestId('cal-view-switch').click();
  await page.getByRole('menuitemradio', { name: /^Month$/i }).click();
  await page.waitForLoadState('networkidle');
}

const shot = async (page: any, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

test.describe('the follow-up sheet at 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('opens from the day, ticks the patchy students, and asks without sending for real', async ({ page }) => {
    const posts = await mockFollowUp(page);
    await openMonth(page);

    const day = page.locator('button', { hasText: /of 12 likely/ }).first();
    // Generous: the forecast waits on two reads, and a dev server compiles them cold.
    await expect(day).toBeVisible({ timeout: 30_000 });
    await shot(page, 'm1-month-day');
    await day.click();

    const confirm = page.getByRole('button', { name: /Confirm who is coming/ }).first();
    await expect(confirm).toBeVisible();
    await shot(page, 'm2-day-card');
    await confirm.click();

    const sheet = page.getByRole('dialog', { name: 'Confirm who is coming' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Not asked/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('checkbox', { name: 'Ask Anitha Rao' })).toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: 'Ask Regular 1' })).not.toBeChecked();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[role="dialog"] [aria-label="Filter by answer"] button');
    await shot(page, 'm3-sheet-not-asked');

    await sheet.getByRole('button', { name: /^Ask \d+ on Teams$/ }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ action: 'ask' });
    expect(posts[0].studentIds).toContain('patchy-a');
    expect(posts[0].studentIds).not.toContain('reg-0');
  });

  test('the call list: no reply first, Call is a tel: link, Record saves a reason', async ({ page }) => {
    const posts = await mockFollowUp(page, { asked: true });
    await openMonth(page);
    await page.locator('button', { hasText: /of 12 likely/ }).first().click();
    await page.getByRole('button', { name: /Confirm who is coming/ }).first().click();

    const sheet = page.getByRole('dialog', { name: 'Confirm who is coming' });
    await expect(sheet.getByRole('button', { name: /No reply/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('link', { name: 'Call Anitha Rao' })).toHaveAttribute('href', 'tel:9000000000');
    await assertTouchTargetSize(page, '[role="dialog"] a[aria-label^="Call "]');

    await sheet.getByRole('button', { name: 'Record an answer for Anitha Rao' }).click();
    const said = sheet.getByRole('group', { name: 'What they said' });
    await said.getByRole('button', { name: /Not coming/ }).click();
    await sheet.getByRole('radio', { name: 'Exam clash' }).click();
    await shot(page, 'm4-record-panel');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ action: 'record', studentId: 'patchy-a', answer: 'not_coming', reason_code: 'clash' });
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('the follow-up sheet on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('opens as a dialog with inline Call and Record', async ({ page }) => {
    await mockFollowUp(page, { asked: true });
    await openMonth(page);
    const pill = page.locator('[data-turnout]').first();
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await pill.click();
    await page.getByRole('button', { name: /Confirm who is coming/ }).first().click();

    const sheet = page.getByRole('dialog', { name: 'Confirm who is coming' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Record' }).first()).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Call' }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await shot(page, 'd1-sheet-laptop');
  });
});

test.describe('the student one-tap page', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const CLASS = '11111111-1111-4111-8111-111111111111';
  const context = (over: Record<string, unknown> = {}) => ({
    class: {
      id: CLASS,
      title: 'Building materials chapter',
      scheduled_date: istToday(),
      start_time: '19:00:00',
      end_time: '20:30:00',
      classroom_id: '22222222-2222-4222-8222-222222222222',
      status: 'scheduled',
      topic: null,
    },
    role: 'student',
    myRsvp: null,
    confirmation: { asked_at: new Date().toISOString(), confirmed_at: null },
    away: null,
    open: true,
    ...over,
  });

  test('asks the question with two equal answers, and a yes is saved', async ({ page }) => {
    let saved: any = null;
    await page.route('**/api/timetable/rsvp/context**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(context()) }),
    );
    await page.route('**/api/timetable/rsvp', (route) => {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"rsvp":null,"attending":true}' });
    });

    await signIn(page, 'student');
    await page.goto(`${APP_URLS.nexus}/student/rsvp/${CLASS}?ask=1`);
    await expect(page.getByRole('heading', { name: 'Will you be in this class?' })).toBeVisible();

    const yes = page.getByRole('button', { name: /I.ll be there/ });
    const no = page.getByRole('button', { name: /I can.t come/ });
    await expect(yes).toBeVisible();
    await expect(no).toBeVisible();
    for (const b of [yes, no]) expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    await assertNoHorizontalOverflow(page);

    await yes.click();
    await expect(page.getByRole('heading', { name: /You said you.ll be there/ })).toBeVisible();
    expect(saved).toMatchObject({ class_id: CLASS, response: 'attending' });
  });

  test('a student already away sees that, not the question', async ({ page }) => {
    await page.route('**/api/timetable/rsvp/context**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(context({ away: { summary: 'Away until 24 Oct' } })),
      }),
    );
    await signIn(page, 'student');
    await page.goto(`${APP_URLS.nexus}/student/rsvp/${CLASS}?ask=1`);
    await expect(page.getByRole('heading', { name: 'You told us you are away' })).toBeVisible();
    await expect(page.getByText('Away until 24 Oct')).toBeVisible();
  });
});
