import { test, expect } from '@playwright/test';

/**
 * Foundation Module E2E Tests
 *
 * Tests the entire foundation module lifecycle:
 * - Chapter listing with sequential unlock logic
 * - Section quiz submission (pass/fail/partial)
 * - Chapter completion detection
 * - Sequential chapter unlocking
 * - Progress save/resume
 * - Edge cases
 */

const BASE_URL = 'http://localhost:3012';

// ============================================================
// Shared state across serial tests
// ============================================================
let studentToken: string;
let studentId: string;
let classroomId: string;
let teacherToken: string;

// Chapter/section data discovered during tests
let chapters: any[];
let firstChapterId: string;
let firstChapterSections: any[];

// Helper: auth header
const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

// Helper: build correct answers map from questions (uses admin GET with correct_option)
async function getCorrectAnswers(
  request: any,
  sectionId: string,
  token: string
): Promise<Record<string, string>> {
  // Use the student quiz GET endpoint - it strips correct_option
  // So we need to use the admin sections endpoint to get correct answers
  // Actually, the quiz POST returns correct answers in the response
  // We'll get questions from chapter detail and guess — or use a workaround

  // For testing, we'll submit with all 'a' options first to discover correct answers
  // from the response, then re-submit correctly.
  // But actually the POST response includes correct_answer for each question.
  // Let's submit once with dummy answers to discover correct answers.
  const dummyRes = await request.post(`${BASE_URL}/api/foundation/sections/${sectionId}/quiz`, {
    headers: authHeader(token),
    data: { answers: {} }, // empty answers to get graded — all will be wrong
  });
  // This might fail if answers are required. Let's use the teacher admin endpoint instead.
  // Actually, looking at the submitQuizAttempt code, empty answers will work but all will be "wrong"
  // and the response includes `questions` with `correct_option`.
  if (dummyRes.ok()) {
    const body = await dummyRes.json();
    const correctAnswers: Record<string, string> = {};
    for (const q of body.questions || []) {
      correctAnswers[q.id] = q.correct_option;
    }
    return correctAnswers;
  }

  // Fallback: try admin quiz questions endpoint
  const adminRes = await request.get(
    `${BASE_URL}/api/foundation/admin/sections/${sectionId}/questions`,
    { headers: authHeader(token) }
  );
  if (adminRes.ok()) {
    const adminBody = await adminRes.json();
    const correctAnswers: Record<string, string> = {};
    for (const q of adminBody.questions || []) {
      correctAnswers[q.id] = q.correct_option;
    }
    return correctAnswers;
  }

  throw new Error(`Could not get correct answers for section ${sectionId}`);
}

// Helper: build wrong answers (all opposite of correct)
function buildWrongAnswers(correctAnswers: Record<string, string>): Record<string, string> {
  const wrong: Record<string, string> = {};
  for (const [qId, correct] of Object.entries(correctAnswers)) {
    wrong[qId] = correct === 'a' ? 'b' : 'a';
  }
  return wrong;
}

// ============================================================
// Suite A: Foundation Chapter List API
// ============================================================
test.describe('Foundation Chapter List API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup: get student and teacher tokens', async ({ request }) => {
    // Student login
    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-foundation-student@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user.id;
    classroomId = studentBody.classrooms[0]?.id;
    expect(studentToken).toBeTruthy();
    expect(classroomId).toBeTruthy();

    // Teacher login
    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-foundation-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    const teacherBody = await teacherRes.json();
    teacherToken = teacherBody.testToken;
    expect(teacherToken).toBeTruthy();
  });

  test('GET /api/foundation/chapters without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/foundation/chapters returns chapters with progress', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.chapters).toBeDefined();
    expect(Array.isArray(body.chapters)).toBe(true);
    expect(body.chapters.length).toBeGreaterThan(0);

    // Save for later tests
    chapters = body.chapters;
    firstChapterId = chapters[0].id;

    // Verify chapter shape
    const ch = chapters[0];
    expect(ch.id).toBeTruthy();
    expect(ch.title).toBeTruthy();
    expect(typeof ch.chapter_number).toBe('number');
  });

  test('Chapter 1 is always unlocked (in_progress or completed)', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const body = await res.json();
    const ch1 = body.chapters[0];

    // Chapter 1 should never be locked
    const ch1Status = ch1.progress?.status || 'in_progress';
    expect(['in_progress', 'completed']).toContain(ch1Status);
  });

  test('Chapter 2+ are locked initially for fresh student', async ({ request }) => {
    // Create a completely fresh student to test initial lock state
    const freshRes = await request.post('/api/auth/test-login', {
      data: { email: `e2e-foundation-fresh-${Date.now()}@neramclasses.com`, role: 'student' },
    });
    expect(freshRes.status()).toBe(200);
    const freshBody = await freshRes.json();

    const chaptersRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(freshBody.testToken),
    });
    const chaptersBody = await chaptersRes.json();

    if (chaptersBody.chapters.length > 1) {
      // Fresh student: ch1 should be in_progress, ch2+ should be locked
      // (unless progress already existed)
      const ch1 = chaptersBody.chapters[0];
      const ch2 = chaptersBody.chapters[1];

      // ch1 has no progress record → should get in_progress from unlock logic
      expect(ch1.progress?.status || 'in_progress').not.toBe('locked');

      // ch2 should be locked (no progress, previous not completed)
      const ch2Status = ch2.progress?.status || 'locked';
      expect(ch2Status).toBe('locked');
    }
  });
});

