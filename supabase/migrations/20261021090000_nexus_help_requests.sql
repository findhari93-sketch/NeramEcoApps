-- Nexus help requests from people who cannot sign in (POST /api/help).
--
-- A student stuck outside Nexus ("Can't connect to the site", a failed sign-in)
-- had no way to reach staff. /help now saves a request in support_tickets with no
-- user_id and posts it to the staff Help Desk chat in Teams.
--
-- 1. requester_ip_hash: an HMAC of the sender's IP (never the IP), so the public
--    route can cap requests per network. Counted in the database because
--    serverless functions share no memory.
-- 2. nexus_settings.help_desk_chat: which Teams group chat Neram Assistant posts
--    requests into, as { "conversation_id": "...", "service_url": "..." }. Seeded
--    empty; set it once the bot has been added to the chat (see
--    apps/nexus/src/lib/help-desk-teams.ts). Until then requests are still saved
--    and listed in Admin.
-- 3. The support-ticket-attachments bucket. Marketing's public upload route has
--    written to it since 2026-03, but no migration ever created it and it does
--    not exist on production, so every screenshot upload there has failed.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS requester_ip_hash TEXT;

COMMENT ON COLUMN support_tickets.requester_ip_hash IS
  'HMAC of the requester IP for rate limiting public requests. Never the raw IP.';

CREATE INDEX IF NOT EXISTS idx_support_tickets_requester_recent
  ON support_tickets (requester_ip_hash, created_at DESC)
  WHERE requester_ip_hash IS NOT NULL;

INSERT INTO nexus_settings (key, value)
VALUES ('help_desk_chat', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Public read: the screenshot URL goes into a Teams card and the Admin ticket
-- view. Writes only through the service role (the API routes).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('support-ticket-attachments', 'support-ticket-attachments', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
