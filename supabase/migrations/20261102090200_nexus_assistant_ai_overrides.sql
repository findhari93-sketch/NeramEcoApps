-- Teacher overrides for a student's AI answers in Neram Assistant. The rule
-- itself (on while caught up) is computed live in
-- apps/nexus/src/lib/assistant/ai-access.ts; a row here beats it. Rows are
-- never edited or deleted: a new override clears the active one, and Clear
-- stamps cleared_at, so the admin page keeps the history.
CREATE TABLE IF NOT EXISTS nexus_assistant_ai_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('on', 'off')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 200),
  set_by uuid REFERENCES users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  ends_on date,
  cleared_at timestamptz,
  cleared_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_naao_student_set
  ON nexus_assistant_ai_overrides (student_id, set_at DESC);

ALTER TABLE nexus_assistant_ai_overrides ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
