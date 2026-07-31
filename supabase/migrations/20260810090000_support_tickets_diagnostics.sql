-- Support tickets: carry the diagnostics the student app captures automatically.
--
-- The student app's "Report a problem" button used to write into
-- nexus_foundation_issues, which put app reports into the Nexus teacher inbox.
-- Those reports now go to support_tickets instead, so the two columns that
-- table was missing move across with them. Without these, repointing the
-- reporter would silently drop the console logs and device info that make a
-- bug report diagnosable.
--
-- screenshot_urls and page_url already exist on support_tickets.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS console_logs JSONB,
  ADD COLUMN IF NOT EXISTS device_info JSONB;

COMMENT ON COLUMN support_tickets.console_logs IS
  'Recent console and network errors auto-captured by the student app reporter. Null for tickets filed through forms that do not capture them.';
COMMENT ON COLUMN support_tickets.device_info IS
  'Viewport, user agent, platform and PWA flag auto-captured by the student app reporter.';
