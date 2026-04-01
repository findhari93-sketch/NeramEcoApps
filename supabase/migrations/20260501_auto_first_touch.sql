-- =================================================================
-- Auto First-Touch Messaging System
-- Sends personalized WhatsApp/email 30 min after user registration
-- =================================================================

-- ============ AUTO MESSAGES TABLE ============
CREATE TABLE public.auto_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'first_touch'
    CHECK (message_type IN ('first_touch','follow_up_3d','follow_up_7d','nurture')),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
  template_name TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','sent','delivered','read','failed')),
  external_message_id TEXT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  send_after TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate first_touch per user per channel
CREATE UNIQUE INDEX idx_auto_msg_first_touch_unique
  ON public.auto_messages (user_id, message_type, channel)
  WHERE message_type = 'first_touch';

-- Fast lookup for pending messages ready to send
CREATE INDEX idx_auto_msg_pending
  ON public.auto_messages (delivery_status, send_after)
  WHERE delivery_status = 'pending';

-- Lookup by user (CRM detail view)
CREATE INDEX idx_auto_msg_user_id ON public.auto_messages (user_id);

-- Auto-update timestamp
CREATE TRIGGER update_auto_messages_updated_at
  BEFORE UPDATE ON public.auto_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: service role only (cron + admin API)
ALTER TABLE public.auto_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on auto_messages"
  ON public.auto_messages FOR ALL
  USING (true) WITH CHECK (true);

-- ============ 3 FIRST-TOUCH TEMPLATES IN WA_TEMPLATES ============

-- New category
INSERT INTO public.wa_template_categories (name, slug, sort_order) VALUES
  ('Auto First Touch', 'auto-first-touch', 0);

-- Template A: Quick Question (text only)
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'First Touch — Quick Question',
  E'Hi {{student_name}} \U0001F44B This is Hari from Neram Classes.\n\nThanks for checking out our NATA/JEE tools \u2014 hope they helped!\n\nQuick question: are you preparing for NATA 2026, JEE Paper 2, or both? Happy to point you to the right resources based on where you are \U0001F642',
  ARRAY['student_name'],
  1,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'auto-first-touch';

-- Template B: Student Results Video
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'First Touch — Student Results Video',
  E'Hi {{student_name}} \U0001F44B This is Hari from Neram Classes.\n\nSaw you signed up on our app \u2014 welcome! Here''s a quick look at what our students pulled off this year \U0001F447\n\n[VIDEO: Mumbai exam center interview]\n\nWhich exam are you targeting \u2014 NATA, JEE B.Arch, or still figuring it out?',
  ARRAY['student_name'],
  2,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'auto-first-touch';

-- Template C: Drawing Tip
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'First Touch — Drawing Tip',
  E'Hi {{student_name}} \U0001F44B Welcome to Neram Classes!\n\nSince you''re exploring NATA/JEE prep, here''s something useful \u2014 a free drawing practice tip that our students swear by \U0001F447\n\n[VIDEO: Students sharing how Neram helped for Anna University]\n\nAre you already practicing drawing, or mostly focused on the aptitude side right now?',
  ARRAY['student_name'],
  3,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'auto-first-touch';

-- ============ AUTO FIRST-TOUCH SETTING ============
INSERT INTO public.site_settings (key, value) VALUES
  ('auto_first_touch', '{
    "enabled": true,
    "delay_minutes": 30,
    "email_enabled": true,
    "video_urls": {
      "first_touch_results_video": "",
      "first_touch_drawing_tip": ""
    }
  }'::JSONB)
ON CONFLICT (key) DO NOTHING;

-- ============ PG_CRON + PG_NET ============
-- These extensions enable the 15-minute auto-send cron job.
-- pg_cron: schedules SQL jobs inside PostgreSQL
-- pg_net: makes HTTP requests from SQL (calls admin API)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Note: The cron job schedule is set up via execute_sql after migration,
-- because it needs the CRON_SECRET configured as a database parameter.
