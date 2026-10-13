/**
 * Pure helpers for the Admin "Review requests" page. Unit tested.
 */
import type { ReviewRequestProgress } from '@neram/database';

export type ChipTone = 'default' | 'info' | 'success' | 'warning' | 'error';

export const PROGRESS_TONE: Record<ReviewRequestProgress, ChipTone> = {
  not_sent: 'default',
  sent: 'info',
  opened: 'info',
  submitted: 'warning',
  published: 'success',
  posted_google: 'success',
  expired: 'default',
  cancelled: 'default',
};

/** Order of the filter chips, which is also the order a request moves through. */
export const PROGRESS_ORDER: ReviewRequestProgress[] = [
  'not_sent',
  'sent',
  'opened',
  'submitted',
  'published',
  'posted_google',
  'expired',
  'cancelled',
];

export interface NamedPerson {
  name: string | null;
}

/**
 * Rank people the way staff search on LinkedIn: a name that starts with the
 * letters, then a later word that starts with them, then a name that only
 * contains them. An earlier hit ranks higher inside each group. Same order as
 * Nexus's rankPeople (apps/nexus/src/lib/people-search.ts), kept small here
 * because Admin only needs the ordering, not the fuzzy matching.
 */
export function rankByName<T extends NamedPerson>(people: T[], rawQuery: string): T[] {
  const q = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return people;
  const scored: Array<{ p: T; tier: number; at: number }> = [];
  for (const p of people) {
    const name = (p.name || '').toLowerCase();
    const at = name.indexOf(q);
    if (at < 0) continue;
    const tier = at === 0 ? 0 : /\s/.test(name[at - 1]) ? 1 : 2;
    scored.push({ p, tier, at });
  }
  return scored
    .sort((a, b) => a.tier - b.tier || a.at - b.at || (a.p.name || '').localeCompare(b.p.name || ''))
    .map((s) => s.p);
}

/** One line for the result: "AIR 142 · SPA Delhi" or "98.5 percentile". */
export function resultLine(r: { air_rank?: number | null; percentile?: number | null; college_admitted?: string | null }): string {
  const result = r.air_rank ? `AIR ${r.air_rank}` : r.percentile != null ? `${r.percentile} percentile` : null;
  return [result, r.college_admitted || null].filter(Boolean).join(' · ');
}

/** Why a student would not be shown a Google button, in words staff can act on. */
export function googleLinkWarning(input: {
  learningMode: string | null;
  centreName: string | null;
  hasTarget: boolean;
}): string | null {
  if (input.hasTarget) return null;
  if (input.learningMode === 'online') {
    return 'No Google link for online students yet. Add a Google Place ID to the headquarters centre, or pick the centre they reviewed.';
  }
  if (!input.centreName) return 'Pick a centre so the student can be sent to its Google page.';
  return `${input.centreName} has no Google Place ID, so the student will not see the Google step. Add it in Centres.`;
}

/** First name for a greeting, never a placeholder like "Student". */
export function greetingName(name: string | null | undefined): string | null {
  const first = (name || '').trim().split(/\s+/)[0];
  if (!first || ['student', 'user', 'learner'].includes(first.toLowerCase())) return null;
  return first;
}

export type ReminderTarget = 'google' | 'justdial' | 'sulekha';

/**
 * What to remind a student about after they sent their review: Google first
 * (it is what parents check), then their one directory. Null when there is
 * nothing left to ask for. One reminder per request: no nagging.
 */
export function reminderFor(r: {
  submitted_at: string | null;
  google_target_url: string | null;
  google_posted_self_reported_at: string | null;
  secondary_platform: 'justdial' | 'sulekha' | null;
  secondary_clicked_at: string | null;
  reminder_sent_at: string | null;
  status: string;
}): ReminderTarget | null {
  if (!r.submitted_at || r.reminder_sent_at || r.status === 'cancelled') return null;
  if (r.google_target_url && !r.google_posted_self_reported_at) return 'google';
  if (r.secondary_platform && !r.secondary_clicked_at) return r.secondary_platform;
  return null;
}

// ── Bulk links by batch ──────────────────────────────────────────────────

/** '2025-26' is the batch that wrote the exam in 2026. Anything else: null. */
export function examYearFromCohort(cohort: string | null | undefined): number | null {
  const m = /^(\d{4})-\d{2}$/.exec((cohort || '').trim());
  return m ? Number(m[1]) + 1 : null;
}

