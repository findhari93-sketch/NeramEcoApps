-- ============================================
-- Careers: Job Postings & Applications
-- ============================================
-- Enables admin-managed job listings on the marketing site
-- with LinkedIn-style screening questions and contract terms.

-- ============================================
-- JOB POSTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  description TEXT NOT NULL,
  skills_required JSONB NOT NULL DEFAULT '[]'::jsonb,

  employment_type TEXT NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),

  target_audience TEXT NOT NULL DEFAULT 'any'
    CHECK (target_audience IN ('college_students', 'experienced', 'any')),

  schedule_details TEXT,
  location TEXT NOT NULL,
  experience_required TEXT,

  -- LinkedIn-style screening questions (flexible per job)
  screening_questions JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Contract terms (min duration, probation, termination note, remuneration note)
  contract_terms JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed', 'archived')),

  display_priority INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_postings_published
  ON job_postings (display_priority DESC, published_at DESC)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_slug
  ON job_postings (slug);

-- Updated_at trigger
CREATE OR REPLACE TRIGGER set_job_postings_updated_at
  BEFORE UPDATE ON job_postings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

-- Public can read published jobs
CREATE POLICY "Public can read published job postings"
  ON job_postings FOR SELECT
  USING (status = 'published');

-- Service role has full access (admin API routes)
CREATE POLICY "Service role full access on job_postings"
  ON job_postings
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ============================================
-- JOB APPLICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,

  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  resume_url TEXT,
  portfolio_url TEXT,

  -- Answers to screening questions
  screening_answers JSONB NOT NULL DEFAULT '[]'::jsonb,

  terms_agreed BOOLEAN NOT NULL DEFAULT false,
  terms_agreed_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn')),

  admin_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id
  ON job_applications (job_posting_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_email
  ON job_applications (applicant_email);

-- Updated_at trigger
CREATE OR REPLACE TRIGGER set_job_applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- No public access to applications (inserted via admin client in API routes)
-- Service role has full access
CREATE POLICY "Service role full access on job_applications"
  ON job_applications
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
