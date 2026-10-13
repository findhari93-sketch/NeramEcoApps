-- College cover photos and logos, found automatically.
--
-- A new college row starts as photo_status = 'pending' whatever adds it (seed
-- SQL, a script, MCP, a future Admin form). The daily Admin cron
-- /api/cron/college-photos picks pending rows, looks on Wikidata, Wikimedia
-- Commons and the college's own website, and stores what it finds in the
-- college-photos bucket. Staff edits set 'manual', which the cron never touches.

ALTER TABLE public.colleges
  ADD COLUMN IF NOT EXISTS hero_image_credit text,
  ADD COLUMN IF NOT EXISTS hero_image_source_url text,
  ADD COLUMN IF NOT EXISTS hero_image_license text,
  ADD COLUMN IF NOT EXISTS logo_source_url text,
  ADD COLUMN IF NOT EXISTS photo_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS photo_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo_attempts integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colleges_photo_status_check') THEN
    ALTER TABLE public.colleges
      ADD CONSTRAINT colleges_photo_status_check
      CHECK (photo_status IN ('pending', 'found', 'partial', 'not_found', 'manual'));
  END IF;
END $$;

-- Colleges that already have both images were set by hand.
UPDATE public.colleges
   SET photo_status = 'manual'
 WHERE hero_image_url IS NOT NULL AND logo_url IS NOT NULL AND photo_status = 'pending';

CREATE INDEX IF NOT EXISTS colleges_photo_queue_idx
  ON public.colleges (photo_status, photo_checked_at)
  WHERE status = 'active';

COMMENT ON COLUMN public.colleges.hero_image_credit IS
  'Who took or owns the cover photo, shown next to it (CC BY licences require it).';
COMMENT ON COLUMN public.colleges.hero_image_source_url IS
  'Page the cover photo came from (Commons file page or the college site). Used for credit links and takedowns.';
COMMENT ON COLUMN public.colleges.hero_image_license IS
  'Licence of the cover photo, e.g. CC BY-SA 4.0, CC0, or official-site.';
COMMENT ON COLUMN public.colleges.photo_status IS
  'pending: queued for the photo cron. found: cover and logo. partial: one of them. not_found: nothing usable (retried monthly, 3 tries). manual: staff set it, never automated.';

-- Public read: covers appear on public pages and in Google results.
-- Writes only through the service role (Admin cron, scripts and API routes).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('college-photos', 'college-photos', true, 5242880,
        ARRAY['image/jpeg', 'image/webp', 'image/png'])
ON CONFLICT (id) DO NOTHING;
