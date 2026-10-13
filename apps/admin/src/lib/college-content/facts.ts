/**
 * One flat, keyed set of facts per college: the only material the FAQ writer
 * may use. Every number an answer is allowed to contain comes from here (see
 * validate.ts), so this is also the source of truth for "is this answer true".
 *
 * Relative imports only: the backfill script runs this under tsx.
 */
import { createHash } from 'node:crypto';

export interface CollegeRowForFacts {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  state: string | null;
  district: string | null;
  address: string | null;
  pincode: string | null;
  type: string | null;
  established_year: number | null;
  affiliated_university: string | null;
  coa_approved: boolean | null;
  coa_validity_till: string | null;
  naac_grade: string | null;
  naac_valid_till: string | null;
  nba_accredited: boolean | null;
  nirf_rank_architecture: number | null;
  nirf_year: number | null;
  total_barch_seats: number | null;
  annual_fee_approx: number | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
  has_management_quota: boolean | null;
  has_nri_quota: boolean | null;
  website: string | null;
  admissions_phone: string | null;
  admissions_email: string | null;
  nearest_railway: string | null;
  railway_distance_km: number | null;
  nearest_airport: string | null;
  airport_distance_km: number | null;
  avg_placement_salary: number | null;
  max_placement_salary: number | null;
  highlights: string[] | null;
}

export const FACT_COLLEGE_COLUMNS =
  'id,slug,name,short_name,city,state,district,address,pincode,type,established_year,affiliated_university,coa_approved,coa_validity_till,naac_grade,naac_valid_till,nba_accredited,nirf_rank_architecture,nirf_year,total_barch_seats,annual_fee_approx,annual_fee_min,annual_fee_max,accepted_exams,counseling_systems,has_management_quota,has_nri_quota,website,admissions_phone,admissions_email,nearest_railway,railway_distance_km,nearest_airport,airport_distance_km,avg_placement_salary,max_placement_salary,highlights,faq_facts_hash,faqs_generated_at,status';

export interface FeeRow {
  college_id: string;
  academic_year: string;
  year_number: number | null;
  fee_category: string | null;
  tuition: number | null;
  hostel: number | null;
  mess: number | null;
}

export interface CutoffRow {
  college_id: string;
  academic_year: string;
  counseling_system: string;
  category: string | null;
  cutoff_type: string | null;
  cutoff_value: number | null;
  round_number: number | null;
}

export interface PlacementRow {
  college_id: string;
  academic_year: string;
  average_package_lpa: number | null;
  highest_package_lpa: number | null;
  placement_rate_percent: number | null;
}

export interface InfraRow {
  college_id: string;
  has_hostel_boys: boolean | null;
  has_hostel_girls: boolean | null;
  campus_area_acres: number | null;
  design_studios: number | null;
}

/** Facts are strings (shown as written) or lists. Numbers are pre-formatted so answers copy them exactly. */
export type Facts = Record<string, string | string[]>;

const EXAM_LABELS: Record<string, string> = {
  JEE_PAPER_2: 'JEE Main Paper 2',
  'JEE Main Paper 2': 'JEE Main Paper 2',
  'JEE MAIN PAPER 2': 'JEE Main Paper 2',
  // B.Arch admission through JEE Main is always Paper 2 (Paper 1 is B.E./B.Tech).
  'JEE Main': 'JEE Main Paper 2',
  'JEE MAIN': 'JEE Main Paper 2',
  NATA: 'NATA',
  TANATA: 'TANATA',
  AAT: 'AAT (JEE Advanced Architecture Aptitude Test)',
};

export function examLabel(e: string): string {
  return EXAM_LABELS[e] ?? EXAM_LABELS[e.toUpperCase()] ?? e.replace(/_/g, ' ');
}

/** Counselling systems, written the way students search for them. */
const SYSTEM_LABELS: Record<string, string> = {
  TNEA: 'TNEA (Tamil Nadu Engineering Admissions)',
  JoSAA: 'JoSAA',
  KCET: 'KCET (Karnataka)',
  CENTAC: 'CENTAC (Puducherry)',
  APSCHE: 'AP EAPCET counselling (APSCHE)',
  KEAM: 'KEAM (Kerala)',
};

export function systemLabel(s: string): string {
  return SYSTEM_LABELS[s] ?? s;
}

/** ₹45,000 / ₹1.25 lakh, the way Indian fee pages write it. */
export function formatInr(n: number): string {
  if (n >= 100000) {
    const lakh = Math.round((n / 100000) * 100) / 100;
    return `₹${lakh} lakh`;
  }
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const put = (f: Facts, key: string, v: unknown) => {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    const list = v.map((x) => String(x).trim()).filter(Boolean);
    if (list.length) f[key] = list;
    return;
  }
  const s = String(v).trim();
  if (s) f[key] = s;
};

/** Latest academic year present, e.g. "2025-26" beats "2024-25". */
const latest = <T extends { academic_year: string }>(rows: T[]) =>
  rows.length ? rows.map((r) => r.academic_year).sort().reverse()[0] : null;

