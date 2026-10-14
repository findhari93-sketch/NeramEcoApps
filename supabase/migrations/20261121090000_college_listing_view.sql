-- College Hub directory redesign: one row per college with the listing card
-- fields plus review and cutoff summaries, so the list, grid and table views
-- can show rating, review count and the latest cutoff without loading the
-- detail page relations.
--
-- security_invoker: the view runs with the caller's rights (no SECURITY
-- DEFINER view, per the Supabase security advisor). The marketing listing
-- queries use the service-role client, so RLS on the base tables is unchanged.

CREATE OR REPLACE VIEW public.college_listing
WITH (security_invoker = true) AS
SELECT
  c.id, c.slug, c.name, c.short_name, c.city, c.state, c.state_slug, c.type, c.neram_tier,
  c.coa_approved, c.naac_grade, c.nirf_rank, c.nirf_rank_architecture, c.arch_index_score,
  c.annual_fee_min, c.annual_fee_max, c.annual_fee_approx, c.total_barch_seats,
  c.accepted_exams, c.counseling_systems, c.logo_url, c.hero_image_url, c.highlights,
  c.verified, c.data_completeness, c.admissions_phone, c.brochure_url,
  c.avg_placement_salary, c.min_placement_salary, c.max_placement_salary, c.city_slug,
  c.status,
  r.review_avg,
  COALESCE(r.review_count, 0)::int AS review_count,
  co.cutoff_value,
  co.cutoff_type,
  co.counseling_system AS cutoff_system,
  co.academic_year AS cutoff_year
FROM public.colleges c
LEFT JOIN LATERAL (
  SELECT
    ROUND(AVG(cr.rating_overall)::numeric, 1) AS review_avg,
    COUNT(cr.rating_overall) AS review_count
  FROM public.college_reviews cr
  WHERE cr.college_id = c.id
    AND cr.status = 'approved'
    AND cr.rating_overall IS NOT NULL
) r ON true
LEFT JOIN LATERAL (
  -- Latest year, general category, last round: the number students quote.
  SELECT cc.cutoff_value, cc.cutoff_type, cc.counseling_system, cc.academic_year
  FROM public.college_cutoffs cc
  WHERE cc.college_id = c.id
    AND cc.category = 'general'
    AND cc.cutoff_value IS NOT NULL
  ORDER BY cc.academic_year DESC, cc.round_number DESC NULLS LAST
  LIMIT 1
) co ON true;

COMMENT ON VIEW public.college_listing IS
  'College Hub listing rows: colleges listing columns + approved review average/count + latest general-category cutoff.';

GRANT SELECT ON public.college_listing TO anon, authenticated, service_role;

-- PostgREST picks up the new view without a restart.
NOTIFY pgrst, 'reload schema';
