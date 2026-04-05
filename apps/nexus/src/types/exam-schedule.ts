export interface ExamScheduleStudent {
  student_id: string;
  name: string;
  session: 'morning' | 'afternoon' | null;
  state: string;
}

export interface ExamScheduleUpcomingDate {
  exam_date: {
    id: string;
    exam_date: string;
    phase: string;
    attempt_number: number;
    label: string | null;
  };
  students_by_city: Record<string, ExamScheduleStudent[]>;
  total_students: number;
}

export interface ExamScheduleNotSubmitted {
  id: string;
  name: string;
}

export interface ExamScheduleRecentlyCompleted {
  student_id: string;
  name: string;
  exam_date: string;
  completed_at: string;
  city: string | null;
}

export interface ExamScheduleData {
  upcoming: ExamScheduleUpcomingDate[];
  not_submitted: ExamScheduleNotSubmitted[];
  recently_completed: ExamScheduleRecentlyCompleted[];
}
