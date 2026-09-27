-- ============================================================================
-- One person per email address, whatever the casing.
--
-- users_email_key is UNIQUE(email) and case-sensitive. Google lowercases, Entra
-- keeps admin-set casing, so "Name@neramclasses.com" and "name@neramclasses.com"
-- could be two rows. getUserByEmail now matches case-insensitively, which is
-- only safe when the index guarantees a single match.
--
-- Fails loudly (and changes nothing) while collisions remain. Merge each pair
-- with the admin merge flow first; the error lists how many groups are left.
-- ============================================================================

DO $$
DECLARE
  groups int;
BEGIN
  SELECT count(*) INTO groups
  FROM (
    SELECT lower(email) FROM public.users
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) g;

  IF groups > 0 THEN
    RAISE EXCEPTION
      'users_email_lower_unique: % email address(es) are shared by more than one user (case-insensitive). Merge them first: SELECT lower(email), array_agg(id) FROM users WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1;',
      groups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON public.users (lower(email));
