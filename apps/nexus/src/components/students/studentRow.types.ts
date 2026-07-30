import type { EmailDomainStatus } from '@/lib/classroom-email';

/** Density modes for the roster: dense scan list, avatar card grid, or roomy rows. */
export type ViewMode = 'compact' | 'cards' | 'detailed';

export const VIEW_STORAGE_KEY = 'nexus:students:view';

export interface StudentBatch {
  id: string;
  name: string;
}

export interface EnrolledStudent {
  id: string;
  name: string;
  email: string | null;
  email_status: EmailDomainStatus; // class-domain status of the shown email
  avatar_url: string | null;
  ms_oid: string | null;
  awaiting_microsoft: boolean; // enrolled, but no Entra account yet: cannot sign in

  batch: StudentBatch | null; // classroom section (nexus_batches)
  exam_batch: string | null; // exam-year cohort (users.academic_year)
  academic_year?: string | null; // same value, named after the column

  // Classification, two orthogonal axes. See lib/student-stage.ts.
  study_stage: string | null; // nexus_enrollments.current_standard
  study_stage_source: 'staff' | 'onboarding_backfill' | null;
  participation_status: 'active' | 'dormant';
  dormant_since: string | null;
  dormant_reason: string | null;

  /**
   * Whether the class and the exam year agree, computed server-side from the
   * current batch so the row chip, the banner count and the drawer's warning can
   * never disagree about the same student. See pairStatus in @neram/database.
   */
  pair_status?: 'ok' | 'mismatch' | 'no_stage' | 'no_year' | 'unknown';

  attendance: { attended: number; total: number; percentage: number };
  checklist: { completed: number; total: number };
}

export interface StudentRowProps {
  student: EnrolledStudent;
  /** Current exam-year cohort, so a mismatch tooltip can name the expected year. */
  currentBatch?: string | null;
  checklistPct: number;
  attColor: string;
  doneColor: string;
  presenceStatus?: string | null;
  isMobile: boolean;
  /** Select mode turns row taps into selection toggles instead of navigation. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  onCopy: (e: React.MouseEvent, email: string) => void;
}
