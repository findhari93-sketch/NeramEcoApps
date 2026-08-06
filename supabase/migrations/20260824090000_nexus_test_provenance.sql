-- ============================================================================
-- TEST PROVENANCE: what a paper contains, and what its author asked for
--
-- Two columns, deliberately NOT one, because they answer different questions and
-- only one of them can ever be recovered from history.
--
--   content_summary   WHAT IS IN THE PAPER. Derived from the questions
--                     themselves, so it can be computed for tests that already
--                     exist. Backfilled by this migration.
--
--   source_filters    WHAT THE AUTHOR ASKED FOR. The exam, year, categories,
--                     difficulty and search text they had set when they pressed
--                     Create. Unrecoverable for existing rows, because nothing
--                     ever stored it: POST /api/question-bank/custom-tests
--                     accepted a title, question ids and timer settings, and
--                     dropped the entire filter state on the floor.
--
-- They disagree usefully. A student who filters "HARD, spatial visualisation"
-- and then hand-picks eight questions has a source_filters that says what they
-- were hunting for and a content_summary that says what they actually took. The
-- gap between the two is the interesting part, which is why collapsing them into
-- one column would destroy the feature.
--
-- WHY THIS EXISTS: the teacher hub's Student tests tab showed 28 papers with
-- near-identical auto-generated names ("Practice - 10 questions" x3, and a
-- 544-question paper called "Practice - 0 questions"), no creation date, and no
-- indication of what any of them covered. Staff could not tell them apart, so
-- the signal in "which chapters is this student choosing to drill" was
-- unreadable.
--
-- SHAPE OF content_summary, v1. The backfill below and buildContentSummary() in
-- packages/database/src/queries/nexus/test-provenance.ts MUST produce the same
-- shape. There is a unit test pinning the TypeScript side; this comment is the
-- contract for the SQL side.
--
--   {
--     "v": 1,
--     "question_count": 27,
--     "papers":     [{"exam_type":"JEE_PAPER_2","year":2005,"session":null,"n":27}],
--     "difficulty": {"MEDIUM":18,"HARD":9},
--     "categories": [{"slug":"puzzle","n":8},{"slug":"aptitude","n":6}],
--     "formats":    {"mcq":27},
--     "generated":  "backfill"
--   }
--
-- `papers` and `categories` are capped at the top 6 by count. A 544-question
-- paper spanning 11 exam years and 23 categories is not made more legible by
-- listing all of them, and an unbounded array on a list-view read is a cost with
-- no reader. `generated` records which side produced the row, so a future
-- mismatch between the SQL and TypeScript shapes is diagnosable rather than
-- mysterious.
-- ============================================================================

ALTER TABLE nexus_tests
  ADD COLUMN IF NOT EXISTS content_summary JSONB,
  ADD COLUMN IF NOT EXISTS source_filters  JSONB;

COMMENT ON COLUMN nexus_tests.content_summary IS
  'What this paper contains, derived from its questions at compose time: question_count, papers, difficulty, categories, formats. Shape v1, see migration 20260824090000. Safe to recompute from nexus_test_questions at any time, and recomputing is the correct repair if it ever looks wrong. NOT authoritative for anything a student is graded on.';

COMMENT ON COLUMN nexus_tests.source_filters IS
  'What the author had filtered when they pressed Create: exam, year, session, categories, difficulty, formats, topic_ids, attempt_status, search text, and whether the selection was hand-picked or came from "select all matching". NULL on every row created before 20260824090000, because nothing stored it. Never derived: a NULL here means "we do not know", and must not be back-filled with a guess from content_summary.';

-- ============================================================================
-- Backfill content_summary.
--
-- Every active test, not only the student-built ones: the teacher Library and
-- By-location tabs read the same column, and the whole table is 2,414
-- nexus_test_questions rows, so scoping this narrower would save nothing and
-- leave half the hub without a description.
--
-- Only rows where content_summary IS NULL, so re-running this migration is a
-- no-op rather than a rewrite of anything composeTest has since produced.
-- ============================================================================

