import { test, expect } from '@playwright/test';

/**
 * Support Tickets E2E Tests
 *
 * Tests the support ticket system: creating tickets via marketing API,
 * listing/managing via admin API, adding comments, updating status.
 *
 * Flow: Ticket created (marketing) → Admin lists → Admin adds comment → Admin resolves
 */

test.describe('Support Tickets API - Full Lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3013' });

  let createdTicketId: string;
  let createdTicketNumber: string;

  // ---- Create ticket via Marketing API ----
  test('POST marketing /api/support-tickets should create a ticket', async ({ request }) => {
    const response = await request.post('http://localhost:3010/api/support-tickets', {
      data: {
        userName: 'E2E Test User',
        userEmail: 'e2e-test@example.com',
        userPhone: '9876500001',
        category: 'enrollment_issue',
        subject: 'E2E Test Ticket - Enrollment Problem',
        description: 'This is a test ticket created by Playwright E2E tests. Safe to delete.',
        pageUrl: 'http://localhost:3010/en/enroll?token=test',
        sourceApp: 'marketing',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.ticketNumber).toBeDefined();
    expect(body.ticketId).toBeDefined();

    createdTicketId = body.ticketId;
    createdTicketNumber = body.ticketNumber;
  });

  test('POST marketing /api/support-tickets should reject missing fields', async ({ request }) => {
    const response = await request.post('http://localhost:3010/api/support-tickets', {
      data: { userName: 'Missing fields' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  // ---- List tickets via Admin API ----
  test('GET /api/support-tickets should return tickets with pagination', async ({ request }) => {
    const response = await request.get('/api/support-tickets');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBeDefined();
    expect(body.pagination.total).toBeDefined();
  });

  test('GET /api/support-tickets?stats=true should include stats', async ({ request }) => {
    const response = await request.get('/api/support-tickets?stats=true');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
  });

  test('GET /api/support-tickets should support status filter', async ({ request }) => {
    const response = await request.get('/api/support-tickets?status=open');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data.length > 0) {
      for (const ticket of body.data) {
        expect(ticket.status).toBe('open');
      }
    }
  });

  test('GET /api/support-tickets should support category filter', async ({ request }) => {
    const response = await request.get('/api/support-tickets?category=enrollment_issue');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data.length > 0) {
      for (const ticket of body.data) {
        expect(ticket.category).toBe('enrollment_issue');
      }
    }
  });

  // ---- Get ticket detail ----
  test('GET /api/support-tickets/:id should return ticket with comments', async ({ request }) => {
    if (!createdTicketId) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/support-tickets/${createdTicketId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(createdTicketId);
    expect(body.data.ticket_number).toBe(createdTicketNumber);
    expect(body.data.user_name).toBe('E2E Test User');
    expect(body.data.category).toBe('enrollment_issue');
    expect(body.data.comments).toBeDefined();
    expect(Array.isArray(body.data.comments)).toBe(true);
  });

  test('GET /api/support-tickets/:id should return 404 for non-existent ticket', async ({ request }) => {
    const response = await request.get(
      '/api/support-tickets/00000000-0000-0000-0000-000000000000',
      { failOnStatusCode: false }
    );
    expect(response.status()).toBe(404);
  });

  // ---- Add comment ----
  test('POST /api/support-tickets/:id/comments should add admin comment', async ({ request }) => {
    if (!createdTicketId) {
      test.skip();
      return;
    }

    const response = await request.post(`/api/support-tickets/${createdTicketId}/comments`, {
      data: {
        content: 'This is an admin reply from E2E test.',
        adminName: 'E2E Admin',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.content).toBe('This is an admin reply from E2E test.');
    expect(body.data.is_admin).toBe(true);
  });

  test('POST /api/support-tickets/:id/comments should reject missing fields', async ({ request }) => {
    if (!createdTicketId) {
      test.skip();
      return;
    }

    const response = await request.post(`/api/support-tickets/${createdTicketId}/comments`, {
      data: { content: 'Missing admin name' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('content, adminName');
  });

  // ---- Verify comment appears ----
  test('GET /api/support-tickets/:id should show the added comment', async ({ request }) => {
    if (!createdTicketId) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/support-tickets/${createdTicketId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.comments.length).toBeGreaterThanOrEqual(1);

    const adminComment = body.data.comments.find(
      (c: any) => c.content === 'This is an admin reply from E2E test.'
    );
    expect(adminComment).toBeDefined();
    expect(adminComment.is_admin).toBe(true);
  });

  // ---- Update status ----
  test('PATCH /api/support-tickets/:id should update to in_progress', async ({ request }) => {
    if (!createdTicketId) {
      test.skip();
      return;
    }

    const response = await request.patch(`/api/support-tickets/${createdTicketId}`, {
      data: { status: 'in_progress' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('in_progress');
  });

  test('PATCH /api/support-tickets/:id should resolve with notes', async ({ request }) => {
    if (!createdTicketId) {
      test.skip();
      return;
    }

    const response = await request.patch(`/api/support-tickets/${createdTicketId}`, {
      data: {
        status: 'resolved',
        resolution_notes: 'Resolved by E2E test - test passed successfully.',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('resolved');
    expect(body.data.resolution_notes).toBe('Resolved by E2E test - test passed successfully.');
  });

  test('PATCH /api/support-tickets/:id should return 404 for non-existent ticket', async ({ request }) => {
    const response = await request.patch(
      '/api/support-tickets/00000000-0000-0000-0000-000000000000',
      {
        data: { status: 'closed' },
        failOnStatusCode: false,
      }
    );
    expect(response.status()).toBe(404);
  });

  // ---- Quick status update from list route ----
  test('PATCH /api/support-tickets (list route) should update status', async ({ request }) => {
    if (!createdTicketId) {
      test.skip();
      return;
    }

    const response = await request.patch('/api/support-tickets', {
      data: {
        id: createdTicketId,
        status: 'closed',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('closed');
  });

  test('PATCH /api/support-tickets (list route) should reject missing id', async ({ request }) => {
    const response = await request.patch('/api/support-tickets', {
      data: { status: 'closed' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Support Tickets - Admin Page Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('support-tickets page should load without 500 error', async ({ page }) => {
    await page.goto('/support-tickets', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
  });

  test('support-tickets page should not have fatal page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/support-tickets', { waitUntil: 'domcontentloaded', timeout: 15000 });

    for (const err of errors) {
      expect(err).not.toContain('worker');
      expect(err).not.toContain('child process');
    }
  });
});
