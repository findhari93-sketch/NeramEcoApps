-- ============================================
-- AUTOMATIC PROFILE PHOTO APPROVAL
--
-- Until now a teacher opened every student photo, and nearly every decision was
-- the same one: yes, that is one person's face and it is clear. Nexus now asks
-- Gemini that question when a photo arrives (apps/nexus/src/lib/photo-face-check.ts)
-- and approves the clear ones on the teacher's behalf. The rules for what an
-- answer may do live in apps/nexus/src/lib/photo-auto-review.ts.
--
-- The machine only ever says yes. A "no" or a "not sure" leaves the photo in
-- Needs review for a human, because a rejection blocks the student and messages
-- them. There is no auto-reject path.
--
-- An automatic approval is a real approval for the photo gate, but the photo is
-- NOT copied onto the student's Microsoft account until a teacher confirms it
-- from the Auto-approved tab, so a later rejection never has to chase a picture
-- that is already on Teams.
--
-- Additive only. Nothing existing changes meaning: every current approval has a
-- NULL photo_review_method, which reads as a teacher approval, and the pending
-- badge (count_pending_photo_reviews) is untouched because an automatically
-- approved photo is simply 'approved'.
-- ============================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS photo_review_method TEXT,
  ADD COLUMN IF NOT EXISTS photo_ai_check      JSONB;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_photo_review_method_check;
ALTER TABLE public.users ADD CONSTRAINT users_photo_review_method_check
  CHECK (photo_review_method IS NULL OR photo_review_method IN ('teacher', 'auto'));

COMMENT ON COLUMN public.users.photo_review_method IS
  'Who approved the current photo: teacher or auto. Only meaningful when photo_status is approved; NULL on an approval reads as teacher. An auto approval is not copied to Microsoft until a teacher confirms it, which flips this to teacher.';

COMMENT ON COLUMN public.users.photo_ai_check IS
  'Latest automatic face check: { avatar_url, checked_at, model, verdict, error }. avatar_url is the photo that was judged, so a replaced photo reads as unchecked without any writer having to clear this.';

-- ============================================
-- The decision log records automatic approvals too. An automatic row has no
-- human reviewer, so reviewed_by becomes nullable, but ONLY for those rows: the
-- reviewer check below means a teacher decision can never lose its name.
-- ============================================
ALTER TABLE public.nexus_photo_reviews
  ALTER COLUMN reviewed_by DROP NOT NULL;

ALTER TABLE public.nexus_photo_reviews
  ADD COLUMN IF NOT EXISTS method   TEXT NOT NULL DEFAULT 'teacher',
  ADD COLUMN IF NOT EXISTS ai_check JSONB;

ALTER TABLE public.nexus_photo_reviews DROP CONSTRAINT IF EXISTS nexus_photo_reviews_method_check;
ALTER TABLE public.nexus_photo_reviews ADD CONSTRAINT nexus_photo_reviews_method_check
  CHECK (method IN ('teacher', 'auto'));

ALTER TABLE public.nexus_photo_reviews DROP CONSTRAINT IF EXISTS nexus_photo_reviews_reviewer_check;
ALTER TABLE public.nexus_photo_reviews ADD CONSTRAINT nexus_photo_reviews_reviewer_check
  CHECK (method = 'auto' OR reviewed_by IS NOT NULL);

COMMENT ON COLUMN public.nexus_photo_reviews.method IS
  'teacher for a human decision, auto for an approval made by the face check. Auto rows carry ai_check and no reviewed_by.';

-- New columns on tables the API reads through PostgREST.
NOTIFY pgrst, 'reload schema';
