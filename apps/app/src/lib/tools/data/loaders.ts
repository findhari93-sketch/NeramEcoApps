/**
 * Server data (service role: never import from a client component) for the public tool pages, cached for a day and shared by
 * every page, the sitemaps and llms.txt (so ~2,000 place pages cost a handful
 * of cached queries).
 *
 * PRIVACY: allotment_list_entries holds personal fields (name, date of birth,
 * application number). Only `college_code, aggregate_mark, allotted_category,
 * year` are ever selected from it, and only per-college minimums leave this
 * file. Never add a personal column to a select here; a unit test checks the
 * select strings.
 *
 * TOOL_DATA_REVALIDATE must equal the pages' `revalidate`: Next uses the
 * lowest value in a route, so a smaller one here would silently win.
 */
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { createAdminClientISR } from '@neram/database';
import { stateSlugForName } from '@neram/geo';
import {
  citySlugFor,
  parseCentre,
  type Centre,
  type CentreRow,
  type CoaCollege,
  type CutoffCollege,
  type JosaaClosing,
  type MarketingCollege,
  type SystemRanks,
  rankBands,
} from './facts';
import { SELECTS } from './selects';

export const TOOL_DATA_REVALIDATE = 86400;
const TAGS = { tags: ['tool-facts'], revalidate: TOOL_DATA_REVALIDATE };
const db = () => createAdminClientISR(TOOL_DATA_REVALIDATE) as any;


