/**
 * Display strings for the college directory, following the directory copy
 * guide: lead with the number, short units on mobile, and say why a value is
 * missing ("Via JoSAA", "Not published") instead of N/A or a blank. Facts on
 * one line are separated by a middle dot, never a dash.
 */
import { COLLEGE_TYPES, EXAM_FILTERS, EXAM_LABELS } from './constants';
import { typeKey } from './listing-filter';

type Length = 'full' | 'short';

interface FeeFields {
  annual_fee_approx?: number | null;
  annual_fee_min?: number | null;
  counseling_systems?: string[] | null;
}

/** Compact rupees: ₹25K, ₹2.0L, ₹12.5L. */
export function formatRupees(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${value.toLocaleString('en-IN')}`;
}

/** Full rupees with Indian grouping: ₹2,00,000. */
export function formatRupeesFull(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function isJosaaOnly(c: { counseling_systems?: string[] | null }): boolean {
  const systems = c.counseling_systems ?? [];
  return systems.length > 0 && systems.every((s) => s === 'JoSAA');
}

export function annualFee(c: FeeFields): number | null {
  return c.annual_fee_approx ?? c.annual_fee_min ?? null;
}

/** "₹2.0L" (full) or "₹2.0L/yr" (short). Missing: "Via JoSAA" or "Not published". */
export function feeLabel(c: FeeFields, length: Length = 'full'): string {
  const fee = annualFee(c);
  if (fee == null) return isJosaaOnly(c) ? 'Via JoSAA' : 'Not published';
  return length === 'short' ? `${formatRupees(fee)}/yr` : formatRupees(fee);
}

/** "80" (full) or "80 seats" (short). Missing: "Via JoSAA" / "Not published". */
export function seatsLabel(
  c: { total_barch_seats?: number | null; counseling_systems?: string[] | null },
  length: Length = 'full'
): string {
  const seats = c.total_barch_seats;
  if (seats == null) return isJosaaOnly(c) ? (length === 'short' ? 'JEE only' : 'Via JoSAA') : 'Not published';
  return length === 'short' ? `${seats} seats` : String(seats);
}

interface CutoffFields {
  cutoff_value?: number | null;
  cutoff_type?: string | null;
  cutoff_system?: string | null;
  cutoff_year?: string | null;
}

export function hasCutoff(c: CutoffFields): boolean {
  return c.cutoff_value != null;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-IN') : String(Math.round(n * 100) / 100);
}

/** Year label from an academic year like "2025-26" or "2025". */
function cutoffYearLabel(year: string | null | undefined): string {
  if (!year) return '';
  const m = year.match(/\d{4}/);
  return m ? m[0] : year;
}

/**
 * "TNEA 2025 · 182.5", "JoSAA 2025 · rank 1,234" (full) or "Cutoff 182.5" /
 * "Rank 1,234" (short). Null when the college has no cutoff.
 */
export function cutoffLabel(c: CutoffFields, length: Length = 'full'): string | null {
  if (c.cutoff_value == null) return null;
  const value = trimNumber(c.cutoff_value);
  const isRank = c.cutoff_type === 'rank';
  const isPct = c.cutoff_type === 'percentile';
  if (length === 'short') return isRank ? `Rank ${value}` : `Cutoff ${value}${isPct ? '%ile' : ''}`;
  const head = [c.cutoff_system, cutoffYearLabel(c.cutoff_year)].filter(Boolean).join(' ');
  const body = isRank ? `rank ${value}` : `${value}${isPct ? ' percentile' : ''}`;
  return head ? `${head} · ${body}` : body;
}

/** Counselling names, by every spelling the DB uses. */
const SYSTEM_NAMES: Record<string, string> = {
  TNEA: 'TNEA',
  JOSAA: 'JoSAA',
  KEAM: 'KEAM',
  KCET: 'KCET',
  COMEDK: 'COMEDK',
  'AP EAPCET': 'AP EAPCET',
  APSCHE: 'APSCHE',
  CENTAC: 'CENTAC',
  'TS EAPCET': 'TS EAPCET',
  'TS EAMCET': 'TS EAPCET',
  'MHT CET': 'MHT CET',
  WBJEE: 'WBJEE',
  UPSEE: 'UPSEE',
  OJEE: 'OJEE',
  REAP: 'REAP',
  BCECE: 'BCECE',
  GUJCET: 'GUJCET',
};

/**
 * How admission happens: counselling_systems plus counselling names that were
 * stored in accepted_exams instead (some rows list "TNEA" as an exam).
 */
export function admissionSystems(c: { counseling_systems?: string[] | null; accepted_exams?: string[] | null }): string[] {
  const out: string[] = [];
  for (const raw of [...(c.counseling_systems ?? []), ...(c.accepted_exams ?? [])]) {
    const key = (raw ?? '').trim().toUpperCase().replace(/[_-]/g, ' ');
    const name = SYSTEM_NAMES[key];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Counselling systems as the "Admission via" value: "TNEA", "JoSAA · KCET". */
export function admissionLabel(c: { counseling_systems?: string[] | null; accepted_exams?: string[] | null }): string {
  const systems = admissionSystems(c);
  return systems.length ? systems.slice(0, 2).join(' · ') : 'Check with college';
}

/** "₹4.2 LPA". Null when unknown (the slot is hidden, not shown as N/A). */
export function packageLabel(c: { avg_placement_salary?: number | null }): string | null {
  const v = c.avg_placement_salary;
  if (v == null || v <= 0) return null;
  // Stored in rupees per year; older rows store LPA directly.
  const lpa = v >= 1000 ? v / 100000 : v;
  return `₹${lpa.toFixed(1)} LPA`;
}

/** "Government" / "Govt", "Deemed university" / "Deemed". Unknown types pass through. */
export function typeLabel(type: string | null | undefined, length: Length = 'full'): string {
  const key = typeKey(type);
  if (!key) return 'Type not listed';
  const def = COLLEGE_TYPES.find((t) => t.value.toLowerCase() === key);
  if (def) return length === 'short' ? def.short : def.label;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Display name of one accepted_exams value: "JEE Main Paper 2" / "JEE P2". */
export function examLabel(exam: string, length: Length = 'full'): string {
  const def = EXAM_FILTERS.find((e) => (e.matches as readonly string[]).includes(exam) || e.value === exam);
  if (def) return length === 'short' ? def.short : def.label;
  return EXAM_LABELS[exam] ?? exam;
}

/** Architecture entrance exams first, deduplicated: ["NATA", "JEE Main Paper 2"]. */
export function examList(accepted: string[] | null | undefined, length: Length = 'full'): string[] {
  const out: string[] = [];
  for (const def of EXAM_FILTERS) {
    if ((accepted ?? []).some((e) => (def.matches as readonly string[]).includes(e))) {
      out.push(length === 'short' ? def.short : def.label);
    }
  }
  return out;
}

/** "NAAC A+" or "No NAAC grade". */
export function naacLabel(grade: string | null | undefined): string {
  return grade ? `NAAC ${grade}` : 'No NAAC grade';
}

/** "4.2". Null when there are no reviews. */
export function ratingLabel(c: { review_avg?: number | null; review_count?: number | null }): string | null {
  if (c.review_avg == null || !c.review_count) return null;
  return Number(c.review_avg).toFixed(1);
}

/** Two-letter initials for the logo fallback tile: "Sir J.J. College" → "SJ". */
export function initials(name: string): string {
  const skip = new Set(['of', 'and', 'the', 'for', 'in', '&']);
  const words = name
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !skip.has(w.toLowerCase()));
  const letters = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return letters.join('') || name.slice(0, 2).toUpperCase();
}

/** Short display name for chips and trays. */
export function shortName(c: { short_name?: string | null; name: string }): string {
  if (c.short_name && c.short_name.trim()) return c.short_name.trim();
  return c.name.length > 28 ? `${c.name.slice(0, 26).trim()}…` : c.name;
}

export function collegeHref(c: { state_slug?: string | null; slug: string }): string {
  return `/colleges/${c.state_slug ?? 'india'}/${c.slug}`;
}
