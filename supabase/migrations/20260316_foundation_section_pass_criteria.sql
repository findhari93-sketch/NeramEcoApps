-- Per-section pass criteria (replaces chapter-level min_quiz_score_pct)
-- NULL means all questions must be answered correctly to pass
ALTER TABLE nexus_foundation_sections
ADD COLUMN min_questions_to_pass INTEGER DEFAULT NULL;

-- Mark chapter-level field as deprecated (keep column for backward compat with historical data)
COMMENT ON COLUMN nexus_foundation_chapters.min_quiz_score_pct
IS 'DEPRECATED: Use nexus_foundation_sections.min_questions_to_pass instead. Retained for historical quiz attempt records.';
