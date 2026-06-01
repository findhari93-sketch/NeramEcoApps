-- College Outreach v2
-- 1) Add 'partner' as a contact_status lifecycle stage (paid / active partnership).
-- 2) Add data-hygiene columns. `status` becomes the new public + emailable gate
--    (active / duplicate / defunct / unverified), superseding the looser is_active.
-- Idempotent: safe to run more than once (IF EXISTS / IF NOT EXISTS guards).

-- 1) Widen the contact_status CHECK to include 'partner'
ALTER TABLE colleges DROP CONSTRAINT IF EXISTS colleges_contact_status_check;
ALTER TABLE colleges
  ADD CONSTRAINT colleges_contact_status_check
  CHECK (contact_status IN (
    'never_contacted',
    'emailed_v1',
    'replied',
    'engaged',
    'claimed',
    'partner',
    'bounced',
    'opted_out'
  ));

-- 2) Data-hygiene columns
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'duplicate', 'defunct', 'unverified')),
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES colleges(id),
  ADD COLUMN IF NOT EXISTS email_source TEXT,        -- 'official_site' | 'manual' | 'directory' | null
  ADD COLUMN IF NOT EXISTS deactivated_reason TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Only 'active' colleges are public + emailable; index for the filtered queries.
CREATE INDEX IF NOT EXISTS idx_colleges_status ON colleges(status);

COMMENT ON COLUMN colleges.status IS 'Lifecycle gate for College Hub: active (public + emailable), duplicate, defunct, unverified (hidden until promoted).';
COMMENT ON COLUMN colleges.duplicate_of IS 'When status=duplicate, the surviving colleges.id this row was merged into.';
COMMENT ON COLUMN colleges.email_source IS 'Provenance of email/admissions_email: official_site | manual | directory.';