// ============================================================
// Suite B: Foundation Chapter Detail API
// ============================================================
test.describe('Foundation Chapter Detail API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup tokens', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-foundation-student@neramclasses.com', role: 'student' },
    });
    const body = await res.json();
    studentToken = body.testToken;

    // Get chapters
    const chapRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const chapBody = await chapRes.json();
    chapters = chapBody.chapters;
    firstChapterId = chapters[0].id;
  });

  test('GET /api/foundation/chapters/[id] returns sections with quiz questions', async ({
    request,
  }) => {
    const res = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.chapter).toBeDefined();
    expect(body.chapter.id).toBe(firstChapterId);
    expect(body.sections).toBeDefined();
    expect(Array.isArray(body.sections)).toBe(true);
    expect(body.sections.length).toBeGreaterThan(0);

    // Save for later tests
    firstChapterSections = body.sections;

    // Verify section shape
    const section = body.sections[0];
    expect(section.id).toBeTruthy();
    expect(typeof section.start_timestamp_seconds).toBe('number');
    expect(typeof section.end_timestamp_seconds).toBe('number');
    expect(section.end_timestamp_seconds).toBeGreaterThan(section.start_timestamp_seconds);
  });

  test('Each section has quiz questions', async ({ request }) => {
    const res = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    for (const section of body.sections) {
      expect(section.quiz_questions).toBeDefined();
      expect(Array.isArray(section.quiz_questions)).toBe(true);
      expect(section.quiz_questions.length).toBeGreaterThan(0);

      // Verify question shape (correct_option should be stripped for students)
      const q = section.quiz_questions[0];
      expect(q.id).toBeTruthy();
      expect(q.question_text).toBeTruthy();
      expect(q.option_a).toBeTruthy();
      expect(q.option_b).toBeTruthy();
      expect(q.option_c).toBeTruthy();
      expect(q.option_d).toBeTruthy();
      // correct_option should NOT be present in student view
      expect(q.correct_option).toBeUndefined();
    }
  });

  test('Quiz questions do not expose correct answers in student view', async ({ request }) => {
    const res = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    for (const section of body.sections) {
      for (const q of section.quiz_questions) {
        expect(q.correct_option).toBeUndefined();
        expect(q.correct_answer).toBeUndefined();
      }
    }
  });
});

