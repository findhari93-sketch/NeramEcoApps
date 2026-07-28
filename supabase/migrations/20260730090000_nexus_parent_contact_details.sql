-- ============================================
-- PARENT CONTACT DETAILS
--
-- Provisioning wrote the parent's email and phone onto their `users` row.
-- Both users.email and users.phone are UNIQUE across the whole ecosystem, and a
-- parent's email and phone are precisely the pair most likely to be sitting
-- there already: the parent is usually the person who filled in the enquiry
-- form, so their address has been on a `lead` row for months. Creating parent
-- access therefore failed with users_email_key on the most ordinary input there
-- is, and would have failed on users_phone_unique one field later.
--
-- These values are only a delivery address for the weekly digest and the future
-- WhatsApp channel. They are not an identity and not a login credential
-- (parents sign in with nexus_parent_credentials.login_id), so they have no
-- business holding a globally unique identity slot. They move here, onto the
-- parent's own portal record, where duplicates are allowed: two siblings'
-- guardians may legitimately share one inbox, and a parent may genuinely be
-- reachable on the same number already recorded against their child.
--
-- The parent's `users` row keeps only what it needs to be an identity: the
-- synthetic ms_oid, a display name, and user_type = 'parent'.
-- ============================================

ALTER TABLE public.nexus_parent_credentials
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

COMMENT ON COLUMN public.nexus_parent_credentials.contact_email IS
  'Where the weekly digest is sent. Deliberately NOT users.email: that column is '
  'globally unique and a parent''s address is usually already on a lead row. Not '
  'unique here, because two guardians may share one inbox. Never a login id.';

COMMENT ON COLUMN public.nexus_parent_credentials.contact_phone IS
  'Reachable number, and the WhatsApp destination once a provider is wired. '
  'Deliberately NOT users.phone, which is globally unique. Stored E.164 where '
  'the input allowed it to be normalised. Not unique here.';

-- Carry over anything the old code managed to write before it started failing,
-- so no already-provisioned parent silently loses their digest address.
UPDATE public.nexus_parent_credentials c
   SET contact_email = COALESCE(c.contact_email, u.email),
       contact_phone = COALESCE(c.contact_phone, u.phone)
  FROM public.users u
 WHERE u.id = c.parent_user_id
   AND u.ms_oid LIKE 'parent:%'
   AND (u.email IS NOT NULL OR u.phone IS NOT NULL);

-- Then release the unique slots those rows were holding. Scoped by BOTH the
-- synthetic ms_oid and user_type so this can only ever touch a row that parent
-- provisioning itself created, never a real student, teacher or lead. It runs
-- after the backfill above, so nothing is lost.
UPDATE public.users
   SET email = NULL,
       phone = NULL
 WHERE ms_oid LIKE 'parent:%'
   AND user_type = 'parent'
   AND (email IS NOT NULL OR phone IS NOT NULL);

NOTIFY pgrst, 'reload schema';
