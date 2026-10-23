export type EnrolmentStage = 'checking' | 'enrolled' | null;

export interface EnrolmentLinkRow {
  status: string;
  submitted_at: string | null;
  rejected_at: string | null;
}

/**
 * Where a person is on the way into class. Enrolled by any route counts: a
 * used direct link, a student profile (approved application or office
 * enrolment) or a student user. Every enrolled student gets the class setup
 * guide. 'checking' is a direct link whose payment waits for staff; null is
 * someone who has not enrolled yet.
 */
export function enrolmentStageFrom(
  links: EnrolmentLinkRow[],
  hasStudentProfile: boolean,
  userType: string | null | undefined,
): EnrolmentStage {
  const live = links.filter((l) => l.status !== 'cancelled');
  if (live.some((l) => l.status === 'used') || hasStudentProfile || userType === 'student') return 'enrolled';
  const waiting = live.some(
    (l) => l.status === 'active' && l.submitted_at && (!l.rejected_at || new Date(l.rejected_at) < new Date(l.submitted_at)),
  );
  return waiting ? 'checking' : null;
}
