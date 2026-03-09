CREATE OR REPLACE FUNCTION get_allotment_college_stats(p_system_id UUID, p_year INT)
RETURNS TABLE(
  college_code TEXT,
  college_name TEXT,
  allotted BIGINT,
  min_rank INT,
  max_rank INT,
  avg_score NUMERIC,
  categories TEXT
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      a.college_code::TEXT,
      COALESCE(a.college_name, a.college_code)::TEXT AS college_name,
      COUNT(*)::BIGINT AS allotted,
      MIN(a.rank)::INT AS min_rank,
      MAX(a.rank)::INT AS max_rank,
      ROUND(AVG(a.aggregate_mark)::NUMERIC, 2) AS avg_score,
      STRING_AGG(DISTINCT a.allotted_category, ', ' ORDER BY a.allotted_category)::TEXT AS categories
    FROM allotment_list_entries a
    WHERE a.counseling_system_id = p_system_id
      AND a.year = p_year
    GROUP BY a.college_code, a.college_name
    ORDER BY min_rank ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE;
