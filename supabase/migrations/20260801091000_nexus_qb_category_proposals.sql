-- ============================================================
-- Nexus QB: staged category re-classification
--
-- Splitting `conic_sections` into parabola / ellipse / hyperbola (and finding
-- the locus and triangle-area questions) is done by a script, but nothing goes
-- live until a human approves it. The script writes proposals here; the teacher
-- review page approves them; nexus_qb_apply_category_proposals commits.
--
-- Deltas (add/remove) rather than a replacement array, so applying is idempotent
-- and survives a teacher editing the question between proposal and approval.
-- ============================================================

CREATE TABLE IF NOT EXISTS nexus_qb_category_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,

  -- Snapshot at proposal time. If the live row has drifted from this by the
  -- time someone approves, the proposal is marked stale instead of applied.
  current_categories text[] NOT NULL,

  proposed_add    text[] NOT NULL DEFAULT '{}',
  proposed_remove text[] NOT NULL DEFAULT '{}',

  -- 'keyword' = deterministic rules, 'ai' = model classification, 'manual' = typed by a human
  source text NOT NULL CHECK (source IN ('keyword', 'ai', 'manual')),
  confidence real,
  rationale text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'stale')),

  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  applied_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (run_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_qb_cat_proposals_pending
  ON nexus_qb_category_proposals(created_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_qb_cat_proposals_question
  ON nexus_qb_category_proposals(question_id);

ALTER TABLE nexus_qb_category_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_qb_cat_proposals" ON nexus_qb_category_proposals;
CREATE POLICY "service_role_qb_cat_proposals" ON nexus_qb_category_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Apply approved proposals.
--
-- categories[] and nexus_qb_question_tags hold the same information and nothing
-- in the database keeps them in step, so both writes happen here, in one
-- transaction. That is the whole reason this is a function and not three
-- separate PostgREST calls.
--
-- A generic categories[] -> tags trigger was considered and rejected: the
-- tagging assistant intentionally adds theme and exam tags that have no
-- categories[] counterpart, and a symmetric trigger would delete them.
-- ============================================================
CREATE OR REPLACE FUNCTION nexus_qb_apply_category_proposals(
  p_ids uuid[],
  p_reviewer uuid DEFAULT NULL
)
RETURNS TABLE (applied int, stale int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_applied int := 0;
  v_stale   int := 0;
BEGIN
  -- 0. Retire proposals whose question changed since the snapshot.
  UPDATE nexus_qb_category_proposals p
  SET status = 'stale'
  FROM nexus_qb_questions q
  WHERE p.id = ANY(p_ids)
    AND p.status IN ('pending', 'approved')
    AND q.id = p.question_id
    AND q.categories IS DISTINCT FROM p.current_categories;
  GET DIAGNOSTICS v_stale = ROW_COUNT;

  -- 1. categories[]: add the new slugs, drop the superseded ones, dedupe, sort.
  UPDATE nexus_qb_questions q
  SET categories = COALESCE((
        SELECT array_agg(DISTINCT c ORDER BY c)
        FROM unnest(q.categories || p.proposed_add) AS c
        WHERE c <> ALL(p.proposed_remove)
      ), '{}'),
      updated_at = now()
  FROM nexus_qb_category_proposals p
  WHERE p.id = ANY(p_ids)
    AND p.status IN ('pending', 'approved')
    AND p.question_id = q.id;
  GET DIAGNOSTICS v_applied = ROW_COUNT;

  -- 2. Mirror the additions into the tag join table.
  INSERT INTO nexus_qb_question_tags (question_id, tag_id, created_by)
  SELECT p.question_id, t.id, p_reviewer
  FROM nexus_qb_category_proposals p
  CROSS JOIN LATERAL unnest(p.proposed_add) AS a(slug)
  JOIN nexus_qb_tags t ON t.slug = a.slug AND t.group_type = 'subject'
  WHERE p.id = ANY(p_ids)
    AND p.status IN ('pending', 'approved')
  ON CONFLICT (question_id, tag_id) DO NOTHING;

  -- 3. Mirror the removals. Scoped to subject tags so theme/exam tags survive.
  DELETE FROM nexus_qb_question_tags qt
  USING nexus_qb_category_proposals p, nexus_qb_tags t
  WHERE p.id = ANY(p_ids)
    AND p.status IN ('pending', 'approved')
    AND qt.question_id = p.question_id
    AND qt.tag_id = t.id
    AND t.group_type = 'subject'
    AND t.slug = ANY(p.proposed_remove);

  -- 4. Close out the proposals.
  UPDATE nexus_qb_category_proposals
  SET status = 'applied',
      applied_at = now(),
      reviewed_by = COALESCE(reviewed_by, p_reviewer),
      reviewed_at = COALESCE(reviewed_at, now())
  WHERE id = ANY(p_ids)
    AND status IN ('pending', 'approved');

  RETURN QUERY SELECT v_applied, v_stale;
END;
$$;

COMMENT ON FUNCTION nexus_qb_apply_category_proposals(uuid[], uuid) IS
  'Commit approved category proposals, writing BOTH nexus_qb_questions.categories and nexus_qb_question_tags in one transaction. Nothing else keeps those two in sync.';
