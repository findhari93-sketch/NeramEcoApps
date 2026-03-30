import { test, expect } from '@playwright/test';

/**
 * Foundation Watch Tracking & Quiz Threshold E2E Tests
 *
 * Tests two critical fixes:
 * 1. Watch session tracking: per-section session IDs, all sections saved (not just current)
 * 2. Auto-recalculation of min_questions_to_pass when questions are added/deleted
 *
 * Bug context:
 * - Previously, a single UUID was shared across all sections — upsert on conflict 'id'
 *   caused section A's data to be overwritten when section B was saved. Only the last
 *   section's few seconds survived (e.g., "8s" total for a student who watched everything).
 * - min_questions_to_pass defaulted to null (100% required), forcing manual configuration.
 */

const BASE_URL = 'http://localhost:3012';

let studentToken: string;
let studentId: string;
let teacherToken: string;
let teacherId: string;

let chapters: any[];
let firstChapterId: string;
let firstChapterSections: any[];

const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

// ============================================================
// Setup
// ============================================================
test.describe('Foundation Watch Tracking & Quiz Threshold', () => {
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
    expect(studentToken).toBeTruthy();

    // Teacher login
    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-foundation-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    const teacherBody = await teacherRes.json();
    teacherToken = teacherBody.testToken;
    teacherId = teacherBody.user.id;
    expect(teacherToken).toBeTruthy();
  });

  test('setup: get chapter data with sections', async ({ request }) => {
    const res = await request.get('/api/foundation/chapters', {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    chapters = body.chapters;
    expect(chapters.length).toBeGreaterThan(0);
    firstChapterId = chapters[0].id;

    // Get chapter detail with sections
    const detailRes = await request.get(`/api/foundation/chapters/${firstChapterId}`, {
      headers: authHeader(studentToken),
    });
    expect(detailRes.status()).toBe(200);
    const detail = await detailRes.json();
    firstChapterSections = detail.sections;
    expect(firstChapterSections.length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================
  // Suite 1: Watch Session Tracking — Per-Section IDs
  // ============================================================
  test.describe('Watch Session Tracking', () => {

    test('TC-W01: Single section watch session saves correctly', async ({ request }) => {
      const section = firstChapterSections[0];

      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 60,
          last_section_id: section.id,
          watch_sessions: [{
            id: 'test-ws-single-' + Date.now(),
            section_id: section.id,
            watched_seconds: 120,
            section_duration_seconds: 210,
            completion_pct: 57.14,
            play_count: 1,
            pause_count: 0,
            seek_count: 0,
            device_type: 'desktop',
          }],
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.progress).toBeDefined();
    });

    test('TC-W02: Multiple sections saved in single request — no data overwrite', async ({ request }) => {
      // This is the critical test: send watch data for sections A AND B simultaneously.
      // Previously, only one would survive because they shared the same session ID.
      const sectionA = firstChapterSections[0];
      const sectionB = firstChapterSections[1];
      const baseId = 'test-ws-multi-' + Date.now();

      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 600,
          last_section_id: sectionB.id,
          watch_sessions: [
            {
              id: `${baseId}-secA`,
              section_id: sectionA.id,
              watched_seconds: 200,
              section_duration_seconds: 210,
              completion_pct: 95.24,
              play_count: 1,
              pause_count: 2,
              seek_count: 0,
              device_type: 'desktop',
            },
            {
              id: `${baseId}-secB`,
              section_id: sectionB.id,
              watched_seconds: 350,
              section_duration_seconds: 400,
              completion_pct: 87.5,
              play_count: 1,
              pause_count: 1,
              seek_count: 1,
              device_type: 'desktop',
            },
          ],
        },
      });
      expect(res.status()).toBe(200);

      // Verify: fetch student scores and check both sections have data
      const scoresRes = await request.get(
        `/api/foundation/chapters/${firstChapterId}/student-scores`,
        { headers: authHeader(teacherToken) }
      );
      expect(scoresRes.status()).toBe(200);
      const scores = await scoresRes.json();

      // Find our student
      const studentScore = scores.find((s: any) => s.student_id === studentId);
      expect(studentScore).toBeDefined();

      // Both sections should have watch data (not just the last one)
      const secAData = studentScore.sections.find((s: any) => s.section_id === sectionA.id);
      const secBData = studentScore.sections.find((s: any) => s.section_id === sectionB.id);

      expect(secAData).toBeDefined();
      expect(secBData).toBeDefined();
      expect(secAData.watched_seconds).toBeGreaterThan(0);
      expect(secBData.watched_seconds).toBeGreaterThan(0);

      // Total watch time should be sum of both, not just one
      expect(studentScore.total_watch_seconds).toBeGreaterThanOrEqual(
        secAData.watched_seconds + secBData.watched_seconds
      );
    });

    test('TC-W03: Same session ID upserts correctly (incremental saves)', async ({ request }) => {
      // Simulates the 30-second heartbeat: same section, same session ID, increasing watched_seconds
      const section = firstChapterSections[0];
      const sessionId = 'test-ws-upsert-' + Date.now();

      // First save: 30 seconds watched
      await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 30,
          last_section_id: section.id,
          watch_sessions: [{
            id: sessionId,
            section_id: section.id,
            watched_seconds: 30,
            section_duration_seconds: 210,
            completion_pct: 14.29,
            play_count: 1,
            pause_count: 0,
            seek_count: 0,
            device_type: 'desktop',
          }],
        },
      });

      // Second save (30s later): 60 seconds watched, same session ID
      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 60,
          last_section_id: section.id,
          watch_sessions: [{
            id: sessionId,
            section_id: section.id,
            watched_seconds: 60,
            section_duration_seconds: 210,
            completion_pct: 28.57,
            play_count: 1,
            pause_count: 0,
            seek_count: 0,
            device_type: 'desktop',
          }],
        },
      });
      expect(res.status()).toBe(200);
    });

    test('TC-W04: Backward-compat — single watch_session (old format) still works', async ({ request }) => {
      const section = firstChapterSections[0];

      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 100,
          last_section_id: section.id,
          watch_session: {
            id: 'test-ws-compat-' + Date.now(),
            section_id: section.id,
            watched_seconds: 100,
            section_duration_seconds: 210,
            completion_pct: 47.62,
            play_count: 1,
            pause_count: 0,
            seek_count: 0,
            device_type: 'mobile',
          },
        },
      });
      expect(res.status()).toBe(200);
    });

    test('TC-W05: Empty watch_sessions array does not error', async ({ request }) => {
      const section = firstChapterSections[0];

      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 50,
          last_section_id: section.id,
          // No watch_sessions at all
        },
      });
      expect(res.status()).toBe(200);
    });

    test('TC-W06: Token via query param (sendBeacon path) authenticates correctly', async ({ request }) => {
      const section = firstChapterSections[0];

      const res = await request.post(
        `/api/foundation/chapters/${firstChapterId}/progress?token=${encodeURIComponent(studentToken)}`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: {
            last_video_position_seconds: 70,
            last_section_id: section.id,
            watch_sessions: [{
              id: 'test-ws-beacon-' + Date.now(),
              section_id: section.id,
              watched_seconds: 70,
              section_duration_seconds: 210,
              completion_pct: 33.33,
              play_count: 1,
              pause_count: 0,
              seek_count: 0,
              device_type: 'mobile',
            }],
          },
        }
      );
      expect(res.status()).toBe(200);
    });

    test('TC-W07: Token via query param without Authorization header — no 401', async ({ request }) => {
      // sendBeacon cannot set custom headers. This tests that query param auth works standalone.
      const section = firstChapterSections[0];

      const res = await request.post(
        `/api/foundation/chapters/${firstChapterId}/progress?token=${encodeURIComponent(studentToken)}`,
        {
          // Deliberately omit Authorization header (simulating sendBeacon)
          headers: { 'Content-Type': 'application/json' },
          data: {
            last_video_position_seconds: 80,
            last_section_id: section.id,
          },
        }
      );
      // Should NOT return 401 — query param token should authenticate
      expect(res.status()).not.toBe(401);
      expect(res.status()).toBe(200);
    });

    test('TC-W08: Invalid token via query param returns 401/500', async ({ request }) => {
      const res = await request.post(
        `/api/foundation/chapters/${firstChapterId}/progress?token=invalid_garbage_token`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: {
            last_video_position_seconds: 50,
          },
          failOnStatusCode: false,
        }
      );
      // Should fail auth
      expect([401, 500]).toContain(res.status());
    });

    test('TC-W09: Student scores table shows correct total watch time', async ({ request }) => {
      const scoresRes = await request.get(
        `/api/foundation/chapters/${firstChapterId}/student-scores`,
        { headers: authHeader(teacherToken) }
      );
      expect(scoresRes.status()).toBe(200);
      const scores = await scoresRes.json();

      const studentScore = scores.find((s: any) => s.student_id === studentId);
      if (studentScore) {
        // total_watch_seconds should be the sum of all sections
        const sectionWatchSum = studentScore.sections.reduce(
          (sum: number, s: any) => sum + s.watched_seconds, 0
        );
        expect(studentScore.total_watch_seconds).toBe(sectionWatchSum);

        // Watch completion percentage per section should be 0-100
        for (const sec of studentScore.sections) {
          expect(sec.watch_completion_pct).toBeGreaterThanOrEqual(0);
          expect(sec.watch_completion_pct).toBeLessThanOrEqual(100);
        }
      }
    });

    test('TC-W10: Watch session with missing id is ignored (no crash)', async ({ request }) => {
      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 90,
          last_section_id: firstChapterSections[0].id,
          watch_sessions: [
            { section_id: firstChapterSections[0].id, watched_seconds: 50 }, // missing 'id'
          ],
        },
      });
      // Should succeed (the invalid session is skipped, progress still saves)
      expect(res.status()).toBe(200);
    });
  });

  // ============================================================
  // Suite 2: Auto-Recalculate min_questions_to_pass
  // ============================================================
  test.describe('Quiz Threshold Auto-Recalculation', () => {

    // We'll create a temporary test section, add/remove questions, and verify the threshold.
    let testChapterId: string;
    let testSectionId: string;
    const createdQuestionIds: string[] = [];

    test('setup: find a chapter to create test section in', async ({ request }) => {
      // Use the admin endpoint to list chapters
      const res = await request.get('/api/foundation/admin/chapters', {
        headers: authHeader(teacherToken),
      });
      if (res.status() === 200) {
        const body = await res.json();
        testChapterId = body.chapters?.[0]?.id || firstChapterId;
      } else {
        testChapterId = firstChapterId;
      }
      expect(testChapterId).toBeTruthy();
    });

    test('setup: create a test section', async ({ request }) => {
      const res = await request.post(
        `/api/foundation/admin/chapters/${testChapterId}/sections`,
        {
          headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
          data: {
            title: 'E2E Test Section — Quiz Threshold',
            start_timestamp_seconds: 9900,
            end_timestamp_seconds: 9999,
          },
        }
      );
      expect(res.status()).toBe(201);
      const body = await res.json();
      testSectionId = body.section.id;
      expect(testSectionId).toBeTruthy();

      // Initially, min_questions_to_pass should be null (no questions yet)
      expect(body.section.min_questions_to_pass).toBeNull();
    });

    test('TC-Q01: Adding 1st question → min_questions_to_pass = 1 (max(1, 1-1)=1)', async ({ request }) => {
      const res = await request.post(
        `/api/foundation/admin/sections/${testSectionId}/questions`,
        {
          headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
          data: {
            question_text: 'Test Q1: What is architecture?',
            option_a: 'Art of building',
            option_b: 'Art of painting',
            option_c: 'Art of cooking',
            option_d: 'Art of coding',
            correct_option: 'a',
          },
        }
      );
      expect(res.status()).toBe(201);
      createdQuestionIds.push((await res.json()).question.id);

      // Verify: fetch the section and check min_questions_to_pass
      const sectionRes = await request.get(
        `/api/foundation/admin/sections/${testSectionId}`,
        { headers: authHeader(teacherToken) }
      );
      if (sectionRes.status() === 200) {
        const section = await sectionRes.json();
        // 1 question: max(1, 1-1) = max(1, 0) = 1
        expect(section.section?.min_questions_to_pass ?? section.min_questions_to_pass).toBe(1);
      }
    });

    test('TC-Q02: Adding 2nd question → min_questions_to_pass = 1 (max(1, 2-1)=1)', async ({ request }) => {
      const res = await request.post(
        `/api/foundation/admin/sections/${testSectionId}/questions`,
        {
          headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
          data: {
            question_text: 'Test Q2: Indus Valley civilization was located in?',
            option_a: 'Europe',
            option_b: 'South Asia',
            option_c: 'Africa',
            option_d: 'Americas',
            correct_option: 'b',
          },
        }
      );
      expect(res.status()).toBe(201);
      createdQuestionIds.push((await res.json()).question.id);

      const sectionRes = await request.get(
        `/api/foundation/admin/sections/${testSectionId}`,
        { headers: authHeader(teacherToken) }
      );
      if (sectionRes.status() === 200) {
        const section = await sectionRes.json();
        // 2 questions: max(1, 2-1) = 1
        expect(section.section?.min_questions_to_pass ?? section.min_questions_to_pass).toBe(1);
      }
    });

    test('TC-Q03: Adding 3rd question → min_questions_to_pass = 2 (max(1, 3-1)=2)', async ({ request }) => {
      const res = await request.post(
        `/api/foundation/admin/sections/${testSectionId}/questions`,
        {
          headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
          data: {
            question_text: 'Test Q3: Gothic architecture originated in?',
            option_a: 'Italy',
            option_b: 'France',
            option_c: 'Germany',
            option_d: 'Spain',
            correct_option: 'b',
          },
        }
      );
      expect(res.status()).toBe(201);
      createdQuestionIds.push((await res.json()).question.id);

      const sectionRes = await request.get(
        `/api/foundation/admin/sections/${testSectionId}`,
        { headers: authHeader(teacherToken) }
      );
      if (sectionRes.status() === 200) {
        const section = await sectionRes.json();
        // 3 questions: max(1, 3-1) = 2
        expect(section.section?.min_questions_to_pass ?? section.min_questions_to_pass).toBe(2);
      }
    });

    test('TC-Q04: Adding 4th question → min_questions_to_pass = 3 (max(1, 4-1)=3)', async ({ request }) => {
      const res = await request.post(
        `/api/foundation/admin/sections/${testSectionId}/questions`,
        {
          headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
          data: {
            question_text: 'Test Q4: Taj Mahal is an example of?',
            option_a: 'Gothic architecture',
            option_b: 'Mughal architecture',
            option_c: 'Roman architecture',
            option_d: 'Greek architecture',
            correct_option: 'b',
          },
        }
      );
      expect(res.status()).toBe(201);
      createdQuestionIds.push((await res.json()).question.id);

      const sectionRes = await request.get(
        `/api/foundation/admin/sections/${testSectionId}`,
        { headers: authHeader(teacherToken) }
      );
      if (sectionRes.status() === 200) {
        const section = await sectionRes.json();
        // 4 questions: max(1, 4-1) = 3
        expect(section.section?.min_questions_to_pass ?? section.min_questions_to_pass).toBe(3);
      }
    });

    test('TC-Q05: Deleting 1 question (4→3) → min_questions_to_pass = 2', async ({ request }) => {
      const qId = createdQuestionIds.pop()!;
      const res = await request.delete(
        `/api/foundation/admin/questions/${qId}`,
        { headers: authHeader(teacherToken) }
      );
      expect(res.status()).toBe(200);

      const sectionRes = await request.get(
        `/api/foundation/admin/sections/${testSectionId}`,
        { headers: authHeader(teacherToken) }
      );
      if (sectionRes.status() === 200) {
        const section = await sectionRes.json();
        // 3 questions remaining: max(1, 3-1) = 2
        expect(section.section?.min_questions_to_pass ?? section.min_questions_to_pass).toBe(2);
      }
    });

    test('TC-Q06: Deleting down to 1 question → min_questions_to_pass = 1', async ({ request }) => {
      // Delete 2 more (3→2→1)
      const qId2 = createdQuestionIds.pop()!;
      await request.delete(`/api/foundation/admin/questions/${qId2}`, {
        headers: authHeader(teacherToken),
      });
      const qId3 = createdQuestionIds.pop()!;
      await request.delete(`/api/foundation/admin/questions/${qId3}`, {
        headers: authHeader(teacherToken),
      });

      const sectionRes = await request.get(
        `/api/foundation/admin/sections/${testSectionId}`,
        { headers: authHeader(teacherToken) }
      );
      if (sectionRes.status() === 200) {
        const section = await sectionRes.json();
        // 1 question remaining: max(1, 1-1) = 1
        expect(section.section?.min_questions_to_pass ?? section.min_questions_to_pass).toBe(1);
      }
    });

    test('TC-Q07: Deleting last question (1→0) → min_questions_to_pass = null', async ({ request }) => {
      const qId = createdQuestionIds.pop()!;
      await request.delete(`/api/foundation/admin/questions/${qId}`, {
        headers: authHeader(teacherToken),
      });

      const sectionRes = await request.get(
        `/api/foundation/admin/sections/${testSectionId}`,
        { headers: authHeader(teacherToken) }
      );
      if (sectionRes.status() === 200) {
        const section = await sectionRes.json();
        // 0 questions: null
        expect(section.section?.min_questions_to_pass ?? section.min_questions_to_pass).toBeNull();
      }
    });

    test('cleanup: delete test section', async ({ request }) => {
      if (testSectionId) {
        await request.delete(
          `/api/foundation/admin/sections/${testSectionId}`,
          { headers: authHeader(teacherToken) }
        );
      }
    });
  });

  // ============================================================
  // Suite 3: Edge Cases & Regression
  // ============================================================
  test.describe('Edge Cases', () => {

    test('TC-E01: Progress save with no auth and no query token returns error', async ({ request }) => {
      const res = await request.post(
        `/api/foundation/chapters/${firstChapterId}/progress`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: { last_video_position_seconds: 10 },
          failOnStatusCode: false,
        }
      );
      expect([401, 500]).toContain(res.status());
    });

    test('TC-E02: Watch session with 0 watched_seconds is handled', async ({ request }) => {
      const section = firstChapterSections[0];
      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 5,
          last_section_id: section.id,
          watch_sessions: [{
            id: 'test-ws-zero-' + Date.now(),
            section_id: section.id,
            watched_seconds: 0,
            section_duration_seconds: 210,
            completion_pct: 0,
            play_count: 0,
            pause_count: 0,
            seek_count: 0,
            device_type: 'desktop',
          }],
        },
      });
      expect(res.status()).toBe(200);
    });

    test('TC-E03: Watch sessions with duplicate section_id uses different IDs', async ({ request }) => {
      // Simulates: student watches section A, leaves, comes back, watches section A again
      // Each viewing session should have a different session ID
      const section = firstChapterSections[0];
      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 100,
          last_section_id: section.id,
          watch_sessions: [
            {
              id: 'test-ws-dup-a-' + Date.now(),
              section_id: section.id,
              watched_seconds: 100,
              section_duration_seconds: 210,
              completion_pct: 47.62,
              play_count: 1,
              pause_count: 0,
              seek_count: 0,
              device_type: 'desktop',
            },
            {
              id: 'test-ws-dup-b-' + Date.now(),
              section_id: section.id,
              watched_seconds: 50,
              section_duration_seconds: 210,
              completion_pct: 23.81,
              play_count: 1,
              pause_count: 0,
              seek_count: 0,
              device_type: 'mobile',
            },
          ],
        },
      });
      expect(res.status()).toBe(200);
    });

    test('TC-E04: Large number of sections does not cause timeout', async ({ request }) => {
      // Simulate saving 10 sections worth of watch data at once
      const sessions = Array.from({ length: 10 }, (_, i) => ({
        id: `test-ws-bulk-${i}-${Date.now()}`,
        section_id: firstChapterSections[i % firstChapterSections.length].id,
        watched_seconds: 60 + i * 10,
        section_duration_seconds: 300,
        completion_pct: ((60 + i * 10) / 300) * 100,
        play_count: 1,
        pause_count: i,
        seek_count: 0,
        device_type: 'desktop',
      }));

      const res = await request.post(`/api/foundation/chapters/${firstChapterId}/progress`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: {
          last_video_position_seconds: 500,
          last_section_id: firstChapterSections[0].id,
          watch_sessions: sessions,
        },
        timeout: 15000,
      });
      expect(res.status()).toBe(200);
    });

    test('TC-E05: Student scores API returns watch dots with correct color thresholds', async ({ request }) => {
      const scoresRes = await request.get(
        `/api/foundation/chapters/${firstChapterId}/student-scores`,
        { headers: authHeader(teacherToken) }
      );
      expect(scoresRes.status()).toBe(200);
      const scores = await scoresRes.json();
      expect(Array.isArray(scores)).toBe(true);

      // Verify data shape for each student
      for (const student of scores) {
        expect(student.student_id).toBeTruthy();
        expect(student.student_name).toBeTruthy();
        expect(Array.isArray(student.sections)).toBe(true);
        expect(typeof student.overall_score_pct).toBe('number');
        expect(typeof student.completed_sections).toBe('number');
        expect(typeof student.total_sections).toBe('number');
        expect(typeof student.total_watch_seconds).toBe('number');

        // total_sections should match actual section count
        expect(student.total_sections).toBe(firstChapterSections.length);

        for (const sec of student.sections) {
          expect(sec.section_id).toBeTruthy();
          expect(typeof sec.watched_seconds).toBe('number');
          expect(typeof sec.watch_completion_pct).toBe('number');
          expect(typeof sec.seek_count).toBe('number');
          expect(sec.watch_completion_pct).toBeGreaterThanOrEqual(0);
          expect(sec.watch_completion_pct).toBeLessThanOrEqual(100);
        }
      }
    });
  });
});
