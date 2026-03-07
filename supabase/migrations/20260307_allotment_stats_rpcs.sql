-- RPC functions for allotment list statistics
-- Same pattern as rank list RPCs — server-side GROUP BY to bypass 1000-row limit

-- Year-wise allotment summary
CREATE OR REPLACE FUNCTION get_allotment_year_summary(p_system_id uuid)
RETURNS TABLE(year int, total_entries bigint) AS $$
BEGIN
  RETURN QUERY
    SELECT a.year, count(*)::bigint AS total_entries
    FROM allotment_list_entries a
    WHERE a.counseling_system_id = p_system_id
    GROUP BY a.year
    ORDER BY a.year DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Community-wise allotment breakdown
CREATE OR REPLACE FUNCTION get_allotment_community_stats(p_system_id uuid, p_year int)
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
      a.community::text,
      count(*)::bigint,
      min(a.rank)::int AS min_rank,
      max(a.rank)::int AS max_rank,
      round(avg(a.aggregate_mark)::numeric, 2) AS avg_score,
      min(a.aggregate_mark)::numeric AS min_score,
      max(a.aggregate_mark)::numeric AS max_score
    FROM allotment_list_entries a
    WHERE a.counseling_system_id = p_system_id
      AND a.year = p_year
    GROUP BY a.community
    ORDER BY count(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;
