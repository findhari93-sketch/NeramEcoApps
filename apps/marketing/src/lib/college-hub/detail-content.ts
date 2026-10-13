/**
 * Facts-only text and data for the college detail page: the answer-first
 * summary, cutoff tables, sources line, breadcrumbs and internal links.
 *
 * Everything here is pure and built on the server, so the same strings land
 * in the HTML, the JSON-LD and the tests. A missing fact drops its sentence,
 * row or link; nothing ever prints "N/A" or "updated soon".
 */
import { EXAM_LABELS, FEE_CATEGORY_LABELS } from './constants';
import type { College, CollegeCutoff, CollegeListItem } from './types';

export const SITE_URL = 'https://neramclasses.com';

type Named = Pick<College, 'name' | 'short_name'>;

/** The name students search for: the short name when there is one. */
export function displayName(c: Named): string {
  return c.short_name?.trim() || c.name;
}

export function canonicalCollegePath(c: Pick<College, 'slug' | 'state_slug'>): string {
  return `/colleges/${c.state_slug ?? 'india'}/${c.slug}`;
}

/** Locale prefix for internal hrefs (English has none: localePrefix 'as-needed'). */
export function localePrefix(locale: string): string {
  return locale === 'en' ? '' : `/${locale}`;
}

const uniq = (list: string[]) => Array.from(new Set(list.filter(Boolean)));

/** Human labels for accepted exams, de-duplicated after mapping. */
export function examLabels(exams: string[] | null | undefined): string[] {
  return uniq((exams ?? []).map((e) => EXAM_LABELS[e] ?? e.trim()));
}

/** Counselling system labels: 'AP_EAPCET' -> 'AP EAPCET'; 'other' is dropped. */
export function systemLabels(systems: string[] | null | undefined): string[] {
  return uniq((systems ?? []).filter((s) => s && s.toLowerCase() !== 'other').map((s) => s.replace(/_/g, ' ').trim()));
}

