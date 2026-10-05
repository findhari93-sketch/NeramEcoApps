/**
 * A paper's year, session and shift, as the teacher corrects them after upload.
 *
 * Read by the PATCH route and the Edit details dialog alike, so the dialog can
 * never offer a value the route refuses. Saved through the
 * nexus_qb_rename_paper function, which moves the paper and every question
 * source row carrying its key together. A change of exam goes through
 * nexus_qb_change_paper_exam, which also remaps sections the new exam lacks.
 */
import { isQBQuestionSection, type QBSectionMap } from '@neram/database';

export type PaperShift = 'forenoon' | 'afternoon';

export interface PaperIdentityEdit {
  year: number;
  session: string | null;
  shift: PaperShift | null;
}

export const PAPER_YEAR_MIN = 2000;

export interface PaperSessionOption {
  value: string;
  label: string;
  /** The month it is usually sat, as a reminder beside the choice. */
  hint: string;
}

// JEE Paper 2 has 2 sessions per year
export const JEE_SESSIONS: PaperSessionOption[] = [
  { value: 'Session 1', label: 'Session 1', hint: 'January' },
  { value: 'Session 2', label: 'Session 2', hint: 'April' },
];

// NATA has up to 3 tests per year
export const NATA_SESSIONS: PaperSessionOption[] = [
  { value: 'Test 1', label: 'Test 1', hint: 'April' },
  { value: 'Test 2', label: 'Test 2', hint: 'July' },
  { value: 'Test 3', label: 'Test 3', hint: 'October' },
];

export function sessionOptionsFor(examType: string): PaperSessionOption[] {
  return examType === 'NATA' ? NATA_SESSIONS : JEE_SESSIONS;
}
export const PAPER_SESSION_MAX_LENGTH = 40;

/**
 * The session to start on when a paper moves to another exam: a standard
 * session becomes the one in the same place for the new exam (Test 1 for
 * Session 1), and anything unusual is kept as typed.
 */
export function sessionForExam(session: string | null, fromExam: string, toExam: string): string | null {
  if (!session) return null;
  const to = sessionOptionsFor(toExam);
  if (to.some((o) => o.value === session)) return session;
  const index = sessionOptionsFor(fromExam).findIndex((o) => o.value === session);
  if (index < 0) return session;
  return to[Math.min(index, to.length - 1)].value;
}

export function paperYearMax(now: Date = new Date()): number {
  return now.getFullYear() + 1;
}

/** True when the body tries to change any of the three, or the exam. */
export function bodyEditsIdentity(body: Record<string, unknown>): boolean {
  return body.year !== undefined || body.session !== undefined || body.shift !== undefined || body.exam_type !== undefined;
}

/**
 * The body's section_map ({"drawing": "planning"}), or null when it is not an
 * object of known sections. Missing means no remapping.
 */
export function parseSectionMap(value: unknown): QBSectionMap | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const out: QBSectionMap = {};
  for (const [from, to] of Object.entries(value as Record<string, unknown>)) {
    if (!isQBQuestionSection(from) || !isQBQuestionSection(to)) return null;
    out[from] = to;
  }
  return out;
}

/**
 * The edit the body asks for, filled in from the paper for anything it leaves
 * out, or the sentence to show when it is not a paper that can exist.
 */
export function parsePaperIdentityEdit(
  body: Record<string, unknown>,
  current: { year: number; session: string | null; shift: string | null },
  now: Date = new Date(),
): { ok: true; value: PaperIdentityEdit } | { ok: false; error: string } {
  const year = body.year === undefined ? current.year : Number(body.year);
  if (!Number.isInteger(year) || year < PAPER_YEAR_MIN || year > paperYearMax(now)) {
    return { ok: false, error: `Year must be between ${PAPER_YEAR_MIN} and ${paperYearMax(now)}` };
  }

  const rawSession = body.session === undefined ? current.session : body.session;
  if (rawSession != null && typeof rawSession !== 'string') {
    return { ok: false, error: 'Session must be text' };
  }
  const session = rawSession?.trim() || null;
  if (session && session.length > PAPER_SESSION_MAX_LENGTH) {
    return { ok: false, error: `Session must be ${PAPER_SESSION_MAX_LENGTH} characters or fewer` };
  }

  const rawShift = body.shift === undefined ? current.shift : body.shift;
  const shift = rawShift === '' ? null : rawShift;
  if (shift != null && shift !== 'forenoon' && shift !== 'afternoon') {
    return { ok: false, error: 'Shift must be forenoon, afternoon or none' };
  }

  return { ok: true, value: { year, session, shift } };
}

/** The HTTP status for an error raised by nexus_qb_rename_paper. */
export function renameErrorStatus(code: string | undefined): number {
  if (code === 'P0002') return 404;
  if (code === '23505') return 409;
  if (code === '22023') return 400;
  return 500;
}
