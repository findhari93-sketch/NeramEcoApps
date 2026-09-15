import type { StudentDrawingAttempt, StudentRubric } from '@/lib/student-drawing-payload';

export interface AssignmentAttachment {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}

/** The assignment as the student detail route returns it. */
export interface StudentAssignmentDetail {
  id: string;
  title: string;
  class_date: string;
  instructions: string | null;
  expected_outcome?: string | null;
  focus_points?: string | null;
  assignment_type: 'drawing' | 'document';
  submission_format: 'pdf' | 'image' | 'pdf_or_image';
  evaluation_type: 'marks' | 'stars';
  max_marks: number;
  due_at: string | null;
  catchup_window_days: number;
  /** When true, worked solutions must be uploaded before the questions open. */
  requires_pdf?: boolean;
  content_image_url: string | null;
  reference_images?: string[] | null;
  content_video_url: string | null;
  links: { label: string; url: string }[];
  attachments: AssignmentAttachment[];
}

export interface AssignmentRecording {
  url: string | null;
  source: string | null;
  class_title?: string | null;
}

export type { StudentDrawingAttempt, StudentRubric };
