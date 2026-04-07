-- Geographic Student Hierarchy
-- Groups students by country > state > district > city for the Geographic Overview page.

-- Compound index for fast geographic grouping
CREATE INDEX IF NOT EXISTS idx_lead_profiles_geo_hierarchy
  ON lead_profiles(country, state, district, city)
  WHERE city IS NOT NULL AND TRIM(city) <> '';

-- RPC function: returns student counts grouped by geography
CREATE OR REPLACE FUNCTION get_geographic_student_hierarchy()
RETURNS TABLE(
  country TEXT,
  state TEXT,
  district TEXT,
  city TEXT,
  student_count BIGINT
) AS $$
  SELECT
    COALESCE(NULLIF(TRIM(lp.country), ''), 'IN') AS country,
    INITCAP(TRIM(lp.state)) AS state,
    INITCAP(TRIM(lp.district)) AS district,
    INITCAP(TRIM(lp.city)) AS city,
    COUNT(DISTINCT u.id) AS student_count
  FROM lead_profiles lp
  JOIN users u ON u.id = lp.user_id
  WHERE lp.city IS NOT NULL
    AND TRIM(lp.city) <> ''
    AND u.user_type = 'student'
  GROUP BY
    COALESCE(NULLIF(TRIM(lp.country), ''), 'IN'),
    INITCAP(TRIM(lp.state)),
    INITCAP(TRIM(lp.district)),
    INITCAP(TRIM(lp.city))
  ORDER BY country, state, district, city;
$$ LANGUAGE sql STABLE;
