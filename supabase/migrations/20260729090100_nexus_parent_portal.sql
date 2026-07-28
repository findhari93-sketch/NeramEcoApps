-- ============================================
-- NEXUS PARENT PORTAL
--
-- Parents have no Microsoft account. They sign in with an ADMIN-ISSUED login id
-- and password. Their `users` row carries a synthetic ms_oid of the form
-- 'parent:<uuid>' so every existing route's .eq('ms_oid', ...) resolves them
-- with no per-route change. That is the same trick the impersonation token
-- already uses (see apps/nexus/src/lib/impersonation-token.ts).
--
-- Two rival link tables existed and were never reconciled.
-- nexus_parent_links wins: it has the right unique key and is the one the app
-- already reads. nexus_parent_invite_codes is DEPRECATED here, not dropped,
-- because it may carry production rows a migration cannot see.
--
-- RLS follows the Nexus convention throughout: enable, then a service_role-only
-- policy. auth.uid() is ALWAYS NULL in Nexus (it authenticates via MSAL, not
-- Supabase Auth), so any policy referencing it is dead code and grants nothing.
-- ALL parent authorization lives in the API layer, in assertParentOf().
-- ============================================


-- ── 1. Canonicalise nexus_parent_links ────────────────────────────────────
-- Under admin-issued credentials there is no invite to accept, so the two
-- invite columns stop being meaningful and must stop being NOT NULL. Existing
-- unique index on invite_token is kept: Postgres allows many NULLs in a unique
-- index, so nullable + unique is exactly the behaviour wanted.
ALTER TABLE public.nexus_parent_links
  ALTER COLUMN invite_token      DROP NOT NULL,
  ALTER COLUMN invite_expires_at DROP NOT NULL;

ALTER TABLE public.nexus_parent_links
  -- Which classroom the link was created against. Denormalised so the digest
  -- cron can batch by classroom without joining through enrollments.
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.nexus_classrooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relationship TEXT NOT NULL DEFAULT 'parent'
    CHECK (relationship IN ('parent', 'guardian', 'other')),
  -- With two guardians on one child, whose inbox the digest goes to.
  ADD COLUMN IF NOT EXISTS is_primary   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- is_active was `BOOLEAN DEFAULT true`, i.e. nullable. A NULL there makes the
-- partial indexes below silently skip the row, so tighten it.
UPDATE public.nexus_parent_links SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.nexus_parent_links
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

-- parent_user_id was nullable because an unaccepted invite had no parent yet.
-- Under provisioning the parent row always exists first, so it can be tightened.
-- Any legacy row without a parent is an invite nobody ever accepted; it links
-- nothing and is safe to remove. Announce it rather than delete silently.
DO $$
DECLARE orphan_count INTEGER;
BEGIN
  SELECT count(*) INTO orphan_count
    FROM public.nexus_parent_links WHERE parent_user_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE NOTICE 'nexus_parent_links: removing % unaccepted invite row(s) with no parent_user_id', orphan_count;
    DELETE FROM public.nexus_parent_links WHERE parent_user_id IS NULL;
  END IF;
END$$;

