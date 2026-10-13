-- College page SEO/AEO: entity data and per-college FAQs.
--
-- aliases and wikidata_id let the page tell Google and AI engines which real
-- institution it is about (schema.org alternateName and sameAs).
-- college_faqs holds 10 to 20 questions per college, written by the daily Admin
-- cron /api/cron/college-content from the college's own facts only. Staff edits
-- set generated_by = 'staff' or locked = true, which the cron never overwrites.

ALTER TABLE public.colleges
  ADD COLUMN IF NOT EXISTS aliases text[],
  ADD COLUMN IF NOT EXISTS wikidata_id text,
  ADD COLUMN IF NOT EXISTS faq_facts_hash text,
  ADD COLUMN IF NOT EXISTS faqs_generated_at timestamptz;

COMMENT ON COLUMN public.colleges.aliases IS
  'Other names students search for, e.g. MSEC or the old name. Rendered as schema.org alternateName.';
COMMENT ON COLUMN public.colleges.wikidata_id IS
  'Wikidata entity id (Q...), set by the photo cron. Rendered in schema.org sameAs.';
COMMENT ON COLUMN public.colleges.faq_facts_hash IS
  'Hash of the facts the current FAQs were written from. The content cron rewrites FAQs when it changes.';

CREATE TABLE IF NOT EXISTS public.college_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  answer text NOT NULL,
  intent text,
  fact_keys text[] NOT NULL DEFAULT '{}',
  generated_by text NOT NULL DEFAULT 'template' CHECK (generated_by IN ('ai', 'template', 'staff')),
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS college_faqs_college_idx ON public.college_faqs (college_id, position);

DROP TRIGGER IF EXISTS update_college_faqs_updated_at ON public.college_faqs;
CREATE TRIGGER update_college_faqs_updated_at
  BEFORE UPDATE ON public.college_faqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.college_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "college_faqs public read" ON public.college_faqs;
CREATE POLICY "college_faqs public read" ON public.college_faqs
  FOR SELECT USING (true);
-- No write policies: only the service role (Admin cron and API routes) writes.