export function buildFacts(
  c: CollegeRowForFacts,
  fees: FeeRow[] = [],
  cutoffs: CutoffRow[] = [],
  placements: PlacementRow[] = [],
  infra: InfraRow | null = null,
): Facts {
  const f: Facts = {};
  put(f, 'name', c.name);
  put(f, 'short_name', c.short_name && c.short_name !== c.name ? c.short_name : null);
  put(f, 'city', c.city);
  put(f, 'district', c.district && c.district !== c.city ? c.district : null);
  put(f, 'state', c.state);
  put(f, 'address', c.address);
  put(f, 'pincode', c.pincode);
  put(f, 'type', c.type ? (c.type.toLowerCase() === 'deemed' ? 'Deemed-to-be university' : titleCase(c.type)) : null);
  put(f, 'established_year', c.established_year);
  put(f, 'affiliated_university', c.affiliated_university);
  if (c.coa_approved) put(f, 'coa_approved', 'yes');
  put(f, 'coa_validity_till', c.coa_validity_till?.slice(0, 4));
  put(f, 'naac_grade', c.naac_grade);
  put(f, 'naac_valid_till', c.naac_valid_till?.slice(0, 4));
  if (c.nba_accredited) put(f, 'nba_accredited', 'yes');
  if (c.nirf_rank_architecture) {
    put(f, 'nirf_rank_architecture', c.nirf_rank_architecture);
    put(f, 'nirf_year', c.nirf_year);
  }
  put(f, 'barch_seats', c.total_barch_seats);

  const fee = c.annual_fee_approx ?? c.annual_fee_min;
  if (fee) {
    put(f, 'annual_fee', formatInr(fee));
    put(f, 'five_year_fee_estimate', formatInr(fee * 5));
  }
  if (c.annual_fee_min && c.annual_fee_max && c.annual_fee_max > c.annual_fee_min) {
    put(f, 'annual_fee_range', `${formatInr(c.annual_fee_min)} to ${formatInr(c.annual_fee_max)}`);
  }

  const feeYear = latest(fees);
  if (feeYear) {
    const yearRows = fees.filter((r) => r.academic_year === feeYear && (r.year_number ?? 1) === 1);
    put(f, 'fee_year', feeYear);
    for (const r of yearRows) {
      const cat = (r.fee_category || 'general').toLowerCase().replace(/[^a-z]+/g, '_');
      if (r.tuition) put(f, `tuition_${cat}`, formatInr(r.tuition));
      if (r.hostel) put(f, `hostel_fee_${cat}`, formatInr(r.hostel));
      if (r.mess) put(f, `mess_fee_${cat}`, formatInr(r.mess));
    }
  }

  put(f, 'entrance_exams', (c.accepted_exams ?? []).map(examLabel).filter((v, i, a) => a.indexOf(v) === i));
  put(f, 'counselling', (c.counseling_systems ?? []).map(systemLabel));

  // Cutoffs: latest year per counselling system, each category.
  const systems = [...new Set(cutoffs.map((r) => r.counseling_system))];
  for (const sys of systems) {
    const rows = cutoffs.filter((r) => r.counseling_system === sys && r.cutoff_value != null);
    const year = latest(rows);
    if (!year) continue;
    const key = sys.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    put(f, `cutoff_${key}_year`, year);
    for (const r of rows.filter((x) => x.academic_year === year)) {
      const cat = (r.category || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const type = r.cutoff_type ? ` (${r.cutoff_type})` : '';
      if (!f[`cutoff_${key}_${cat}`]) put(f, `cutoff_${key}_${cat}`, `${r.cutoff_value}${type}`);
    }
  }

  if (c.has_management_quota) put(f, 'management_quota', 'yes');
  if (c.has_nri_quota) put(f, 'nri_quota', 'yes');
  put(f, 'website', c.website);
  put(f, 'admissions_phone', c.admissions_phone);
  put(f, 'admissions_email', c.admissions_email);
  if (c.nearest_railway) put(f, 'nearest_railway', c.railway_distance_km ? `${c.nearest_railway} (${c.railway_distance_km} km)` : c.nearest_railway);
  if (c.nearest_airport) put(f, 'nearest_airport', c.airport_distance_km ? `${c.nearest_airport} (${c.airport_distance_km} km)` : c.nearest_airport);

  const placeYear = latest(placements);
  const pl = placements.find((p) => p.academic_year === placeYear);
  if (pl) {
    put(f, 'placement_year', placeYear);
    if (pl.average_package_lpa) put(f, 'average_package', `₹${pl.average_package_lpa} LPA`);
    if (pl.highest_package_lpa) put(f, 'highest_package', `₹${pl.highest_package_lpa} LPA`);
    if (pl.placement_rate_percent) put(f, 'placement_rate', `${pl.placement_rate_percent}%`);
  } else {
    if (c.avg_placement_salary) put(f, 'average_package', formatInr(c.avg_placement_salary) + ' per year');
    if (c.max_placement_salary) put(f, 'highest_package', formatInr(c.max_placement_salary) + ' per year');
  }

  if (infra) {
    const hostels = [infra.has_hostel_boys && 'boys', infra.has_hostel_girls && 'girls'].filter(Boolean) as string[];
    if (hostels.length) put(f, 'hostel', `available for ${hostels.join(' and ')}`);
    put(f, 'campus_area_acres', infra.campus_area_acres);
    put(f, 'design_studios', infra.design_studios);
  }
  put(f, 'highlights', (c.highlights ?? []).slice(0, 5));
  return f;
}

/**
 * Facts every B.Arch college shares, from the Council of Architecture's
 * regulations. Kept separate so they do not change the per-college hash.
 */
export const COMMON_FACTS: Facts = {
  barch_duration: '5 years',
  barch_regulator: 'Council of Architecture (COA)',
  barch_eligibility:
    'Class 12 (or equivalent) with Physics, Chemistry and Mathematics, at least 50% marks in PCM and 50% overall, or a 3-year diploma with Mathematics with 50% marks, plus a valid NATA or JEE Main Paper 2 score',
};

/** Stable hash of a college's facts: the content cron rewrites FAQs when it changes. */
export function factsHash(f: Facts): string {
  const sorted = Object.keys(f)
    .sort()
    .map((k) => [k, f[k]]);
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 32);
}
