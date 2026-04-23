export type ToolName = 'get_college' | 'search_colleges' | 'compare_colleges';

export type ToolSuccess<T> = { ok: true; data: T };
export type ToolFailure = { ok: false; error: string; slug?: string };
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

export interface GetCollegeArgs {
  slug: string;
}

export interface SearchCollegesArgs {
  q?: string;
  state?: string;
  city?: string;
  type?: 'government' | 'private' | 'aided' | 'deemed';
  counseling_system?: string;
  coa_approved?: boolean;
  naac_grade?: string;
  accepted_exam?: string;
  fee_max?: number;
  neram_tier?: string;
  sort_by?: 'arch_index' | 'nirf_rank' | 'fee_low' | 'fee_high' | 'name' | 'placement_high' | 'naac_grade';
  limit?: number;
}

export interface CompareCollegesArgs {
  slugs: string[];
}

export interface CollegeCard {
  name: string;
  slug: string;
  url: string;
  city: string | null;
  state: string | null;
  type: string | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  annual_fee_approx: number | null;
  coa_approved: boolean | null;
  naac_grade: string | null;
  nirf_rank: number | null;
  neram_tier: string | null;
  total_barch_seats: number | null;
  accepted_exams: string[] | null;
}
