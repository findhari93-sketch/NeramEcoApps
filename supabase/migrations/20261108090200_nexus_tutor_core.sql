-- AI Tutor, part 3: sessions, concept mastery, learning events, My Learning,
-- and the similar-question candidate read.
--
-- All rows are written by the Nexus server with the service role
-- (lib/assistant/tutor/*). Students read their own rows only through API
-- routes, so every table is service-role only.

-- ── Tutor sessions ──────────────────────────────────────────────────────────
-- One open session per student per question. `state` holds what the engine
-- needs between turns (lib/assistant/tutor/engine.ts SessionState); the
-- transcript lives in nexus_assistant_messages under a 'tutor:<qid>' thread,
-- so AI replies count against the same daily allowance as the Assistant.
CREATE TABLE IF NOT EXISTS nexus_tutor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  pack_id uuid REFERENCES nexus_qb_tutor_packs(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES nexus_assistant_threads(id) ON DELETE SET NULL,
  phase text NOT NULL DEFAULT 'attempt'
    CHECK (phase IN ('diagnose', 'attempt', 'guided', 'reveal', 'practice_next', 'done')),
  step_index smallint NOT NULL DEFAULT 0,
  hints_used smallint NOT NULL DEFAULT 0 CHECK (hints_used BETWEEN 0 AND 4),
  ai_calls smallint NOT NULL DEFAULT 0,
  attempted_at timestamptz,
  revealed_at timestamptz,
  reveal_reason text CHECK (reveal_reason IN ('attempted', 'hints_exhausted', 'guided_done')),
  outcome text CHECK (outcome IN ('independent', 'with_hints', 'after_reveal', 'abandoned')),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Optimistic lock: a turn writes only if seq is still what it read.
  seq integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nts_open
  ON nexus_tutor_sessions (student_id, question_id)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nts_student_recent ON nexus_tutor_sessions (student_id, updated_at DESC);

-- ── Concept mastery ─────────────────────────────────────────────────────────
-- Evidence-based, never a label on the student: lib/assistant/tutor/mastery.ts
-- moves `score` toward a target per piece of evidence and derives `state`.
CREATE TABLE IF NOT EXISTS nexus_student_concept_mastery (
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES nexus_concepts(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (state IN ('UNKNOWN', 'INTRODUCED', 'DEVELOPING', 'PRACTICING', 'STRONG', 'MASTERED')),
  score real NOT NULL DEFAULT 0,
  evidence_n integer NOT NULL DEFAULT 0,
  independent_n integer NOT NULL DEFAULT 0,
  hard_independent_n integer NOT NULL DEFAULT 0,
  last_result text CHECK (last_result IN ('correct', 'wrong')),
  last_error_code text,
  last_evidence_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, concept_id)
);

-- ── Learning events ─────────────────────────────────────────────────────────
-- What happened, for mastery history, analytics and the mistake log.
CREATE TABLE IF NOT EXISTS nexus_learning_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  question_id uuid REFERENCES nexus_qb_questions(id) ON DELETE SET NULL,
  concept_ids uuid[] NOT NULL DEFAULT '{}',
  session_id uuid REFERENCES nexus_tutor_sessions(id) ON DELETE SET NULL,
  error_code text,
  evidence text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nle_student_recent ON nexus_learning_events (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nle_mistakes ON nexus_learning_events (student_id, error_code, created_at DESC)
  WHERE error_code IS NOT NULL;

-- ── My Learning ─────────────────────────────────────────────────────────────
-- What a student chose to keep. The server rebuilds the body from the pack;
-- a student never posts the content (lib/assistant/tutor/save.ts).
CREATE TABLE IF NOT EXISTS nexus_learning_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('formula', 'concept', 'explanation', 'mistake', 'shortcut', 'example', 'diagram', 'bookmark')),
  title text NOT NULL CHECK (length(title) <= 200),
  body_md text NOT NULL CHECK (length(body_md) <= 4000),
  source_ref text,
  source_question_id uuid REFERENCES nexus_qb_questions(id) ON DELETE SET NULL,
  source_session_id uuid REFERENCES nexus_tutor_sessions(id) ON DELETE SET NULL,
  concept_ids uuid[] NOT NULL DEFAULT '{}',
  chapter_tag_id uuid REFERENCES nexus_qb_tags(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR length(note) <= 1000),
  important boolean NOT NULL DEFAULT false,
  -- Active recall (R2): Leitner box and when the card is next due.
  recall_box smallint NOT NULL DEFAULT 0,
  recall_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Saving the same thing twice from the same question is one item.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nli_unique_source
  ON nexus_learning_items (student_id, source_question_id, source_ref)
  WHERE source_question_id IS NOT NULL AND source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nli_student_recent ON nexus_learning_items (student_id, created_at DESC);

ALTER TABLE nexus_tutor_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_tutor_sessions" ON nexus_tutor_sessions;
CREATE POLICY "service_role_tutor_sessions" ON nexus_tutor_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nexus_student_concept_mastery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_concept_mastery" ON nexus_student_concept_mastery;
CREATE POLICY "service_role_concept_mastery" ON nexus_student_concept_mastery
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nexus_learning_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_learning_events" ON nexus_learning_events;
CREATE POLICY "service_role_learning_events" ON nexus_learning_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nexus_learning_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_learning_items" ON nexus_learning_items;
CREATE POLICY "service_role_learning_items" ON nexus_learning_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Similar-question candidates ─────────────────────────────────────────────
-- Active maths questions sharing at least one concept with p_question, minus
-- the same repeat group and anything p_student already answered correctly.
-- Ids and metadata only: no question text, key or explanation, so a caller
-- can never read a solution through it. lib/assistant/tutor/similar.ts sorts
-- the rows into the four levels.
CREATE OR REPLACE FUNCTION public.nexus_tutor_similar_candidates(
  p_student uuid,
  p_question uuid,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  question_id uuid,
  concept_ids uuid[],
  core_ids uuid[],
  difficulty text,
  attempted boolean,
  has_pack boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT concept_id FROM nexus_qb_question_concepts WHERE question_id = p_question
  ),
  src_group AS (
    SELECT repeat_group_id FROM nexus_qb_questions WHERE id = p_question
  ),
  cand AS (
    SELECT qc.question_id, count(*) AS shared
    FROM nexus_qb_question_concepts qc
    JOIN src USING (concept_id)
    WHERE qc.question_id <> p_question
    GROUP BY qc.question_id
  )
  SELECT
    q.id,
    (SELECT coalesce(array_agg(x.concept_id), '{}') FROM nexus_qb_question_concepts x WHERE x.question_id = q.id),
    (SELECT coalesce(array_agg(x.concept_id), '{}') FROM nexus_qb_question_concepts x WHERE x.question_id = q.id AND x.role = 'core'),
    q.difficulty,
    EXISTS (SELECT 1 FROM nexus_qb_student_attempts a WHERE a.student_id = p_student AND a.question_id = q.id),
    EXISTS (SELECT 1 FROM nexus_qb_tutor_packs p WHERE p.question_id = q.id AND p.status IN ('verified', 'reviewed'))
  FROM cand c
  JOIN nexus_qb_questions q ON q.id = c.question_id
  WHERE q.is_active
    AND q.status = 'active'
    AND q.section IN ('math_mcq', 'math_numerical')
    AND (q.repeat_group_id IS NULL OR q.repeat_group_id IS DISTINCT FROM (SELECT repeat_group_id FROM src_group))
    AND NOT EXISTS (
      SELECT 1 FROM nexus_qb_student_attempts a
      WHERE a.student_id = p_student AND a.question_id = q.id AND a.is_correct
    )
  ORDER BY c.shared DESC, q.id
  LIMIT greatest(1, least(coalesce(p_limit, 40), 100));
$$;

-- Supabase grants EXECUTE to anon and authenticated by default, so REVOKE
-- FROM PUBLIC alone leaves them able to call it. Name every role.
REVOKE ALL ON FUNCTION public.nexus_tutor_similar_candidates(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_tutor_similar_candidates(uuid, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
