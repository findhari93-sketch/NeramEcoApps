-- Recording trims: fold a checkpoint the trim empties into its neighbour.
--
-- Several recaps had checkpoint 1 placed over the silent wait before class
-- while its questions cover the start of the real lesson (Islamic Architecture
-- in India: checkpoint 0:00 to 14:37, nobody speaks until 20:00). Trimming the
-- wait leaves that checkpoint zero seconds long. The player's gate ignores a
-- zero-length checkpoint, so its quiz would never open, and completion needs
-- every checkpoint passed: nobody could finish the class.
--
-- nexus_apply_recording_trim now also takes, per recap:
--   archive_sections  checkpoints to retire (archived_at), on apply
--   restore_sections  checkpoints to bring back, on revert
--   move_questions    [{ ids, to }]: questions moved to another checkpoint
-- and stores p_payload->'merged' on the trim row, so "Use original" can undo
-- each fold exactly (apps/nexus/src/lib/recording-trim-apply.ts).
-- Same signature as 20261125090000; everything else is unchanged.

CREATE OR REPLACE FUNCTION nexus_apply_recording_trim(p_trim UUID, p_payload JSONB, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trim nexus_recording_trims%ROWTYPE;
  v_mode TEXT := p_payload->>'mode';
  v_recap JSONB;
  v_section JSONB;
  v_prog JSONB;
  v_move JSONB;
  v_rows INTEGER;
  v_conflicts INTEGER := 0;
BEGIN
  SELECT * INTO v_trim FROM nexus_recording_trims WHERE id = p_trim FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trim % not found', p_trim;
  END IF;

  UPDATE nexus_scheduled_classes
  SET recording_trim_id = p_trim,
      recording_trimmed_url = p_payload->'class'->>'trimmed_url',
      recording_trim_state = p_payload->'class'->>'state',
      recording_trim_removed_seconds = (p_payload->'class'->>'removed_seconds')::numeric::int,
      recording_duration_minutes = COALESCE((p_payload->'class'->>'duration_minutes')::numeric, recording_duration_minutes)
  WHERE id = v_trim.class_id;

  IF p_payload ? 'vtt' AND p_payload->>'vtt' IS NOT NULL THEN
    UPDATE nexus_class_transcripts
    SET vtt_original = CASE WHEN v_mode = 'apply' THEN COALESCE(vtt_original, vtt) ELSE NULL END,
        vtt = p_payload->>'vtt',
        updated_at = now()
    WHERE class_id = v_trim.class_id;
  END IF;

  FOR v_recap IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'recaps', '[]'::jsonb)) LOOP
    UPDATE nexus_class_recaps
    SET recording_url = v_recap->>'recording_url',
        recording_drive_id = v_recap->>'drive_id',
        recording_item_id = v_recap->>'item_id',
        video_duration_seconds = (v_recap->>'duration_seconds')::numeric::int,
        timeline_version = timeline_version + 1,
        updated_at = now()
    WHERE id = (v_recap->>'id')::uuid;

    FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_recap->'sections', '[]'::jsonb)) LOOP
      UPDATE nexus_class_recap_sections
      SET start_timestamp_seconds = (v_section->>'start')::numeric,
          end_timestamp_seconds = (v_section->>'end')::numeric
      WHERE id = (v_section->>'id')::uuid;
    END LOOP;

    -- Folds: questions first, then retire or restore the checkpoint.
    FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(v_recap->'move_questions', '[]'::jsonb)) LOOP
      UPDATE nexus_class_recap_questions
      SET section_id = (v_move->>'to')::uuid
      WHERE id IN (SELECT (jsonb_array_elements_text(v_move->'ids'))::uuid);
    END LOOP;

    UPDATE nexus_class_recap_sections
    SET archived_at = now()
    WHERE id IN (SELECT (jsonb_array_elements_text(COALESCE(v_recap->'archive_sections', '[]'::jsonb)))::uuid)
      AND recap_id = (v_recap->>'id')::uuid;

    UPDATE nexus_class_recap_sections
    SET archived_at = NULL
    WHERE id IN (SELECT (jsonb_array_elements_text(COALESCE(v_recap->'restore_sections', '[]'::jsonb)))::uuid)
      AND recap_id = (v_recap->>'id')::uuid;

    FOR v_prog IN SELECT * FROM jsonb_array_elements(COALESCE(v_recap->'progress', '[]'::jsonb)) LOOP
      UPDATE nexus_class_recap_progress
      SET last_video_position_seconds = (v_prog->>'pos')::numeric::int,
          furthest_position_seconds = (v_prog->>'furthest')::numeric::int,
          played_ranges = v_prog->'ranges',
          watch_sessions = '{}'::jsonb,
          watch_version = watch_version + 1
      WHERE recap_id = (v_recap->>'id')::uuid
        AND student_id = (v_prog->>'student_id')::uuid
        AND watch_version = (v_prog->>'version')::int;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        v_conflicts := v_conflicts + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF p_payload ? 'chapters' AND p_payload->'chapters' IS NOT NULL AND jsonb_typeof(p_payload->'chapters') = 'array' THEN
    UPDATE nexus_class_video_meta SET chapters = p_payload->'chapters', updated_at = now() WHERE scheduled_class_id = v_trim.class_id;
  END IF;

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'PROGRESS_CONFLICT %', v_conflicts;
  END IF;

  UPDATE nexus_recording_trims
  SET status = CASE WHEN v_mode = 'apply' THEN 'applied' ELSE 'reverted' END,
      plan = jsonb_set(COALESCE(plan, '{}'::jsonb), '{merged}', COALESCE(p_payload->'merged', '[]'::jsonb)),
      applied_at = CASE WHEN v_mode = 'apply' THEN now() ELSE applied_at END,
      applied_by = CASE WHEN v_mode = 'apply' THEN p_actor ELSE applied_by END,
      reverted_at = CASE WHEN v_mode = 'revert' THEN now() ELSE reverted_at END,
      reverted_by = CASE WHEN v_mode = 'revert' THEN p_actor ELSE reverted_by END,
      updated_at = now()
  WHERE id = p_trim;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION nexus_apply_recording_trim(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_apply_recording_trim(UUID, JSONB, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
