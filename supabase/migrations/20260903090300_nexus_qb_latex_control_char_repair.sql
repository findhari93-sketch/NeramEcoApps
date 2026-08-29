-- ============================================================
-- Repair LaTeX destroyed by backslash-escape interpretation at import
-- ============================================================
-- A question in the bank renders as red raw source in the UI:
--
--   Let $\sqrt{x}+y=rac{5\sqrt3}{2}$ ...
--
-- "rac" is what is left of "\frac". The importer passed the CSV text through
-- something that interpreted C-style backslash escapes, so "\f" became a
-- formfeed and the "f" was consumed. The same bug ate other commands:
--
--   \frac  -> 0x0C + "rac"     (form feed)
--   \alpha -> 0x07 + "lpha"    (bell)
--   \beta  -> 0x08 + "eta"     (backspace)
--   \vec   -> 0x0B + "ec"      (vertical tab)
--
-- KaTeX cannot parse the result, so it falls back to rendering the raw string
-- in red. Students see a broken question and cannot search for it either.

-- ------------------------------------------------------------
-- 1. The unambiguous control characters
-- ------------------------------------------------------------
-- Bell, backspace, vertical tab and form feed have no legitimate use in
-- question prose, so every occurrence is this bug and can be restored
-- unconditionally. Plain replace(), not regexp_replace(), so the backslash in
-- the replacement is a literal and not a backreference.

UPDATE nexus_qb_questions
SET question_text = replace(replace(replace(replace(
      question_text, chr(7), '\a'), chr(8), '\b'), chr(11), '\v'), chr(12), '\f')
WHERE question_text ~ '[\a\b\v\f]';

UPDATE nexus_qb_questions
SET explanation_detailed = replace(replace(replace(replace(
      explanation_detailed, chr(7), '\a'), chr(8), '\b'), chr(11), '\v'), chr(12), '\f')
WHERE explanation_detailed ~ '[\a\b\v\f]';

UPDATE nexus_qb_questions
SET explanation_brief = replace(replace(replace(replace(
      explanation_brief, chr(7), '\a'), chr(8), '\b'), chr(11), '\v'), chr(12), '\f')
WHERE explanation_brief ~ '[\a\b\v\f]';

-- ------------------------------------------------------------
-- 2. Tab and carriage return, only where they spell a command
-- ------------------------------------------------------------
-- These two are NOT unconditionally safe: a tab can be real whitespace. Only
-- rewrite one that is immediately followed by the rest of a known command.
--
-- Newline is deliberately excluded entirely. 88 rows contain one and none of
-- them spell a LaTeX command; they are real line breaks separating answer
-- options ("(A) 1919\n(B) 1920"). Rewriting those to a literal "\n" would
-- corrupt eighty-eight correct questions to fix zero broken ones.

UPDATE nexus_qb_questions
SET question_text = regexp_replace(
      question_text, chr(9) || '(heta|imes|ext|au|an|o)', '\\t\1', 'g')
WHERE question_text ~ (chr(9) || '(heta|imes|ext|au|an|o)');

UPDATE nexus_qb_questions
SET question_text = regexp_replace(
      question_text, chr(13) || '(ight|angle|ho|m)', '\\r\1', 'g')
WHERE question_text ~ (chr(13) || '(ight|angle|ho|m)');

-- The search vectors are rebuilt automatically: every statement above is an
-- UPDATE on nexus_qb_questions, which fires trg_nexus_qb_search_vectors.

-- ------------------------------------------------------------
-- 3. Stop it recurring
-- ------------------------------------------------------------
-- The original importer could not be identified: the damage includes 0x07 and
-- 0x0B, which are Python/C escapes rather than JSON ones, so it was a one-off
-- script rather than any write path still in this repo. Guarding the API route
-- would therefore protect only one of several writers (API, seed scripts, the
-- Supabase dashboard, MCP).
--
-- The table is the one place every writer passes through, so the guard lives
-- here. It repairs only the four characters that have no legitimate use in
-- question prose, and deliberately leaves newline and tab alone.

CREATE OR REPLACE FUNCTION nexus_qb_repair_latex_escapes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.question_text := replace(replace(replace(replace(
    NEW.question_text, chr(7), '\a'), chr(8), '\b'), chr(11), '\v'), chr(12), '\f');
  NEW.explanation_brief := replace(replace(replace(replace(
    NEW.explanation_brief, chr(7), '\a'), chr(8), '\b'), chr(11), '\v'), chr(12), '\f');
  NEW.explanation_detailed := replace(replace(replace(replace(
    NEW.explanation_detailed, chr(7), '\a'), chr(8), '\b'), chr(11), '\v'), chr(12), '\f');
  RETURN NEW;
END;
$fn$;

-- Must run BEFORE the search trigger so the vectors index the repaired text.
-- Postgres fires same-timing triggers in name order, and
-- "trg_nexus_qb_latex_repair" sorts before "trg_nexus_qb_search_vectors".
DROP TRIGGER IF EXISTS trg_nexus_qb_latex_repair ON nexus_qb_questions;
CREATE TRIGGER trg_nexus_qb_latex_repair
  BEFORE INSERT OR UPDATE ON nexus_qb_questions
  FOR EACH ROW EXECUTE FUNCTION nexus_qb_repair_latex_escapes();
