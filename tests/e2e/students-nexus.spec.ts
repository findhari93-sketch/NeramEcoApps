import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;

test.describe('Nexus Students API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-students@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
    expect(testToken).toBeDefined();
    expect(classroomId).toBeDefined();
  });

  test('GET /api/students without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/students', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/students without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/students?classroom=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/students with classroom should return students array', async ({ request }) => {
    const res = await request.get(`/api/students?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.students).toBeDefined();
    expect(Array.isArray(body.students)).toBe(true);
  });

  test('GET /api/students should include attendance and checklist stats', async ({ request }) => {
    const res = await request.get(`/api/students?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    if (body.students.length > 0) {
      const student = body.students[0];
      expect(student.id).toBeDefined();
      expect(student.name).toBeDefined();
      expect(student.attendance).toBeDefined();
      expect(typeof student.attendance.attended).toBe('number');
      expect(typeof student.attendance.total).toBe('number');
      expect(student.checklist).toBeDefined();
      expect(typeof student.checklist.completed).toBe('number');
      expect(typeof student.checklist.total).toBe('number');
    }
  });

  test('GET /api/students should support search parameter', async ({ request }) => {
    const res = await request.get(`/api/students?classroom=${classroomId}&search=nonexistent`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.students).toBeDefined();
    expect(Array.isArray(body.students)).toBe(true);
  });
});
