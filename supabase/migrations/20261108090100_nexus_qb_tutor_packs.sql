-- AI Tutor, part 2: tutor packs.
--
-- One pack per maths question holds what the tutor teaches with: the steps
-- (each with a choice or number check), a 4-level hint ladder, the common
-- mistakes with an error code, and the final answer. Packs are written
-- offline by scripts/qb-tutor-packs.ts and checked against the stored answer
-- key before they are marked 'verified'. A 'draft' is never served.
--
-- A pack carries a checksum of the question it was written for. The server
-- recomputes it on every read, so editing the question or its key silently
-- retires the old pack (lib/assistant/tutor/pack-store.ts).
--
-- The pack JSON never leaves the server: the tutor sends one step at a time.

CREATE TABLE IF NOT EXISTS nexus_qb_tutor_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  schema_version smallint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'reviewed', 'retired')),
  pack jsonb NOT NULL,
  verify_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_checksum text NOT NULL,
  generator text NOT NULL,
  model text,
  run_id uuid,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, version)
);

-- At most one pack a student can be taught from, per question.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nqtp_live
  ON nexus_qb_tutor_packs (question_id)
  WHERE status IN ('verified', 'reviewed');
CREATE INDEX IF NOT EXISTS idx_nqtp_status ON nexus_qb_tutor_packs (status, updated_at DESC);

ALTER TABLE nexus_qb_tutor_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_qb_tutor_packs" ON nexus_qb_tutor_packs;
CREATE POLICY "service_role_qb_tutor_packs" ON nexus_qb_tutor_packs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
