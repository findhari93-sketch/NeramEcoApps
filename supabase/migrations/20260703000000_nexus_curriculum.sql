-- Nexus Curriculum + Teaching Plans (Course Plan v2)
--
-- Replaces the removed week/session course-plan module with:
--   1. An org-wide repository of teachable content: modules containing topics, each topic
--      carrying priority, readiness, delivery mode and authored class content. Topics are
--      shared across plans (the same topic can be placed in many plans).
--   2. Teaching plans: one per batch/exam with a date range and a draft -> active lifecycle.
--      Plan entries place a topic (or a test) on a calendar day; a NULL planned_date means
--      the entry sits in the "Unscheduled" tray. Rearranging is just updating planned_date.
--   3. An audit log of every plan mutation, shown as the plan's Activity feed so multiple
--      teachers can work on the same plan and see what changed.
--
-- The old nexus_course_plan* tables are intentionally left in place (dropped later, once
-- the new module is signed off).
--
-- Access is via the service-role admin client in the Nexus API routes, so RLS is enabled
-- with no policies (deny by default; the service role bypasses RLS). Role checks happen in
-- the API layer.
--
-- Idempotent: safe to run more than once.

-- ============================================================
-- 1. Repository: modules (top level grouping)
-- ============================================================
CREATE TABLE IF NOT EXISTS nexus_course_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  -- Which exams this module serves. Matches nexus_classrooms.type values plus 'foundation'.
  exam_tags   TEXT[] NOT NULL DEFAULT '{}',
  -- Accent color used across the planner UI (hex, e.g. '#7C3AED').
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Repository: topics (the schedulable unit, org-wide)
-- ============================================================
-- Deliberately NOT an extension of nexus_topics, which is classroom-scoped and joined by
-- timetable/progress/checklist code. This table is the shared curriculum library.
CREATE TABLE IF NOT EXISTS nexus_course_topics (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          UUID NOT NULL REFERENCES nexus_course_modules(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  priority           TEXT NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('mandatory', 'high', 'medium', 'low')),
  status             TEXT NOT NULL DEFAULT 'idea'
                       CHECK (status IN ('idea', 'drafted', 'class_ready')),
  intended_delivery  TEXT NOT NULL DEFAULT 'live'
                       CHECK (intended_delivery IN ('live', 'self_learning', 'either')),
  estimated_sessions INTEGER NOT NULL DEFAULT 1,
  -- Authored class content (markdown). Everything a teacher needs to run the class.
  summary            TEXT,
  activities         TEXT,
  drills             TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_course_topics_module
  ON nexus_course_topics(module_id) WHERE is_active = true;

-- Topic resources: links, YouTube videos, or Study Materials files.
CREATE TABLE IF NOT EXISTS nexus_course_topic_resources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id      UUID NOT NULL REFERENCES nexus_course_topics(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'link' CHECK (kind IN ('link', 'youtube', 'study_file')),
  title         TEXT NOT NULL,
  url           TEXT,
  study_file_id UUID REFERENCES nexus_study_files(id) ON DELETE SET NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_course_topic_resources_topic
  ON nexus_course_topic_resources(topic_id);

-- Topic tests: link a repository topic to existing tests (quiz / practice).
CREATE TABLE IF NOT EXISTS nexus_course_topic_tests (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES nexus_course_topics(id) ON DELETE CASCADE,
  test_id  UUID NOT NULL REFERENCES nexus_tests(id) ON DELETE CASCADE,
  purpose  TEXT NOT NULL DEFAULT 'practice' CHECK (purpose IN ('quiz', 'practice')),
  UNIQUE (topic_id, test_id)
);

-- ============================================================
-- 3. Teaching plans (one per batch/exam, draft -> active lifecycle)
-- ============================================================
CREATE TABLE IF NOT EXISTS nexus_teaching_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id      UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  exam_type         TEXT NOT NULL DEFAULT 'nata'
                      CHECK (exam_type IN ('nata', 'jee', 'foundation', 'custom')),
  start_date        DATE NOT NULL,
  expected_end_date DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  activated_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_teaching_plans_classroom
  ON nexus_teaching_plans(classroom_id, status);

-- Plan entries: a topic or a test placed on the plan.
--   planned_date NULL  = sits in the Unscheduled tray
--   position           = order within a day (or within the tray)
-- One entry can produce N scheduled classes (spillover continuations link back via
-- nexus_scheduled_classes.plan_entry_id below).
CREATE TABLE IF NOT EXISTS nexus_teaching_plan_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES nexus_teaching_plans(id) ON DELETE CASCADE,
  topic_id     UUID REFERENCES nexus_course_topics(id) ON DELETE SET NULL,
  test_id      UUID REFERENCES nexus_tests(id) ON DELETE SET NULL,
  -- Free-text label used when a test is placed before the actual nexus_tests row exists,
  -- or for a continuation part label ('Part 2 of 2').
  label        TEXT,
  entry_type   TEXT NOT NULL DEFAULT 'live_class'
                 CHECK (entry_type IN ('live_class', 'self_learning', 'test')),
  planned_date DATE,
  position     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned', 'scheduled', 'done', 'spillover', 'skipped')),
  is_unplanned BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (topic_id IS NOT NULL OR test_id IS NOT NULL OR entry_type = 'test')
);

CREATE INDEX IF NOT EXISTS idx_nexus_teaching_plan_entries_plan
  ON nexus_teaching_plan_entries(plan_id, planned_date, position);

-- ============================================================
-- 4. Audit log (the plan's Activity feed)
-- ============================================================
-- Mirrors the nexus_document_audit_log pattern. Written by the API layer on every mutation.
CREATE TABLE IF NOT EXISTS nexus_plan_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES nexus_teaching_plans(id) ON DELETE CASCADE,
  entry_id     UUID REFERENCES nexus_teaching_plan_entries(id) ON DELETE SET NULL,
  action       TEXT NOT NULL CHECK (action IN (
                 'created', 'edited', 'activated', 'completed',
                 'added_entry', 'removed_entry', 'moved', 'rescheduled',
                 'scheduled_class', 'status_changed', 'converted'
               )),
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Human-readable summary + structured before/after, e.g.
  -- { "summary": "moved One-Point Perspective", "from": "2026-07-08", "to": "2026-07-10" }
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_plan_audit_log_plan
  ON nexus_plan_audit_log(plan_id, created_at DESC);

-- ============================================================
-- 5. Coverage link: scheduled classes point back at the plan
-- ============================================================
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS plan_entry_id  UUID REFERENCES nexus_teaching_plan_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_topic_id UUID REFERENCES nexus_course_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_scheduled_classes_plan_entry
  ON nexus_scheduled_classes(plan_entry_id) WHERE plan_entry_id IS NOT NULL;

-- ============================================================
-- 6. RLS (service-role only; API layer enforces roles)
-- ============================================================
ALTER TABLE nexus_course_modules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_topics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_topic_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_topic_tests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_teaching_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_teaching_plan_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_plan_audit_log         ENABLE ROW LEVEL SECURITY;