/** "A, B and C". */
export function joinAnd(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** "A, B or C". */
export function joinOr(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
}

/** ₹1.5 lakh, ₹12 lakh, or ₹85,000 below one lakh. */
export function feeText(amount: number): string {
  if (amount >= 100000) {
    const lakh = (amount / 100000).toFixed(1).replace(/\.0$/, '');
    return `₹${lakh} lakh`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** The annual fee figure we can state, and whether it is a floor ("from"). */
export function annualFee(c: Pick<College, 'annual_fee_approx' | 'annual_fee_min'>): { amount: number; from: boolean } | null {
  if (c.annual_fee_approx) return { amount: c.annual_fee_approx, from: false };
  if (c.annual_fee_min) return { amount: c.annual_fee_min, from: true };
  return null;
}

const TYPE_LABELS: Record<string, string> = {
  government: 'government',
  private: 'private',
  deemed: 'deemed university',
  'government aided': 'government aided',
};

/** Lower-case type for prose, or null when the type is unknown. */
export function typeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return TYPE_LABELS[type.trim().toLowerCase()] ?? type.trim().toLowerCase();
}

/** "Private", "Government": for lists and tables. */
export function typeTitle(type: string | null | undefined): string | null {
  const t = typeLabel(type);
  return t ? t.replace(/\b\w/g, (m) => m.toUpperCase()) : null;
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

// ─── Answer-first summary ────────────────────────────────────────────────────

export type SummaryInput = Pick<
  College,
  | 'name'
  | 'short_name'
  | 'city'
  | 'state'
  | 'type'
  | 'established_year'
  | 'affiliated_university'
  | 'total_barch_seats'
  | 'coa_approved'
  | 'annual_fee_approx'
  | 'annual_fee_min'
  | 'accepted_exams'
  | 'counseling_systems'
  | 'naac_grade'
  | 'nirf_rank_architecture'
  | 'nirf_year'
>;

export const SUMMARY_MAX_WORDS = 70;

/**
 * 40 to 70 words built only from known facts. Sentences are picked by
 * priority under the word cap, then printed in reading order. With very
 * little data the summary is shorter rather than padded.
 */
export function buildCollegeSummary(c: SummaryInput): string {
  const place = [c.city, c.state].filter(Boolean).join(', ');
  type S = { order: number; priority: number; text: string };
  const sentences: S[] = [];

  sentences.push({
    order: 0,
    priority: 0,
    text: `${c.name} offers the five-year B.Arch programme${place ? ` in ${place}` : ''}.`,
  });

  // Type, founding year, university
  const tl = typeLabel(c.type);
  const est = c.established_year ? `established in ${c.established_year}` : '';
  const aff = c.affiliated_university ? `affiliated to ${c.affiliated_university}` : '';
  if (tl || est || aff) {
    let text: string;
    if (tl) {
      const tail = [est, aff].filter(Boolean).join(' and ');
      text = `It is ${article(tl)} ${tl} college${tail ? `, ${tail}` : ''}.`;
    } else if (est && aff) {
      text = `It was ${est} and is ${aff}.`;
    } else if (est) {
      text = `It was ${est}.`;
    } else {
      text = `It is ${aff}.`;
    }
    sentences.push({ order: 1, priority: 4, text });
  }

  // Seats and COA
  if (c.total_barch_seats) {
    sentences.push({
      order: 2,
      priority: 2,
      text: `It has ${c.total_barch_seats} B.Arch seats${c.coa_approved ? ' approved by the Council of Architecture (COA)' : ''}.`,
    });
  } else if (c.coa_approved) {
    sentences.push({ order: 2, priority: 2, text: 'The B.Arch programme is approved by the Council of Architecture (COA).' });
  }

  // Fee
  const fee = annualFee(c);
  if (fee) {
    sentences.push({
      order: 3,
      priority: 1,
      text: fee.from
        ? `Tuition starts at about ${feeText(fee.amount)} a year.`
        : `The approximate tuition fee is ${feeText(fee.amount)} a year.`,
    });
  }

  // Admission route
  const exams = examLabels(c.accepted_exams);
  const systems = systemLabels(c.counseling_systems);
  if (exams.length && systems.length) {
    sentences.push({
      order: 4,
      priority: 1,
      text: `Admission is on ${joinOr(exams)} scores, with seats allotted through ${joinAnd(systems)} counselling.`,
    });
  } else if (exams.length) {
    sentences.push({ order: 4, priority: 1, text: `Admission is on ${joinOr(exams)} scores.` });
  } else if (systems.length) {
    sentences.push({ order: 4, priority: 1, text: `Seats are allotted through ${joinAnd(systems)} counselling.` });
  }

  // Accreditation and ranking
  const naac = c.naac_grade ? `holds NAAC ${c.naac_grade} accreditation` : '';
  const nirf = c.nirf_rank_architecture
    ? `is ranked ${c.nirf_rank_architecture} in the NIRF Architecture ranking${c.nirf_year ? ` ${c.nirf_year}` : ''}`
    : '';
  if (naac || nirf) {
    sentences.push({ order: 5, priority: 3, text: `The college ${[naac, nirf].filter(Boolean).join(' and ')}.` });
  }

  const chosen: S[] = [];
  let words = 0;
  for (const s of [...sentences].sort((a, b) => a.priority - b.priority || a.order - b.order)) {
    const w = wordCount(s.text);
    if (chosen.length > 0 && words + w > SUMMARY_MAX_WORDS) continue;
    chosen.push(s);
    words += w;
  }
  return chosen
    .sort((a, b) => a.order - b.order)
    .map((s) => s.text)
    .join(' ');
}

// ─── Cutoff tables ───────────────────────────────────────────────────────────

export interface CutoffTable {
  system: string;
  label: string;
  cutoffType: CollegeCutoff['cutoff_type'];
  /** Newest first, at most three. */
  years: string[];
  rows: Array<{ category: string; label: string; values: Array<string | null> }>;
  /** Years with data for the sparkline's category, oldest first. */
  trendPoints: number;
  trendCategory: string;
}

const CATEGORY_ORDER = Object.keys(FEE_CATEGORY_LABELS);

function categoryLabel(cat: string): string {
  return FEE_CATEGORY_LABELS[cat.toLowerCase()] ?? cat.replace(/_/g, ' ').toUpperCase();
}

export function formatCutoffValue(value: number, type: CollegeCutoff['cutoff_type']): string {
  if (type === 'rank') return Math.round(value).toLocaleString('en-IN');
  if (type === 'percentile') return `${value}`;
  return `${value}`;
}

export const CUTOFF_TYPE_LABELS: Record<CollegeCutoff['cutoff_type'], string> = {
  rank: 'Closing rank',
  score: 'Cutoff score',
  percentile: 'Cutoff percentile',
};

/**
 * One table per counselling system the college takes part in (its own list
 * first, then any other system the cutoff rows mention): last three years by
 * category, using the final round of each year as the closing figure.
 */
export function buildCutoffTables(cutoffs: CollegeCutoff[], systems: string[] | null | undefined): CutoffTable[] {
  const valid = cutoffs.filter((c) => c.cutoff_value !== null && c.cutoff_value !== undefined && c.academic_year);
  if (!valid.length) return [];
  const order = uniq([...(systems ?? []), ...valid.map((c) => c.counseling_system)]);
  const tables: CutoffTable[] = [];
  for (const system of order) {
    const rows = valid.filter((c) => c.counseling_system === system);
    if (!rows.length) continue;
    // Final round per (year, category)
    const best = new Map<string, CollegeCutoff>();
    for (const r of rows) {
      const key = `${r.academic_year}|${r.category}`;
      const prev = best.get(key);
      if (!prev || (r.round_number ?? 0) > (prev.round_number ?? 0)) best.set(key, r);
    }
    const years = uniq(rows.map((r) => r.academic_year)).sort((a, b) => b.localeCompare(a)).slice(0, 3);
    const cats = uniq(rows.filter((r) => years.includes(r.academic_year)).map((r) => r.category)).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a.toLowerCase());
      const ib = CATEGORY_ORDER.indexOf(b.toLowerCase());
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    const cutoffType = rows[0].cutoff_type;
    const tableRows = cats.map((cat) => ({
      category: cat,
      label: categoryLabel(cat),
      values: years.map((y) => {
        const hit = best.get(`${y}|${cat}`);
        return hit && hit.cutoff_value !== null ? formatCutoffValue(hit.cutoff_value, hit.cutoff_type) : null;
      }),
    }));
    const trendCategory = cats[0];
    const trendPoints = uniq(rows.filter((r) => r.category === trendCategory).map((r) => r.academic_year)).length;
    tables.push({
      system,
      label: systemLabels([system])[0] ?? system,
      cutoffType,
      years,
      rows: tableRows,
      trendPoints,
      trendCategory,
    });
  }
  return tables;
}

/** Newest academic year across the tables, for the section heading. */
export function latestCutoffYear(tables: CutoffTable[]): string | null {
  const ys = tables.flatMap((t) => t.years).sort((a, b) => b.localeCompare(a));
  return ys[0] ?? null;
}

// ─── Last updated + sources ──────────────────────────────────────────────────

export type SourcesInput = Pick<
  College,
  'coa_approved' | 'naac_grade' | 'nirf_rank_architecture' | 'nirf_year' | 'website' | 'last_data_update' | 'updated_at'
>;

/** Only the sources whose data the page actually shows. */
export function buildSources(c: SourcesInput, cutoffSystems: string[] = []): string[] {
  const out: string[] = [];
  if (c.coa_approved) out.push('Council of Architecture (COA)');
  if (c.naac_grade) out.push('NAAC');
  if (c.nirf_rank_architecture) out.push(`NIRF${c.nirf_year ? ` ${c.nirf_year}` : ''}`);
  const sys = systemLabels(cutoffSystems);
  if (sys.length) out.push(`${joinAnd(sys)} allotment data`);
  if (c.website) out.push('college website');
  return out;
}

/** ISO date the page's facts were last touched, or null. */
export function lastUpdatedIso(c: Pick<College, 'last_data_update' | 'updated_at'>): string | null {
  for (const v of [c.last_data_update, c.updated_at]) {
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** "3 October 2026", fixed to IST so server and browser agree. */
export function formatIstDate(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}`;
}

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

export interface CrumbItem {
  name: string;
  /** Path without locale. */
  path: string;
}

/** One list for the visible breadcrumb and BreadcrumbList JSON-LD. */
export function buildCollegeBreadcrumbs(c: Pick<College, 'name' | 'short_name' | 'slug' | 'state' | 'state_slug'>): CrumbItem[] {
  return [
    { name: 'Home', path: '/' },
    { name: 'Colleges', path: '/colleges' },
    { name: c.state, path: `/colleges/${c.state_slug ?? 'india'}` },
    { name: displayName(c), path: canonicalCollegePath(c) },
  ];
}

// ─── Internal links ──────────────────────────────────────────────────────────

export interface InternalLink {
  href: string;
  label: string;
  /** Query-string pages (compare) are not for crawling. */
  nofollow?: boolean;
}

/** Counselling system key -> /counseling/{slug} guide. Linked only if routed. */
export const COUNSELLING_GUIDE_SLUGS: Record<string, string> = {
  TNEA: 'tnea-barch',
  JoSAA: 'josaa',
  KEAM: 'keam-arch',
  KCET: 'kea-barch',
  MHT_CET: 'mht-cet-barch',
  WBJEE: 'wbjee-barch',
  OJEE: 'ojee-barch',
  REAP: 'reap-barch',
  APSCHE: 'ap-barch',
  AP_EAPCET: 'ap-barch',
  TS_EAPCET: 'tg-barch',
  UPSEE: 'uptac-barch',
  BCECE: 'bceceb-ugeac',
  CENTAC: 'centac-barch',
};

export interface LinkContext {
  locale: string;
  similar: Pick<CollegeListItem, 'slug' | 'name' | 'short_name'>[];
  /** City slugs whose /colleges/city/{slug} listing has 2+ colleges. */
  cityListingSlugs: Set<string>;
  /** Slugs of /counseling/{slug} guides that exist. */
  routedGuideSlugs: Set<string>;
  /** Counselling keys with a /colleges/counseling/{slug} listing. */
  counselingListingKeys: Set<string>;
  /** NATA coaching page for the college city, when one exists. */
  cityCoachingPath: string | null;
  /** NATA coaching page for the state, used when the city has none. */
  stateCoachingPath: string | null;
}

export type LinkCollege = Pick<
  College,
  'name' | 'short_name' | 'slug' | 'city' | 'city_slug' | 'state' | 'state_slug' | 'counseling_systems' | 'nirf_rank_architecture'
>;

/** Links to pages that exist, in the order a student would want them. */
export function buildInternalLinks(c: LinkCollege, ctx: LinkContext): InternalLink[] {
  const p = localePrefix(ctx.locale);
  const n = displayName(c);
  const links: InternalLink[] = [];

  if (ctx.similar.length) {
    const others = ctx.similar.slice(0, 2);
    links.push({
      href: `${p}/colleges/compare?slugs=${[c.slug, ...others.map((o) => o.slug)].join(',')}`,
      label: `Compare ${n} with ${joinAnd(others.map((o) => displayName(o)))}`,
      nofollow: true,
    });
  }

  for (const sys of c.counseling_systems ?? []) {
    const label = systemLabels([sys])[0];
    if (!label) continue;
    if (sys === 'TNEA') links.push({ href: `${p}/colleges/tnea`, label: 'All TNEA B.Arch colleges' });
    else if (sys === 'JoSAA') links.push({ href: `${p}/colleges/josaa`, label: 'All JoSAA B.Arch colleges' });
    else if (ctx.counselingListingKeys.has(sys)) {
      links.push({ href: `${p}/colleges/counseling/${sys.toLowerCase().replace(/_/g, '-')}`, label: `All ${label} B.Arch colleges` });
    }
    const guide = COUNSELLING_GUIDE_SLUGS[sys];
    if (guide && ctx.routedGuideSlugs.has(guide)) {
      links.push({ href: `${p}/counseling/${guide}`, label: `${label} B.Arch counselling guide` });
    }
  }

  if (c.city_slug && ctx.cityListingSlugs.has(c.city_slug)) {
    links.push({ href: `${p}/colleges/city/${c.city_slug}`, label: `All B.Arch colleges in ${c.city}` });
  }
  if (c.state_slug) {
    links.push({ href: `${p}/colleges/${c.state_slug}`, label: `All B.Arch colleges in ${c.state}` });
  }
  if (c.nirf_rank_architecture) {
    links.push({ href: `${p}/colleges/rankings/nirf/${c.slug}`, label: `${n} NIRF ranking history` });
  }
  links.push({ href: `${p}/nata-hub`, label: 'NATA exam guide' });
  if (ctx.cityCoachingPath) {
    links.push({ href: `${p}${ctx.cityCoachingPath}`, label: `NATA coaching in ${c.city}` });
  } else if (ctx.stateCoachingPath) {
    links.push({ href: `${p}${ctx.stateCoachingPath}`, label: `NATA coaching in ${c.state}` });
  }

  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));
}
