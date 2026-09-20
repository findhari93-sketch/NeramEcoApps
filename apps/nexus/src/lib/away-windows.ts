/**
 * A stretch of days a student told us in advance they cannot attend.
 *
 * The per-class RSVP answers "not this Thursday". It cannot answer "I have
 * quarterly exams for the next fortnight", so a student sitting school exams had
 * to decline eight classes one at a time. Nobody does that, and the register
 * then read them as eight unexplained misses: indistinguishable from a student
 * who had simply stopped coming. This is the primitive that tells those two
 * apart.
 *
 * Deliberately NOT the dormant/paused lever. A paused student is dropped from
 * the roster by loadClassroomRoster, so they generate no absence rows and appear
 * in no register cell at all. Being away is not the same as not being watched:
 * an away student still owes the catch-up work, and still has to come back.
 *
 * No React, no Supabase, and no Date parsing. Every date here is a YYYY-MM-DD
 * string compared with < and >, which for ISO dates is already chronological
 * order. That is not a shortcut, it is the point: the last bug on this screen
 * was a date range silently shifted by a timezone conversion, and a rule that
 * never converts cannot shift.
 */

/** Sorts after any real date, so an open-ended window has an end to compare. */
const OPEN_ENDED = '9999-12-31';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** An open-ended window goes back in front of a human after this long. */
export const OPEN_ENDED_REVIEW_DAYS = 30;

export interface AwayWindow {
  id: string;
  student_id: string;
  /** Inclusive. */
  starts_on: string;
  /** Inclusive. Null means open ended: they do not know when they are back. */
  ends_on: string | null;
  /** When a human should look again. Read by the standing view, never by the register. */
  review_on?: string | null;
  expected_return_note?: string | null;
  reason_code: string | null;
  reason_note: string | null;
  source: string | null;
  cancelled_at: string | null;
  created_at: string | null;
}

/** Plain date arithmetic on a YYYY-MM-DD. Built and read in UTC, so no shift. */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * When this window should go back in front of a human.
 *
 * A window with a return date reviews itself on that date. An open-ended one
 * would otherwise explain every future class forever, so it gets a horizon.
 */
export function defaultReviewOn(startsOn: string, endsOn: string | null): string {
  return endsOn || addDays(startsOn, OPEN_ENDED_REVIEW_DAYS);
}

/**
 * Has this window outlived its review date?
 *
 * Only the standing view may act on this. The register must give the same answer
 * about October in December that it gave in October, so grouping never reads it.
 */
export function reviewOverdue(w: AwayWindow, todayYmd: string): boolean {
  if (!isActive(w)) return false;
  const review = w.review_on || defaultReviewOn(w.starts_on, w.ends_on);
  return todayYmd > review;
}

/** The last day a window covers, with open-ended windows sorting last. */
function endOf(w: Pick<AwayWindow, 'ends_on'>): string {
  return w.ends_on || OPEN_ENDED;
}

/** A window still stands: nobody has ended it early. */
export function isActive(w: Pick<AwayWindow, 'cancelled_at'>): boolean {
  return !w.cancelled_at;
}

/** Does this window, if it still stands, cover this day? Both ends inclusive. */
export function covers(w: AwayWindow, ymd: string): boolean {
  if (!isActive(w)) return false;
  if (!ymd || !w.starts_on) return false;
  return ymd >= w.starts_on && ymd <= endOf(w);
}

/**
 * Do two windows share any day?
 *
 * Used by the write path to refuse a second overlapping declaration. Postgres
 * would express this as an EXCLUDE constraint over a daterange, which needs the
 * btree_gist extension: not installed on this production database, and adding an
 * extension to it is a bigger risk than the problem, given how reliably
 * migrations here drift between staging and prod. So the write path refuses an
 * overlap using this, and `coveringWindow` below makes an overlap that slips
 * through harmless rather than ambiguous.
 */
export function overlaps(
  a: Pick<AwayWindow, 'starts_on' | 'ends_on'>,
  b: Pick<AwayWindow, 'starts_on' | 'ends_on'>,
): boolean {
  return a.starts_on <= endOf(b) && b.starts_on <= endOf(a);
}

/**
 * Windows in the one order every screen reads them in.
 *
 * Earliest start first, then earliest declared, then by id. The tiebreakers
 * matter: two overlapping windows must not be able to hand the register one
 * answer and the parent view another for the same night, and `created_at` alone
 * can tie because it is written by the same statement for a batch.
 */