async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[tool-facts]', err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** PostgREST returns at most 1,000 rows per request; page through. */
async function selectAll(table: string, columns: string, apply?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let q = db().from(table).select(columns).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ─── NATA test cities ─────────────────────────────────────────────────────

const readCentres = unstable_cache(
  () =>
    safe(async () => {
      const rows = (await selectAll('nata_exam_centers', SELECTS.centres)) as CentreRow[];
      // Latest brochure year only.
      const latest = Math.max(0, ...rows.map((r) => r.year ?? 0));
      return rows.filter((r) => (r.year ?? 0) === latest);
    }, [] as CentreRow[]),
  ['app-tool-centres-v1'],
  TAGS
);

export const loadCentres = cache(async (): Promise<Centre[]> =>
  (await readCentres()).map(parseCentre).filter((c): c is Centre => c !== null)
);

// ─── TNEA closing marks (per college, per category) ───────────────────────

const readTnea = unstable_cache(
  () =>
    safe(async () => {
      const { data: sys } = await db().from('counseling_systems').select('id').eq('code', 'TNEA_BARCH').maybeSingle();
      if (!sys?.id) return [] as CutoffCollege[];
      const years = await selectAll('allotment_list_entries', 'year', (q) => q.eq('counseling_system_id', sys.id).order('year', { ascending: false }).limit(1));
      const year = years[0]?.year;
      if (!year) return [] as CutoffCollege[];
      const [rows, dir] = await Promise.all([
        selectAll('allotment_list_entries', SELECTS.allotments, (q) => q.eq('counseling_system_id', sys.id).eq('year', year)),
        selectAll('counseling_college_directory', SELECTS.directory, (q) => q.eq('counseling_system_id', sys.id)),
      ]);
      const byCode = new Map<string, CutoffCollege>();
      const dirByCode = new Map<string, any>(dir.map((d: any) => [String(d.college_code), d]));
      for (const r of rows) {
        const mark = Number(r.aggregate_mark);
        if (!r.college_code || !Number.isFinite(mark) || !r.allotted_category) continue;
        const code = String(r.college_code);
        let c = byCode.get(code);
        if (!c) {
          const d = dirByCode.get(code);
          c = {
            system: 'TNEA_BARCH',
            code,
            name: d?.college_name ?? `College ${code}`,
            city: d?.city ?? null,
            district: d?.district ?? null,
            citySlug: citySlugFor(d?.city, 'tamil-nadu') ?? citySlugFor(d?.district, 'tamil-nadu'),
            stateSlug: 'tamil-nadu',
            year,
            closingMarks: {},
            seats: 0,
          };
          byCode.set(code, c);
        }
        const cat = String(r.allotted_category);
        const prev = c.closingMarks![cat];
        c.closingMarks![cat] = prev == null ? mark : Math.min(prev, mark);
        c.seats = (c.seats ?? 0) + 1;
      }
      // Two decimals is how TNEA publishes marks.
      for (const c of byCode.values()) for (const k of Object.keys(c.closingMarks!)) c.closingMarks![k] = Math.round(c.closingMarks![k] * 100) / 100;
      return [...byCode.values()];
    }, [] as CutoffCollege[]),
  ['app-tool-tnea-v1'],
  TAGS
);

// ─── KEAM closing ranks (State Merit) ─────────────────────────────────────

const readKeam = unstable_cache(
  () =>
    safe(async () => {
      const rows = await selectAll('keam_cutoffs', SELECTS.keam, (q) => q.eq('seat_type', 'SM'));
      const year = Math.max(0, ...rows.map((r: any) => r.year ?? 0));
      const phaseNo = (p: string) => Number(String(p).replace(/\D/g, '')) || 0;
      const thisYear = rows.filter((r: any) => r.year === year && r.closing_rank != null);
      // The last phase with State Merit allotments holds the final closing rank.
      const lastPhase = Math.max(0, ...thisYear.map((r: any) => phaseNo(r.phase)));
      const best = new Map<string, CutoffCollege>();
      for (const r of thisYear) {
        if (phaseNo(r.phase) !== lastPhase) continue;
        const code = String(r.college_code);
        const existing = best.get(code);
        if (existing && (existing.closingRank ?? 0) >= r.closing_rank) continue;
        best.set(code, {
          system: 'KEAM_BARCH',
          code,
          name: r.college_name,
          city: r.town ?? null,
          district: r.district ?? null,
          citySlug: citySlugFor(r.town, 'kerala') ?? citySlugFor(r.district, 'kerala'),
          stateSlug: 'kerala',
          year,
          closingRank: r.closing_rank,
          seats: r.seats_filled ?? undefined,
        });
      }
      return [...best.values()];
    }, [] as CutoffCollege[]),
  ['app-tool-keam-v1'],
  TAGS
);

export const loadCutoffColleges = cache(async (): Promise<CutoffCollege[]> => {
  const [tnea, keam] = await Promise.all([readTnea(), readKeam()]);
  return [...tnea, ...keam];
});

// ─── COA approved colleges ────────────────────────────────────────────────

const readCoa = unstable_cache(
  () =>
    safe(async () => {
      const rows = await selectAll('coa_institutions', SELECTS.coa);
      return rows.map((r: any): CoaCollege => {
        const stateSlug = stateSlugForName(String(r.state ?? ''));
        return {
          code: String(r.institution_code ?? ''),
          name: r.name,
          city: r.city ?? '',
          citySlug: citySlugFor(r.city, stateSlug),
          stateSlug,
          intake: r.current_intake ?? null,
          period: r.approval_period_raw ?? null,
          checkedAt: r.last_scraped_at ?? null,
          since: r.commenced_year ?? null,
          university: r.affiliating_university ?? null,
        };
      });
    }, [] as CoaCollege[]),
  ['app-tool-coa-v1'],
  TAGS
);

export const loadCoaColleges = cache(() => readCoa());

// ─── JoSAA closing ranks (B.Arch, open, gender-neutral, final round) ──────

const readJosaa = unstable_cache(
  () =>
    safe(async () => {
      const { data: progs } = await db().from('josaa_programs').select('id, name');
      const barch = (progs ?? []).filter((p: any) => /architecture/i.test(p.name) && !/planning/i.test(p.name)).map((p: any) => p.id);
      if (barch.length === 0) return [] as JosaaClosing[];
      const { data: yr } = await db().from('josaa_or_cr').select('year').order('year', { ascending: false }).limit(1);
      const year = yr?.[0]?.year;
      if (!year) return [] as JosaaClosing[];
      const { data: rd } = await db().from('josaa_or_cr').select('round_no').eq('year', year).order('round_no', { ascending: false }).limit(1);
      const round = rd?.[0]?.round_no;
      const rows = await selectAll('josaa_or_cr', SELECTS.josaa, (q) =>
        q.eq('year', year).eq('round_no', round).eq('seat_type', 'OPEN').eq('gender', 'Gender-Neutral').in('program_id', barch)
      );
      const ids = [...new Set(rows.map((r: any) => r.institute_id))];
      const { data: inst } = await db().from('josaa_institutes').select(SELECTS.josaaInstitutes).in('id', ids);
      const byId = new Map<number, any>((inst ?? []).map((i: any) => [i.id, i]));
      return rows
        .filter((r: any) => r.closing_rank != null && byId.has(r.institute_id))
        .map((r: any): JosaaClosing => {
          const i = byId.get(r.institute_id);
          return {
            institute: i.name,
            type: i.institute_type ?? null,
            state: i.state ?? null,
            city: i.city ?? null,
            quota: r.quota,
            closingRank: r.closing_rank,
            year,
            round,
          };
        });
    }, [] as JosaaClosing[]),
  ['app-tool-josaa-v1'],
  TAGS
);

export const loadJosaaClosing = cache(() => readJosaa());

// ─── Marketing college pages (cross-links) ────────────────────────────────

const readMarketingColleges = unstable_cache(
  () =>
    safe(async () => {
      const rows = await selectAll('colleges', SELECTS.colleges, (q) => q.or('is_active.is.null,is_active.eq.true'));
      return rows
        .filter((r: any) => r.slug && r.state_slug)
        .map((r: any): MarketingCollege => ({ slug: r.slug, name: r.name, city: r.city ?? null, cityPageSlug: r.city_slug ?? null, district: r.district ?? null, stateSlug: r.state_slug }));
    }, [] as MarketingCollege[]),
  ['app-tool-mkt-colleges-v1'],
  TAGS
);

export const loadMarketingColleges = cache(() => readMarketingColleges());

// ─── Rank lists, as 10-mark bands ─────────────────────────────────────────

const readRankBands = unstable_cache(
  () =>
    safe(async () => {
      const out: SystemRanks[] = [];
      for (const code of ['TNEA_BARCH', 'KEAM_BARCH'] as const) {
        const { data: sys } = await db().from('counseling_systems').select('id').eq('code', code).maybeSingle();
        if (!sys?.id) continue;
        const latest = await selectAll('rank_list_entries', 'year', (q) => q.eq('counseling_system_id', sys.id).order('year', { ascending: false }).limit(1));
        const year = latest[0]?.year;
        if (!year) continue;
        const rows = await selectAll('rank_list_entries', SELECTS.rankList, (q) => q.eq('counseling_system_id', sys.id).eq('year', year));
        out.push({ code, year, total: rows.length, bands: rankBands(rows) });
      }
      return out;
    }, [] as SystemRanks[]),
  ['app-tool-rank-bands-v1'],
  TAGS
);

export const loadRankBands = cache(() => readRankBands());

// ─── Question bank (approved community questions) ─────────────────────────

export interface PublicQuestion {
  id: string;
  title: string;
  category: string;
  examYear: number | null;
}

export interface QuestionBankFacts {
  questions: PublicQuestion[];
  /** One question shown in full on the public page, the community's top voted. */
  sample: (PublicQuestion & { body: string }) | null;
}

const readQuestions = unstable_cache(
  () =>
    safe(async (): Promise<QuestionBankFacts> => {
      const rows = await selectAll('question_posts', SELECTS.questions, (q) => q.eq('status', 'approved').order('vote_score', { ascending: false }));
      const questions = rows.map((r: any): PublicQuestion => ({ id: r.id, title: r.title, category: r.category, examYear: r.exam_year ?? null }));
      let sample: QuestionBankFacts['sample'] = null;
      if (questions[0]) {
        const { data } = await db().from('question_posts').select(SELECTS.questionSample).eq('id', questions[0].id).maybeSingle();
        if (data) sample = { ...questions[0], body: String(data.body ?? '').slice(0, 1200) };
      }
      return { questions, sample };
    }, { questions: [], sample: null } as QuestionBankFacts),
  ['app-tool-questions-v1'],
  TAGS
);

export const loadQuestionBank = cache(() => readQuestions());
