import { test, expect } from '@playwright/test';

/**
 * Nexus Student Onboarding E2E Tests
 *
 * Tests the per-student onboarding system including:
 * - Onboarding API (start, update_step, submit) — no classroom_id required
 * - Review API (approve, reject) — no classroom_id required
 * - Nudge API — no classroom_id required
 * - Auth /api/auth/me — returns onboardingStatus + profileComplete
 * - Profile completion gate — students with missing fields get redirected
 * - One onboarding per student (not per classroom)
 */

test.describe('Nexus Onboarding API', () => {
  test.use({ baseURL: 'http://localhost:3012' });
  test.describe.configure({ mode: 'serial' });

  let studentToken: string;
  let studentId: string;
  let teacherToken: string;
  let teacherId: string;

  // =========================================
  // Setup: Create test student and teacher
  // =========================================

  test('setup: create test student', async ({ request }) => {
    const email = `e2e-onboard-student-${Date.now()}@neramclasses.com`;
    const res = await request.post('/api/auth/test-login', {
      data: { email, role: 'student' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    studentToken = body.testToken;
    studentId = body.user.id;
    expect(studentToken).toMatch(/^test_/);
    expect(body.nexusRole).toBe('student');
    expect(body.classrooms.length).toBeGreaterThanOrEqual(1);
  });

  test('setup: create test teacher', async ({ request }) => {
    const email = `e2e-onboard-teacher-${Date.now()}@neramclasses.com`;
    const res = await request.post('/api/auth/test-login', {
      data: { email, role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    teacherToken = body.testToken;
    teacherId = body.user.id;
    expect(body.nexusRole).toBe('teacher');
  });

  // =========================================
  // Test 1: /api/auth/me returns new fields
  // =========================================

  test('GET /api/auth/me returns onboardingStatus and profileComplete', async ({ request }) => {
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.user).toBeDefined();
    expect(body.nexusRole).toBe('student');
    expect(body).toHaveProperty('onboardingStatus');
    expect(body).toHaveProperty('profileComplete');
    // New student should have null onboardingStatus (no record yet)
    expect(body.onboardingStatus).toBeNull();
    // profileComplete should be true when no onboarding (gate only applies to approved students)
    expect(body.profileComplete).toBe(true);
  });

  // =========================================
  // Test 2: Onboarding GET — no classroom param
  // =========================================

  test('GET /api/onboarding without classroom param should work', async ({ request }) => {
    const res = await request.get('/api/onboarding', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // No onboarding record exists yet
    expect(body.onboarding).toBeNull();
    expect(body.requiredTemplates).toBeDefined();
    expect(Array.isArray(body.requiredTemplates)).toBe(true);
    expect(body.uploadedDocs).toBeDefined();
    expect(Array.isArray(body.uploadedDocs)).toBe(true);
  });

  // =========================================
  // Test 3: Start onboarding — no classroom_id
  // =========================================

  test('POST /api/onboarding action=start without classroom_id', async ({ request }) => {
    const res = await request.post('/api/onboarding', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'start' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboarding).toBeDefined();
    expect(body.onboarding.student_id).toBe(studentId);
    expect(body.onboarding.current_step).toBe('welcome');
    expect(body.onboarding.status).toBe('in_progress');
  });

  // =========================================
  // Test 4: Onboarding is per-student (unique)
  // =========================================

  test('POST /api/onboarding action=start again returns same record', async ({ request }) => {
    const res = await request.post('/api/onboarding', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'start' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Should return existing record, not create duplicate
    expect(body.onboarding.student_id).toBe(studentId);
    expect(body.onboarding.current_step).toBe('welcome');
  });

  // =========================================
  // Test 5: Update step — no classroom_id
  // =========================================

  test('POST /api/onboarding action=update_step to documents', async ({ request }) => {
    const res = await request.post('/api/onboarding', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'update_step', step: 'documents' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboarding.current_step).toBe('documents');
    expect(body.onboarding.status).toBe('in_progress');
  });

  test('POST /api/onboarding action=update_step to student_info with data', async ({ request }) => {
    const res = await request.post('/api/onboarding', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        action: 'update_step',
        step: 'student_info',
        current_standard: '12th',
        academic_year: '2025-26',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboarding.current_step).toBe('student_info');
    expect(body.onboarding.current_standard).toBe('12th');
    expect(body.onboarding.academic_year).toBe('2025-26');
  });

  // =========================================
  // Test 6: GET onboarding shows current state
  // =========================================

  test('GET /api/onboarding returns current onboarding state', async ({ request }) => {
    const res = await request.get('/api/onboarding', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboarding).toBeDefined();
    expect(body.onboarding.current_step).toBe('student_info');
    expect(body.onboarding.current_standard).toBe('12th');
    expect(body.onboarding.status).toBe('in_progress');
  });

  // =========================================
  // Test 7: /api/auth/me reflects in_progress
  // =========================================

  test('GET /api/auth/me shows in_progress onboardingStatus', async ({ request }) => {
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboardingStatus).toBe('in_progress');
  });

  // =========================================
  // Test 8: Submit fails without docs
  // =========================================

  test('POST /api/onboarding action=submit fails without required docs', async ({ request }) => {
    const res = await request.post('/api/onboarding', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'submit' },
      failOnStatusCode: false,
    });
    // Should fail because no documents uploaded
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing required documents');
  });

  // =========================================
  // Test 9: Review API — teacher perspective
  // =========================================

  test('GET /api/onboarding/review returns pending reviews', async ({ request }) => {
    const res = await request.get('/api/onboarding/review?status=submitted', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.reviews).toBeDefined();
    expect(Array.isArray(body.reviews)).toBe(true);
    // Our test student hasn't submitted yet, so they shouldn't be in pending
  });

  test('GET /api/onboarding/review returns all records', async ({ request }) => {
    const res = await request.get('/api/onboarding/review', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.reviews).toBeDefined();
    expect(Array.isArray(body.reviews)).toBe(true);
  });

  // =========================================
  // Test 10: Review approve — no classroom_id
  // =========================================

  test('POST /api/onboarding/review approve without classroom_id', async ({ request }) => {
    const res = await request.post('/api/onboarding/review', {
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        student_id: studentId,
        action: 'approve',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboarding).toBeDefined();
    expect(body.onboarding.status).toBe('approved');
    expect(body.onboarding.reviewed_by).toBe(teacherId);
  });

  // =========================================
  // Test 11: After approval, auth/me shows approved
  // =========================================

  test('GET /api/auth/me shows approved status after review', async ({ request }) => {
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboardingStatus).toBe('approved');
    // Test user has no phone/dob/gender → profileComplete should be false
    expect(body.profileComplete).toBe(false);
  });

  // =========================================
  // Test 12: Reject flow — no classroom_id
  // =========================================

  test('POST /api/onboarding/review reject without classroom_id', async ({ request }) => {
    // First, set status back to submitted for rejection test
    // We need to create a second student for this
    const email2 = `e2e-reject-student-${Date.now()}@neramclasses.com`;
    const loginRes = await request.post('/api/auth/test-login', {
      data: { email: email2, role: 'student' },
    });
    const { testToken: token2, user: user2 } = await loginRes.json();

    // Start onboarding for student 2
    await request.post('/api/onboarding', {
      headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
      data: { action: 'start' },
    });

    // Teacher rejects student 2
    const rejectRes = await request.post('/api/onboarding/review', {
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        student_id: user2.id,
        action: 'reject',
        reason: 'Documents are blurry, please re-upload',
      },
    });
    expect(rejectRes.status()).toBe(200);
    const rejectBody = await rejectRes.json();

    expect(rejectBody.onboarding.status).toBe('rejected');
    expect(rejectBody.onboarding.rejection_reason).toBe('Documents are blurry, please re-upload');
    expect(rejectBody.onboarding.current_step).toBe('documents');
  });

  test('POST /api/onboarding/review reject requires reason', async ({ request }) => {
    const res = await request.post('/api/onboarding/review', {
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        student_id: studentId,
        action: 'reject',
        // No reason provided
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('reason');
  });

  // =========================================
  // Test 13: Nudge — no classroom_id
  // =========================================

  test('POST /api/onboarding/nudge without classroom_id', async ({ request }) => {
    // Create a student with submitted status for nudge test
    const email3 = `e2e-nudge-student-${Date.now()}@neramclasses.com`;
    const loginRes = await request.post('/api/auth/test-login', {
      data: { email: email3, role: 'student' },
    });
    const { testToken: token3 } = await loginRes.json();

    // Start onboarding
    await request.post('/api/onboarding', {
      headers: { Authorization: `Bearer ${token3}`, 'Content-Type': 'application/json' },
      data: { action: 'start' },
    });

    // Nudge (should work even though not submitted — just records the nudge)
    const res = await request.post('/api/onboarding/nudge', {
      headers: {
        Authorization: `Bearer ${token3}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    // Should succeed (first nudge, no cooldown)
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.teamsLink).toBeDefined();
  });

  test('POST /api/onboarding/nudge respects 24h cooldown', async ({ request }) => {
    // Create a fresh student for cooldown test
    const email4 = `e2e-nudge-cooldown-${Date.now()}@neramclasses.com`;
    const loginRes = await request.post('/api/auth/test-login', {
      data: { email: email4, role: 'student' },
    });
    const { testToken: token4 } = await loginRes.json();

    // Start onboarding
    await request.post('/api/onboarding', {
      headers: { Authorization: `Bearer ${token4}`, 'Content-Type': 'application/json' },
      data: { action: 'start' },
    });

    // First nudge — should succeed
    const firstNudge = await request.post('/api/onboarding/nudge', {
      headers: { Authorization: `Bearer ${token4}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(firstNudge.status()).toBe(200);

    // Second nudge — should be rate-limited (24h cooldown)
    const secondNudge = await request.post('/api/onboarding/nudge', {
      headers: { Authorization: `Bearer ${token4}`, 'Content-Type': 'application/json' },
      data: {},
      failOnStatusCode: false,
    });
    expect(secondNudge.status()).toBe(429);
    const cooldownBody = await secondNudge.json();
    expect(cooldownBody.error).toContain('cooldown');
    expect(cooldownBody.nextNudgeAt).toBeDefined();
  });

  // =========================================
  // Test 14: Profile completion API
  // =========================================

  test('GET /api/student/profile-completion returns missing fields', async ({ request }) => {
    const res = await request.get('/api/student/profile-completion', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.user).toBeDefined();
    expect(body.missingFields).toBeDefined();
    expect(Array.isArray(body.missingFields)).toBe(true);
    // New test user should be missing phone, dob, gender at minimum
    expect(body.missingFields).toContain('phone');
    expect(body.missingFields).toContain('date_of_birth');
    expect(body.missingFields).toContain('gender');
    expect(body.isComplete).toBe(false);
  });

  test('PATCH /api/student/profile-completion updates profile', async ({ request }) => {
    const res = await request.patch('/api/student/profile-completion', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        userUpdates: {
          phone: '+919999900099',
          date_of_birth: '2007-05-15',
          gender: 'male',
          first_name: 'Test',
        },
        leadUpdates: {
          father_name: 'Test Father',
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('GET /api/auth/me shows profileComplete=true after filling fields', async ({ request }) => {
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboardingStatus).toBe('approved');
    expect(body.profileComplete).toBe(true);
    expect(body.user.phone).toBe('+919999900099');
  });

  // =========================================
  // Test 15: Review enriches with classrooms
  // =========================================

  test('GET /api/onboarding/review includes enrolled classrooms', async ({ request }) => {
    const res = await request.get('/api/onboarding/review', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Find our test student's record
    const studentReview = body.reviews.find((r: any) => r.student_id === studentId);
    if (studentReview) {
      expect(studentReview.classrooms).toBeDefined();
      expect(Array.isArray(studentReview.classrooms)).toBe(true);
      expect(studentReview.documents).toBeDefined();
      expect(Array.isArray(studentReview.documents)).toBe(true);
      expect(studentReview.student).toBeDefined();
      expect(studentReview.student.name).toBeDefined();
      expect(studentReview.student.email).toBeDefined();
    }
  });

  // =========================================
  // Test 16: Auth/security edge cases
  // =========================================

  test('GET /api/onboarding without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/onboarding', {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/onboarding/review as student returns 403', async ({ request }) => {
    const res = await request.post('/api/onboarding/review', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { student_id: studentId, action: 'approve' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/onboarding invalid action returns 400', async ({ request }) => {
    const res = await request.post('/api/onboarding', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'invalid_action' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });
});

/**
 * Separate test suite: Profile completion gate for legacy students
 */
test.describe('Profile Completion Gate', () => {
  test.use({ baseURL: 'http://localhost:3012' });
  test.describe.configure({ mode: 'serial' });

  let legacyToken: string;
  let legacyId: string;
  let teacherToken: string;

  test('setup: create legacy student with approved onboarding but no profile', async ({ request }) => {
    // Create student
    const email = `e2e-legacy-${Date.now()}@neramclasses.com`;
    const loginRes = await request.post('/api/auth/test-login', {
      data: { email, role: 'student' },
    });
    const loginBody = await loginRes.json();
    legacyToken = loginBody.testToken;
    legacyId = loginBody.user.id;

    // Create teacher
    const teacherEmail = `e2e-legacy-teacher-${Date.now()}@neramclasses.com`;
    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: teacherEmail, role: 'teacher' },
    });
    const teacherBody = await teacherRes.json();
    teacherToken = teacherBody.testToken;

    // Start onboarding (creates the record)
    await request.post('/api/onboarding', {
      headers: { Authorization: `Bearer ${legacyToken}`, 'Content-Type': 'application/json' },
      data: { action: 'start' },
    });

    // Teacher approves (simulating legacy student already approved)
    const approveRes = await request.post('/api/onboarding/review', {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { student_id: legacyId, action: 'approve' },
    });
    expect(approveRes.status()).toBe(200);
  });

  test('legacy student: /api/auth/me shows approved but profileComplete=false', async ({ request }) => {
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${legacyToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.onboardingStatus).toBe('approved');
    expect(body.profileComplete).toBe(false);
  });

  test('legacy student: profile-completion shows missing fields', async ({ request }) => {
    const res = await request.get('/api/student/profile-completion', {
      headers: { Authorization: `Bearer ${legacyToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.isComplete).toBe(false);
    expect(body.missingFields.length).toBeGreaterThan(0);
    expect(body.missingFields).toContain('phone');
    expect(body.missingFields).toContain('date_of_birth');
    expect(body.missingFields).toContain('gender');
  });

  test('legacy student: filling profile makes profileComplete=true', async ({ request }) => {
    // Fill required fields
    const patchRes = await request.patch('/api/student/profile-completion', {
      headers: { Authorization: `Bearer ${legacyToken}`, 'Content-Type': 'application/json' },
      data: {
        userUpdates: {
          phone: '+919999900098',
          date_of_birth: '2006-08-20',
          gender: 'female',
          first_name: 'Legacy',
        },
        leadUpdates: {
          father_name: 'Legacy Father',
          city: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600001',
          applicant_category: 'school_student',
        },
      },
    });
    expect(patchRes.status()).toBe(200);

    // Verify auth/me now shows profileComplete=true
    const meRes = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${legacyToken}` },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();

    expect(meBody.onboardingStatus).toBe('approved');
    expect(meBody.profileComplete).toBe(true);
  });
});

/**
 * Separate test suite: One onboarding per student (not per classroom)
 */
test.describe('Per-Student Onboarding Uniqueness', () => {
  test.use({ baseURL: 'http://localhost:3012' });

  test('same student starting onboarding twice returns same record', async ({ request }) => {
    const email = `e2e-unique-${Date.now()}@neramclasses.com`;
    const loginRes = await request.post('/api/auth/test-login', {
      data: { email, role: 'student' },
    });
    const { testToken } = await loginRes.json();

    // Start onboarding first time
    const res1 = await request.post('/api/onboarding', {
      headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
      data: { action: 'start' },
    });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    const firstId = body1.onboarding.id;

    // Start onboarding second time
    const res2 = await request.post('/api/onboarding', {
      headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
      data: { action: 'start' },
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    const secondId = body2.onboarding.id;

    // Should be the exact same record
    expect(secondId).toBe(firstId);
  });
});
