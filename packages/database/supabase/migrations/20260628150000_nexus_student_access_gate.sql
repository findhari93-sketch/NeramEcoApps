-- Nexus student access gate ("closed for renovation").
--
-- During the 2026-27 rebuild, Nexus is closed to all students by default and
-- reopened to them one by one as features are finished. This mirrors the
-- existing alumni lockout: a single per-student flag, checked at the
-- /api/auth/me chokepoint, that renders a friendly "preparing your classroom"
-- screen instead of the app.
--
-- The gate only affects students (nexusRole === 'student'). Teachers and admins
-- are never gated. It changes no enrollment, attendance, or progress data and
-- is fully reversible (flip the flag true, or drop the column).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nexus_access_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.nexus_access_enabled IS
  'When true, this student may enter Nexus. Default false closes Nexus to all students during the 2026-27 rebuild; admins flip it true to admit students one by one. Teachers/admins are unaffected (the gate only applies to students).';

-- Fast lookup of who currently has access.
CREATE INDEX IF NOT EXISTS idx_users_nexus_access_enabled
  ON users(nexus_access_enabled)
  WHERE nexus_access_enabled = true;

-- Keep the Playwright E2E student logged-in (it authenticates against the real
-- /api/auth/me, so it must be allowed through the gate).
UPDATE users
  SET nexus_access_enabled = true
  WHERE email IN ('e2etestingstudent@neramclasses.com');
