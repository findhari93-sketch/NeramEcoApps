import { RSVP_REASONS, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import type { RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';

/**
 * How the expected headcount is worded, in one place.
 *
 * Five surfaces render this number: the planner caption, the week block, the
 * month day list, the class panel and the availability sheet. One of them
 * wording it differently is exactly the drift the shared roster module exists
 * to end, and it is worse here than usual because the number has two
 * denominators behind it (see the route's own comment on why away leaves
 * `total` but never leaves the attendance rate).
 *
 * Type-only import, so nothing from the route reaches the browser bundle. Same
 * precedent as RegisterGrid importing RegisterResponse.
 */

/** "18 of 22 expected". Where there is room for the whole sentence. */
export function expectedLabel(s: RsvpSummary): string {
  return `${s.attending} of ${s.total} expected`;
}

/** "18 of 22". For a 116px week column, where there is not. */
export function compactLabel(s: RsvpSummary): string {
  return `${s.attending} of ${s.total}`;
}

/** "6 away", "1 away". Empty string at zero, so callers can concatenate. */
export function awayLabel(count: number): string {
  return count > 0 ? `${count} away` : '';
}

/** "4 stepped out". The existing vocabulary for a per-class opt-out. */
export function steppedOutLabel(count: number): string {
  return count > 0 ? `${count} stepped out` : '';
}

/** "28 on roll". The other denominator, spelled out so the two reconcile. */
export function onRollLabel(count: number): string {
  return `${count} on roll`;
}

/**
 * "24 of 28 available". The wording for a date with NO class scheduled.
 *
 * Deliberately not expectedLabel. On the default-attending model "expected"
 * means "has not said otherwise", and on a date with no class there is nothing
 * to say otherwise about: no RSVP row can exist, so `not_attending` is a
 * structural zero rather than a measured one. Printing "24 of 24 expected,
 * nobody stepped out" would assert a reply nobody was ever given the chance to
 * make. "Available" claims only what is true, that these students have not
 * declared themselves away.
 */
export function availableLabel(s: RsvpSummary): string {
  return `${s.attending} of ${s.on_roll} available`;
}

/** The other half of that honesty, for the caption under it. */
export const UNASKED_NOTE = 'Nothing scheduled yet, so nobody has been asked.';

export type TurnoutKey = 'good' | 'thin' | 'very_thin' | 'empty';

export interface Turnout {
  key: TurnoutKey;
  /** Short enough for a chip at 375px. */
  label: string;
}

/** At or above this share of the roll, the class is worth running as planned. */
export const TURNOUT_GOOD = 0.75;
/** Below this share, it is worth asking whether to run it at all. */
export const TURNOUT_THIN = 0.5;

/**
 * Is this day worth running?
 *
 * Measured against `on_roll`, NOT against `total`. This is the one number on
 * the screen that must not use the expected-headcount denominator: away
 * students leave `total`, so a night where 14 of 27 are on exam leave and the
 * remaining 13 all turn up reads as 13 of 13, a perfect 100%. That is precisely
 * the night the teacher opened this to find. Against the roll it reads 48%,
 * which is the truth they are deciding on.
 *
 * The verdict is a word, never a colour on its own: the chip that renders it
 * carries an icon and this label together, because half of "very thin" arriving
 * as a red pixel reaches neither a screen reader nor a colour-blind reader.
 */
export function turnoutVerdict(s: RsvpSummary): Turnout {
  if (s.on_roll <= 0) return { key: 'empty', label: 'Nobody on roll' };
  return verdictFor(s.attending, s.on_roll);
}

/**
 * The same verdict, read off the realistic headcount instead of the entitled one.
 *
 * Shares the thresholds with turnoutVerdict by construction rather than by
 * copying them, because a calendar cell saying "Thin" and the sheet behind it
 * saying "Good turnout" about the same night is the drift this file exists to
 * prevent.
 */
export function forecastVerdict(likely: number, onRoll: number): Turnout {
  if (onRoll <= 0) return { key: 'empty', label: 'Nobody on roll' };
  return verdictFor(likely, onRoll);
}

function verdictFor(head: number, onRoll: number): Turnout {
  const share = head / onRoll;
  if (share >= TURNOUT_GOOD) return { key: 'good', label: 'Good turnout' };
  if (share >= TURNOUT_THIN) return { key: 'thin', label: 'Thin' };
  return { key: 'very_thin', label: 'Very thin' };
}

/**
 * "2 exam clash, 1 unwell, 1 family", in the order the reasons are offered.
 *
 * This is the line that answers "why", which is what turns a count the teacher
 * cannot act on into one they can: nine students out on a school exam clash is
 * a class to move, nine out unwell is not. Empty string when nothing is
 * tallied, so callers can concatenate.
 */
export function reasonSummaryLabel(
  tally: Partial<Record<RsvpReasonCode, number>> | null | undefined,
): string {
  if (!tally) return '';
  return RSVP_REASONS.filter((r) => (tally[r.code] || 0) > 0)
    .map((r) => `${tally[r.code]} ${r.shortLabel.toLowerCase()}`)
    .join(', ');
}

/**
 * The whole thing as one sentence, for an aria-label.
 *
 * Several surfaces can only afford to show "18 of 22" or a bare icon. A screen
 * reader should still get the away count, because on those surfaces colour and
 * a 12px glyph are carrying it, and neither reaches a screen reader at all.
 */
export function announce(s: RsvpSummary): string {
  const parts = [expectedLabel(s), awayLabel(s.away), steppedOutLabel(s.not_attending)];
  return parts.filter(Boolean).join(', ');
}

// ── The realistic headcount ──────────────────────────────────────────────────
//
// Everything below words the forecast. It is kept in this file, beside the
// wording it has to sit next to, for the reason stated at the top: five
// surfaces render this number and the moment one of them phrases it itself the
// screens start disagreeing about the same night.

/** The shape the labels need. A structural subset of DayForecast. */
export interface ForecastLike {
  likely: number;
  expected: number;
  onRoll: number;
  away: number;
  declined: number;
  atRisk: number;
  estimated: boolean;
  /**
   * Optional on purpose. A caller built before the past/future split, and every
   * existing test fixture, omits these four and keeps the exact wording it had.
   * Absent `outcome` reads as 'forecast', which is what those callers meant.
   */
  outcome?: 'forecast' | 'actual' | 'past_unmeasured';
  actual?: number | null;
  discounted?: number;
  confidence?: 'firm' | 'soft';
}

/**
 * A class that has run and was never read from Teams.
 *
 * Deliberately NOT a number. The temptation is to keep showing the forecast,
 * and that is how "36 of 38" ended up describing a room that held twenty. The
 * only honest thing to say about an unread class is that we did not read it.
 */
export const NOT_READ_NOTE = 'Not read from Teams yet';

/** The headcount this day should be judged on, or null when there is none. */
export function headcountOf(f: ForecastLike): number | null {
  if (f.outcome === 'past_unmeasured') return null;
  if (f.outcome === 'actual') return f.actual ?? 0;
  return f.likely;
}

/**
 * The turnout verdict, or null when there is nothing to judge.
 *
 * Every caller must go through this rather than calling forecastVerdict with
 * `.likely` directly: a measured past date has to be judged on who actually
 * came, and an unread one must get no verdict at all. "Good turnout" over a
 * class nobody read is the screen inventing an opinion out of a missing row.
 */
export function forecastVerdictOf(f: ForecastLike): Turnout | null {
  const head = headcountOf(f);
  return head === null ? null : forecastVerdict(head, f.onRoll);
}

/**
 * One class block's headcount: what happened, or what is expected.
 *
 * THIS IS THE LINE THE COMPLAINT WAS ABOUT. A week block read "36 of 38" for a
 * class that had already run and held about twenty, because `compactLabel`
 * states an expectation and nothing downstream of it ever learned the class was
 * over. The day-level forecast had the same bug and is fixed in class-forecast;
 * this is the per-class surface, which reads a summary rather than a forecast
 * and so needs its own repair.
 *
 * `present` is undefined until Teams has been read, and an undefined count is
 * NOT a zero: one means nobody looked, the other means nobody came. Callers
 * must key their map on synced classes only, never default the number to 0.
 *
 * The denominator stays `total`, the same one the expectation used, so a
 * teacher comparing the two is comparing like with like: "36 of 38 expected"
 * becomes "20 of 38 came" rather than switching to a roll they never saw.
 */
export function classCountLabel(s: RsvpSummary, present?: number): string {
  if (present === undefined) return compactLabel(s);
  return `${present} of ${s.total} came`;
}

/**
 * The shortest honest form, for a month-grid pill with room for a few glyphs.
 *
 * `likelyLabel` is the right length for a card or a day list and far too long
 * for a cell in a 7-column grid: "Not read from Teams yet" is 23 characters in
 * a pill sized for 9, and it would either wrap the cell or truncate into
 * nonsense. Nothing is lost, because the cell's aria-label already carries the
 * whole sentence through announceForecast.
 *
 * "18 came" rather than "18 of 30 came": the denominator is the one part a
 * teacher can reconstruct from the row, and the past tense is what distinguishes
 * this from a forecast at a glance.
 */
export function compactForecastLabel(f: ForecastLike): string {
  if (f.outcome === 'past_unmeasured') return 'Not read';
  if (f.outcome === 'actual') return `${f.actual ?? 0} came`;
  return `${f.estimated ? '~' : ''}${f.likely} of ${f.onRoll}`;
}

/**
 * The headline above a day card or calendar cell.
 *
 * One place for the three suffixes. `decidable` is the caller's judgement that
 * the day is still worth asking about: false once its classes have ended, and
 * false on a date with nothing scheduled, where the honest word is "available"
 * rather than "likely" because nobody has been asked yet. A past date takes
 * neither, since "18 of 30 came likely" is the sort of line that teaches a
 * teacher to stop reading the number.
 */
export function forecastHeadline(f: ForecastLike, decidable: boolean): string {
  if (f.outcome === 'actual' || f.outcome === 'past_unmeasured') return likelyLabel(f);
  return decidable ? `${likelyLabel(f)} likely` : `${likelyLabel(f)} available`;
}

/**
 * "~16 of 30" on the calendar.
 *
 * The tilde is load-bearing and appears only when something was actually
 * discounted. "20 of 30" with nobody at risk is a count, not a prediction, and
 * decorating it as an estimate would teach the teacher to distrust the digits
 * on every other cell too.
 */
export function likelyLabel(f: ForecastLike): string {
  if (f.outcome === 'past_unmeasured') return NOT_READ_NOTE;
  if (f.outcome === 'actual') return `${f.actual ?? 0} of ${f.onRoll} came`;
  return `${f.estimated ? '~' : ''}${f.likely} of ${f.onRoll}`;
}

/**
 * The same, spelled out, where there is room for a word.
 *
 * A past date says nothing extra: "18 of 30 came" is already a whole sentence,
 * and "18 of 30 came likely" is the kind of line that makes a teacher stop
 * believing the screen.
 */
export function likelySentence(f: ForecastLike): string {
  if (f.outcome === 'actual' || f.outcome === 'past_unmeasured') return likelyLabel(f);
  return `${likelyLabel(f)} likely`;
}

/**
 * "30 on roll, 9 away, 1 stepped out, 4 rarely come".
 *
 * The sum behind the headline, in the order it is subtracted, so the teacher
 * can check the number rather than trust it. Zero terms are dropped: "0 stepped
 * out" is noise on the twenty-nine days a month where nobody did.
 */
export function forecastBreakdownLabel(f: ForecastLike): string {
  if (f.outcome === 'past_unmeasured') return NOT_READ_NOTE;
  const parts = [
    onRollLabel(f.onRoll),
    awayLabel(f.away),
    steppedOutLabel(f.declined),
    // A class that has run needs no prediction behind it. The roll, the away
    // days and the opt-outs still explain the shape of the room; "4 rarely
    // come" about a night already counted is noise.
    f.outcome === 'actual' ? '' : riskLabel(f),
    f.outcome === 'actual' ? '' : softNote(f),
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * "4 rarely come, about 3 fewer".
 *
 * Both halves, because under an expected-value forecast they are genuinely two
 * numbers. `atRisk` is how many people the "See who" sheet will name; the
 * second is how many chairs their records actually take off, which is smaller
 * because an unreliable student is not a certain absence. Printing only the
 * first leaves a teacher unable to reconcile the headline; printing only the
 * second leaves the sheet listing four names for a drop of three.
 */
function riskLabel(f: ForecastLike): string {
  if (f.atRisk <= 0) return '';
  const fewer = f.discounted ?? 0;
  return fewer > 0 ? `${f.atRisk} rarely come, about ${fewer} fewer` : `${f.atRisk} rarely come`;
}

/** Says out loud when the estimate is mostly the room's average. */
function softNote(f: ForecastLike): string {
  return f.confidence === 'soft' ? 'estimate is soft, little history to go on' : '';
}

/**
 * "In 2 of the last 18 classes (11%)".
 *
 * States the real denominator it judged on. The founder asked for "their last
 * 10"; the measured window is a date range, so quoting a fixed ten would be a
 * number nobody could check against the register. `judged` already has declared
 * away days taken out of it, which is why this can be shown to a student's
 * teacher without misrepresenting anyone who told us in advance.
 */
export function attendanceRecordLabel(record: { judged: number; rate: number | null }): string {
  if (record.rate === null || record.judged <= 0) return 'No attendance measured yet';
  return `In ${Math.round((record.rate / 100) * record.judged)} of the last ${record.judged} classes (${record.rate}%)`;
}

/**
 * The forecast as one sentence, for a screen reader.
 *
 * The calendar cell carries the verdict as a colour and a 12px glyph and the
 * count as four characters. Neither survives the trip to a screen reader, so
 * the whole sum goes in the accessible name.
 */
export function announceForecast(f: ForecastLike, dayLabel: string, scheduled: boolean): string {
  const head = headcountOf(f);
  const past = f.outcome === 'actual' || f.outcome === 'past_unmeasured';
  const parts = [
    dayLabel,
    past || scheduled ? likelySentence(f) : `${likelyLabel(f)} available`,
    // No verdict on a class nobody read. "Good turnout" about an unknown night
    // is the screen inventing an opinion out of a missing row.
    head === null ? '' : forecastVerdict(head, f.onRoll).label,
    forecastBreakdownLabel(f),
  ];
  return parts.filter(Boolean).join(', ');
}

export interface AvailabilitySegment {
  key: 'attending' | 'at_risk' | 'declined' | 'away';
  /** Percentage of the full roll, 0 to 100. */
  pct: number;
}

/**
 * The bar, measured against `on_roll` rather than `total`.
 *
 * Deliberate: the bar is the one place both denominators are visible at once.
 * Measuring it against `total` would hide the away block entirely, which is the
 * single fact the teacher opened the sheet to see.
 */
export function barSegments(s: RsvpSummary, atRisk = 0): AvailabilitySegment[] {
  if (s.on_roll <= 0) return [];
  const pct = (n: number) => (n / s.on_roll) * 100;
  // Carved OUT of attending, not added beside it, so the solid block always
  // measures `likely` and the bar and the headline cannot disagree.
  const risky = Math.min(Math.max(atRisk, 0), s.attending);
  return [
    { key: 'attending' as const, pct: pct(s.attending - risky) },
    // Only when there is something to carve out. A zero-width block is DOM that
    // renders nothing, reads as nothing, and still has to be explained to every
    // test that counts the segments.
    ...(risky > 0 ? [{ key: 'at_risk' as const, pct: pct(risky) }] : []),
    { key: 'declined' as const, pct: pct(s.not_attending) },
    { key: 'away' as const, pct: pct(s.away) },
  ];
}
