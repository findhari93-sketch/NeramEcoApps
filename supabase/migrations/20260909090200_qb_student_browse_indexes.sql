-- Two indexes the student Question Bank browse path has always needed.
--
-- Neither of these is about a slow query in isolation: a single browse query
-- executes in about 1ms today. They are about the shape of the work. The browse
-- sort has no supporting index at all, so every page of every filter sorts the
-- whole matched set; and the paper lookup cannot use the unique index that
-- happens to cover its columns, because that index leads with question_id.
--
-- CONCURRENTLY so neither takes a write lock on a live table. That means these
-- statements cannot run inside a transaction block, which is why this file
-- contains nothing else.

-- 1. The browse sort.
--
-- getQBQuestions orders by display_order NULLS LAST then created_at DESC, over
-- rows already narrowed to is_active AND status='active'. Nothing indexed that,
-- so the planner sorted the matched set on every page turn. The predicate
-- matches the query's own filter exactly, which also gives the (is_active,
-- status) pair a single index instead of the two separate ones it was filtering
-- across.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nexus_qb_questions_browse
  ON nexus_qb_questions (display_order NULLS LAST, created_at DESC)
  WHERE is_active = true AND status = 'active';

-- 2. The paper lookup.
--
-- resolvePaperSourceIds filters exam_type + year + session + shift. The existing
-- unique index on those columns leads with question_id and so cannot serve it,
-- and idx_nexus_qb_sources_exam stops at (exam_type, year), which is why the
-- planner has been preferring the year-only index and filtering the rest. The
-- table is small enough that this is cheap today; it stops being cheap as papers
-- are added, and the ordering here matches the query's own equality columns.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nexus_qb_sources_exam_year_session_shift
  ON nexus_qb_question_sources (exam_type, year, session, shift);
