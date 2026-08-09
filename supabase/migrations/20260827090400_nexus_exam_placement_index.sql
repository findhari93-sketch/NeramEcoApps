-- One active paper per exam.
--
-- Separate file from the enum addition because this NAMES the value 'exam', and
-- Postgres will not let a value added by ALTER TYPE be used in the transaction
-- that added it.
--
-- The list is the one from 20260825090100 plus 'exam'. qb_paper stays in it;
-- class_test and the rest stay out, because those contexts legitimately hold
-- several tests.

DROP INDEX IF EXISTS uq_placement_single_test;
CREATE UNIQUE INDEX uq_placement_single_test
  ON nexus_test_placements(context_type, context_id)
  WHERE is_active = true
    AND context_type IN (
      'study_file',
      'class_recap_section',
      'foundation_section',
      'module_item',
      'qb_paper',
      'exam'
    );

-- REMINDER for createExamSeries, and this has already cost a day once:
-- uq_placement_test_context, the OTHER unique rule on this table, is
-- UNIQUE(context_type, context_id, test_id) with NO WHERE clause. A deactivated
-- row therefore occupies its triple forever, so swapping an exam's paper back
-- to one it previously used must REVIVE the existing row, never insert a new
-- one. See attachClassTest (class-test.ts) and linkTestToQBPaper (qb-papers.ts)
-- for the pattern.
