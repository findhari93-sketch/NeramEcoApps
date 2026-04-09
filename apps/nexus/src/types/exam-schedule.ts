// Phase info returned by API
export interface PhaseInfo {
  phase: 'phase_1' | 'phase_2';
  label: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  max_attempts: number;
}

// A single student on a specific exam date (in week view)
export interface StudentOnDate {
  student_id: string;
  name: string;
  session: 'morning' | 'afternoon' | null;
  attempt_number: number;
  state: string;
  academic_year: string | null;
  not_this_year: boolean;
}

// Summary of a student for popup views
export interface StudentSummary {
  student_id: string;
  name: string;
  academic_year: string | null;
  not_this_year: boolean;
  has_date: boolean;
  exam_date: string | null;
  exam_city: string | null;
  exam_session: 'morning' | 'afternoon' | null;
  state: string | null;
  exam_completed_at: string | null;
  attempt_id: string | null;
  // Exam intent fields (from nexus_student_exam_plans)
  plan_state: 'still_thinking' | 'planning_to_write' | 'applied' | 'not_this_year' | 'completed' | null;
  target_year: string | null;
  application_number: string | null;
  // Only present on removed_students
  deleted_at?: string | null;
  deletion_reason?: string | null;
}

// Data for one day (Friday or Saturday)
export interface DayData {
  date: string;
  day_name: string;
  is_past: boolean;
  students_by_city: Record<string, StudentOnDate[]>;
  total_students: number;
}

// Current week's data
export interface WeekData {
  week_number: number;
  week_label: string;
  friday: DayData | null;
  saturday: DayData | null;
  is_current_week: boolean;
  is_past: boolean;
}

// 5-bucket intent breakdown
export interface ExamIntentBuckets {
  date_booked: number;
  applied_no_date: number;
  planning: number;
  not_this_year: number;
  no_response: number;
}

// Summary stats (now includes full student lists for popups)
export interface ExamScheduleStats {
  total_students: number;
  submitted_count: number;
  not_submitted_count: number;
  this_week_exam_count: number;
  completed_count: number;
  students: StudentSummary[];
  submitted_students: StudentSummary[];
  removed_students: StudentSummary[];
  buckets: ExamIntentBuckets;
}

// Navigation bounds
export interface WeekNavigation {
  min_week_offset: number;
  max_week_offset: number;
  current_week_offset: number;
}

// Student who hasn't submitted a date
export interface NotSubmittedStudent {
  id: string;
  name: string;
}

// Student who recently completed an exam
export interface RecentlyCompletedStudent {
  student_id: string;
  name: string;
  exam_date: string;
  completed_at: string;
  city: string | null;
}

// Current user's attempts
export interface MyAttempt {
  attempt_number: number;
  exam_date: string | null;
  exam_city: string | null;
  exam_session: string | null;
  state: string;
}

// Full API response
export interface ExamScheduleData {
  phase_info: PhaseInfo;
  current_week: WeekData;
  stats: ExamScheduleStats;
  not_submitted: NotSubmittedStudent[];
  recently_completed: RecentlyCompletedStudent[];
  navigation: WeekNavigation;
  my_attempts: MyAttempt[];
}

// Date rail item (all phase exam dates with student counts)
export interface DateRailItem {
  date: string;      // YYYY-MM-DD
  day: 'Fri' | 'Sat';
  studentCount: number;
  isPast: boolean;
}
