import { test, expect } from '@playwright/test';

/**
 * Drawing Review AI Workflow Tests
 *
 * Tests the AI-first review redesign:
 * - Teacher reviewed tab shows redo submissions (Bug 3 fix)
 * - Review queue sub-filter (reviewed_only, redo)
 * - PATCH review saves new fields (corrected_image_url, ai_overlay_annotations)
 * - Student sees full feedback when status=redo (Bug 2 fix)
 * - AI draft status field is present on new submissions
 *
 * Run: pnpm test:e2e tests/e2e/drawing-review-ai-workflow.spec.ts --project=nexus-chrome
 */

const BASE = process.env.NEXUS_URL || 'http://localhost:3012';

let teacherToken: string;
let studentToken: string;
let testSubmissionId: string;
let testQuestionId: string;

test.describe('Drawing Review AI Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  // ============================================================
  // Setup
  // ============================================================
  test('setup: authenticate as teacher and student', async ({ request }) => {
    test.setTimeout(60000);

    const teacherRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.ok()).toBeTruthy();
    const teacherData = await teacherRes.json();
    teacherToken = teacherData.testToken;
    expect(teacherToken).toBeTruthy();

    const studentRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.ok()).toBeTruthy();
    const studentData = await studentRes.json();
    studentToken = studentData.testToken;
    expect(studentToken).toBeTruthy();
  });

  test('setup: get a drawing question to submit against', async ({ request }) => {
    const res = await request.get(`${BASE}/api/drawing/questions?limit=1`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questions.length).toBeGreaterThan(0);
    testQuestionId = body.questions[0].id;
  });

  // ============================================================
  // Student Submission + AI Draft Status
  // ============================================================
  test.describe('Student Submission', () => {
    test('creates submission and sets ai_draft_status to pending or generating', async ({ request }) => {
      const res = await request.post(`${BASE}/api/drawing/submissions`, {
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          question_id: testQuestionId,
          source_type: 'question_bank',
          original_image_url: 'https://placehold.co/400x300/png',
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      testSubmissionId = body.submission.id;
      expect(testSubmissionId).toBeTruthy();

      // ai_draft_status should be set (pending/generating/ready — not null)
      expect(['pending', 'generating', 'ready', 'failed']).toContain(
        body.submission.ai_draft_status
      );
    });

    test('submission appears in teacher pending queue', async ({ request }) => {
      const res = await request.get(
        `${BASE}/api/drawing/submissions/review-queue?status=submitted`,
        { headers: { Authorization: `Bearer ${teacherToken}` } }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const found = body.submissions.find((s: { id: string }) => s.id === testSubmissionId);
      expect(found).toBeDefined();
    });
  });

  // ============================================================
  // Teacher Review with New Fields
  // ============================================================
  test.describe('Teacher Review — new fields', () => {
    test('PATCH review accepts corrected_image_url and ai_overlay_annotations', async ({ request }) => {
      const annotations = [
        { area: 'top-left', label: 'Proportion off', severity: 'high' },
        { area: 'center', label: 'Good composition', severity: 'low' },
      ];

      const res = await request.patch(
        `${BASE}/api/drawing/submissions/${testSubmissionId}/review`,
        {
          headers: {
            Authorization: `Bearer ${teacherToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            tutor_feedback: 'Work on proportion of the top elements.',
            corrected_image_url: 'https://placehold.co/400x300/png',
            ai_overlay_annotations: annotations,
            action: 'redo',
          },
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.submission.status).toBe('redo');
    });

    test('reviewed submission with status=redo is returned by corrected_image_url', async ({ request }) => {
      const res = await request.get(
        `${BASE}/api/drawing/submissions/${testSubmissionId}`,
        { headers: { Authorization: `Bearer ${teacherToken}` } }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const s = body.submission;
      expect(s.corrected_image_url).toBeTruthy();
      expect(Array.isArray(s.ai_overlay_annotations)).toBe(true);
      expect(s.ai_overlay_annotations.length).toBe(2);
      expect(s.ai_overlay_annotations[0].area).toBe('top-left');
      expect(s.ai_overlay_annotations[0].severity).toBe('high');
    });
  });

  // ============================================================
  // Bug 3 Fix: Teacher Reviewed Tab Includes Redo Submissions
  // ============================================================
  test.describe('Teacher reviewed tab — includes redo submissions', () => {
    test('status=reviewed returns submissions with status redo', async ({ request }) => {
      const res = await request.get(
        `${BASE}/api/drawing/submissions/review-queue?status=reviewed`,
        { headers: { Authorization: `Bearer ${teacherToken}` } }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const testSub = body.submissions.find((s: { id: string }) => s.id === testSubmissionId);
      expect(testSub).toBeDefined();
      expect(testSub.status).toBe('redo');
    });

    test('status=redo sub-filter returns only redo submissions', async ({ request }) => {
      const res = await request.get(
        `${BASE}/api/drawing/submissions/review-queue?status=redo`,
        { headers: { Authorization: `Bearer ${teacherToken}` } }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      for (const s of body.submissions) {
        expect(s.status).toBe('redo');
      }
    });

    test('status=reviewed_only sub-filter excludes redo submissions', async ({ request }) => {
      const res = await request.get(
        `${BASE}/api/drawing/submissions/review-queue?status=reviewed_only`,
        { headers: { Authorization: `Bearer ${teacherToken}` } }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      for (const s of body.submissions) {
        expect(s.status).toBe('reviewed');
      }
    });
  });

  // ============================================================
  // Bug 2 Fix: Student sees full feedback on redo status
  // ============================================================
  test.describe('Student redo view — full feedback visible', () => {
    test('student can fetch submission with status=redo and sees feedback fields', async ({ request }) => {
      const res = await request.get(
        `${BASE}/api/drawing/submissions/${testSubmissionId}`,
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const s = body.submission;

      // Status is redo
      expect(s.status).toBe('redo');

      // Full feedback fields are present (not null/empty)
      expect(s.tutor_feedback).toBeTruthy();
      expect(s.corrected_image_url).toBeTruthy();
      expect(Array.isArray(s.ai_overlay_annotations)).toBe(true);
    });
  });

  // ============================================================
  // Role-based Access: student cannot call teacher review endpoint
  // ============================================================
  test.describe('Role-based access', () => {
    test('student cannot access teacher review queue', async ({ request }) => {
      const res = await request.get(
        `${BASE}/api/drawing/submissions/review-queue?status=submitted`,
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(res.status()).toBe(403);
    });

    test('student cannot PATCH review endpoint', async ({ request }) => {
      const res = await request.patch(
        `${BASE}/api/drawing/submissions/${testSubmissionId}/review`,
        {
          headers: {
            Authorization: `Bearer ${studentToken}`,
            'Content-Type': 'application/json',
          },
          data: { action: 'complete' },
        }
      );
      expect(res.status()).toBe(403);
    });
  });

  // ============================================================
  // Review without rating (rating now optional)
  // ============================================================
  test.describe('Optional rating', () => {
    test('teacher can mark complete without a rating', async ({ request }) => {
      // First submit a new drawing for this test
      const submitRes = await request.post(`${BASE}/api/drawing/submissions`, {
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          question_id: testQuestionId,
          source_type: 'question_bank',
          original_image_url: 'https://placehold.co/400x300/png',
        },
      });
      const { submission } = await submitRes.json();

      const res = await request.patch(
        `${BASE}/api/drawing/submissions/${submission.id}/review`,
        {
          headers: {
            Authorization: `Bearer ${teacherToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            // No tutor_rating — should not fail
            tutor_feedback: 'Looks good!',
            action: 'complete',
          },
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.submission.status).toBe('completed');
      expect(body.submission.tutor_rating).toBeNull();
    });
  });
});
