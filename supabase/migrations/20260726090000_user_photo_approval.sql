-- ============================================
-- TEACHER-APPROVED PROFILE PHOTOS
-- A Nexus student must have a clear, face-visible photo of themselves that a
-- teacher has approved. There is no AI check: a human looks at every photo.
--
-- The gate value lives denormalized on `users` because /api/auth/me already does
-- `select('*')` on that row, so the check costs ZERO extra reads on the hottest
-- route in the app. Full history still lives in `user_avatars` (every photo) and
-- `nexus_photo_reviews` (every decision), both off the hot path.
--
-- Status meaning:
--   missing   no photo at all                       -> BLOCKS (when the flag is on)
--   pending   uploaded, waiting for a teacher       -> allowed in, deliberately
--   approved  a teacher looked at it and said yes   -> allowed in
--   rejected  a teacher looked at it and said no    -> BLOCKS, with a reason
--
-- Enforcement is behind the `student.photo-gate` feature flag (default off), so
-- applying this migration changes nothing on its own.
-- ============================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS photo_status            TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS photo_submitted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_reviewed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_reviewed_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS photo_avatar_id         UUID REFERENCES public.user_avatars(id) ON DELETE SET NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_photo_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_photo_status_check
  CHECK (photo_status IN ('missing', 'pending', 'approved', 'rejected'));

-- Backfill: everyone who already has an avatar (self-uploaded or synced from
-- Microsoft Graph) goes into the teacher's review queue as `pending`, which is
-- allowed in. Everyone else stays `missing`. Nobody is blocked by this migration
-- because the feature flag defaults to off.
UPDATE public.users
SET photo_status = 'pending',
    photo_submitted_at = COALESCE(photo_submitted_at, updated_at, created_at, now())
WHERE avatar_url IS NOT NULL
  AND photo_status = 'missing';

-- Partial index: serves both the review-queue listing and the staff nav badge
-- count, without indexing the large `approved` majority.
CREATE INDEX IF NOT EXISTS idx_users_photo_status_open
  ON public.users (photo_status)
  WHERE photo_status IN ('pending', 'rejected');

COMMENT ON COLUMN public.users.photo_status IS
  'Teacher approval state of the profile photo. missing and rejected block a student from Nexus when the student.photo-gate feature flag is on. pending is deliberately allowed in, so nobody is locked out waiting for a teacher to wake up.';

-- ============================================
-- Append-only decision log. Every approve/reject a teacher makes, with the
-- avatar it was about, so a disputed decision can always be traced.
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- Same convention as nexus_assignment_reminders.
-- ============================================
CREATE TABLE IF NOT EXISTS public.nexus_photo_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  avatar_id   UUID REFERENCES public.user_avatars(id) ON DELETE SET NULL,
  avatar_url  TEXT,
  decision    TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason      TEXT,
  reviewed_by UUID NOT NULL REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_photo_reviews_user
  ON public.nexus_photo_reviews (user_id, reviewed_at DESC);

ALTER TABLE public.nexus_photo_reviews ENABLE ROW LEVEL SECURITY;
