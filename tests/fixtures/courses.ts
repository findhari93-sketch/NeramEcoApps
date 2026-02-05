/**
 * Course Test Fixtures
 *
 * Pre-defined course and batch data for testing.
 */

export const mockCourses = [
  {
    id: 'course-nata-2024',
    name: 'NATA Complete Course 2024',
    slug: 'nata-complete-2024',
    description: {
      en: 'Complete preparation for NATA exam',
      ta: 'NATA தேர்வுக்கான முழுமையான தயாரிப்பு',
    },
    price: 25000,
    discounted_price: 20000,
    duration_months: 6,
    is_active: true,
    features: {
      en: ['Live classes', 'Mock tests', 'Study materials'],
      ta: ['நேரடி வகுப்புகள்', 'மாதிரி தேர்வுகள்', 'படிப்பு பொருட்கள்'],
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'course-jee-2024',
    name: 'JEE Paper 2 Course 2024',
    slug: 'jee-paper2-2024',
    description: {
      en: 'Complete preparation for JEE Paper 2 (B.Arch)',
      ta: 'JEE Paper 2 (B.Arch) தேர்வுக்கான முழுமையான தயாரிப்பு',
    },
    price: 30000,
    discounted_price: 25000,
    duration_months: 8,
    is_active: true,
    features: {
      en: ['Live classes', 'Mock tests', 'Previous year papers'],
      ta: ['நேரடி வகுப்புகள்', 'மாதிரி தேர்வுகள்', 'முந்தைய ஆண்டு வினாத்தாள்கள்'],
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
];

export const mockBatches = [
  {
    id: 'batch-nata-jan-2024',
    course_id: 'course-nata-2024',
    name: 'NATA January 2024 Batch',
    start_date: '2024-01-15',
    end_date: '2024-06-15',
    max_students: 50,
    current_students: 35,
    schedule: {
      days: ['Monday', 'Wednesday', 'Friday'],
      time: '18:00-20:00',
      timezone: 'Asia/Kolkata',
    },
    teams_channel_id: 'teams-channel-123',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'batch-jee-feb-2024',
    course_id: 'course-jee-2024',
    name: 'JEE February 2024 Batch',
    start_date: '2024-02-01',
    end_date: '2024-09-30',
    max_students: 40,
    current_students: 28,
    schedule: {
      days: ['Tuesday', 'Thursday', 'Saturday'],
      time: '17:00-19:00',
      timezone: 'Asia/Kolkata',
    },
    teams_channel_id: 'teams-channel-456',
    is_active: true,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
];

export const mockStudentProfile = {
  id: 'profile-student-001',
  user_id: 'student-uuid-002',
  course_id: 'course-nata-2024',
  batch_id: 'batch-nata-jan-2024',
  enrollment_date: '2024-01-15',
  payment_status: 'paid' as const,
  total_fee: 20000,
  paid_amount: 20000,
  pending_amount: 0,
  lessons_completed: 15,
  assignments_completed: 8,
  total_watch_time_minutes: 1200,
  teams_email: 'student@neramclasses.onmicrosoft.com',
  teams_user_id: 'teams-user-123',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-02-01T00:00:00Z',
};