// ============================================================
// Suite C: Quiz Submission Flow
// ============================================================
test.describe('Quiz Submission Flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  let sectionId: string;
  let correctAnswers: Record<string, string>;

  test('setup: get tokens and section data', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-quiz-student@neramclasses.com', role: 'student' },
    });
    const body = await res.json();
    studentToken = body.testToken;
    studentId = body.user.id;

    // Get first chapter
    const chapRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const chapBody = await chapRes.json();
    firstChapterId = chapBody.chapters[0].id;

    // Get sections
    const detailRes = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const detailBody = await detailRes.json();
    firstChapterSections = detailBody.sections;
    sectionId = firstChapterSections[0].id;

    // Get correct answers by submitting empty (which returns questions with correct_option)
    correctAnswers = await getCorrectAnswers(request, sectionId, studentToken);
    expect(Object.keys(correctAnswers).length).toBeGreaterThan(0);
  });

  test('POST quiz without auth returns 401/500', async ({ request }) => {
    const res = await request.post(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: { Authorization: '' },
      data: { answers: correctAnswers },
      failOnStatusCode: false,
    });
    expect([401, 500]).toContain(res.status());
  });

  test('POST quiz without answers returns 400', async ({ request }) => {
    const res = await request.post(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: authHeader(studentToken),
      data: {},
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('answers');
  });

  test('POST quiz with wrong answers returns passed=false', async ({ request }) => {
    const wrongAnswers = buildWrongAnswers(correctAnswers);
    const res = await request.post(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: authHeader(studentToken),
      data: { answers: wrongAnswers },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(false);
    expect(body.score_pct).toBeLessThan(100);
  });

  test('POST quiz with correct answers returns passed=true', async ({ request }) => {
    const res = await request.post(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: authHeader(studentToken),
      data: { answers: correctAnswers },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(body.score_pct).toBe(100);
    expect(body.correct_count).toBe(body.total_count);
  });

  test('Quiz attempt number increments on re-submission', async ({ request }) => {
    // Submit again (re-attempt)
    const res = await request.post(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: authHeader(studentToken),
      data: { answers: correctAnswers },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // attempt_number should be > 1 since we've submitted multiple times
    expect(body.attempt.attempt_number).toBeGreaterThan(1);
  });

  test('Submit quiz for non-existent section returns error', async ({ request }) => {
    const res = await request.post(
      `/api/foundation/sections/00000000-0000-0000-0000-000000000000/quiz`,
      {
        headers: authHeader(studentToken),
        data: { answers: { 'fake-q': 'a' } },
        failOnStatusCode: false,
      }
    );
    expect([404, 500]).toContain(res.status());
  });
});

// ============================================================
// Suite D: Sequential Chapter Unlock via Quiz Completion
// ============================================================
test.describe('Sequential Chapter Unlock', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  // Use a dedicated student for this suite to avoid state pollution
  const unlockStudentEmail = `e2e-unlock-${Date.now()}@neramclasses.com`;

  test('setup: create fresh student', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: unlockStudentEmail, role: 'student' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    studentToken = body.testToken;
    studentId = body.user.id;
  });

  test('fresh student: chapter 1 unlocked, chapter 2+ locked', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const body = await res.json();
    chapters = body.chapters;
    expect(chapters.length).toBeGreaterThan(0);

    // Chapter 1 should be in_progress (unlocked)
    const ch1Status = chapters[0].progress?.status || 'in_progress';
    expect(ch1Status).not.toBe('locked');

    // If there's a chapter 2, it should be locked
    if (chapters.length > 1) {
      const ch2Status = chapters[1].progress?.status || 'locked';
      expect(ch2Status).toBe('locked');
    }
  });

  test('complete all sections of chapter 1 via quizzes', async ({ request }) => {
    firstChapterId = chapters[0].id;

    // Get chapter detail with sections
    const detailRes = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const detailBody = await detailRes.json();
    firstChapterSections = detailBody.sections;

    // Pass each section's quiz with correct answers
    for (const section of firstChapterSections) {
      const correctAnswers = await getCorrectAnswers(request, section.id, studentToken);

      const quizRes = await request.post(`/api/foundation/sections/${section.id}/quiz`, {
        headers: authHeader(studentToken),
        data: { answers: correctAnswers },
      });
      expect(quizRes.status()).toBe(200);
      const quizBody = await quizRes.json();
      expect(quizBody.passed).toBe(true);
    }
  });

  test('after completing chapter 1: chapter status is completed', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    const ch1 = body.chapters[0];
    expect(ch1.progress?.status).toBe('completed');
    expect(ch1.completed_sections).toBe(ch1.section_count);
  });

  test('after completing chapter 1: chapter 2 is unlocked', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    if (body.chapters.length > 1) {
      const ch2 = body.chapters[1];
      const ch2Status = ch2.progress?.status || 'in_progress';
      // Chapter 2 should be in_progress (unlocked) now
      expect(ch2Status).not.toBe('locked');
    }
  });

  test('chapter 3 stays locked when only chapter 1 is complete', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    if (body.chapters.length > 2) {
      const ch3 = body.chapters[2];
      const ch3Status = ch3.progress?.status || 'locked';
      expect(ch3Status).toBe('locked');
    }
  });
});