export function sortWindows(windows: AwayWindow[]): AwayWindow[] {
  return [...windows].sort(
    (a, b) =>
      a.starts_on.localeCompare(b.starts_on) ||
      (a.created_at || '').localeCompare(b.created_at || '') ||
      a.id.localeCompare(b.id),
  );
}

/** The one window that explains this day, or null. Deterministic under overlap. */
export function coveringWindow(windows: AwayWindow[], ymd: string): AwayWindow | null {
  for (const w of sortWindows(windows)) {
    if (covers(w, ymd)) return w;
  }
  return null;
}

/** Windows per student, each list already in `sortWindows` order. */
export function groupByStudent(windows: AwayWindow[]): Map<string, AwayWindow[]> {
  const out = new Map<string, AwayWindow[]>();
  for (const w of sortWindows(windows)) {
    const list = out.get(w.student_id);
    if (list) list.push(w);
    else out.set(w.student_id, [w]);
  }
  return out;
}

/** "20 Oct" from "2026-10-20". Empty for anything that is not a plain date. */
export function formatDay(ymd: string | null | undefined): string {
  if (!ymd || ymd.length < 10) return '';
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12) return '';
  return `${day} ${MONTHS[month - 1]}`;
}

/**
 * The window in a sentence, from the reader's point of view today.
 *
 * An open-ended window reads as how long it has already run rather than as a
 * blank, because "away since 3 Oct, no return date yet" is the one a teacher
 * needs to act on and "away" alone hides it.
 */
export function describeWindow(w: AwayWindow, todayYmd: string): string {
  const started = todayYmd >= w.starts_on;
  if (!w.ends_on) {
    return started
      ? `Away since ${formatDay(w.starts_on)}, no return date yet`
      : `Away from ${formatDay(w.starts_on)}, no return date yet`;
  }
  if (started) return `Away until ${formatDay(w.ends_on)}`;
  return `Away ${formatDay(w.starts_on)} to ${formatDay(w.ends_on)}`;
}

/**
 * The columns every reader of this table needs, in one place.
 *
 * Five screens answer from these rows (the register, the class screen, the
 * teacher panel, the parent portal and the student's own banner). A column list
 * copied five times is how one of them ends up reading a window without its
 * `cancelled_at` and showing a student as away after they came back.
 */
export const AWAY_COLUMNS =
  'id, student_id, starts_on, ends_on, review_on, expected_return_note, ' +
  'reason_code, reason_note, source, cancelled_at, created_at';

/**
 * Live away windows, optionally narrowed to some students and to a date range.
 *
 * A range filter keeps a window whose span overlaps it at all, including an
 * open-ended one, which is why the upper bound tests `starts_on` and the lower
 * bound has to allow a null `ends_on` through.
 */
export async function loadAwayWindows(
  supabase: { from: (t: string) => any },
  opts: { studentIds?: string[]; from?: string; to?: string } = {},
): Promise<AwayWindow[]> {
  let q = supabase
    .from('nexus_student_away_windows')
    .select(AWAY_COLUMNS)
    .is('cancelled_at', null);
  if (opts.studentIds) {
    if (opts.studentIds.length === 0) return [];
    q = q.in('student_id', opts.studentIds);
  }
  if (opts.to) q = q.lte('starts_on', opts.to);
  if (opts.from) q = q.or(`ends_on.is.null,ends_on.gte.${opts.from}`);
  const { data, error } = await q;
  if (error) {
    // The table not being there yet is the one error worth surviving.
    //
    // `deploy-nexus` in .github/workflows/deploy.yml declares `needs:
    // [detect-changes]` and NOT `needs: [deploy-db-production]`, so the app
    // deploy and the migration run in parallel. Without this, the window
    // between Vercel going live and `supabase db push` finishing would 500 the
    // attendance register, the class screen and the parent portal: three
    // working screens taken down by a table nobody has declared a window in.
    //
    // Narrow on purpose. "No table" and "no rows" mean the same thing here,
    // because a window cannot exist before the table does, so reading it as
    // empty states nothing false about any student. Every other error still
    // throws, because those CAN be false: a truncated or failed read renders a
    // student who told us in advance as "missed, no reason", which is the exact
    // falsehood this feature was built to stop telling.
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data || []) as AwayWindow[];
}

/**
 * Postgres `undefined_table`, or PostgREST failing to find it in its schema
 * cache (which is what Supabase actually returns: a 404 with PGRST205).
 *
 * Exported because the register endpoint pages its own away read rather than
 * calling `loadAwayWindows`, so it needs the same judgement. Verified against
 * the real API: `{"code":"PGRST205","message":"Could not find the table
 * 'public.nexus_student_away_windows' in the schema cache"}`.
 */
export function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205';
}
