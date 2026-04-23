import { getColleges } from '@/lib/college-hub/queries';
import type { SearchCollegesArgs, ToolResult, CollegeCard } from './types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export async function searchCollegesTool(
  args: SearchCollegesArgs
): Promise<ToolResult<{ count: number; results: CollegeCard[] }>> {
  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, args.limit ?? DEFAULT_LIMIT));

    const { data, count } = await getColleges({
      search: args.q,
      state: args.state,
      city: args.city,
      type: args.type,
      counselingSystem: args.counseling_system,
      coa: args.coa_approved,
      naacGrade: args.naac_grade,
      exam: args.accepted_exam,
      maxFee: args.fee_max,
      sortBy: args.sort_by ?? 'arch_index',
      limit,
      page: 1,
    } as any);

    const results: CollegeCard[] = (data ?? []).map((row: any) => ({
      name: row.name,
      slug: row.slug,
      url: `/colleges/${row.state_slug ?? 'india'}/${row.slug}`,
      city: row.city ?? null,
      state: row.state ?? null,
      type: row.type ?? null,
      annual_fee_min: row.annual_fee_min ?? null,
      annual_fee_max: row.annual_fee_max ?? null,
      annual_fee_approx: row.annual_fee_approx ?? null,
      coa_approved: row.coa_approved ?? null,
      naac_grade: row.naac_grade ?? null,
      nirf_rank: row.nirf_rank ?? null,
      neram_tier: row.neram_tier ?? null,
      total_barch_seats: row.total_barch_seats ?? null,
      accepted_exams: row.accepted_exams ?? null,
    }));

    return { ok: true, data: { count, results } };
  } catch (err) {
    console.error('[aintra/search-colleges] query error', err);
    return { ok: false, error: 'tool_error' };
  }
}
