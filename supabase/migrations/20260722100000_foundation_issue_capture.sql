-- Foundation issues: auto-captured technical context for student error reports.
--
-- When a student files an issue (from any app), the client now attaches:
--   * console_logs  — recent console errors/warnings, uncaught errors,
--                     unhandled rejections, and failed fetch responses.
--   * device_info   — browser / OS / device / viewport / connection / PWA.
--   * source_app    — which app the report came from ('nexus' | 'app').
--
-- These are STAFF-ONLY (shown in the Nexus teacher inbox); never surfaced to
-- the student. Both the Nexus (Microsoft-auth) and the student PWA
-- (Firebase-auth) report flows write into this one table so staff review a
-- single inbox.

ALTER TABLE nexus_foundation_issues
  ADD COLUMN IF NOT EXISTS console_logs JSONB,
  ADD COLUMN IF NOT EXISTS device_info  JSONB,
  ADD COLUMN IF NOT EXISTS source_app   TEXT NOT NULL DEFAULT 'nexus';
