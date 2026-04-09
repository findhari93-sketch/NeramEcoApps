-- Fix FK constraints on drawing_submissions so hard-delete works cleanly.
-- All child tables either cascade-delete or nullify their reference.

-- 1. drawing_thread_status.thread_id  →  CASCADE (thread status has no meaning without the thread)
ALTER TABLE drawing_thread_status
  DROP CONSTRAINT drawing_thread_status_thread_id_fkey,
  ADD CONSTRAINT drawing_thread_status_thread_id_fkey
    FOREIGN KEY (thread_id) REFERENCES drawing_submissions(id) ON DELETE CASCADE;

-- 2. drawing_thread_status.latest_submission_id  →  SET NULL (thread can survive with no latest_submission)
ALTER TABLE drawing_thread_status
  DROP CONSTRAINT drawing_thread_status_latest_submission_id_fkey,
  ADD CONSTRAINT drawing_thread_status_latest_submission_id_fkey
    FOREIGN KEY (latest_submission_id) REFERENCES drawing_submissions(id) ON DELETE SET NULL;

-- 3. drawing_submissions.thread_id (self-referential)  →  SET NULL
ALTER TABLE drawing_submissions
  DROP CONSTRAINT fk_ds_thread_id,
  ADD CONSTRAINT fk_ds_thread_id
    FOREIGN KEY (thread_id) REFERENCES drawing_submissions(id) ON DELETE SET NULL;

-- 4. drawing_gallery_reactions.submission_id  →  CASCADE
ALTER TABLE drawing_gallery_reactions
  DROP CONSTRAINT drawing_gallery_reactions_submission_id_fkey,
  ADD CONSTRAINT drawing_gallery_reactions_submission_id_fkey
    FOREIGN KEY (submission_id) REFERENCES drawing_submissions(id) ON DELETE CASCADE;

-- 5. drawing_submission_comments.submission_id  →  CASCADE
ALTER TABLE drawing_submission_comments
  DROP CONSTRAINT drawing_submission_comments_submission_id_fkey,
  ADD CONSTRAINT drawing_submission_comments_submission_id_fkey
    FOREIGN KEY (submission_id) REFERENCES drawing_submissions(id) ON DELETE CASCADE;