ALTER TABLE public.nexus_parent_links ALTER COLUMN parent_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_parent_links_student
  ON public.nexus_parent_links (student_user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_nexus_parent_links_parent
  ON public.nexus_parent_links (parent_user_id) WHERE is_active;

-- At most one primary contact per child among live links.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nexus_parent_links_primary
  ON public.nexus_parent_links (student_user_id)
  WHERE is_active AND is_primary AND revoked_at IS NULL;

ALTER TABLE public.nexus_parent_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON public.nexus_parent_links;
CREATE POLICY "service_role_full_access" ON public.nexus_parent_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. Parent credentials ─────────────────────────────────────────────────
-- A separate table, NOT columns on `users`. `users` is shared across all four
-- apps and is read with select('*') on every single login, plus by
-- reconcileMsIdentity. Putting a password hash on that row would pull it into
-- memory on every login in the ecosystem, one serialisation mistake away from
-- leaking it. Keeping it here also gives the lockout counters a natural home.
CREATE TABLE IF NOT EXISTS public.nexus_parent_credentials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id        UUID NOT NULL UNIQUE
                          REFERENCES public.users(id) ON DELETE CASCADE,
  -- Case-insensitive by construction: always stored and queried lowercased.
  login_id              TEXT NOT NULL UNIQUE,
  -- scrypt$N=16384,r=8,p=1$<salt_b64url>$<hash_b64url>. Node's built-in crypto,
  -- so no new dependency (same reasoning as lib/impersonation-token.ts).
  password_hash         TEXT NOT NULL,
  must_change_password  BOOLEAN NOT NULL DEFAULT true,
  -- Bumped on password change and on revoke. Every session token carries the
  -- value it was minted with, and a mismatch kills the session on the very next
  -- request. This is what makes "revoke" instant rather than "within 12 hours".
  token_version         INTEGER NOT NULL DEFAULT 1,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  created_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  password_set_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at            TIMESTAMPTZ,
  revoked_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_parent_credentials_login
  ON public.nexus_parent_credentials (login_id);

ALTER TABLE public.nexus_parent_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON public.nexus_parent_credentials;
CREATE POLICY "service_role_full_access" ON public.nexus_parent_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. Login attempts (IP throttle + audit) ───────────────────────────────
-- Serverless functions share no memory, so an in-process rate limiter is
-- useless: each cold start would begin counting from zero. Raw IPs are never
-- stored; the API sha256s them before insert.
CREATE TABLE IF NOT EXISTS public.nexus_parent_login_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id      TEXT,
  ip_hash       TEXT,
  success       BOOLEAN NOT NULL DEFAULT false,
  user_agent    TEXT,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_parent_login_attempts_ip
  ON public.nexus_parent_login_attempts (ip_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_parent_login_attempts_login
  ON public.nexus_parent_login_attempts (login_id, attempted_at DESC);

ALTER TABLE public.nexus_parent_login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON public.nexus_parent_login_attempts;
CREATE POLICY "service_role_full_access" ON public.nexus_parent_login_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 4. Per-note "share with parent" ───────────────────────────────────────
-- The notes teachers actually write are rows in nexus_student_watchlist_events
-- with action = 'note' and the text in `message`. The single `notes` TEXT column
-- on nexus_student_watchlist is a free-form blob, not per-note. So the flag
-- belongs here, on the event.
--
-- Default false, and that default is the whole point: a concern note is private
-- unless a teacher deliberately shares it. Teachers stop recording honest
-- concerns the moment those notes become parent-visible by default.
ALTER TABLE public.nexus_student_watchlist_events
  ADD COLUMN IF NOT EXISTS shared_with_parent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shared_by          UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_watchlist_events_shared
  ON public.nexus_student_watchlist_events (student_id, created_at DESC)
  WHERE shared_with_parent;


-- ── 5. Who gave the absence reason ────────────────────────────────────────
-- A parent may now answer on the child's behalf. The teacher must be able to
-- see WHO said it: "his mother says he was unwell" and "he says he was unwell"
-- are different pieces of evidence. Reusing the existing reason columns rather
-- than inventing a rival table keeps exactly one reason per absence.
ALTER TABLE public.nexus_class_absences
  ADD COLUMN IF NOT EXISTS reason_submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason_source TEXT
    CHECK (reason_source IS NULL OR reason_source IN ('student', 'parent', 'teacher'));


-- ── 6. Digest / alert send log ────────────────────────────────────────────
-- One row per (parent, child, kind, channel, period). The UNIQUE key is what
-- makes the cron idempotent: a retried or double-fired invocation cannot send
-- the same digest twice. period_key is 'YYYY-Www' for the weekly digest and
-- 'YYYY-MM-DD' for a slip alert, so the same slip cannot alert twice in a day.
CREATE TABLE IF NOT EXISTS public.nexus_parent_digests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  classroom_id    UUID REFERENCES public.nexus_classrooms(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('weekly_digest', 'slip_alert')),
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'in_app', 'whatsapp')),
  period_key      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent', 'failed', 'skipped')),
  -- Why it was skipped ('no_email', 'no_signals', 'not_configured') or the
  -- provider error. Keeps a silent non-send debuggable.
  detail          TEXT,
  -- The rendered payload, so support can answer "what did we actually tell them".
  snapshot        JSONB,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_id, kind, channel, period_key)
);

