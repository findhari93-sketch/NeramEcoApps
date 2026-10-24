/**
 * Where a person is in school, for PersonAvatar: Class 10, 11, 12 or a break
 * year (finished Class 12, results in hand, preparing full time).
 *
 * The same four values as nexus_enrollments.current_standard, so Admin and
 * Nexus say the same thing. Several places can know it; the first one set wins:
 *
 *   nexus        the student's active Nexus enrolment (their teachers keep it)
 *   staff        users.study_stage, recorded by staff from any Admin avatar
 *   application  lead_profiles.academic_data.current_class ('12_completed')
 *   demo         the newest demo booking's class ('12th-pass')
 *
 * The last two are the student's own word on a form, and the hover card says so.
 *
 * Pure TypeScript: the browser imports this file.
 */

export const STUDY_STAGES = ['10th', '11th', '12th', 'gap_year'] as const;
export type StudyStage = (typeof STUDY_STAGES)[number];
export type StudySource = 'nexus' | 'staff' | 'application' | 'demo';

export function isStudyStage(value: unknown): value is StudyStage {
  return typeof value === 'string' && (STUDY_STAGES as readonly string[]).includes(value);
}

/** The demo booking's free-text class: '10th', '11th', '12th', '12th-pass'. */
export function demoClassToStage(currentClass: string | null | undefined): StudyStage | null {
  const value = currentClass?.trim().toLowerCase();
  if (!value) return null;
  if (value === '12th-pass') return 'gap_year';
  return isStudyStage(value) ? value : null;
}

export interface StudySources {
  enrolment?: string | null;
  staff?: string | null;
  application?: StudyStage | null;
  demo?: string | null;
  /** users.twelfth_passed_year, recorded by staff. */
  staffTwelfthYear?: number | null;
  /** academic_data.twelfth_year from the application, a number or a string. */
  applicationTwelfthYear?: unknown;
}

export interface ResolvedStudy {
  stage: StudyStage | null;
  source: StudySource | null;
  /** The year they finished Class 12. Only for a break year. */
  twelfthPassedYear: number | null;
}

function yearOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null;
}

export function resolveStudyStage(sources: StudySources): ResolvedStudy {
  const candidates: Array<[StudyStage | null, StudySource]> = [
    [isStudyStage(sources.enrolment) ? sources.enrolment : null, 'nexus'],
    [isStudyStage(sources.staff) ? sources.staff : null, 'staff'],
    [sources.application ?? null, 'application'],
    [demoClassToStage(sources.demo), 'demo'],
  ];
  const hit = candidates.find(([stage]) => stage);
  if (!hit) return { stage: null, source: null, twelfthPassedYear: null };
  const [stage, source] = hit;
  const twelfthPassedYear =
    stage === 'gap_year' ? yearOf(sources.staffTwelfthYear) ?? yearOf(sources.applicationTwelfthYear) : null;
  return { stage, source, twelfthPassedYear };
}

/** Years staff can pick for "Finished 12th in": this year back to 2015, newest first. */
export function twelfthYearOptions(now: Date = new Date()): number[] {
  const out: number[] = [];
  for (let y = now.getFullYear(); y >= 2015; y -= 1) out.push(y);
  return out;
}