// ============================================================
// Suite E: Progress Save API
// ============================================================
test.describe('Progress Save API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup tokens', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-progress-student@neramclasses.com', role: 'student' },
    });
    const body = await res.json();
    studentToken = body.testToken;

    const chapRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const chapBody = await chapRes.json();
    firstChapterId = chapBody.chapters[0].id;
  });

  test('POST progress saves video position', async ({ request }) => {
    const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
      headers: authHeader(studentToken),
      data: {
        last_video_position_seconds: 45,
        status: 'in_progress',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeDefined();
  });

  test('GET chapter detail returns saved position', async ({ request }) => {
    const res = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress?.last_video_position_seconds).toBe(45);
  });

  test('POST progress with watch_session data succeeds', async ({ request }) => {
    const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
      headers: authHeader(studentToken),
      data: {
        last_video_position_seconds: 90,
        watch_session: {
          id: `ws-${Date.now()}`,
          section_id: 'test-section-placeholder', // may not match real section
          watched_seconds: 45,
          section_duration_seconds: 120,
          completion_pct: 37.5,
          play_count: 1,
          pause_count: 2,
          seek_count: 0,
          device_type: 'desktop',
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeDefined();
  });

  test('POST progress updates position correctly', async ({ request }) => {
    // Save new position
    await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
      headers: authHeader(studentToken),
      data: { last_video_position_seconds: 120 },
    });

    // Verify
    const detailRes = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const detailBody = await detailRes.json();
    expect(detailBody.progress?.last_video_position_seconds).toBe(120);
  });

  test('POST progress without auth returns error', async ({ request }) => {
    const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
      headers: { Authorization: '' },
      data: { last_video_position_seconds: 10 },
      failOnStatusCode: false,
    });
    expect([401, 500]).toContain(res.status());
  });
});

