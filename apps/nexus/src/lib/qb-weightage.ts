/**
 * Chapter weightage: which chapters a past-paper section leans on, year by year.
 *
 * The RPC (nexus_qb_chapter_weightage) returns raw counts from the live tags.
 * Everything a student sees is derived here, in pure functions, so the rules are
 * tested in one place and the page only draws.
 *
 * THE RULES THAT MATTER
 *
 * Share, not counts. 2019 has three JEE papers and most years have one, and the
 * 2006-07 maths sections had 40 questions while later ones have 25-30. Raw counts
 * would make 2019 look like the year everything was asked. Each year's count is
 * divided by that year's section size, the shares are averaged so every exam year
 * counts once, and the result is shown as questions in today's paper.
 *
 * Missing is not zero. Years with no paper in the bank are a gap column, never a
 * row of empty cells, or "not in the bank yet" reads as "never asked".
 *
 * A year whose section is much smaller than usual (under 60% of the median per
 * paper) is only partly in the bank. It is drawn hatched and left out of every
 * average, so half a paper cannot drag a chapter down.
 *
 * The 10 come from a visible formula, not a model: 60% how many questions a
 * chapter gets (relative to the top chapter) and 40% how regularly it is asked.
 */

export type WeightageSection = 'math' | 'aptitude' | 'drawing' | 'planning';
export type WeightageWindow = 'all' | 'recent';
export type ChapterTrend = 'rising' | 'falling' | 'stopped' | 'new' | 'steady';

export interface QBWeightagePayload {
  exam_type: string;
  papers: { year: number; papers: number }[];
  totals: { section: string; year: number; questions: number }[];
  cells: { section: string; year: number; chapter: string; questions: number }[];
  chapters: {
    slug: string;
    label: string;
    unit: string;
    unit_label: string;
    unit_order: number;
    chapter_order: number;
    has_children: boolean;
  }[];
}

export type YearColumn =
  | { kind: 'year'; year: number; papers: number; questions: number; partial: boolean }
  | { kind: 'gap'; from: number; to: number };

export interface ChapterStat {
  slug: string;
  label: string;
  /** Root subject tag, or null when the chapter is its own root (most aptitude topics). */
  unit: string | null;
  unitLabel: string | null;
  /** Raw question count per exam year (all papers of that year together). */
  counts: Record<number, number>;
  /** Average questions in today's paper, over the chosen window. */
  perPaper: number;
  /** Years in the window this chapter was asked, and the window's length. */
  asked: number;
  of: number;
  /** Same, over every counted year, whatever the window. */
  askedAll: number;
  ofAll: number;
  trend: ChapterTrend;
  lastYear: number | null;
  /** Questions in the bank for this chapter and section, across all years. */
  total: number;
  /** Average share of the section in the recent and the earlier years. */
  recentShare: number;
  olderShare: number;
  score: number;
}

export interface SectionWeightage {
  section: WeightageSection;
  window: WeightageWindow;
  /** Questions in one paper of this section today (latest full year). */
  paperSize: number;
  columns: YearColumn[];
  countedYears: number[];
  recentYears: number[];
  /** True when there are enough years to call anything rising or falling. */
  hasTrends: boolean;
  /** 'thin' sections (drawing) are too short a history to chart. */
  mode: 'full' | 'thin';
  totalQuestions: number;
  /** Units in display order, or empty when chapters have no parent units. */
  units: { slug: string; label: string }[];
  chapters: ChapterStat[];
}

export const RECENT_YEARS = 5;
/** A trend needs a "before" as well as an "after". */
const MIN_YEARS_FOR_TRENDS = RECENT_YEARS + 3;
const MIN_YEARS_FOR_CHARTS = 4;
const MIN_QUESTIONS_FOR_CHARTS = 40;
const PARTIAL_THRESHOLD = 0.6;

export const SECTION_LABELS: Record<WeightageSection, string> = {
  math: 'Mathematics',
  aptitude: 'Aptitude',
  drawing: 'Drawing',
  planning: 'Planning',
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sections present in the payload, in a fixed order. */
export function availableSections(payload: QBWeightagePayload | null | undefined): WeightageSection[] {
  if (!payload) return [];
  const present = new Set(payload.totals.filter((t) => t.questions > 0).map((t) => t.section));
  return (['math', 'aptitude', 'planning', 'drawing'] as const).filter((s) => present.has(s));
}

/** Year columns for one section: real years, with runs of missing years folded into one gap. */
export function buildColumns(payload: QBWeightagePayload, section: WeightageSection): YearColumn[] {
  const papersByYear = new Map(payload.papers.map((p) => [p.year, Math.max(1, p.papers)]));
  const rows = payload.totals
    .filter((t) => t.section === section && t.questions > 0)
    .sort((a, b) => a.year - b.year);
  if (!rows.length) return [];

  const perPaper = rows.map((r) => r.questions / (papersByYear.get(r.year) ?? 1));
  const med = median(perPaper);
  const out: YearColumn[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (prev && r.year - prev.year > 1) out.push({ kind: 'gap', from: prev.year + 1, to: r.year - 1 });
    out.push({
      kind: 'year',
      year: r.year,
      papers: papersByYear.get(r.year) ?? 1,
      questions: r.questions,
      partial: rows.length >= 3 && perPaper[i] < med * PARTIAL_THRESHOLD,
    });
  });
  return out;
}

