import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Curriculum Repository + Teaching Plans (Course Plan v2, sequential
 * auto-flow) E2E, API level.
 *
 * Full lifecycle: create module -> quick-add topics -> mark class ready ->
 * create plan -> add entries to the queue -> pin a test -> reorder ->
 * set session span -> activate -> class-day agenda (seed, mark, end class,
 * carry) -> skip -> audit feed reflects it all -> catch-up track for a late
 * joiner -> student sees only their shared track -> student denied on staff
 * endpoints.
 *
 * Teams meeting creation is NOT exercised here (needs a real Graph token);
 * the schedule bridge is tested without it.
 *
 * Requires migrations 20260703000000_nexus_curriculum.sql and
 * 20260703120000_nexus_plan_autoflow.sql to be applied.
 */

const NEXUS_URL = APP_URLS.nexus;
const STAMP = `E2E-CPv2 ${Date.now()}`;

// Future window so nothing is locked by the engine (Mon Jul 6 2026 onward).
const PLAN_START = '2026-07-06';
const PLAN_END = '2026-08-30';
const TEST_PIN_DATE = '2026-07-10';

test.describe('Teaching Plans (Course Plan v2 auto-flow)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: NEXUS_URL });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let studentClassroomId: string;
  let studentUserId: string;
  let moduleId: string;
  let topicAId: string; // 2 sessions
  let topicBId: string; // 1 session
  let planId: string;
  let entryAId: string;
  let entryBId: string;
  let testEntryId: string;
  let extraEntryId: string;
  let catchupPlanId: string;

  const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

  test('setup: tokens', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    expect(teacher).toBeTruthy();
    teacherToken = teacher!.testToken;
    classroomId = teacher!.classrooms[0]?.id;
    expect(classroomId).toBeTruthy();

    const student = await getTestAuthToken(request, 'student');
    expect(student).toBeTruthy();
    studentToken = student!.testToken;
    studentClassroomId = student!.classrooms[0]?.id;
    studentUserId = student!.user?.id;
  });

  // ── Repository ─────────────────────────────────────────

  test('teacher creates a module', async ({ request }) => {
    const res = await request.post('/api/curriculum', {
      ...auth(teacherToken),
      data: { action: 'create_module', title: `${STAMP} Drawing`, exam_tags: ['nata'] },
    });
    expect(res.status()).toBe(200);
    moduleId = (await res.json()).module.id;
    expect(moduleId).toBeTruthy();
  });

  test('teacher quick-adds topics (land as Ideas)', async ({ request }) => {
    const a = await request.post('/api/curriculum', {
      ...auth(teacherToken),
      data: {
        action: 'create_topic',
        module_id: moduleId,
        title: `${STAMP} One-Point Perspective`,
        priority: 'mandatory',
        estimated_sessions: 2,
      },
    });
    expect(a.status()).toBe(200);
    const topicA = (await a.json()).topic;
    topicAId = topicA.id;
    expect(topicA.status).toBe('idea');
    expect(topicA.priority).toBe('mandatory');
    expect(topicA.visible_to_students).toBe(false);

    const b = await request.post('/api/curriculum', {
      ...auth(teacherToken),
      data: { action: 'create_topic', module_id: moduleId, title: `${STAMP} Mensuration Intro` },
    });
    expect(b.status()).toBe(200);
    topicBId = (await b.json()).topic.id;
  });

  test('teacher authors content and marks topic A class ready', async ({ request }) => {
    const res = await request.patch(`/api/curriculum/topics/${topicAId}`, {
      ...auth(teacherToken),
      data: {
        summary: 'Horizon line, vanishing point, depth construction.',
        activities: '- Warm-up: 10 cubes\n- Guided demo: room corner\n- Timed sketch drill',
        status: 'class_ready',
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).topic.status).toBe('class_ready');
  });

  test('topic publication toggles persist', async ({ request }) => {
    const on = await request.patch(`/api/curriculum/topics/${topicAId}`, {
      ...auth(teacherToken),
      data: { visible_to_students: true, is_self_learning: false },
    });
    expect(on.status()).toBe(200);
    expect((await on.json()).topic.visible_to_students).toBe(true);
    const off = await request.patch(`/api/curriculum/topics/${topicAId}`, {
      ...auth(teacherToken),
      data: { visible_to_students: false },
    });
    expect((await off.json()).topic.visible_to_students).toBe(false);
  });

  // ── Plan lifecycle (queue model) ───────────────────────

  test('teacher creates a plan (draft) with schedule settings', async ({ request }) => {
    const res = await request.post('/api/teaching-plans', {
      ...auth(teacherToken),
      data: {
        classroom_id: classroomId,
        title: `${STAMP} Plan`,
        exam_type: 'nata',
        start_date: PLAN_START,
        expected_end_date: PLAN_END,
        saturday_classes: true,
        exam_date: '2026-09-12',
      },
    });
    expect(res.status()).toBe(200);
    const plan = (await res.json()).plan;
    planId = plan.id;
    expect(plan.status).toBe('draft');
    expect(plan.saturday_classes).toBe(true);
    expect(plan.exam_date).toBe('2026-09-12');
  });

  test('teacher adds topics and a test placeholder to the queue', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: {
        action: 'add_entries',
        entries: [{ topic_id: topicAId }, { topic_id: topicBId }, { label: 'Weekly Test 1', entry_type: 'test' }],
      },
    });
    expect(res.status()).toBe(200);
    const { entries } = await res.json();
    expect(entries.length).toBe(3);
    entryAId = entries[0].id;
    entryBId = entries[1].id;
    testEntryId = entries[2].id;
    // Draft plan: additions are not flagged as unplanned inserts.
    expect(entries[0].is_unplanned).toBe(false);
    // Auto-flow: topic entries never carry a date; the queue computes them.
    expect(entries[0].planned_date).toBeNull();
    // Queue positions ascend.
    expect(entries[1].position).toBeGreaterThan(entries[0].position);
  });

  test('teacher pins the test to a date', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { action: 'pin_test', entry_id: testEntryId, pinned_date: TEST_PIN_DATE },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).entry.planned_date).toBe(TEST_PIN_DATE);
  });

  test('pinning a topic is rejected (tests only)', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { action: 'pin_test', entry_id: entryAId, pinned_date: TEST_PIN_DATE },
    });
    expect(res.status()).toBe(400);
  });

  test('teacher reorders topic B to the start of the queue', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { action: 'reorder_entry', entry_id: entryBId },
    });
    expect(res.status()).toBe(200);

    const plan = await (await request.get(`/api/teaching-plans/${planId}`, auth(teacherToken))).json();
    const ordered = plan.plan.entries.map((e: { id: string }) => e.id);
    expect(ordered.indexOf(entryBId)).toBeLessThan(ordered.indexOf(entryAId));
  });

  test('teacher sets the session span of topic A', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { action: 'set_span', entry_id: entryAId, session_span: 3 },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).entry.session_span).toBe(3);
  });

  test('teacher activates the plan', async ({ request }) => {
    const res = await request.patch(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { status: 'active' },
    });
    expect(res.status()).toBe(200);
    const plan = (await res.json()).plan;
    expect(plan.status).toBe('active');
    expect(plan.activated_at).toBeTruthy();
  });

  test('additions to an active plan are tagged unplanned', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { action: 'add_entries', entries: [{ topic_id: topicBId, label: 'Extra practice' }] },
    });
    expect(res.status()).toBe(200);
    const entry = (await res.json()).entries[0];
    extraEntryId = entry.id;
    expect(entry.is_unplanned).toBe(true);
  });

  test('schedule bridge creates a class without touching the pinned date', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}/schedule`, {
      ...auth(teacherToken),
      data: { entry_id: entryAId, scheduled_date: '2026-07-07', start_time: '19:00', end_time: '20:30' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.class.id).toBeTruthy();
    expect(body.class.plan_entry_id).toBe(entryAId);
    expect(body.entry.status).toBe('scheduled');
    // Auto-flow invariant: topic entries keep planned_date NULL.
    expect(body.entry.planned_date).toBeNull();
  });

  // ── Class Day ──────────────────────────────────────────
  // Queue after reorder: B (1 day, Jul 6) -> A (3 days, Jul 7 to 9) ->
  // pinned test (Jul 10) -> extra.

  test('class-day GET seeds the agenda from the topic content', async ({ request }) => {
    const res = await request.get(`/api/teaching-plans/${planId}/class-day?date=2026-07-07`, auth(teacherToken));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.entry?.id).toBe(entryAId);
    // Topic A has 3 activity bullets.
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    expect(body.items[0].status).toBe('pending');
  });

  test('agenda items cycle status and take unplanned additions', async ({ request }) => {
    const day = await (
      await request.get(`/api/teaching-plans/${planId}/class-day?date=2026-07-07`, auth(teacherToken))
    ).json();
    const first = day.items[0];

    const set = await request.post(`/api/teaching-plans/${planId}/class-day`, {
      ...auth(teacherToken),
      data: { action: 'set_item_status', item_id: first.id, status: 'covered' },
    });
    expect(set.status()).toBe(200);
    expect((await set.json()).item.status).toBe('covered');

    const add = await request.post(`/api/teaching-plans/${planId}/class-day`, {
      ...auth(teacherToken),
      data: { action: 'add_item', date: '2026-07-07', title: 'Q&A: measuring point method' },
    });
    expect(add.status()).toBe(200);
    const item = (await add.json()).item;
    expect(item.is_unplanned).toBe(true);
    expect(item.source).toBe('manual');
  });

  test('end class logs coverage (completed_sessions increments)', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}/class-day`, {
      ...auth(teacherToken),
      data: { action: 'end_class', date: '2026-07-07' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.entry.completed_sessions).toBe(1);
    // Span is 3, so one session does not finish the entry.
    expect(body.finished).toBe(false);
  });

  test('carry remaining grows the session span (later classes shift)', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}/class-day`, {
      ...auth(teacherToken),
      data: { action: 'carry_remaining', date: '2026-07-07' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).entry.session_span).toBe(4);
  });

  test('skip frees the class days of the extra entry', async ({ request }) => {
    const res = await request.post(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { action: 'set_status', entry_id: extraEntryId, status: 'skipped' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).entry.status).toBe('skipped');
  });

  test('plan GET returns queue, linked classes and the full audit story', async ({ request }) => {
    const res = await request.get(`/api/teaching-plans/${planId}`, auth(teacherToken));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plan.entries.length).toBeGreaterThanOrEqual(4);
    const scheduled = body.plan.entries.find((e: { id: string }) => e.id === entryAId);
    expect(scheduled.classes.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.teachers)).toBe(true);

    const actions = body.audit.map((a: { action: string }) => a.action);
    for (const expected of [
      'created',
      'added_entry',
      'pinned',
      'reordered',
      'activated',
      'scheduled_class',
      'coverage_logged',
      'carried',
      'status_changed',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  // ── Catch-up (late joiner) ─────────────────────────────
  // A plan far in the past makes every computed class day precede the e2e
  // student's enrolment, so the whole queue counts as missed.

  test('teacher builds a past plan and generates a catch-up track', async ({ request }) => {
    test.skip(!studentClassroomId, 'e2e student has no classroom enrolment');
    const create = await request.post('/api/teaching-plans', {
      ...auth(teacherToken),
      data: {
        classroom_id: studentClassroomId,
        title: `${STAMP} Catchup Plan`,
        exam_type: 'nata',
        start_date: '2023-01-02',
        expected_end_date: '2023-03-31',
      },
    });
    expect(create.status()).toBe(200);
    catchupPlanId = (await create.json()).plan.id;

    const add = await request.post(`/api/teaching-plans/${catchupPlanId}`, {
      ...auth(teacherToken),
      data: { action: 'add_entries', entries: [{ topic_id: topicAId }, { topic_id: topicBId }] },
    });
    expect(add.status()).toBe(200);

    const gen = await request.post(`/api/teaching-plans/${catchupPlanId}/catchup`, {
      ...auth(teacherToken),
      data: { action: 'generate', student_id: studentUserId },
    });
    expect(gen.status()).toBe(200);
    const track = (await gen.json()).track;
    expect(track).toBeTruthy();
    expect(track.shared_at).toBeNull();
    expect(track.items.length).toBe(2);
  });

  test('student cannot see an unshared track', async ({ request }) => {
    test.skip(!catchupPlanId, 'catch-up plan not created');
    const res = await request.get('/api/student/catchup', auth(studentToken));
    expect(res.status()).toBe(200);
    const { tracks } = await res.json();
    expect(tracks.some((t: { plan_id: string }) => t.plan_id === catchupPlanId)).toBe(false);
  });

  test('sharing publishes the track and its topics', async ({ request }) => {
    test.skip(!catchupPlanId, 'catch-up plan not created');
    const res = await request.post(`/api/teaching-plans/${catchupPlanId}/catchup`, {
      ...auth(teacherToken),
      data: { action: 'share', student_id: studentUserId },
    });
    expect(res.status()).toBe(200);
    const track = (await res.json()).track;
    expect(track.shared_at).toBeTruthy();

    // Sharing makes the tracked topics student-visible self-learning modules.
    const topic = await (
      await request.get(`/api/curriculum/topics/${topicAId}`, auth(teacherToken))
    ).json();
    expect(topic.topic.is_self_learning).toBe(true);
    expect(topic.topic.visible_to_students).toBe(true);
  });

  test('student sees the shared track and completes it in order', async ({ request }) => {
    test.skip(!catchupPlanId, 'catch-up plan not created');
    const res = await request.get('/api/student/catchup', auth(studentToken));
    expect(res.status()).toBe(200);
    const track = (await res.json()).tracks.find((t: { plan_id: string }) => t.plan_id === catchupPlanId);
    expect(track).toBeTruthy();
    expect(track.items.length).toBe(2);

    // Out-of-order completion is rejected.
    const early = await request.post('/api/student/catchup', {
      ...auth(studentToken),
      data: { item_id: track.items[1].id, status: 'done' },
    });
    expect(early.status()).toBe(400);

    // In-order completion works.
    const first = await request.post('/api/student/catchup', {
      ...auth(studentToken),
      data: { item_id: track.items[0].id, status: 'done' },
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).item.status).toBe('done');
  });

  // ── Access control ─────────────────────────────────────

  test('student is denied on all staff endpoints', async ({ request }) => {
    for (const call of [
      request.get('/api/curriculum', auth(studentToken)),
      request.get(`/api/curriculum/topics/${topicAId}`, auth(studentToken)),
      request.get('/api/teaching-plans', auth(studentToken)),
      request.get(`/api/teaching-plans/${planId}`, auth(studentToken)),
      request.get(`/api/teaching-plans/${planId}/class-day?date=2026-07-07`, auth(studentToken)),
      request.get(`/api/teaching-plans/${planId}/catchup`, auth(studentToken)),
    ]) {
      const res = await call;
      expect(res.status()).toBe(403);
    }
  });

  test('unauthenticated requests are rejected', async ({ request }) => {
    const res = await request.get('/api/curriculum');
    expect(res.status()).not.toBe(200);
  });

  // ── Cleanup (soft) ─────────────────────────────────────

  test('cleanup: archive plans, deactivate topics and module', async ({ request }) => {
    await request.patch(`/api/teaching-plans/${planId}`, {
      ...auth(teacherToken),
      data: { status: 'archived' },
    });
    if (catchupPlanId) {
      await request.patch(`/api/teaching-plans/${catchupPlanId}`, {
        ...auth(teacherToken),
        data: { status: 'archived' },
      });
    }
    for (const topicId of [topicAId, topicBId]) {
      await request.patch(`/api/curriculum/topics/${topicId}`, {
        ...auth(teacherToken),
        data: { is_active: false },
      });
    }
    const res = await request.post('/api/curriculum', {
      ...auth(teacherToken),
      data: { action: 'update_module', module_id: moduleId, is_active: false },
    });
    expect(res.status()).toBe(200);
  });
});
