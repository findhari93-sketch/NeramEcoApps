-- Search Analytics Table
-- Tracks search queries, clicks, and zero-result queries for improving search quality

CREATE TABLE IF NOT EXISTS search_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('query', 'click', 'no_results')),
  query TEXT NOT NULL,
  result_path TEXT,
  result_position INTEGER,
  result_count INTEGER,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON search_analytics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_event ON search_analytics (event_type);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics (query);

-- RLS: allow anonymous inserts (search analytics from unauthenticated marketing visitors)
ALTER TABLE search_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON search_analytics
  FOR INSERT WITH CHECK (true);

-- No select/update/delete for anonymous users (admin-only reads)
CREATE POLICY "Admin reads analytics" ON search_analytics
  FOR SELECT USING (auth.role() = 'service_role');
