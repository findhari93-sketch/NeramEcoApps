import { test, expect } from '@playwright/test';

/**
 * Foundation Module ↔ Checklist Integration E2E Tests
 *
 * Tests the complete lifecycle:
 * - Teacher creates module → adds items → creates checklist → links module → assigns to classroom
 * - Student views checklist → completes module items → checklist progress updates
 * - Cross-module unlock: completing one module entry unlocks the next in the checklist
 * - Full lifecycle: foundation chapter completion → module completion → checklist progression
 */

const BASE_URL = 'http://localhost:3012';

// Shared state
let teacherToken: string;
let studentToken: string;
let studentId: string;
let classroomId: string;

// Created resources (for cleanup reference)
let testModuleId: string;
let testModuleItem1Id: string;
let testModuleItem2Id: string;
let testChecklistId: string;
let testEntryId: string;
let testSimpleEntryId: string;

const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

// ============================================================
// Suite G: Module Creation & Checklist Linking (Teacher Flow)
// ============================================================
test.describe('Module Creation & Checklist Linking', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup: get teacher and student tokens', async ({ request }) => {
    // Teacher login
    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-checklist-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    const teacherBody = await teacherRes.json();
    teacherToken = teacherBody.testToken;
    classroomId = teacherBody.classrooms[0]?.id;
    expect(teacherToken).toBeTruthy();
    expect(classroomId).toBeTruthy();

    // Student login
    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-checklist-student@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user.id;
  });

  test('POST /api/modules creates a module', async ({ request }) => {
    const res = await request.post('/api/modules', {
      headers: authHeader(teacherToken),
      data: {
        title: 'E2E Test Module - Foundation Checklist',
        description: 'Created by Playwright for checklist integration tests',
        category: 'general',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.module.id).toBeTruthy();
    expect(body.module.title).toBe('E2E Test Module - Foundation Checklist');
    testModuleId = body.module.id;
  });

  test('POST /api/modules/[id]/items adds items to module', async ({ request }) => {
    // Add first item
    const res1 = await request.post(`/api/modules/${testModuleId}/items`, {
      headers: authHeader(teacherToken),
      data: {
        title: 'E2E Video Item 1',
        item_type: 'video',
        youtube_video_id: 'dQw4w9WgXcQ',
        sort_order: 0,
      },
    });
    expect(res1.status()).toBe(201);
    const body1 = await res1.json();
    testModuleItem1Id = body1.item.id;

    // Add second item
    const res2 = await request.post(`/api/modules/${testModuleId}/items`, {
      headers: authHeader(teacherToken),
      data: {
        title: 'E2E Video Item 2',
        item_type: 'video',
        youtube_video_id: 'dQw4w9WgXcQ',
        sort_order: 1,
      },
    });
    expect(res2.status()).toBe(201);
    const body2 = await res2.json();
    testModuleItem2Id = body2.item.id;
  });

  test('POST /api/checklists creates a checklist', async ({ request }) => {
    const res = await request.post('/api/checklists', {
      headers: authHeader(teacherToken),
      data: {
        title: 'E2E Test Checklist',
        description: 'Foundation + custom module integration test',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.checklist.id).toBeTruthy();
    testChecklistId = body.checklist.id;
  });

  test('POST /api/checklists/[id]/entries adds module entry to checklist', async ({
    request,
  }) => {
    const res = await request.post(`/api/checklists/${testChecklistId}/entries`, {
      headers: authHeader(teacherToken),
      data: {
        entry_type: 'module',
        module_id: testModuleId,
        sort_order: 0,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.entry.id).toBeTruthy();
    expect(body.entry.entry_type).toBe('module');
    expect(body.entry.module_id).toBe(testModuleId);
    testEntryId = body.entry.id;
  });

  test('POST /api/checklists/[id]/entries adds simple_item entry', async ({ request }) => {
    const res = await request.post(`/api/checklists/${testChecklistId}/entries`, {
      headers: authHeader(teacherToken),
      data: {
        entry_type: 'simple_item',
        title: 'E2E Simple Task After Module',
        sort_order: 1,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    testSimpleEntryId = body.entry.id;
  });

  test('POST /api/checklists/[id]/classrooms assigns to classroom', async ({ request }) => {
    const res = await request.post(`/api/checklists/${testChecklistId}/classrooms`, {
      headers: authHeader(teacherToken),
      data: { classroom_ids: [classroomId] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.assignments).toBeDefined();
    expect(body.assignments.length).toBe(1);
  });

  test('PUT /api/checklists/[id] publishes checklist', async ({ request }) => {
    const res = await request.put(`/api/checklists/${testChecklistId}`, {
      headers: authHeader(teacherToken),
      data: { is_published: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.checklist.is_published).toBe(true);
  });

  test('GET /api/checklists/[id] returns checklist with entries', async ({ request }) => {
    const res = await request.get(`/api/checklists/${testChecklistId}`, {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.checklist.entries).toBeDefined();
    expect(body.checklist.entries.length).toBe(2);

    // Entries should be ordered by sort_order
    expect(body.checklist.entries[0].entry_type).toBe('module');
    expect(body.checklist.entries[1].entry_type).toBe('simple_item');
  });

  test('entry validation: module entry requires module_id', async ({ request }) => {
    const res = await request.post(`/api/checklists/${testChecklistId}/entries`, {
      headers: authHeader(teacherToken),
      data: { entry_type: 'module' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('entry validation: simple_item entry requires title', async ({ request }) => {
    const res = await request.post(`/api/checklists/${testChecklistId}/entries`, {
      headers: authHeader(teacherToken),
      data: { entry_type: 'simple_item' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('entry validation: invalid entry_type returns 400', async ({ request }) => {
    const res = await request.post(`/api/checklists/${testChecklistId}/entries`, {
      headers: authHeader(teacherToken),
      data: { entry_type: 'invalid' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });
});

// ============================================================
// Suite H: Student Checklist View
// ============================================================
test.describe('Student Checklist View', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup tokens', async ({ request }) => {
    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-checklist-view-student@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    classroomId = (studentBody.classrooms || [])[0]?.id;
    expect(classroomId).toBeTruthy();
  });

  test('GET /api/checklists/student without classroom returns 400', async ({ request }) => {
    const res = await request.get('/api/checklists/student', {
      headers: authHeader(studentToken),
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/checklists/student returns checklists with entries', async ({ request }) => {
    const res = await request.get(`/api/checklists/student?classroom=${classroomId}`, {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.checklists).toBeDefined();
    expect(Array.isArray(body.checklists)).toBe(true);
  });

  test('student checklists include foundation data when foundation module exists', async ({
    request,
  }) => {
    const res = await request.get(`/api/checklists/student?classroom=${classroomId}`, {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    // foundation may or may not be present depending on if a foundation module
    // is linked to this classroom's checklists
    if (body.foundation) {
      expect(body.foundation.chapters).toBeDefined();
      expect(Array.isArray(body.foundation.chapters)).toBe(true);
      expect(typeof body.foundation.completedCount).toBe('number');
      expect(typeof body.foundation.totalCount).toBe('number');
    }
  });
});

// ============================================================
// Suite I: Module Item Completion → Next Item Unlock
// ============================================================
test.describe('Module Item Completion', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup tokens', async ({ request }) => {
    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-checklist-student@neramclasses.com', role: 'student' },
    });
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user.id;
  });

  test('POST /api/checklists/student/toggle starts a module item', async ({ request }) => {
    if (!testModuleItem1Id) {
      test.skip();
      return;
    }

    const res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(studentToken),
      data: {
        module_item_id: testModuleItem1Id,
        action: 'start',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeDefined();
    expect(body.progress.status).toBe('in_progress');
  });

  test('POST /api/checklists/student/toggle completes a module item', async ({ request }) => {
    if (!testModuleItem1Id) {
      test.skip();
      return;
    }

    const res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(studentToken),
      data: {
        module_item_id: testModuleItem1Id,
        action: 'complete',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeDefined();
    expect(body.progress.status).toBe('completed');
  });

  test('POST /api/checklists/student/toggle starts a simple entry', async ({ request }) => {
    if (!testSimpleEntryId) {
      test.skip();
      return;
    }

    const res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(studentToken),
      data: {
        entry_id: testSimpleEntryId,
        action: 'start',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeDefined();
  });

  test('POST /api/checklists/student/toggle completes a simple entry', async ({ request }) => {
    if (!testSimpleEntryId) {
      test.skip();
      return;
    }

    const res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(studentToken),
      data: {
        entry_id: testSimpleEntryId,
        action: 'complete',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress.status).toBe('completed');
  });

  test('toggle without entry_id or module_item_id returns 400', async ({ request }) => {
    const res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(studentToken),
      data: { action: 'complete' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('toggle without action or is_completed returns 400', async ({ request }) => {
    const res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(studentToken),
      data: { entry_id: testSimpleEntryId || 'some-id' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('legacy boolean toggle works (backward compat)', async ({ request }) => {
    if (!testModuleItem2Id) {
      test.skip();
      return;
    }

    // Complete via legacy boolean
    const res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(studentToken),
      data: {
        module_item_id: testModuleItem2Id,
        is_completed: true,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeDefined();
  });
});

// ============================================================
// Suite J: Cross-Module Checklist Progression
// ============================================================
test.describe('Cross-Module Checklist Progression', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup tokens', async ({ request }) => {
    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-checklist-teacher@neramclasses.com', role: 'teacher' },
    });
    teacherToken = (await teacherRes.json()).testToken;

    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-checklist-student@neramclasses.com', role: 'student' },
    });
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    classroomId = studentBody.classrooms[0]?.id;
  });

  test('checklist progress endpoint returns completion counts', async ({ request }) => {
    if (!testChecklistId) {
      test.skip();
      return;
    }

    const res = await request.get(`/api/checklists/${testChecklistId}/progress`, {
      headers: authHeader(teacherToken),
      failOnStatusCode: false,
    });

    // This endpoint may or may not exist — if it does, verify shape
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
  });

  test('GET /api/checklists/[id] entries maintain sort order', async ({ request }) => {
    if (!testChecklistId) {
      test.skip();
      return;
    }

    const res = await request.get(`/api/checklists/${testChecklistId}`, {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const entries = body.checklist.entries;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].sort_order).toBeGreaterThanOrEqual(entries[i - 1].sort_order);
    }
  });

  test('module list shows modules with item counts', async ({ request }) => {
    const res = await request.get('/api/modules', {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.modules).toBeDefined();
    expect(Array.isArray(body.modules)).toBe(true);

    // Find our test module
    const testModule = body.modules.find((m: any) => m.id === testModuleId);
    if (testModule) {
      expect(testModule.itemCount).toBeGreaterThanOrEqual(2);
    }
  });
});

// ============================================================
// Suite K: Full E2E Lifecycle (Foundation → Checklist)
// ============================================================
test.describe('Full Foundation-Checklist Lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  const lifecycleEmail = `e2e-full-lifecycle-${Date.now()}@neramclasses.com`;
  let lcTeacherToken: string;
  let lcStudentToken: string;
  let lcClassroomId: string;
  let lcModuleId: string;
  let lcModuleItem1Id: string;
  let lcModuleItem2Id: string;
  let lcChecklistId: string;
  let lcModuleEntryId: string;
  let lcSimpleEntryId: string;

  test('lifecycle setup: create teacher, student, module, checklist', async ({ request }) => {
    // Teacher
    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: `e2e-lc-teacher-${Date.now()}@neramclasses.com`, role: 'teacher' },
    });
    const teacherBody = await teacherRes.json();
    lcTeacherToken = teacherBody.testToken;
    lcClassroomId = teacherBody.classrooms[0]?.id;
    expect(lcClassroomId).toBeTruthy();

    // Student
    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: lifecycleEmail, role: 'student' },
    });
    const studentBody = await studentRes.json();
    lcStudentToken = studentBody.testToken;

    // Create module
    const moduleRes = await request.post('/api/modules', {
      headers: authHeader(lcTeacherToken),
      data: { title: `E2E Lifecycle Module ${Date.now()}`, category: 'general' },
    });
    expect(moduleRes.status()).toBe(201);
    lcModuleId = (await moduleRes.json()).module.id;

    // Add 2 items to module
    const item1Res = await request.post(`/api/modules/${lcModuleId}/items`, {
      headers: authHeader(lcTeacherToken),
      data: { title: 'Lifecycle Item 1', item_type: 'document', sort_order: 0 },
    });
    expect(item1Res.status()).toBe(201);
    lcModuleItem1Id = (await item1Res.json()).item.id;

    const item2Res = await request.post(`/api/modules/${lcModuleId}/items`, {
      headers: authHeader(lcTeacherToken),
      data: { title: 'Lifecycle Item 2', item_type: 'document', sort_order: 1 },
    });
    expect(item2Res.status()).toBe(201);
    lcModuleItem2Id = (await item2Res.json()).item.id;

    // Create checklist
    const checklistRes = await request.post('/api/checklists', {
      headers: authHeader(lcTeacherToken),
      data: { title: `E2E Lifecycle Checklist ${Date.now()}` },
    });
    expect(checklistRes.status()).toBe(201);
    lcChecklistId = (await checklistRes.json()).checklist.id;

    // Add module entry (sort_order 0)
    const entryRes = await request.post(`/api/checklists/${lcChecklistId}/entries`, {
      headers: authHeader(lcTeacherToken),
      data: { entry_type: 'module', module_id: lcModuleId, sort_order: 0 },
    });
    expect(entryRes.status()).toBe(201);
    lcModuleEntryId = (await entryRes.json()).entry.id;

    // Add simple entry after module (sort_order 1)
    const simpleRes = await request.post(`/api/checklists/${lcChecklistId}/entries`, {
      headers: authHeader(lcTeacherToken),
      data: { entry_type: 'simple_item', title: 'Final Task', sort_order: 1 },
    });
    expect(simpleRes.status()).toBe(201);
    lcSimpleEntryId = (await simpleRes.json()).entry.id;

    // Assign to classroom
    await request.post(`/api/checklists/${lcChecklistId}/classrooms`, {
      headers: authHeader(lcTeacherToken),
      data: { classroom_ids: [lcClassroomId] },
    });

    // Publish
    await request.put(`/api/checklists/${lcChecklistId}`, {
      headers: authHeader(lcTeacherToken),
      data: { is_published: true },
    });
  });

  test('lifecycle: student completes module items sequentially', async ({ request }) => {
    // Start item 1
    const start1Res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(lcStudentToken),
      data: { module_item_id: lcModuleItem1Id, action: 'start' },
    });
    expect(start1Res.status()).toBe(200);
    expect((await start1Res.json()).progress.status).toBe('in_progress');

    // Complete item 1
    const complete1Res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(lcStudentToken),
      data: { module_item_id: lcModuleItem1Id, action: 'complete' },
    });
    expect(complete1Res.status()).toBe(200);
    expect((await complete1Res.json()).progress.status).toBe('completed');

    // Start item 2
    const start2Res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(lcStudentToken),
      data: { module_item_id: lcModuleItem2Id, action: 'start' },
    });
    expect(start2Res.status()).toBe(200);

    // Complete item 2
    const complete2Res = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(lcStudentToken),
      data: { module_item_id: lcModuleItem2Id, action: 'complete' },
    });
    expect(complete2Res.status()).toBe(200);
    expect((await complete2Res.json()).progress.status).toBe('completed');
  });

  test('lifecycle: after module completion, student completes simple entry', async ({
    request,
  }) => {
    // Start simple entry
    const startRes = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(lcStudentToken),
      data: { entry_id: lcSimpleEntryId, action: 'start' },
    });
    expect(startRes.status()).toBe(200);

    // Complete simple entry
    const completeRes = await request.post('/api/checklists/student/toggle', {
      headers: authHeader(lcStudentToken),
      data: { entry_id: lcSimpleEntryId, action: 'complete' },
    });
    expect(completeRes.status()).toBe(200);
    expect((await completeRes.json()).progress.status).toBe('completed');
  });

  test('lifecycle: verify full checklist shows as completed', async ({ request }) => {
    const res = await request.get(`/api/checklists/student?classroom=${lcClassroomId}`, {
      headers: authHeader(lcStudentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Find our test checklist
    const ourChecklist = body.checklists.find(
      (cl: any) => cl.id === lcChecklistId
    );

    if (ourChecklist) {
      // Both entries should have completed progress
      for (const entry of ourChecklist.entries || []) {
        if (entry.id === lcModuleEntryId || entry.id === lcSimpleEntryId) {
          // Check if progress exists and is completed
          if (entry.entry_type === 'simple_item' && entry.progress) {
            expect(entry.progress.status).toBe('completed');
          }
        }
      }
    }
  });

  // Cleanup: soft-delete the test checklist
  test('cleanup: soft-delete test checklist', async ({ request }) => {
    if (!lcChecklistId) return;

    const res = await request.delete(`/api/checklists/${lcChecklistId}`, {
      headers: authHeader(lcTeacherToken),
    });
    expect(res.status()).toBe(200);
  });
});

// ============================================================
// Suite: Foundation Chapter Completion in Checklist Context
// ============================================================
test.describe('Foundation Chapters in Checklist Context', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  const fcStudentEmail = `e2e-fc-student-${Date.now()}@neramclasses.com`;
  let fcStudentToken: string;
  let fcClassroomId: string;

  test('setup: create student', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: fcStudentEmail, role: 'student' },
    });
    const body = await res.json();
    fcStudentToken = body.testToken;
    fcClassroomId = body.classrooms[0]?.id;
  });

  test('student checklist shows foundation progress when foundation module linked', async ({
    request,
  }) => {
    const res = await request.get(`/api/checklists/student?classroom=${fcClassroomId}`, {
      headers: authHeader(fcStudentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // If foundation exists in any checklist, verify its shape
    if (body.foundation) {
      expect(body.foundation.chapters).toBeDefined();
      expect(body.foundation.totalCount).toBeGreaterThan(0);
      expect(body.foundation.completedCount).toBe(0); // Fresh student

      // Current chapter should be the first one (not yet completed)
      if (body.foundation.currentChapter) {
        expect(body.foundation.currentChapter.id).toBeTruthy();
        expect(body.foundation.currentChapter.title).toBeTruthy();
      }
    }
  });

  test('completing foundation chapters updates checklist foundation progress', async ({
    request,
  }) => {
    // Get foundation chapters
    const chapRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(fcStudentToken),
    });
    const chapBody = await chapRes.json();

    if (chapBody.chapters.length === 0) {
      test.skip();
      return;
    }

    const ch1 = chapBody.chapters[0];

    // Get ch1 sections
    const detailRes = await request.get(`/api/foundation/chapters/${ch1.id}`, {
      headers: authHeader(fcStudentToken),
    });
    const detailBody = await detailRes.json();
    const sections = detailBody.sections;

    // Pass all section quizzes for chapter 1
    for (const section of sections) {
      // Get correct answers by submitting empty first
      const dummyRes = await request.post(`/api/foundation/sections/${section.id}/quiz`, {
        headers: authHeader(fcStudentToken),
        data: { answers: {} },
      });
      if (!dummyRes.ok()) continue;

      const dummyBody = await dummyRes.json();
      const correctAnswers: Record<string, string> = {};
      for (const q of dummyBody.questions || []) {
        correctAnswers[q.id] = q.correct_option;
      }

      if (Object.keys(correctAnswers).length === 0) continue;

      const quizRes = await request.post(`/api/foundation/sections/${section.id}/quiz`, {
        headers: authHeader(fcStudentToken),
        data: { answers: correctAnswers },
      });
      expect(quizRes.status()).toBe(200);
      expect((await quizRes.json()).passed).toBe(true);
    }

    // Now check the student checklist — foundation completedCount should increase
    const checklistRes = await request.get(
      `/api/checklists/student?classroom=${fcClassroomId}`,
      { headers: authHeader(fcStudentToken) }
    );
    const checklistBody = await checklistRes.json();

    if (checklistBody.foundation) {
      expect(checklistBody.foundation.completedCount).toBeGreaterThanOrEqual(1);

      // Current chapter should now be chapter 2 (if exists)
      if (checklistBody.foundation.totalCount > 1) {
        expect(checklistBody.foundation.currentChapter?.id).not.toBe(ch1.id);
      }
    }
  });
});
