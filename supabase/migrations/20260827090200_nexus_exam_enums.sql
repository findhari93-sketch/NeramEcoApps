-- Enum values for scheduled exams. VALUES ONLY: nothing in this file uses them.
--
-- Postgres will not let a value added by ALTER TYPE be USED in the same
-- transaction that adds it. The rule is about use, not about how many values
-- one file adds, which is why several ALTER TYPEs can share a file but the
-- index that names 'exam' has to live in the next one. Same split as
-- 20260823090000_nexus_class_test_enums.sql and 20260825090000.

-- A scheduled, invigilated sitting of a paper. Deliberately NOT reusing
-- 'class_test': that context is homework with a soft deadline, its readers all
-- take the deadline from gating.due_at, and attachClassTest refuses anything
-- that is not MCQ or NUMERICAL and caps at 40 questions. A 77-question paper
-- with a drawing section fails both guards.
ALTER TYPE nexus_placement_context ADD VALUE IF NOT EXISTS 'exam';

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'exam_scheduled';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'exam_result';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'exam_makeup_granted';
