-- Chapter weightage for the student question bank.
--
-- One call returns everything the /student/question-bank/[exam]/weightage page
-- needs to draw a chapter x year history for one exam: how many papers each year
-- has, how many questions each section had that year, and how many of those
-- questions sat in each chapter.
--
-- Chapters come from the live tag tree (nexus_qb_tags.parent_id) and the live
-- question tags (nexus_qb_questions.categories), the same source the practice
-- filter reads. A teacher re-tagging a question changes this answer on the next
-- call; nothing is denormalised.
--
--   unit    = the root subject tag (Algebra, Calculus, Orthographic Projection)
--   chapter = the root's direct child (Definite Integrals), or the root itself
--             when the root has no children (most aptitude topics)
--   deeper tags (Drawing > 2D Composition > Poster Design) roll up to their
--   chapter.
--
-- The section umbrellas 'mathematics', 'aptitude' and 'drawing' sit on nearly
-- every question of their section, so as chapters they would only restate the
-- section total. They are skipped. Their children (2D Composition) are kept.
--
-- Called with the service-role client from one Nexus route, so execution is
-- limited to service_role (see the REVOKE note at the bottom).

CREATE OR REPLACE FUNCTION public.nexus_qb_chapter_weightage(p_exam_type text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE tree(slug, label, unit, chapter, depth) AS (
    SELECT t.slug, t.label, t.slug, t.slug, 0
    FROM nexus_qb_tags t
    WHERE t.group_type = 'subject' AND t.is_active = true AND t.parent_id IS NULL
    UNION ALL
    SELECT c.slug, c.label, tr.unit,
           CASE WHEN tr.depth = 0 THEN c.slug ELSE tr.chapter END,
           tr.depth + 1
    FROM tree tr
    JOIN nexus_qb_tags p ON p.slug = tr.slug AND p.group_type = 'subject'
    JOIN nexus_qb_tags c ON c.parent_id = p.id AND c.group_type = 'subject' AND c.is_active = true
    WHERE tr.depth < 5
  ),
  usable AS (
    SELECT * FROM tree
    WHERE NOT (depth = 0 AND slug IN ('mathematics', 'aptitude', 'drawing'))
  ),
  appearances AS (
    -- One row per question per exam year it appeared in. A repeated question
    -- counts once in each year it was asked.
    SELECT DISTINCT
      q.id,
      s.year,
      CASE WHEN q.section IN ('math_mcq', 'math_numerical') THEN 'math' ELSE q.section END AS section,
      q.categories
    FROM nexus_qb_questions q
    JOIN nexus_qb_question_sources s ON s.question_id = q.id
    WHERE s.exam_type = p_exam_type
      AND s.year IS NOT NULL
      AND q.is_active = true
      AND q.status = 'active'
      AND q.section IS NOT NULL
  ),
  papers AS (
    SELECT s.year,
           COUNT(DISTINCT COALESCE(s.session, '') || '|' || COALESCE(s.shift, '')) AS papers
    FROM nexus_qb_question_sources s
    JOIN nexus_qb_questions q ON q.id = s.question_id
    WHERE s.exam_type = p_exam_type
      AND s.year IS NOT NULL
      AND q.is_active = true
      AND q.status = 'active'
    GROUP BY s.year
  ),
  totals AS (
    SELECT section, year, COUNT(DISTINCT id) AS questions
    FROM appearances
    GROUP BY section, year
  ),
  tagged AS (
    SELECT DISTINCT a.id, a.year, a.section, u.chapter
    FROM appearances a
    CROSS JOIN LATERAL unnest(a.categories) AS c(slug)
    JOIN usable u ON u.slug = c.slug
  ),
  cells AS (
    SELECT section, year, chapter, COUNT(*) AS questions
    FROM tagged
    GROUP BY section, year, chapter
  ),
  chapters AS (
    SELECT DISTINCT ON (ch.slug)
      ch.slug,
      ch.label,
      ch.unit,
      ut.label AS unit_label,
      COALESCE(ut.sort_order, 0) AS unit_order,
      COALESCE(ct.sort_order, 0) AS chapter_order,
      EXISTS (SELECT 1 FROM usable k WHERE k.unit = ch.slug AND k.depth = 1) AS has_children
    FROM usable ch
    JOIN nexus_qb_tags ut ON ut.slug = ch.unit AND ut.group_type = 'subject'
    JOIN nexus_qb_tags ct ON ct.slug = ch.slug AND ct.group_type = 'subject'
    WHERE ch.slug = ch.chapter
      AND EXISTS (SELECT 1 FROM cells x WHERE x.chapter = ch.slug)
    ORDER BY ch.slug
  )
  SELECT jsonb_build_object(
    'exam_type', p_exam_type,
    'papers',   COALESCE((SELECT jsonb_agg(jsonb_build_object('year', year, 'papers', papers) ORDER BY year) FROM papers), '[]'::jsonb),
    'totals',   COALESCE((SELECT jsonb_agg(jsonb_build_object('section', section, 'year', year, 'questions', questions) ORDER BY section, year) FROM totals), '[]'::jsonb),
    'cells',    COALESCE((SELECT jsonb_agg(jsonb_build_object('section', section, 'year', year, 'chapter', chapter, 'questions', questions)) FROM cells), '[]'::jsonb),
    'chapters', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'slug', slug, 'label', label, 'unit', unit, 'unit_label', unit_label,
                  'unit_order', unit_order, 'chapter_order', chapter_order, 'has_children', has_children))
                FROM chapters), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.nexus_qb_chapter_weightage(text) IS
  'Per exam: papers per year, questions per section per year, and questions per chapter per section per year, from live tags. Feeds the student Chapter weightage page.';

-- Supabase grants EXECUTE on new functions to anon and authenticated directly,
-- so REVOKE FROM PUBLIC alone leaves them able to call it. Name every role.
REVOKE ALL ON FUNCTION public.nexus_qb_chapter_weightage(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_qb_chapter_weightage(text) TO service_role;

NOTIFY pgrst, 'reload schema';
