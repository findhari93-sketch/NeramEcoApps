-- Counselling rank and allotment lists hold personal rows (one per candidate).
-- They were readable by anyone holding the public anon key. Every reader is now
-- server side with the service role (apps/app tool APIs, the ISR data loaders,
-- Admin), so close the tables, their summary views and the stats functions to
-- anon and authenticated. The service role bypasses RLS and keeps its grants.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "Public read allotment_list_entries" ON public.allotment_list_entries;
DROP POLICY IF EXISTS "Public read rank_list_entries" ON public.rank_list_entries;

ALTER TABLE public.allotment_list_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rank_list_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.allotment_list_entries FROM anon, authenticated;
REVOKE ALL ON public.rank_list_entries FROM anon, authenticated;
GRANT ALL ON public.allotment_list_entries TO service_role;
GRANT ALL ON public.rank_list_entries TO service_role;

-- Summary views are security_invoker, so they already follow the table grants.
-- Revoke them too so the closed state is explicit.
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['allotment_year_summary', 'rank_list_year_summary'] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
    END IF;
  END LOOP;
END $$;

-- Stats functions run as the caller and read the lists above.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_allotment_college_stats',
        'get_allotment_community_stats',
        'get_allotment_year_summary',
        'get_college_seat_occupancy',
        'get_college_total_occupancy',
        'get_distinct_allotment_years',
        'get_distinct_rank_list_years',
        'get_rank_list_community_stats',
        'get_rank_list_year_summary'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
