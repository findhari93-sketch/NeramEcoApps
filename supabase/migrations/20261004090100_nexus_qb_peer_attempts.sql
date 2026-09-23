-- ============================================
-- "See how others drew this"
--
-- A student practising a bank drawing can look at what classmates made of the
-- same question. The founder's reason: in the exam they get a question they
-- have never seen and have to start from nothing, so drawing blind is the skill
-- being built. But at the beginning, seeing that a thing is possible is what
-- gets a student to pick up a pencil at all. So the door is open, it is behind
-- their own upload by default, and whichever way they came through it is on the
-- record for the teacher.
--
-- Everything about who may see whose drawing is already decided in
-- nexus_inspiration_base: the author's share_drawings_opt_out, the curation
-- state, the 4 star auto-publish bar. This function adds exactly two rules of
-- its own and borrows the rest, because a second copy of a visibility rule is
-- a second place for one to leak.
--
--   1. Only other students' own drawings. Not the teacher's corrected copy of
--      one: that is a model answer, and model answers live behind the solution
--      gate, which is a different door with a different record.
--   2. Never the viewer's own work. They have it open on the same screen.
--
-- MATCHING ON THE MIRROR, NOT THE BANK QUESTION
--
-- drawing_questions now holds one mirror row per option of an "any one of two"
-- drawing, so the mirror is the precise identity: peers of 81B are the people
-- who drew 81B. Attempts made before the split point at the whole-question
-- mirror (qb_part_id = ''), and those are included for every option, because
-- the alternative is telling a student nobody has ever drawn this when several
-- people have.
-- ============================================

CREATE OR REPLACE FUNCTION nexus_qb_peer_attempts(
  p_qb_question_id uuid,
  p_part_id        text,
  p_viewer_id      uuid,
  p_scope          text DEFAULT 'visible',
  p_limit          integer DEFAULT 24
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean,
  rank real, match_kind text, total_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT b.id, b.source_kind, b.source_submission_id, b.source_drawing_question_id,
         b.image_url, b.thumbnail_url, b.image_aspect, b.title_override, b.brief,
         b.category, b.type_slugs, b.tag_labels, b.exam_types, b.paper_years,
         b.is_featured, b.is_visible, b.curation, b.auto_eligible, b.score_pct,
         b.save_count, b.source_created_at,
         b.author_id, b.author_name, b.author_first_name, b.author_last_name,
         b.author_is_alumni, b.author_academic_year, b.author_opted_out, b.is_saved,
         0::real, 'browse'::text, count(*) OVER ()
    FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, coalesce(p_scope, 'visible'), p_viewer_id, false) b
   WHERE b.source_kind = 'submission_original'
     AND b.author_id IS DISTINCT FROM p_viewer_id
     AND EXISTS (
           SELECT 1
             FROM drawing_questions dq
            WHERE dq.id = b.source_drawing_question_id
              AND dq.qb_question_id = p_qb_question_id
              AND dq.qb_part_id IN (coalesce(p_part_id, ''), '')
         )
   ORDER BY b.is_featured DESC NULLS LAST, b.source_created_at DESC, b.id
   LIMIT greatest(coalesce(p_limit, 24), 1)
$fn$;

COMMENT ON FUNCTION nexus_qb_peer_attempts(uuid, text, uuid, text, integer) IS
  'Other students'' own attempts at one bank drawing question, or at one option of it. Visibility, the author opt-out and the quality bar all come from nexus_inspiration_base. Never the teacher''s corrected copy, and never the viewer''s own work.';

REVOKE ALL ON FUNCTION nexus_qb_peer_attempts(uuid, text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_qb_peer_attempts(uuid, text, uuid, text, integer) TO service_role;
