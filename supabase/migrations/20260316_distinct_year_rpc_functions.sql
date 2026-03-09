-- RPC to get distinct years from rank_list_entries (avoids PostgREST max_rows 1000 limit)
CREATE OR REPLACE FUNCTION get_distinct_rank_list_years(p_system_id UUID)
RETURNS TABLE(year INT, total_entries BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT r.year::INT, COUNT(*)::BIGINT as total_entries
    FROM rank_list_entries r
    WHERE r.counseling_system_id = p_system_id
    GROUP BY r.year
    ORDER BY r.year DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC to get distinct years from allotment_list_entries (avoids PostgREST max_rows 1000 limit)
CREATE OR REPLACE FUNCTION get_distinct_allotment_years(p_system_id UUID)
RETURNS TABLE(year INT, total_entries BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT a.year::INT, COUNT(*)::BIGINT as total_entries
    FROM allotment_list_entries a
    WHERE a.counseling_system_id = p_system_id
    GROUP BY a.year
    ORDER BY a.year DESC;
END;
$$ LANGUAGE plpgsql STABLE;
