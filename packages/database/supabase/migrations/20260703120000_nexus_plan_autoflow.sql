-- Nexus Course Plan v2: sequential auto-flow model
--
-- Reworks teaching plans from explicit per-entry dates to an ordered queue:
--   * `position` is now the GLOBAL queue order within a plan (gaps of 1024).
--   * Class dates are computed client/server-side by the plan-flow engine from
--     plan.start_date, skipping Sundays (Saturdays optional per plan), flowing
--     around tests pinned to fixed dates.
--   * `planned_date` is redefined: it is the PINNED date for test entries only.
--     It is NULL for auto-flow topic entries.
--   * Spillover no longer creates Continuation entries; instead session_span on
--     the entry grows and every later entry shifts automatically.
--
-- Also adds:
--   * Class Day agenda items (per-date coverage marking, seeded from the
--     topic's authored activities/drills).
--   * Catch-up tracks for late joiners + minimal student self-learning state.
--   * Topic publication flags (visible_to_students / is_self_learning).
--
-- Access is via the service-role admin client in the Nexus API routes, so RLS
-- is enabled with no policies. Role checks happen in the API layer.
--
-- Idempotent: safe to run more than once.

-- ============================================================
-- 1. Plans: schedule settings
-- ============================================================
ALTER TABLE nexus_teaching_plans
  ADD COLUMN IF NOT EXISTS saturday_classes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exam_date        DATE;

-- ============================================================
-- 2. Entries: queue order + session tracking
-- ============================================================
ALTER TABLE nexus_teaching_plan_entries
  ADD COLUMN IF NOT EXISTS session_span       INTEGER,
  ADD COLUMN IF NOT EXISTS completed_sessions INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN nexus_teaching_plan_entries.planned_date IS
  'Pinned date. Only meaningful for entry_type = ''test'' (tests sit on fixed dates); NULL for auto-flow topic entries whose dates are computed from queue position.';
COMMENT ON COLUMN nexus_teaching_plan_entries.position IS
  'Global queue order within the plan (gaps of 1024 for cheap inserts).';
COMMENT ON COLUMN nexus_teaching_plan_entries.session_span IS
  'How many class days this entry occupies. NULL = use the topic''s estimated_sessions. Carrying an overrun increments this.';

-- Backfill: convert existing rows to the queue model.
--  a) Renumber position globally per plan, preserving the visual order of the
--     old model (dated entries first by date, then tray entries by position).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY plan_id
           ORDER BY planned_date ASC NULLS LAST, position ASC, created_at ASC
         ) * 1024 AS new_position
  FROM nexus_teaching_plan_entries
)
UPDATE nexus_teaching_plan_entries e
SET position = r.new_position
FROM ranked r
WHERE e.id = r.id
  AND e.position IS DISTINCT FROM r.new_position;

--  b) planned_date now only applies to pinned tests.
UPDATE nexus_teaching_plan_entries
SET planned_date = NULL
WHERE entry_type <> 'test'
  AND planned_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_teaching_plan_entries_queue
  ON nexus_teaching_plan_entries(plan_id, position);

-- ============================================================
-- 3. Topics: publication flags
-- ============================================================
ALTER TABLE nexus_course_topics
  ADD COLUMN IF NOT EXISTS visible_to_students BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_self_learning    BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 4. Class Day agenda items
-- ============================================================
-- One row per checklist line on a class day. Seeded lazily (first Class Day
-- fetch for a date) from the topic's activities/drills markdown bullets;
-- teachers add unplanned items mid-class.
CREATE TABLE IF NOT EXISTS nexus_plan_day_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES nexus_teaching_plans(id) ON DELETE CASCADE,
  entry_id     UUID REFERENCES nexus_teaching_plan_entries(id) ON DELETE CASCADE,
  class_date   DATE NOT NULL,
  title        TEXT NOT NULL,
  -- Set when an unplanned item points at a repository topic.
  topic_id     UUID REFERENCES nexus_course_topics(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'covered', 'partial', 'skipped')),
  is_unplanned BOOLEAN NOT NULL DEFAULT false,
  source       TEXT NOT NULL DEFAULT 'seeded' CHECK (source IN ('seeded', 'manual')),
  position     INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_plan_day_items_plan_date
  ON nexus_plan_day_items(plan_id, class_date, position);

-- ============================================================
-- 5. Catch-up tracks (late joiners)
-- ============================================================
CREATE TABLE IF NOT EXISTS nexus_catchup_tracks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID NOT NULL REFERENCES nexus_teaching_plans(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL until the teacher shares the track; students only see shared tracks.
  shared_at  TIMESTAMPTZ,
  shared_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_catchup_tracks_student
  ON nexus_catchup_tracks(student_id) WHERE shared_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS nexus_catchup_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id     UUID NOT NULL REFERENCES nexus_catchup_tracks(id) ON DELETE CASCADE,
  topic_id     UUID NOT NULL REFERENCES nexus_course_topics(id) ON DELETE CASCADE,
  entry_id     UUID REFERENCES nexus_teaching_plan_entries(id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_catchup_items_track
  ON nexus_catchup_items(track_id, position);

-- ============================================================
-- 6. Audit log: new actions
-- ============================================================
ALTER TABLE nexus_plan_audit_log
  DROP CONSTRAINT IF EXISTS nexus_plan_audit_log_action_check;
ALTER TABLE nexus_plan_audit_log
  ADD CONSTRAINT nexus_plan_audit_log_action_check CHECK (action IN (
    'created', 'edited', 'activated', 'completed',
    'added_entry', 'removed_entry', 'moved', 'rescheduled',
    'scheduled_class', 'status_changed', 'converted',
    'reordered', 'coverage_logged', 'carried', 'pinned', 'shared_catchup'
  ));

-- ============================================================
-- 7. RLS (service-role only; API layer enforces roles)
-- ============================================================
ALTER TABLE nexus_plan_day_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_catchup_tracks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_catchup_items   ENABLE ROW LEVEL SECURITY;
