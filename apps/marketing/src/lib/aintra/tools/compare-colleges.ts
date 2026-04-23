import { getCollegeBySlug } from '@/lib/college-hub/queries';
import type { CompareCollegesArgs, ToolResult } from './types';

type Trimmed =
  | {
      name: string;
      slug: string;
      url: string;
      annual_fee_approx: number | null;
      total_barch_seats: number | null;
      coa_approved: boolean | null;
      naac_grade: string | null;
      nirf_rank: number | null;
      accepted_exams: string[] | null;
      fees_summary: Array<{ year: number; tuition: number | null }>;
      cutoffs_summary: Array<{ year: number; category: string | null; value: number | null }>;
      placements_summary: {
        latest_year: number | null;
        placement_rate_percent: number | null;
        avg_package_lpa: number | null;
      } | null;
    }
  | { slug: string; error: 'not_found' };

export async function compareCollegesTool(
  args: CompareCollegesArgs
): Promise<ToolResult<Trimmed[]>> {
  const slugs = Array.isArray(args?.slugs) ? args.slugs.filter(Boolean) : [];
  if (slugs.length < 2 || slugs.length > 3) {
    return { ok: false, error: 'invalid_slug_count' };
  }

  try {
    const rows = await Promise.all(slugs.map((s) => getCollegeBySlug(s)));
    const data: Trimmed[] = rows.map((row, i) => {
      const slug = slugs[i];
      if (!row) return { slug, error: 'not_found' };

      const r = row as any;
      const latestPlacement = (r.placements ?? [])[0] ?? null;

      return {
        name: r.name,
        slug: r.slug,
        url: `/colleges/${r.state_slug ?? 'india'}/${r.slug}`,
        annual_fee_approx: r.annual_fee_approx ?? null,
        total_barch_seats: r.total_barch_seats ?? null,
        coa_approved: r.coa_approved ?? null,
        naac_grade: r.naac_grade ?? null,
        nirf_rank: r.nirf_rank ?? null,
        accepted_exams: r.accepted_exams ?? null,
        fees_summary: (r.fees ?? []).map((f: any) => ({
          year: f.year_number,
          tuition: f.tuition_fees ?? null,
        })),
        cutoffs_summary: (r.cutoffs ?? []).slice(0, 5).map((c: any) => ({
          year: c.academic_year,
          category: c.category ?? null,
          value: c.cutoff_value ?? null,
        })),
        placements_summary: latestPlacement
          ? {
              latest_year: latestPlacement.academic_year ?? null,
              placement_rate_percent: latestPlacement.placement_rate_percent ?? null,
              avg_package_lpa: latestPlacement.avg_package_lpa ?? null,
            }
          : null,
      };
    });

    return { ok: true, data };
  } catch (err) {
    console.error('[aintra/compare-colleges] query error', err);
    return { ok: false, error: 'tool_error' };
  }
}
