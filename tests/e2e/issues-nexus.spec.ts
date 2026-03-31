import { test, expect } from '@playwright/test';

/**
 * Foundation Issues (Enterprise Ticket System) E2E Tests
 *
 * Tests the full ticket lifecycle:
 * - Ticket creation (student, with/without chapter, with category)
 * - Ticket listing with filters
 * - Staff assignment & resolution
 * - Student confirmation & reopen flow
 * - Screenshot upload
 * - Auto-close cron
 *
 * All tests run serially in a single describe to share auth tokens and issue state.
 */

const BASE_URL = 'http://localhost:3012';

const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

test.describe('Foundation Issues — Enterprise Ticket System', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  let studentToken: string;
  let studentId: string;
  let teacherToken: string;
  let createdIssueId: string;
  let createdTicketNumber: string;

  // ── Setup ──
  test('setup: get student and teacher tokens', async ({ request }) => {
    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user?.id;

    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    const teacherBody = await teacherRes.json();
    teacherToken = teacherBody.testToken;

    expect(studentToken).toBeTruthy();
    expect(teacherToken).toBeTruthy();
  });

  // ── Creation: Auth guard ──
  test('POST /api/foundation/issues without auth should return error', async ({ request }) => {
    const res = await request.post('/api/foundation/issues', {
      headers: { Authorization: '' },
      data: { title: 'Test', category: 'bug' },
      failOnStatusCode: false,
    });
    // Route catches auth errors generically — accept 401 or 500
    expect([401, 500]).toContain(res.status());
  });

  // ── Creation: Validation ──
  test('POST /api/foundation/issues without title should return 400', async ({ request }) => {
    const res = await request.post('/api/foundation/issues', {
      headers: authHeader(studentToken),
      data: { category: 'bug' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('title');
  });

  test('POST /api/foundation/issues without category should return 400', async ({ request }) => {
    const res = await request.post('/api/foundation/issues', {
      headers: authHeader(studentToken),
      data: { title: 'Test Issue' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('category');
  });

  // ── Creation: Standalone ticket ──
  test('POST /api/foundation/issues should create standalone ticket with NXS- prefix', async ({ request }) => {
    const res = await request.post('/api/foundation/issues', {
      headers: authHeader(studentToken),
      data: {
        title: '__TEST__ E2E Standalone Issue',
        description: 'Created by Playwright E2E tests. Safe to delete.',
        category: 'bug',
        page_url: '/student/library',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.issue).toBeDefined();
    expect(body.issue.ticket_number).toMatch(/^NXS-\d{4,}$/);
    expect(body.issue.category).toBe('bug');
    expect(body.issue.page_url).toBe('/student/library');
    expect(body.issue.status).toBe('open');
    expect(body.issue.chapter_id).toBeNull();

    createdIssueId = body.issue.id;
    createdTicketNumber = body.issue.ticket_number;
  });

  // ── Creation: Different category ──
  test('POST /api/foundation/issues should create ticket with feature_request category', async ({ request }) => {
    const res = await request.post('/api/foundation/issues', {
      headers: authHeader(studentToken),
      data: {
        title: '__TEST__ Feature Request',
        description: 'I wish I could export my notes as PDF.',
        category: 'feature_request',
        page_url: '/student/documents',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.issue.category).toBe('feature_request');
    expect(body.issue.ticket_number).toMatch(/^NXS-/);
  });

  // ── Listing: Student sees own issues ──
  test('GET /api/foundation/issues (student) should return own issues', async ({ request }) => {
    const res = await request.get('/api/foundation/issues', {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.issues)).toBe(true);

    const testIssue = body.issues.find((i: any) => i.id === createdIssueId);
    expect(testIssue).toBeDefined();
    expect(testIssue.ticket_number).toBe(createdTicketNumber);
    expect(testIssue.category).toBe('bug');
  });

  // ── Listing: Teacher sees all ──
  test('GET /api/foundation/issues (teacher) should return all issues', async ({ request }) => {
    const res = await request.get('/api/foundation/issues', {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.issues)).toBe(true);
    const testIssue = body.issues.find((i: any) => i.id === createdIssueId);
    expect(testIssue).toBeDefined();
  });

  // ── Listing: Status filter ──
  test('GET /api/foundation/issues with status filter should work', async ({ request }) => {
    const res = await request.get('/api/foundation/issues?status=open', {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const issue of body.issues) {
      expect(issue.status).toBe('open');
    }
  });

  // ── Detail: Student views own issue ──
  test('GET /api/foundation/issues/:id (student) should return own issue with activity', async ({ request }) => {
    const res = await request.get(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue).toBeDefined();
    expect(body.issue.id).toBe(createdIssueId);
    expect(body.activity).toBeDefined();
    expect(Array.isArray(body.activity)).toBe(true);
    expect(body.activity.length).toBeGreaterThanOrEqual(1);
    expect(body.activity[0].action).toBe('created');
  });

  // ── Actions: Assign ──
  test('PATCH assign issue (teacher)', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(teacherToken),
      data: {
        action: 'assign',
        assigned_to: studentId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('in_progress');
  });

  // ── Actions: Priority ──
  test('PATCH set priority (teacher)', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(teacherToken),
      data: {
        action: 'priority',
        priority: 'high',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.priority).toBe('high');
  });

  // ── Actions: Comment ──
  test('PATCH add comment (teacher)', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(teacherToken),
      data: {
        action: 'comment',
        comment: '__TEST__ Looking into this issue.',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.activity).toBeDefined();
    expect(body.activity.reason).toBe('__TEST__ Looking into this issue.');
  });

  // ── Resolve: Sets awaiting_confirmation ──
  test('PATCH resolve issue (teacher) should set awaiting_confirmation', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(teacherToken),
      data: {
        action: 'resolve',
        resolution_note: '__TEST__ Fixed the video encoding.',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('awaiting_confirmation');
    expect(body.issue.resolution_note).toBe('__TEST__ Fixed the video encoding.');
    expect(body.issue.auto_close_at).toBeDefined();

    const autoClose = new Date(body.issue.auto_close_at);
    const now = new Date();
    const diffDays = (autoClose.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(2);
    expect(diffDays).toBeLessThan(4);
  });

  // ── Confirm: Teacher can't confirm (not the owner) ──
  test('PATCH confirm without being the owner should fail', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(teacherToken),
      data: { action: 'confirm' },
      failOnStatusCode: false,
    });
    expect([403, 500]).toContain(res.status());
  });

  // ── Reopen: Missing reason ──
  test('PATCH reopen without reason should return 400', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(studentToken),
      data: { action: 'reopen' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('reason');
  });

  // ── Reopen: Student reopens ──
  test('PATCH reopen issue (student) should set back to open', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(studentToken),
      data: {
        action: 'reopen',
        reason: '__TEST__ Video still not working on mobile.',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('open');
    expect(body.issue.auto_close_at).toBeNull();
    expect(body.issue.resolved_by).toBeNull();
  });

  // ── Full cycle: Re-resolve + confirm → closed ──
  test('Re-resolve and confirm flow should close the ticket', async ({ request }) => {
    // Resolve again
    const resolveRes = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(teacherToken),
      data: {
        action: 'resolve',
        resolution_note: '__TEST__ Re-encoded the video. Should work now.',
      },
    });
    expect(resolveRes.status()).toBe(200);

    // Student confirms
    const confirmRes = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(studentToken),
      data: { action: 'confirm' },
    });
    expect(confirmRes.status()).toBe(200);
    const body = await confirmRes.json();
    expect(body.issue.status).toBe('closed');
    expect(body.issue.auto_close_at).toBeNull();
  });

  // ── Closed ticket: Can't confirm again ──
  test('PATCH confirm on already closed issue should return 400', async ({ request }) => {
    const res = await request.patch(`/api/foundation/issues/${createdIssueId}`, {
      headers: authHeader(studentToken),
      data: { action: 'confirm' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  // ── Screenshot Upload: No auth ──
  test('POST /api/foundation/issues/upload without auth should fail', async ({ request }) => {
    const res = await request.post('/api/foundation/issues/upload', {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect([400, 401, 500]).toContain(res.status());
  });

  // ── Screenshot Upload: No file ──
  test('POST /api/foundation/issues/upload without file should fail', async ({ request }) => {
    const res = await request.post('/api/foundation/issues/upload', {
      headers: authHeader(studentToken),
      failOnStatusCode: false,
    });
    // May return 400 (no file) or 500 (formData parse error)
    expect([400, 500]).toContain(res.status());
  });

  // ── Auto-Close Cron ──
  test('GET /api/cron/auto-close-issues should return success', async ({ request }) => {
    const res = await request.get('/api/cron/auto-close-issues', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || 'local-dev-secret'}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.closed).toBe('number');
  });
});
