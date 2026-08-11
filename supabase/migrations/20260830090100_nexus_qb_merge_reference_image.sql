-- Collapse "reference image" and "model solution image" into one field.
--
-- Nobody using this screen could say what told the two apart, and in
-- practice they were almost always the same picture uploaded twice. Keeping
-- two fields also meant two upload zones for a teacher to fill in, which is
-- most of why drawing questions on old papers have neither.
--
-- solution_image_url wins as the surviving column: it is the one already
-- gated by the reveal flow (nexus_qb_drawing_reveals) and read by the test
-- player, so nothing downstream has to change to know where the picture is.
-- drawing_reference_image_url is backfilled INTO it only where a question has
-- a reference but no solution image yet, so an existing solution image is
-- never overwritten by an older reference upload.

UPDATE nexus_qb_questions
SET solution_image_url = drawing_reference_image_url
WHERE question_format = 'DRAWING_PROMPT'
  AND solution_image_url IS NULL
  AND drawing_reference_image_url IS NOT NULL;

COMMENT ON COLUMN nexus_qb_questions.drawing_reference_image_url IS
  'Deprecated: merged into solution_image_url. Kept for old rows and never written to by the editor any more. Do not read this column for new authoring; see solution_image_url.';
