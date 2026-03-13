-- RPC functions for rank list statistics
-- These run GROUP BY on the server to avoid Supabase's default 1000-row limit

-- Year-wise summary: how many rank list entries per year for a counseling system
CREATE OR REPLACE FUNCTION get_rank_list_year_summary(p_system_id uuid)
RETURNS TABLE(year int, total_entries bigint) AS $$
BEGIN
  RETURN QUERY
    SELECT r.year, count(*)::bigint AS total_entries
    FROM rank_list_entries r
    WHERE r.counseling_system_id = p_system_id
    GROUP BY r.year
    ORDER BY r.year DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Community-wise breakdown for a counseling system + year
CREATE OR REPLACE FUNCTION get_rank_list_community_stats(p_system_id uuid, p_year int)
RETURNS TABLE(
  community text,
  count bigint,
  min_rank int,
  max_rank int,
  avg_score numeric,
  min_score numeric,
  max_score numeric
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      r.community::text,
      count(*)::bigint,
      min(r.rank)::int AS min_rank,
      max(r.rank)::int AS max_rank,
      round(avg(r.aggregate_mark)::numeric, 2) AS avg_score,
      min(r.aggregate_mark)::numeric AS min_score,
      max(r.aggregate_mark)::numeric AS max_score
    FROM rank_list_entries r
    WHERE r.counseling_system_id = p_system_id
      AND r.year = p_year
    GROUP BY r.community
    ORDER BY count(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;
