/**
 * Rows of the compare table (canvas: Desktop · Compare colleges), built from
 * the colleges' detail records. Pure, so it is unit tested.
 */
import type { CollegeCutoff, CollegeDetail } from './types';
import {
  admissionLabel,
  annualFee,
  cutoffLabel,
  examList,
  formatRupees,
  naacLabel,
  typeLabel,
} from './format';

export interface CompareCell {
  value: string;
  /** Best numeric value in its row (tagged "Best"). */
  best: boolean;
  /** The value explains a gap rather than giving a number. */
  missing: boolean;
}

export interface CompareRow {
  key: string;
  label: string;
  hint?: string;
  bestTag?: string;
  cells: CompareCell[];
  /** Every college has the same value (and there are at least two). */
  same: boolean;
}

export interface CompareSection {
  id: string;
  title: string;
  rows: CompareRow[];
}

type Value = { text: string; num?: number | null; missing?: boolean };

interface RowDef {
  key: string;
  label: string;
  hint?: string;
  better?: 'high' | 'low';
  bestTag?: string;
  /** Hide the row when no college has a value. */
  optional?: boolean;
  get: (c: CollegeDetail) => Value;
}

/** The latest general-category cutoff (last round of the latest year). */
export function latestCutoff(cutoffs: CollegeCutoff[] | undefined): CollegeCutoff | null {
  const rows = (cutoffs ?? []).filter((c) => c.category === 'general' && c.cutoff_value != null);
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.academic_year.localeCompare(a.academic_year) || (b.round_number ?? 0) - (a.round_number ?? 0))[0];
}

function averagePackageLpa(c: CollegeDetail): number | null {
  const fromPlacements = [...(c.placements ?? [])]
    .sort((a, b) => b.academic_year.localeCompare(a.academic_year))
    .find((p) => p.average_package_lpa != null)?.average_package_lpa;
  if (fromPlacements != null) return fromPlacements;
  const v = c.avg_placement_salary;
  if (v == null || v <= 0) return null;
  return v >= 1000 ? v / 100000 : v;
}

const missing = (text: string): Value => ({ text, missing: true });

const SECTIONS: { id: string; title: string; rows: RowDef[] }[] = [
  {
    id: 'overview',
    title: 'Overview',
    rows: [
      { key: 'location', label: 'Location', get: (c) => ({ text: [c.city, c.state].filter(Boolean).join(', ') }) },
      { key: 'type', label: 'College type', get: (c) => ({ text: typeLabel(c.type) }) },
      { key: 'coa', label: 'COA approval', get: (c) => (c.coa_approved ? { text: 'Approved' } : missing('Not listed')) },
      { key: 'naac', label: 'NAAC grade', get: (c) => (c.naac_grade ? { text: naacLabel(c.naac_grade).replace('NAAC ', '') } : missing('No NAAC grade')) },
      {
        key: 'nirf',
        label: 'NIRF rank',
        hint: 'Architecture',
        better: 'low',
        bestTag: 'Best',
        optional: true,
        get: (c) => (c.nirf_rank_architecture ? { text: `#${c.nirf_rank_architecture}`, num: c.nirf_rank_architecture } : missing('Not ranked')),
      },
      {
        key: 'established',
        label: 'Established',
        optional: true,
        get: (c) => (c.established_year ? { text: String(c.established_year) } : missing('Not published')),
      },
    ],
  },
  {
    id: 'admissions',
    title: 'Admissions',
    rows: [
      { key: 'exams', label: 'Entrance exams', get: (c) => {
        const list = examList(c.accepted_exams);
        return list.length ? { text: list.join(', ') } : missing('Check with college');
      } },
      { key: 'via', label: 'Admission via', get: (c) => ({ text: admissionLabel(c) }) },
      {
        key: 'cutoff',
        label: 'Cutoff',
        hint: 'General category, last round',
        optional: true,
        get: (c) => {
          const cut = latestCutoff(c.cutoffs);
          if (!cut) return missing('Not published');
          return {
            text: cutoffLabel({ cutoff_value: cut.cutoff_value, cutoff_type: cut.cutoff_type, cutoff_system: cut.counseling_system, cutoff_year: cut.academic_year }) ?? '',
          };
        },
      },
      {
        key: 'seats',
        label: 'Seats',
        hint: 'Per year',
        better: 'high',
        bestTag: 'Most seats',
        get: (c) => (c.total_barch_seats ? { text: String(c.total_barch_seats), num: c.total_barch_seats } : missing('Not published')),
      },
    ],
  },
  {
    id: 'fees',
    title: 'Fees',
    rows: [
      {
        key: 'fee',
        label: 'Annual fee',
        better: 'low',
        bestTag: 'Lowest',
        get: (c) => {
          const fee = annualFee(c);
          return fee != null ? { text: `₹${Math.round(fee).toLocaleString('en-IN')}`, num: fee } : missing('Not published');
        },
      },
      {
        key: 'five',
        label: '5-year fee',
        hint: 'Estimate',
        better: 'low',
        bestTag: 'Lowest',
        get: (c) => {
          const fee = annualFee(c);
          return fee != null ? { text: formatRupees(fee * 5), num: fee * 5 } : missing('Not published');
        },
      },
    ],
  },
  {
    id: 'outcomes',
    title: 'Outcomes',
    rows: [
      {
        key: 'package',
        label: 'Average package',
        better: 'high',
        bestTag: 'Highest',
        optional: true,
        get: (c) => {
          const lpa = averagePackageLpa(c);
          return lpa != null ? { text: `₹${lpa.toFixed(1)} LPA`, num: lpa } : missing('Not published');
        },
      },
    ],
  },
];

/** Sections and rows for the given colleges; empty optional rows and sections are dropped. */
export function buildCompareSections(colleges: CollegeDetail[], diffOnly = false): CompareSection[] {
  return SECTIONS.map((sec) => {
    const rows: CompareRow[] = [];
    for (const def of sec.rows) {
      const values = colleges.map(def.get);
      if (def.optional && values.every((v) => v.missing)) continue;
      const nums = values.map((v) => (v.missing ? null : v.num ?? null)).filter((n): n is number => n != null);
      let best: number | null = null;
      // A "Best" tag only means something with two or more real numbers to compare.
      if (def.better && nums.length >= 2 && new Set(nums).size > 1) {
        best = def.better === 'low' ? Math.min(...nums) : Math.max(...nums);
      }
      const same = values.length > 1 && values.every((v) => v.text === values[0].text);
      if (diffOnly && same) continue;
      rows.push({
        key: def.key,
        label: def.label,
        hint: def.hint,
        bestTag: def.bestTag,
        same,
        cells: values.map((v) => ({ value: v.text, missing: Boolean(v.missing), best: best != null && v.num === best && !v.missing })),
      });
    }
    return { id: sec.id, title: sec.title, rows };
  }).filter((s) => s.rows.length > 0);
}
