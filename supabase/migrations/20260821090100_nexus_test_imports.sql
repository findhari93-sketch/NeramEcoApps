-- ═══════════════════════════════════════════════════════════════════════════
-- Keep the JSON a test was built from
-- ═══════════════════════════════════════════════════════════════════════════
-- The AI import parses the teacher's paste in the browser, sends a projection
-- to the dedupe preview, sends structured rows to the commit, and then throws
-- the payload away. Nothing persists it. The only surviving trace of an import
-- is nexus_tests.created_from = 'ai_import', one TEXT value.
--
-- That is why a test's questions are read-only forever after it is created:
-- PATCH /api/question-bank/tests/[id] whitelists title, description,
-- is_published, passing_marks and test_kind, and there is no route at all that
-- changes a test's question set. Losing the JSON is losing the ability to fix
-- a typo without rebuilding the whole paper.
--
-- A separate table rather than a JSONB column on nexus_tests, because that
-- table is on the hot read path for every overview, every attempt and every
-- placement resolve, and a 40-question payload has no business being fetched
-- by any of them.

CREATE TABLE IF NOT EXISTS nexus_test_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One row per test, rewritten in place on every edit. Two rows would mean the
  -- file you download and the test you see could disagree.
  test_id UUID NOT NULL UNIQUE REFERENCES nexus_tests(id) ON DELETE CASCADE,
  -- The validated import JSON, in the same shape the wizard accepts and the
  -- teacher downloads, so a downloaded file can be edited and handed straight
  -- back without a translation step.
  payload JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paste', 'file_upload', 'pdf_generate', 'edit')),
  -- The study chapter this was generated from, when it was generated from one.
  -- nexus_qb_questions records which exam paper a question came from but has no
  -- link at all to study material, so this is the only thread back to the PDF.
  source_file_id UUID REFERENCES nexus_study_files(id) ON DELETE SET NULL,
  -- { exam, pool_size, serve, model, folder_path, dropped_ungrounded }: how the
  -- paper was asked for, which the wizard has never sent to the server.
  prompt_meta JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_test_imports_test
  ON nexus_test_imports(test_id);

-- Answers "has this chapter already got a generated test", which is what the
-- folder-wide generate run needs before it decides what to skip.
CREATE INDEX IF NOT EXISTS idx_nexus_test_imports_source_file
  ON nexus_test_imports(source_file_id)
  WHERE source_file_id IS NOT NULL;

COMMENT ON TABLE nexus_test_imports IS
  'The import JSON each test was built from, kept so the paper can be downloaded, edited and handed back.';
