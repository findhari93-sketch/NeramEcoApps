// Phase info returned by API
export interface PhaseInfo {
  phase: 'phase_1' | 'phase_2';
  label: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  max_attempts: number;
}

// A single student on a specific exam date
export interface StudentOnDate {
  student_id: string;
  name: string;
  session: 'morning' | 'afternoon' | null;
  attempt_number: number;
  state: string;
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

// Summary stats
export interface ExamScheduleStats {
  total_students: number;
  submitted_count: number;
  not_submitted_count: number;
  this_week_exam_count: number;
  completed_count: number;
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