CREATE INDEX IF NOT EXISTS idx_nexus_parent_digests_parent
  ON public.nexus_parent_digests (parent_user_id, sent_at DESC);

ALTER TABLE public.nexus_parent_digests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON public.nexus_parent_digests;
CREATE POLICY "service_role_full_access" ON public.nexus_parent_digests
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 7. Deprecate the rival invite table ───────────────────────────────────
-- Deliberately NOT backfilled. nexus_parent_invite_codes records `created_by`
-- (the teacher who generated the code) and `used_at` (when it was redeemed),
-- but never WHO redeemed it. There is therefore no way to recover the parent
-- from a used row, and mapping created_by onto parent_user_id would link
-- teachers to students as their guardians. That missing column is precisely why
-- this design was replaced. Report any such rows so they can be re-provisioned
-- by hand rather than guessed at.
DO $$
DECLARE used_count INTEGER;
BEGIN
  SELECT count(*) INTO used_count
    FROM public.nexus_parent_invite_codes WHERE used_at IS NOT NULL;
  IF used_count > 0 THEN
    RAISE WARNING 'nexus_parent_invite_codes: % redeemed invite(s) cannot be migrated (the table never recorded who redeemed them). Re-provision these parents via the staff UI.', used_count;
  END IF;
END$$;

-- These reference auth.uid(), which is ALWAYS NULL in Nexus. They have never
-- granted or denied anything. Removing them so nobody later mistakes them for a
-- working authorization layer and skips the API-side check.
DROP POLICY IF EXISTS "teachers_read_invite_codes"   ON public.nexus_parent_invite_codes;
DROP POLICY IF EXISTS "teachers_create_invite_codes" ON public.nexus_parent_invite_codes;
DROP POLICY IF EXISTS "authenticated_read_by_code"   ON public.nexus_parent_invite_codes;

COMMENT ON TABLE public.nexus_parent_invite_codes IS
  'DEPRECATED 2026-07-29. Superseded by admin-issued credentials in '
  'nexus_parent_credentials + nexus_parent_links. No application code reads or '
  'writes this table. Kept only so a production row is not destroyed by a '
  'migration; drop it once prod confirms count(*) = 0.';

-- Same reasoning for the vestigial parent policies on the data tables: written
-- against auth.uid(), so they can never fire.
--
-- Driven off a list with an existence check rather than bare DROP POLICY
-- statements. `DROP POLICY IF EXISTS` tolerates a missing POLICY but still
-- errors on a missing TABLE, and these tables have drifted: 20260325 created
-- `nexus_drawing_submissions`, but both environments now hold
-- `drawing_submissions` instead. A hardcoded list would abort the whole
-- migration on the rename.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('nexus_attendance',                 'parents_read_linked_attendance'),
      ('nexus_student_checklist_progress', 'parents_read_linked_checklist_progress'),
      ('nexus_student_topic_progress',     'parents_read_linked_topic_progress'),
      ('nexus_drawing_submissions',        'parents_read_linked_submissions'),
      ('drawing_submissions',              'parents_read_linked_submissions'),
      ('nexus_parent_links',               'parent_links_read')
    ) AS t(table_name, policy_name)
  LOOP
    IF to_regclass('public.' || target.table_name) IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        target.policy_name, target.table_name
      );
    END IF;
  END LOOP;
END$$;


COMMENT ON TABLE public.nexus_parent_credentials IS
  'Admin-issued parent logins. password_hash is scrypt via Node crypto. '
  'token_version is bumped on password change and revoke; parent session tokens '
  'carry the value they were minted with, so a mismatch ends the session on the '
  'next request.';

COMMENT ON COLUMN public.nexus_student_watchlist_events.shared_with_parent IS
  'False by default. When true, this note is shown verbatim in the parent '
  'portal. Teachers stop writing honest concerns if notes are parent-visible by '
  'default, so sharing is always a deliberate per-note act.';

NOTIFY pgrst, 'reload schema';