export function classifyTrend(recentShare: number, olderShare: number, paperSize: number): ChapterTrend {
  if (recentShare === 0 && olderShare > 0) return 'stopped';
  if (olderShare === 0 && recentShare > 0) return 'new';
  // A ratio alone would flag 0.1 -> 0.2 questions a paper as "rising". The
  // change also has to be worth about a third of a question in today's paper.
  const change = (recentShare - olderShare) * paperSize;
  if (recentShare >= olderShare * 1.4 && change >= 0.3) return 'rising';
  if (recentShare <= olderShare * 0.6 && -change >= 0.3) return 'falling';
  return 'steady';
}

export function buildSectionWeightage(
  payload: QBWeightagePayload,
  section: WeightageSection,
  window: WeightageWindow = 'all',
): SectionWeightage | null {
  const columns = buildColumns(payload, section);
  const years = columns.filter((c): c is Extract<YearColumn, { kind: 'year' }> => c.kind === 'year');
  if (!years.length) return null;

  const counted = years.filter((y) => !y.partial);
  const countedYears = counted.map((y) => y.year);
  const sectionSize = new Map(counted.map((y) => [y.year, y.questions]));
  const latest = counted[counted.length - 1] ?? years[years.length - 1];
  const paperSize = Math.max(1, Math.round(latest.questions / latest.papers));

  const hasTrends = countedYears.length >= MIN_YEARS_FOR_TRENDS;
  const recentYears = countedYears.slice(-RECENT_YEARS);
  const olderYears = hasTrends ? countedYears.slice(0, -RECENT_YEARS) : [];
  const effectiveWindow: WeightageWindow = hasTrends ? window : 'all';
  const windowYears = effectiveWindow === 'recent' ? recentYears : countedYears;
  const totalQuestions = years.reduce((a, y) => a + y.questions, 0);

  const meta = new Map(payload.chapters.map((c) => [c.slug, c]));
  const counts = new Map<string, Record<number, number>>();
  for (const cell of payload.cells) {
    if (cell.section !== section) continue;
    const m = meta.get(cell.chapter);
    // A unit that has chapters of its own ("Trigonometry" with nothing finer)
    // is a question still waiting to be sorted, not a chapter to study.
    if (!m || m.has_children) continue;
    const row = counts.get(cell.chapter) ?? {};
    row[cell.year] = (row[cell.year] ?? 0) + cell.questions;
    counts.set(cell.chapter, row);
  }

  const share = (row: Record<number, number>, y: number) => (row[y] ?? 0) / (sectionSize.get(y) || 1);

  const chapters: ChapterStat[] = [...counts.entries()].map(([slug, row]) => {
    const m = meta.get(slug)!;
    const recentShare = avg(recentYears.map((y) => share(row, y)));
    const olderShare = avg(olderYears.map((y) => share(row, y)));
    const askedYears = countedYears.filter((y) => row[y]);
    const allAsked = Object.keys(row).map(Number).filter((y) => row[y] > 0).sort((a, b) => a - b);
    const hasUnit = m.unit !== m.slug;
    return {
      slug,
      label: m.label,
      unit: hasUnit ? m.unit : null,
      unitLabel: hasUnit ? m.unit_label : null,
      counts: row,
      perPaper: avg(windowYears.map((y) => share(row, y))) * paperSize,
      asked: windowYears.filter((y) => row[y]).length,
      of: windowYears.length,
      askedAll: askedYears.length,
      ofAll: countedYears.length,
      trend: hasTrends ? classifyTrend(recentShare, olderShare, paperSize) : 'steady',
      lastYear: allAsked.length ? allAsked[allAsked.length - 1] : null,
      total: Object.values(row).reduce((a, b) => a + b, 0),
      recentShare,
      olderShare,
      score: 0,
    };
  });

  const maxPer = Math.max(0, ...chapters.map((c) => c.perPaper));
  for (const c of chapters) {
    c.score = 0.6 * (maxPer ? c.perPaper / maxPer : 0) + 0.4 * (c.of ? c.asked / c.of : 0);
  }
  chapters.sort((a, b) => b.perPaper - a.perPaper || a.label.localeCompare(b.label));

  const unitOrder = new Map<string, { label: string; order: number }>();
  for (const c of chapters) {
    if (!c.unit) continue;
    const m = meta.get(c.slug)!;
    if (!unitOrder.has(c.unit)) unitOrder.set(c.unit, { label: m.unit_label, order: m.unit_order });
  }
  // Units only mean something when most chapters have one. Aptitude topics are
  // their own roots, so colouring by "unit" there would give every chapter its
  // own colour.
  const withUnit = chapters.filter((c) => c.unit).length;
  const units =
    withUnit >= chapters.length * 0.6
      ? [...unitOrder.entries()]
          .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label))
          .map(([slug, u]) => ({ slug, label: u.label }))
      : [];

  return {
    section,
    window: effectiveWindow,
    paperSize,
    columns,
    countedYears,
    recentYears,
    hasTrends,
    mode:
      countedYears.length >= MIN_YEARS_FOR_CHARTS && totalQuestions >= MIN_QUESTIONS_FOR_CHARTS && chapters.length > 0
        ? 'full'
        : 'thin',
    totalQuestions,
    units,
    chapters,
  };
}

