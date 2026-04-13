-- ============================================================
-- College Hub Phase 2: Reviews, Comments, Leads
-- ============================================================

-- college_reviews
CREATE TABLE IF NOT EXISTS college_reviews (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id    UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  reviewer_phone TEXT,
  reviewer_year  TEXT,
  firebase_uid   TEXT,

  -- Ratings (1-5, null = not rated)
  rating_overall         SMALLINT CHECK (rating_overall BETWEEN 1 AND 5),
  rating_studio          SMALLINT CHECK (rating_studio BETWEEN 1 AND 5),
  rating_faculty         SMALLINT CHECK (rating_faculty BETWEEN 1 AND 5),
  rating_campus          SMALLINT CHECK (rating_campus BETWEEN 1 AND 5),
  rating_placements      SMALLINT CHECK (rating_placements BETWEEN 1 AND 5),
  rating_value           SMALLINT CHECK (rating_value BETWEEN 1 AND 5),
  rating_infrastructure  SMALLINT CHECK (rating_infrastructure BETWEEN 1 AND 5),

  -- Content
  title       TEXT,
  body        TEXT NOT NULL CHECK (char_length(body) >= 30),
  pros        TEXT,
  cons        TEXT,

  -- Moderation
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  rejected_reason TEXT,
  moderated_by    TEXT,
  moderated_at    TIMESTAMPTZ,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- college_comments
CREATE TABLE IF NOT EXISTS college_comments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id   UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES college_comments(id) ON DELETE CASCADE,
  author_name  TEXT NOT NULL,
  author_phone TEXT,
  firebase_uid TEXT,
  body         TEXT NOT NULL CHECK (char_length(body) >= 5),
  is_ambassador BOOLEAN DEFAULT false,

  -- Moderation
  status      TEXT NOT NULL DEFAULT 'approved'
              CHECK (status IN ('approved', 'removed')),
  removed_reason TEXT,

  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- college_leads
CREATE TABLE IF NOT EXISTS college_leads (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id      UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  nata_score      DECIMAL(5,2),
  jee_score       DECIMAL(5,2),
  city            TEXT,
  message         TEXT,
  consent_given   BOOLEAN NOT NULL DEFAULT false,
  source          TEXT DEFAULT 'interested_button',
  firebase_uid    TEXT,

  -- Lead window snapshot
  lead_window_active BOOLEAN DEFAULT false,

  -- CRM
  status     TEXT NOT NULL DEFAULT 'new'
             CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'dropped')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_college_reviews_college_id ON college_reviews(college_id);
CREATE INDEX IF NOT EXISTS idx_college_reviews_status     ON college_reviews(status);
CREATE INDEX IF NOT EXISTS idx_college_comments_college_id ON college_comments(college_id);
CREATE INDEX IF NOT EXISTS idx_college_comments_parent_id  ON college_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_college_leads_college_id   ON college_leads(college_id);

-- RLS
ALTER TABLE college_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_leads    ENABLE ROW LEVEL SECURITY;

-- Public can read approved reviews and comments
CREATE POLICY "Public read approved reviews"
  ON college_reviews FOR SELECT USING (status = 'approved');

CREATE POLICY "Public read approved comments"
  ON college_comments FOR SELECT USING (status = 'approved');
