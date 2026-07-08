-- Per-plan class-day overrides for the Course Plan v2 auto-flow engine.
--
-- The engine (apps/nexus/src/lib/plan-flow.ts) rolls the ordered topic queue onto
-- real class days computed from the plan's start date + weekday pattern. Two things
-- happen in real life that this table records:
--   * 'cancelled' : a would-be class day is dropped (holiday, teacher out, strike).
--                   The flow skips it, so every class after it shifts one day forward.
--   * 'makeup'    : an extra class is run on a normally-off day (a Sunday, an off
--                   Saturday) to pull a slipping plan back onto its timeline.
--
-- One row per (plan, date). Fed into FlowOptions as holidays (cancelled) and
-- extraDays (makeup).
CREATE TABLE IF NOT EXISTS nexus_plan_schedule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_teaching_plans(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cancelled', 'makeup')),
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, date)
);

CREATE INDEX IF NOT EXISTS idx_nexus_plan_schedule_overrides_plan
  ON nexus_plan_schedule_overrides (plan_id);

-- RLS on, no policies: all access is via the service-role admin client behind the
-- staff-gated API routes (matches the other nexus_* course-plan tables).
ALTER TABLE nexus_plan_schedule_overrides ENABLE ROW LEVEL SECURITY;
