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

  /** nexus_enrollments.id, which removing a student from the class needs. */
  enrollment_id?: string;
  enrolled_at?: string | null;
  /**
   * users.nexus_first_login_at / nexus_last_login_at. Written only when the
   * student actually opens Nexus, unlike users.last_login_at.
   */
  first_signed_in_at?: string | null;
  last_seen_at?: string | null;
  /** Another row on this roster that may be the same person. See lib/roster-duplicates. */
  possible_duplicate_of?: { id: string; name: string } | null;
  /**
   * The student's own record holds an application form. False usually means the
   * form sits on a second record that was never linked. See lib/application-form.
   */
  has_application_form?: boolean;

  /**
   * Where they live, from lead_profiles: the newest of their rows that names a
   * city, title-cased. Kept apart so a city stays comparable; the row joins the
   * two for display with placeLabel(). See lib/student-place.ts.
   */
  city?: string | null;
  state?: string | null;

  batch: StudentBatch | null; // classroom section (nexus_batches)
  exam_batch: string | null; // exam-year cohort (users.academic_year)
  academic_year?: string | null; // same value, named after the column
  /** users.knows_tamil: true Knows Tamil, false English only, null not recorded. */
  knows_tamil?: boolean | null;

  // Classification, two orthogonal axes. See lib/student-stage.ts.
  study_stage: string | null; // nexus_enrollments.current_standard
  study_stage_source: 'staff' | 'onboarding_backfill' | null;
  participation_status: 'active' | 'dormant';
  dormant_since: string | null;
  dormant_reason: string | null;
  /** 'auto' = Not started (never entered Nexus), 'staff' = paused by a person. See lib/not-started.ts. */
  dormant_source?: 'auto' | 'staff' | null;
  /** Who paused them. Null for Not started, which nobody decided. */
  dormant_by_name?: string | null;
  /** Automatic join reminders already sent while Not started. */
  join_reminders_sent?: number;
  /** Latest sign-in outcome, Not started students only. */
  last_sign_in?: { at: string; outcome: 'entered' | 'photo_step' } | null;

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
  /** One clock for every row, so "Seen 2h ago" agrees down the list. */
  now: number;
  /** The search text, so the letters it matched in the name can be marked. */
  query?: string;
  /** Select mode turns row taps into selection toggles instead of navigation. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  /** The row's actions menu. Hidden in select mode, where a tap means "select". */
  actions?: React.ReactNode;
}
