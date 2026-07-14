-- Nexus-specific login tracking.
--
-- users.last_login_at is shared across the Tools app (apps/app), Nexus, and is
-- also stamped at account creation, so it cannot answer "has this student ever
-- opened the Nexus app". These two columns are written ONLY at the Nexus auth
-- chokepoint (apps/nexus/src/app/api/auth/me/route.ts), skipped during teacher
-- "View as Student" impersonation, so they are a trustworthy Nexus-only signal.
--
-- No historical backfill is possible (past Nexus opens are unknowable), so these
-- start NULL for everyone and only populate from real logins after deploy.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nexus_first_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nexus_last_login_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.users.nexus_first_login_at IS 'First time this user authenticated to the Nexus app (set once at the /api/auth/me chokepoint, excludes impersonation).';
COMMENT ON COLUMN public.users.nexus_last_login_at  IS 'Most recent Nexus authentication (bumped on every real, non-impersonated Nexus session).';