/** The exam year to prefill: the application form's target year wins, then the batch. */
export function examYearFor(input: { targetExamYear?: unknown; academicYear?: string | null }): number | null {
  const target = Number(input.targetExamYear);
  if (Number.isInteger(target) && target >= 2015 && target <= 2100) return target;
  return examYearFromCohort(input.academicYear);
}

/** The cohort before this one: '2026-27' gives '2025-26'. "Last year's students". */
export function previousCohort(cohort: string | null | undefined): string | null {
  const m = /^(\d{4})-\d{2}$/.exec((cohort || '').trim());
  if (!m) return null;
  const start = Number(m[1]) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** City spellings that mean the same place. */
const CITY_ALIASES: Record<string, string> = {
  trichy: 'tiruchirappalli',
  tiruchirapalli: 'tiruchirappalli',
  tiruchi: 'tiruchirappalli',
  bengaluru: 'bangalore',
  kanchipuram: 'kancheepuram',
  tiruppur: 'tirupur',
};
const cityKey = (c: string | null | undefined) => {
  const k = (c || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return CITY_ALIASES[k] || k;
};

/** The centre in the student's city, or null so staff pick one. Two centres in one city: null. */
export function guessCentre<T extends { id: string; city: string | null }>(city: string | null | undefined, centres: T[]): string | null {
  const key = cityKey(city);
  if (!key) return null;
  const hits = centres.filter((c) => cityKey(c.city) === key);
  return hits.length === 1 ? hits[0].id : null;
}

export interface BatchRow {
  userId: string;
  name: string;
  photoUrl: string | null;
  phone: string | null;
  city: string | null;
  academicYear: string | null;
  isAlumni: boolean;
  examType: 'NATA' | 'JEE_PAPER_2' | 'BOTH';
  examYear: number | null;
  airRank: number | null;
  percentile: number | null;
  collegeAdmitted: string | null;
  centreId: string | null;
  studentResultId: string | null;
  existingRequest: { id: string; progress: string } | null;
}

/**
 * Exam from any of our spellings: the application form's course_type
 * ('nata' | 'jee_paper2' | 'both' | 'revit' | 'not_sure'), student_results
 * ('nata' | 'jee_paper2'), or free text like "NATA and JEE".
 */
export function examTypeFrom(raw: string | null | undefined): BatchRow['examType'] {
  const v = (raw || '').toLowerCase();
  if (v === 'both' || (v.includes('jee') && v.includes('nata'))) return 'BOTH';
  if (v.includes('jee')) return 'JEE_PAPER_2';
  return 'NATA';
}

/**
 * One student, prefilled from what we already hold. A staff-verified result
 * (student_results) wins over the alumni record for rank, college and photo,
 * and both win over the account avatar.
 */
export function toBatchRow(input: {
  user: { id: string; name: string | null; avatar_url: string | null; phone: string | null; academic_year: string | null; is_alumni: boolean };
  lead?: { city?: string | null; target_exam_year?: unknown; interest_course?: string | null } | null;
  alumni?: { college_name?: string | null; exam_name?: string | null } | null;
  result?: { id: string; exam_type?: string | null; exam_year?: number | null; rank?: number | null; percentile?: number | string | null; college_name?: string | null; photo_url?: string | null } | null;
  centres: Array<{ id: string; city: string | null }>;
  existing?: { id: string; progress: string } | null;
}): BatchRow {
  const { user, lead, alumni, result } = input;
  const city = lead?.city?.trim() || null;
  return {
    userId: user.id,
    name: (user.name || '').trim() || 'Unnamed student',
    photoUrl: result?.photo_url || user.avatar_url || null,
    phone: user.phone || null,
    city,
    academicYear: user.academic_year,
    isAlumni: !!user.is_alumni,
    examType: examTypeFrom(result?.exam_type || alumni?.exam_name || lead?.interest_course),
    examYear: result?.exam_year ?? examYearFor({ targetExamYear: lead?.target_exam_year, academicYear: user.academic_year }),
    airRank: result?.rank ?? null,
    percentile: result?.percentile == null ? null : Number(result.percentile),
    collegeAdmitted: result?.college_name || alumni?.college_name || null,
    centreId: guessCentre(city, input.centres),
    studentResultId: result?.id ?? null,
    existingRequest: input.existing ?? null,
  };
}

/** Rows still missing a result: what staff have left to type. */
export function rowsNeedingResults<T extends { airRank: number | null; percentile: number | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.airRank && r.percentile == null);
}
