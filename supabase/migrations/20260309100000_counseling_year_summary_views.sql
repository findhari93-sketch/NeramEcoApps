-- Views for year-wise summary (replaces broken PostgREST RPCs)
-- PostgREST treats views like tables, so .from('view_name') works reliably

CREATE OR REPLACE VIEW rank_list_year_summary AS
SELECT counseling_system_id, year, COUNT(*)::bigint AS total_entries
FROM rank_list_entries
GROUP BY counseling_system_id, year;

CREATE OR REPLACE VIEW allotment_year_summary AS
SELECT counseling_system_id, year, COUNT(*)::bigint AS total_entries
FROM allotment_list_entries
GROUP BY counseling_system_id, year;

-- Grant read access
GRANT SELECT ON rank_list_year_summary TO anon, authenticated, service_role;
GRANT SELECT ON allotment_year_summary TO anon, authenticated, service_role;
