/**
 * Real B.Arch closing marks and ranks for the cutoff calculator page: the data
 * a chatbot cannot invent honestly, which is why it is on the page.
 *
 * PRIVACY: allotment_list_entries holds personal fields (name, date of birth,
 * application number). Only `college_code, aggregate_mark, allotted_category,
 * year` are selected, and only per-college minimums leave this file. The same
 * rule as apps/app/src/lib/tools/data/loaders.ts.
 */
import { unstable_cache } from 'next/cache';
import { createAdminClientISR } from '@neram/database';

export const CLOSING_MARKS_REVALIDATE = 86400;

export interface TneaClosing {
  code: string;
  name: string;
  city: string | null;
  /** Lowest aggregate mark (out of 400) allotted in the General (OC) category. */
  oc: number;
}

export interface KeamClosing {
  code: string;
  name: string;
  town: string | null;
  /** Last State Merit rank allotted, final phase. */
  closingRank: number;
}

export interface ClosingMarks {
  tnea: { year: number; colleges: TneaClosing[] } | null;
  keam: { year: number; colleges: KeamClosing[] } | null;
}

/** Per college, the lowest OC mark that got a seat; highest first. Pure, for tests. */
export function tneaOcClosing(
  rows: Array<{ college_code: string | number | null; aggregate_mark: number | string | null; allotted_category: string | null }>,
  names: Map<string, { name: string; city: string | null }>,
  limit = 10
): TneaClosing[] {
  const min = new Map<string, number>();
  for (const r of rows) {
    if (r.college_code == null || r.allotted_category !== 'OC') continue;
    const mark = Number(r.aggregate_mark);
    if (!Number.isFinite(mark)) continue;
    const code = String(r.college_code);
    const prev = min.get(code);
    min.set(code, prev == null ? mark : Math.min(prev, mark));
  }
  return [...min.entries()]
    .map(([code, oc]) => ({
      code,
      name: names.get(code)?.name ?? `College ${code}`,
      city: names.get(code)?.city ?? null,
      oc: Math.round(oc * 100) / 100,
    }))
    .sort((a, b) => b.oc - a.oc)
    .slice(0, limit);
}

const db = () => createAdminClientISR(CLOSING_MARKS_REVALIDATE) as any;

async function selectAll(table: string, columns: string, apply: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await apply(db().from(table).select(columns)).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function readTnea(): Promise<ClosingMarks['tnea']> {
  const { data: sys } = await db().from('counseling_systems').select('id').eq('code', 'TNEA_BARCH').maybeSingle();
  if (!sys?.id) return null;
  const { data: latest } = await db()
    .from('allotment_list_entries')
    .select('year')
    .eq('counseling_system_id', sys.id)
    .order('year', { ascending: false })
    .limit(1);
  const year = latest?.[0]?.year;
  if (!year) return null;
  const [rows, dir] = await Promise.all([
    selectAll('allotment_list_entries', 'college_code, aggregate_mark, allotted_category, year', (q) =>
      q.eq('counseling_system_id', sys.id).eq('year', year).eq('allotted_category', 'OC')
    ),
    selectAll('counseling_college_directory', 'college_code, college_name, city', (q) => q.eq('counseling_system_id', sys.id)),
  ]);
  const names = new Map<string, { name: string; city: string | null }>(
    dir.map((d: any) => [String(d.college_code), { name: d.college_name, city: d.city ?? null }])
  );
  const colleges = tneaOcClosing(rows, names);
  return colleges.length ? { year, colleges } : null;
}

async function readKeam(): Promise<ClosingMarks['keam']> {
  const rows = await selectAll('keam_cutoffs', 'year, phase, college_code, college_name, town, seat_type, closing_rank', (q) =>
    q.eq('seat_type', 'SM')
  );
  const year = Math.max(0, ...rows.map((r: any) => r.year ?? 0));
  if (!year) return null;
  const phaseNo = (p: string) => Number(String(p).replace(/\D/g, '')) || 0;
  const thisYear = rows.filter((r: any) => r.year === year && r.closing_rank != null);
  const lastPhase = Math.max(0, ...thisYear.map((r: any) => phaseNo(r.phase)));
  const best = new Map<string, KeamClosing>();
  for (const r of thisYear) {
    if (phaseNo(r.phase) !== lastPhase) continue;
    const code = String(r.college_code);
    const prev = best.get(code);
    if (prev && prev.closingRank >= r.closing_rank) continue;
    best.set(code, { code, name: r.college_name, town: r.town ?? null, closingRank: r.closing_rank });
  }
  const colleges = [...best.values()].sort((a, b) => a.closingRank - b.closingRank).slice(0, 10);
  return colleges.length ? { year, colleges } : null;
}

/** Cached for a day across every render. A failure shows no table, never an error. */
export const loadClosingMarks = unstable_cache(
  async (): Promise<ClosingMarks> => {
    const settle = async <T,>(p: Promise<T>): Promise<T | null> => {
      try {
        return await p;
      } catch (err) {
        console.error('[closing-marks]', err instanceof Error ? err.message : err);
        return null;
      }
    };
    const [tnea, keam] = await Promise.all([settle(readTnea()), settle(readKeam())]);
    return { tnea, keam };
  },
  ['mkt-cutoff-closing-marks-v1'],
  { revalidate: CLOSING_MARKS_REVALIDATE, tags: ['tool-facts'] }
);