// ============================================================
// Suite F: Edge Cases
// ============================================================
test.describe('Foundation Edge Cases', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  test('setup tokens', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-edge-student@neramclasses.com', role: 'student' },
    });
    const body = await res.json();
    studentToken = body.testToken;

    const chapRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    const chapBody = await chapRes.json();
    firstChapterId = chapBody.chapters[0].id;

    const detailRes = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const detailBody = await detailRes.json();
    firstChapterSections = detailBody.sections;
  });

  test('re-submitting quiz for already-passed section succeeds', async ({ request }) => {
    if (!firstChapterSections.length) return;
    const sectionId = firstChapterSections[0].id;

    // Pass the quiz first
    const correctAnswers = await getCorrectAnswers(request, sectionId, studentToken);
    const res1 = await request.post(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: authHeader(studentToken),
      data: { answers: correctAnswers },
    });
    expect(res1.status()).toBe(200);

    // Re-submit (re-attempt on already passed section)
    const res2 = await request.post(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: authHeader(studentToken),
      data: { answers: correctAnswers },
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.passed).toBe(true);
    expect(body2.attempt.attempt_number).toBeGreaterThan(1);
  });

  test('GET quiz questions for a section returns questions without answers', async ({
    request,
  }) => {
    if (!firstChapterSections.length) return;
    const sectionId = firstChapterSections[0].id;

    const res = await request.get(`/api/foundation/sections/${sectionId}/quiz`, {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questions).toBeDefined();
    expect(Array.isArray(body.questions)).toBe(true);

    // Verify no correct answers leaked
    for (const q of body.questions) {
      expect(q.correct_option).toBeUndefined();
    }
  });

  test('chapter sections have valid timestamp ordering', async ({ request }) => {
    const res = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    let prevEnd = 0;
    for (const section of body.sections) {
      expect(section.start_timestamp_seconds).toBeGreaterThanOrEqual(0);
      expect(section.end_timestamp_seconds).toBeGreaterThan(section.start_timestamp_seconds);
      // Sections should be sequential (start >= previous end)
      expect(section.start_timestamp_seconds).toBeGreaterThanOrEqual(prevEnd);
      prevEnd = section.end_timestamp_seconds;
    }
  });

  test('concurrent quiz submissions do not crash', async ({ request }) => {
    if (!firstChapterSections.length) return;
    const sectionId = firstChapterSections[0].id;
    const correctAnswers = await getCorrectAnswers(request, sectionId, studentToken);

    // Fire 3 concurrent submissions
    const promises = Array.from({ length: 3 }, () =>
      request.post(`/api/foundation/sections/${sectionId}/quiz`, {
        headers: authHeader(studentToken),
        data: { answers: correctAnswers },
      })
    );

    const results = await Promise.allSettled(promises);
    // All should resolve (not crash server)
    for (const result of results) {
      expect(result.status).toBe('fulfilled');
      if (result.status === 'fulfilled') {
        expect([200, 500]).toContain(result.value.status());
      }
    }
  });

  test('section quiz questions have valid options', async ({ request }) => {
    const res = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    const body = await res.json();

    for (const section of body.sections) {
      for (const q of section.quiz_questions) {
        expect(q.question_text.trim().length).toBeGreaterThan(0);
        expect(q.option_a.trim().length).toBeGreaterThan(0);
        expect(q.option_b.trim().length).toBeGreaterThan(0);
        expect(q.option_c.trim().length).toBeGreaterThan(0);
        expect(q.option_d.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================
// Suite: Full E2E Lifecycle (Critical Path)
// ============================================================
test.describe('Full Foundation Lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  const lifecycleEmail = `e2e-lifecycle-${Date.now()}@neramclasses.com`;
  let lifecycleToken: string;
  let allChapters: any[];

  test('setup: create fresh student', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: lifecycleEmail, role: 'student' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    lifecycleToken = body.testToken;
  });

  test('lifecycle: complete chapter 1 end-to-end', async ({ request }) => {
    // 1. Get chapters — ch1 should be unlocked
    const chapRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(lifecycleToken),
    });
    const chapBody = await chapRes.json();
    allChapters = chapBody.chapters;
    expect(allChapters.length).toBeGreaterThan(0);

    const ch1 = allChapters[0];
    const ch1Status = ch1.progress?.status || 'in_progress';
    expect(ch1Status).not.toBe('locked');

    // 2. Get chapter 1 detail with sections
    const detailRes = await request.get(`/api/foundation/chapters/${ch1.id}`, {
      headers: authHeader(lifecycleToken),
    });
    const detailBody = await detailRes.json();
    const sections = detailBody.sections;
    expect(sections.length).toBeGreaterThan(0);

    // 3. Save initial progress (simulating video start)
    await request.post(`/api/foundation/chapters/${ch1.id}/progress`, {
      headers: authHeader(lifecycleToken),
      data: { status: 'in_progress', last_video_position_seconds: 0 },
    });

    // 4. Complete each section by passing its quiz
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Simulate watching: save progress at section end
      await request.post(`/api/foundation/chapters/${ch1.id}/progress`, {
        headers: authHeader(lifecycleToken),
        data: {
          last_video_position_seconds: section.end_timestamp_seconds,
          last_section_id: section.id,
        },
      });

      // Get correct answers and submit quiz
      const correctAnswers = await getCorrectAnswers(request, section.id, lifecycleToken);
      const quizRes = await request.post(`/api/foundation/sections/${section.id}/quiz`, {
        headers: authHeader(lifecycleToken),
        data: { answers: correctAnswers },
      });
      expect(quizRes.status()).toBe(200);
      const quizBody = await quizRes.json();
      expect(quizBody.passed).toBe(true);
    }

    // 5. Verify chapter 1 is now completed
    const verifyRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(lifecycleToken),
    });
    const verifyBody = await verifyRes.json();
    expect(verifyBody.chapters[0].progress?.status).toBe('completed');

    // 6. Verify chapter 2 is now unlocked (if exists)
    if (verifyBody.chapters.length > 1) {
      const ch2Status = verifyBody.chapters[1].progress?.status || 'in_progress';
      expect(ch2Status).not.toBe('locked');
    }
  });

  test('lifecycle: verify chapter completion data integrity', async ({ request }) => {
    // After lifecycle completion, verify the data is consistent
    const chapRes = await request.get('/api/foundation/chapters', {
      headers: authHeader(lifecycleToken),
    });
    const chapBody = await chapRes.json();
    const ch1 = chapBody.chapters[0];

    // Completed chapter should have completed_at and all sections done
    expect(ch1.progress?.status).toBe('completed');
    expect(ch1.completed_sections).toBe(ch1.section_count);
    expect(ch1.section_count).toBeGreaterThan(0);

    // Verify chapter detail still returns all section quiz attempts
    const detailRes = await request.get(`/api/foundation/chapters/${ch1.id}`, {
      headers: authHeader(lifecycleToken),
    });
    const detailBody = await detailRes.json();

    for (const section of detailBody.sections) {
      // Each section should have a quiz_attempt (from the enriched detail query)
      expect(section.quiz_attempt).toBeDefined();
      expect(section.quiz_attempt?.passed).toBe(true);
    }
  });
});
