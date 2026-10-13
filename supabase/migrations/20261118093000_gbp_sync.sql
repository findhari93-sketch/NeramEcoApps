-- ============================================================================
-- Google Business Profile sync (review links Phase 3).
--
-- WHY. Students post their review on Google themselves (no API can post one for
-- them). This is the other direction: once a day Admin reads each centre's
-- Google reviews through the Business Profile API, so staff can
--   * see the live Google rating and count per centre (and the marketing pages
--     quote it, through offline_centers.rating / review_count),
--   * confirm a student's "I posted it" against a real Google review,
--   * reply to every review (AI drafts, staff approve and post),
--   * post a student's success to the centre's Google profile as an Update.
-- Nothing runs until the API is approved and its credentials are set; the cron
-- then no-ops with a clear "not connected" answer.
--
-- Written to re-run safely.
-- ============================================================================

-- Which Business Profile location a centre is ("locations/1234567890").
-- Filled automatically by matching the API's placeId to google_place_id.
ALTER TABLE public.offline_centers
  ADD COLUMN IF NOT EXISTS gbp_location_name text;

-- A student's "I posted it", confirmed against a real Google review.
ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS google_review_id text,
  ADD COLUMN IF NOT EXISTS google_review_matched_at timestamptz;

CREATE TABLE IF NOT EXISTS public.gbp_reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Google's resource name: accounts/{a}/locations/{l}/reviews/{r}. The key.
  google_review_name text NOT NULL,
  center_id          uuid REFERENCES public.offline_centers(id) ON DELETE SET NULL,
  location_name      text NOT NULL,
  reviewer_name      text,
  reviewer_photo_url text,
  star_rating        integer CHECK (star_rating IS NULL OR star_rating BETWEEN 1 AND 5),
  comment            text,
  create_time        timestamptz,
  update_time        timestamptz,
  -- The owner reply as Google has it.
  reply_comment      text,
  reply_update_time  timestamptz,
  -- Staff workflow on our side.
  reply_draft        text,
  reply_drafted_at   timestamptz,
  reply_posted_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_request_id  uuid REFERENCES public.review_requests(id) ON DELETE SET NULL,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gbp_reviews_name_key ON public.gbp_reviews (google_review_name);
CREATE INDEX IF NOT EXISTS gbp_reviews_center_idx ON public.gbp_reviews (center_id, create_time DESC);
CREATE INDEX IF NOT EXISTS gbp_reviews_unreplied_idx ON public.gbp_reviews (create_time DESC) WHERE reply_comment IS NULL;

CREATE TABLE IF NOT EXISTS public.gbp_sync_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  trigger          text NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron', 'manual')),
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'partial', 'failed', 'not_connected')),
  locations        integer NOT NULL DEFAULT 0,
  reviews_upserted integer NOT NULL DEFAULT 0,
  matched          integer NOT NULL DEFAULT 0,
  error            text
);
CREATE INDEX IF NOT EXISTS gbp_sync_runs_started_idx ON public.gbp_sync_runs (started_at DESC);

-- A success post ("Congratulations Priya, AIR 142, SPA Delhi") for a centre's
-- Google profile. Drafted from a published, verified review; staff post it.
CREATE TABLE IF NOT EXISTS public.gbp_local_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id        uuid REFERENCES public.offline_centers(id) ON DELETE SET NULL,
  testimonial_id   uuid REFERENCES public.testimonials(id) ON DELETE SET NULL,
  summary          text NOT NULL CHECK (char_length(summary) BETWEEN 20 AND 1500),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'failed')),
  google_post_name text,
  error            text,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  posted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS gbp_local_posts_testimonial_idx ON public.gbp_local_posts (testimonial_id);

-- Service role only, default deny: Admin API routes and the cron read and write these.
ALTER TABLE public.gbp_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gbp_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gbp_local_posts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.gbp_reviews IS
  'Google reviews per centre, read daily from the Business Profile API. Students post these themselves; we only read and reply.';

NOTIFY pgrst, 'reload schema';
