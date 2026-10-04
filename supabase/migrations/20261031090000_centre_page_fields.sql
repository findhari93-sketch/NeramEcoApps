-- Centre pages: the fields the classroom city pages show, edited in Admin > Centres.
--
-- offline_centers.photos stays jsonb. Entries move from bare URL strings to
-- objects: { url, og, alt, kind, w, h, hero }. Marketing reads both shapes.

ALTER TABLE public.offline_centers
  ADD COLUMN IF NOT EXISTS established_year integer,
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS description_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_checked_at date,
  -- Already on prod; missing on staging.
  ADD COLUMN IF NOT EXISTS nearby_cities jsonb;

ALTER TABLE public.offline_centers
  DROP CONSTRAINT IF EXISTS offline_centers_established_year_check;
ALTER TABLE public.offline_centers
  ADD CONSTRAINT offline_centers_established_year_check
  CHECK (established_year IS NULL OR established_year BETWEEN 1990 AND 2100);

COMMENT ON COLUMN public.offline_centers.description IS
  'Staff-written "About this centre" paragraph for the city page. Shown only when description_reviewed.';
COMMENT ON COLUMN public.offline_centers.landmark IS
  'Near-by landmark shown under the address, e.g. "Near Lakshmi Shruthi Signal".';
COMMENT ON COLUMN public.offline_centers.rating_checked_at IS
  'Date staff copied rating and review_count from Google. The page hides the line after 90 days.';

-- Public read: centre photos appear on public pages and in Google results.
-- Writes only through the service role (Admin API routes).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('centre-photos', 'centre-photos', true, 5242880,
        ARRAY['image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
