import type { InspirationSourceKind } from '@neram/database/queries/nexus';

export interface CreditInput {
  kind: InspirationSourceKind;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  isAlumni: boolean;
  /** The year the student sits (or sat) the exam, from their academic year. */
  examYear: number | null;
  optedOut: boolean;
}

/** "Harshitaa T.": enough to be proud of, not enough to find someone by. */
export function shortName(first: string | null, last: string | null, full: string | null): string | null {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f) return l ? `${f} ${l[0].toUpperCase()}.` : f;
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export function formatInspirationCredit(c: CreditInput): string {
  const name = c.optedOut ? null : shortName(c.firstName, c.lastName, c.fullName);
  if (c.kind !== 'submission_original') {
    return c.kind === 'submission_reference' && name ? `Neram reference · from ${name}'s drawing` : 'Neram reference';
  }
  if (!name) return 'Neram student';
  if (c.isAlumni) return c.examYear ? `${name} · Alumni ${c.examYear}` : `${name} · Alumni`;
  return c.examYear ? `${name} · ${c.examYear} batch` : name;
}
