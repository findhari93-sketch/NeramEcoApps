import type { ExamScheduleData } from './exam-schedule';

export interface ExamRegistration {
  id: string;
  exam_type: string;
  is_writing: boolean;
  application_number: string | null;
}

export interface ExamAttemptWithDate {
  id: string;
  exam_type: string;
  phase: string;
  attempt_number: number;
  exam_date: string | null;
  exam_date_id: string | null;
  exam_city: string | null;
  exam_session: string | null;
  state: 'planning' | 'applied' | 'completed' | 'scorecard_uploaded';
  aptitude_score: number | null;
  drawing_score: number | null;
  total_score: number | null;
  exam_completed_at: string | null;
}

export interface NextExam {
  date: string;
  city: string | null;
  days_away: number;
  attempt_number: number;
  phase: string;
  attempt_id: string;
}

export interface OverallProgress {
  total_possible: number;
  activated: number;
  completed: number;
  best_score: number | null;
}

export interface UnifiedExamsResponse {
  registrations: ExamRegistration[];
  my_attempts: ExamAttemptWithDate[];
  next_exam: NextExam | null;
  overall_progress: OverallProgress;
  schedule: ExamScheduleData;
}
