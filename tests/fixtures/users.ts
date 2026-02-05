/**
 * User Test Fixtures
 *
 * Pre-defined user data for testing authentication and user-related features.
 */

export const mockFirebaseUser = {
  uid: 'firebase-test-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
  phoneNumber: '+919876543210',
  emailVerified: true,
  isAnonymous: false,
  metadata: {
    creationTime: '2024-01-01T00:00:00Z',
    lastSignInTime: '2024-01-15T00:00:00Z',
  },
  providerData: [
    {
      providerId: 'google.com',
      uid: 'google-123',
      displayName: 'Test User',
      email: 'test@example.com',
      phoneNumber: null,
      photoURL: 'https://example.com/photo.jpg',
    },
  ],
  getIdToken: async () => 'mock-firebase-id-token',
  getIdTokenResult: async () => ({
    token: 'mock-firebase-id-token',
    claims: {},
    authTime: '2024-01-15T00:00:00Z',
    issuedAtTime: '2024-01-15T00:00:00Z',
    expirationTime: '2024-01-15T01:00:00Z',
    signInProvider: 'google.com',
  }),
};

export const mockMicrosoftUser = {
  oid: 'ms-object-id-456',
  email: 'teacher@neramclasses.com',
  name: 'Test Teacher',
  givenName: 'Test',
  surname: 'Teacher',
  userPrincipalName: 'teacher@neramclasses.onmicrosoft.com',
};

export const mockSupabaseUser = {
  id: 'supabase-uuid-789',
  firebase_uid: 'firebase-test-uid-123',
  ms_oid: null,
  google_id: 'google-123',
  email: 'test@example.com',
  phone: '+919876543210',
  phone_verified: true,
  email_verified: true,
  full_name: 'Test User',
  user_type: 'student' as const,
  status: 'active' as const,
  avatar_url: 'https://example.com/photo.jpg',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
};

export const mockLeadUser = {
  ...mockSupabaseUser,
  id: 'lead-uuid-001',
  user_type: 'lead' as const,
  status: 'pending' as const,
};

export const mockStudentUser = {
  ...mockSupabaseUser,
  id: 'student-uuid-002',
  user_type: 'student' as const,
  status: 'active' as const,
};

export const mockTeacherUser = {
  ...mockSupabaseUser,
  id: 'teacher-uuid-003',
  firebase_uid: null,
  ms_oid: 'ms-object-id-456',
  email: 'teacher@neramclasses.com',
  user_type: 'teacher' as const,
  status: 'active' as const,
};

export const mockAdminUser = {
  ...mockSupabaseUser,
  id: 'admin-uuid-004',
  firebase_uid: null,
  ms_oid: 'ms-object-id-admin',
  email: 'admin@neramclasses.com',
  user_type: 'admin' as const,
  status: 'active' as const,
};
