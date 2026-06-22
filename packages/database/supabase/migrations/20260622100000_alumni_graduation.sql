-- Alumni graduation: revoke Nexus access for a finished cohort and showcase their work.
--
-- When a NATA batch finishes its exam cycle (e.g. the 2025-26 cohort), an admin
-- "graduates" those students to alumni. Graduated students are fully locked out
-- of Nexus, but their data and drawing submissions are preserved so their best
-- work can be curated into an "Alumni Hall of Fame" gallery.
--
-- Why a dedicated is_alumni flag rather than reusing users.lifecycle_status:
-- lifecycle_status='archived' is a CRM de-prioritization that MUST NOT block login
-- (it is also used for stale leads). Alumni graduation MUST block Nexus, so it gets
-- its own explicit gate. The graduate action sets both (is_alumni for the Nexus gate
-- + archived for CRM tidiness). The cohort year reuses the existing users.academic_year.
--
-- Idempotent: safe to run more than once.

-- Alumni gate on users (separate from CRM lifecycle_status).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_since TIMESTAMPTZ;

-- Partial index: alumni are a small subset, queried for the Nexus gate and the
-- admin Alumni list.
CREATE INDEX IF NOT EXISTS idx_users_is_alumni ON users(is_alumni) WHERE is_alumni = true;

-- Hall-of-Fame curation flag on drawing work. Gallery visibility is still driven by
-- the existing is_gallery_visible; this flag only pins/highlights an alumnus's work
-- within the Alumni gallery.
ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS alumni_featured BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.is_alumni IS 'True when the student has been graduated to alumni; blocks Nexus access. Cohort year is in users.academic_year.';
COMMENT ON COLUMN users.alumni_since IS 'Timestamp when the student was graduated to alumni.';
COMMENT ON COLUMN drawing_submissions.alumni_featured IS 'Curator pin: highlight this alumnus work in the Alumni Hall of Fame gallery.';