export const TIERS = [
  { label: 'Must do', from: 0, to: 3 },
  { label: 'Should do', from: 3, to: 7 },
  { label: 'If time', from: 7, to: 10 },
] as const;

/** The "start with these" list: best score first, ties broken by questions per paper. */
export function topChapters(s: SectionWeightage, n = 10): ChapterStat[] {
  return [...s.chapters].sort((a, b) => b.score - a.score || b.perPaper - a.perPaper).slice(0, n);
}

/** One plain line on why a chapter is in the list. */
export function chapterReason(c: ChapterStat, window: WeightageWindow): string {
  const parts: string[] = [];
  if (c.asked === c.of) parts.push(window === 'recent' ? `Asked in all ${c.of} recent years` : 'Asked every year');
  else parts.push(`Asked in ${c.asked} of ${c.of} ${window === 'recent' ? 'recent ' : ''}years`);
  parts.push(`${formatPerPaper(c.perPaper)} a paper`);
  if (c.trend === 'rising') parts.push('rising lately');
  if (c.trend === 'falling') parts.push('less common lately');
  return parts.join(' · ');
}

export interface TrendGroup {
  key: 'more' | 'regular' | 'less' | 'rare';
  label: string;
  hint: string;
  chapters: ChapterStat[];
}

/** The phone version of the trend chart: the same four corners as a list. */
export function trendGroups(s: SectionWeightage): TrendGroup[] {
  const groups: TrendGroup[] = [
    { key: 'more', label: 'Coming up more', hint: 'More questions in recent years than before', chapters: [] },
    { key: 'regular', label: 'Regulars', hint: 'Asked in most years, holding steady', chapters: [] },
    { key: 'less', label: 'Coming up less', hint: 'Fewer questions in recent years', chapters: [] },
    { key: 'rare', label: 'Rare', hint: 'Asked in fewer than half the years', chapters: [] },
  ];
  const by = Object.fromEntries(groups.map((g) => [g.key, g])) as Record<TrendGroup['key'], TrendGroup>;
  for (const c of s.chapters) {
    if (c.trend === 'rising' || c.trend === 'new') by.more.chapters.push(c);
    else if (c.trend === 'falling' || c.trend === 'stopped') by.less.chapters.push(c);
    else if (c.askedAll / Math.max(1, c.ofAll) >= 0.5) by.regular.chapters.push(c);
    else by.rare.chapters.push(c);
  }
  return groups.filter((g) => g.chapters.length > 0);
}

/** Vertical position on the trend chart: log2 of recent over earlier share, clamped to 4x either way. */
export function trendRatio(c: ChapterStat): number {
  const e = 0.004;
  return Math.max(-2, Math.min(2, Math.log2((c.recentShare + e) / (c.olderShare + e))));
}

/** Heat-map colour steps (0 = not asked, 1..5 = darker). Cuts scale with the paper. */
export function heatCuts(paperSize: number): number[] {
  return paperSize >= 40 ? [3, 6, 11, 16] : [1.5, 2.5, 3.5, 4.5];
}
export function heatLegend(paperSize: number): string[] {
  return paperSize >= 40 ? ['0', '1-2', '3-5', '6-10', '11-15', '16+'] : ['0', '1', '2', '3', '4', '5+'];
}
export function heatStep(value: number, cuts: number[]): number {
  if (value <= 0) return 0;
  let i = 1;
  while (i <= cuts.length && value >= cuts[i - 1]) i++;
  return i;
}

export function formatPerPaper(v: number): string {
  if (v >= 10) return String(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return r === 0 && v > 0 ? '<0.1' : String(r);
}

export function gapLabel(col: Extract<YearColumn, { kind: 'gap' }>): string {
  const short = (y: number) => String(y).slice(2);
  return col.from === col.to ? short(col.from) : `${short(col.from)}-${short(col.to)}`;
}

/** "2006 to 2019, and 2026" style summary of the years behind the numbers. */
export function describeYears(s: SectionWeightage): string {
  const runs: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const y of s.countedYears) {
    if (start === null) start = y;
    else if (prev !== null && y !== prev + 1) {
      runs.push(start === prev ? `${start}` : `${start} to ${prev}`);
      start = y;
    }
    prev = y;
  }
  if (start !== null && prev !== null) runs.push(start === prev ? `${start}` : `${start} to ${prev}`);
  if (runs.length <= 1) return runs[0] ?? '';
  return `${runs.slice(0, -1).join(', ')} and ${runs[runs.length - 1]}`;
}