WITH q AS (
  SELECT tq.test_id,
         qq.difficulty,
         qq.question_format,
         qq.categories,
         p.exam_type,
         p.year,
         p.session
    FROM nexus_test_questions tq
    JOIN nexus_qb_questions qq ON qq.id = tq.qb_question_id
    LEFT JOIN nexus_qb_original_papers p ON p.id = qq.original_paper_id
   WHERE tq.test_id IN (SELECT id FROM nexus_tests WHERE content_summary IS NULL)
),
counts AS (
  SELECT test_id, count(*) AS question_count FROM q GROUP BY test_id
),
-- Top 6 source papers by how many of the test's questions came from each.
papers AS (
  SELECT test_id,
         jsonb_agg(
           jsonb_build_object('exam_type', exam_type, 'year', year, 'session', session, 'n', n)
           ORDER BY n DESC, exam_type, year
         ) AS papers
    FROM (
      SELECT test_id, exam_type, year, session, count(*) AS n,
             row_number() OVER (PARTITION BY test_id ORDER BY count(*) DESC, exam_type, year) AS rn
        FROM q
       WHERE exam_type IS NOT NULL
       GROUP BY test_id, exam_type, year, session
    ) ranked
   WHERE rn <= 6
   GROUP BY test_id
),
difficulty AS (
  SELECT test_id, jsonb_object_agg(difficulty, n) AS difficulty
    FROM (SELECT test_id, difficulty, count(*) AS n FROM q WHERE difficulty IS NOT NULL GROUP BY test_id, difficulty) d
   GROUP BY test_id
),
formats AS (
  SELECT test_id, jsonb_object_agg(question_format, n) AS formats
    FROM (SELECT test_id, question_format, count(*) AS n FROM q WHERE question_format IS NOT NULL GROUP BY test_id, question_format) f
   GROUP BY test_id
),
-- Top 6 categories by count. A question carries an ARRAY of categories, so it is
-- unnested first and one question can legitimately count towards several.
categories AS (
  SELECT test_id,
         jsonb_agg(jsonb_build_object('slug', cat, 'n', n) ORDER BY n DESC, cat) AS categories
    FROM (
      SELECT test_id, cat, count(*) AS n,
             row_number() OVER (PARTITION BY test_id ORDER BY count(*) DESC, cat) AS rn
        FROM q, LATERAL unnest(COALESCE(q.categories, '{}'::text[])) AS cat
       GROUP BY test_id, cat
    ) ranked
   WHERE rn <= 6
   GROUP BY test_id
)
UPDATE nexus_tests t
   SET content_summary = jsonb_strip_nulls(
         jsonb_build_object(
           'v', 1,
           'question_count', c.question_count,
           'papers',     p.papers,
           'difficulty', d.difficulty,
           'categories', cat.categories,
           'formats',    f.formats,
           'generated',  'backfill'
         )
       )
  FROM counts c
  LEFT JOIN papers     p   ON p.test_id   = c.test_id
  LEFT JOIN difficulty d   ON d.test_id   = c.test_id
  LEFT JOIN formats    f   ON f.test_id   = c.test_id
  LEFT JOIN categories cat ON cat.test_id = c.test_id
 WHERE t.id = c.test_id
   AND t.content_summary IS NULL;

-- A test with no question rows at all gets an explicit empty summary rather than
-- staying NULL, so the UI can tell "nobody has computed this" from "this paper
-- is genuinely empty". The former is a bug to chase; the latter is a fact to
-- show the teacher.
UPDATE nexus_tests
   SET content_summary = jsonb_build_object('v', 1, 'question_count', 0, 'generated', 'backfill')
 WHERE content_summary IS NULL
   AND NOT EXISTS (SELECT 1 FROM nexus_test_questions tq WHERE tq.test_id = nexus_tests.id);

NOTIFY pgrst, 'reload schema';
