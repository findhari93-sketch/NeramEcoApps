-- Staff role capability tier for Nexus.
--
-- Why a new column instead of widening the user_type enum:
--   user_type is load-bearing across all four apps. The CRM filters
--   user_type='student', bulkSetUserRole accepts only 'teacher'|'admin', and
--   ~192 inline sites compare against 'teacher'/'admin'. Adding enum values
--   would make a new tier fail every one of those gates at once.
--   user_type ALSO gates the Admin app (AdminGuard requires user_type='admin'),
--   so demoting anyone there would remove their CRM / fees / alumni access.
--
-- Division of responsibility after this migration:
--   users.user_type  -> Admin app access tier (unchanged by this migration)
--   users.staff_role -> Nexus authority tier  (new)
--   users.can_teach  -> teaching eligibility  (new, orthogonal to authority)
--
-- can_teach controls exactly one thing: whether the person may be assigned as
-- the tutor of a scheduled class (the Add-Class tutor picker and
-- nexus_scheduled_classes.teacher_id). It grants and removes nothing else, so a
-- non-teaching manager keeps every other manager capability.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS staff_role text
    CHECK (staff_role IN ('admin', 'manager', 'teacher')),
  ADD COLUMN IF NOT EXISTS can_teach boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN users.staff_role IS
  'Nexus authority tier: admin | manager | teacher. NULL for students and for staff not yet classified (resolveStaffRole falls back to user_type). Distinct from user_type, which gates Admin app access.';

COMMENT ON COLUMN users.can_teach IS
  'Whether this person may be assigned as the tutor of a scheduled class. Orthogonal to staff_role: a manager with can_teach=false keeps every other manager capability. Meaningless for students.';

-- Partial index: only staff rows carry a staff_role, so skip the ~1750 NULLs.
CREATE INDEX IF NOT EXISTS idx_users_staff_role
  ON users (staff_role)
  WHERE staff_role IS NOT NULL;

-- Backfill step 1: derive the tier from the existing user_type for every staff
-- row. This is the safe default and keeps behaviour identical for anyone not
-- named in step 2.
UPDATE users
SET staff_role = user_type::text
WHERE staff_role IS NULL
  AND user_type IN ('admin', 'teacher');

-- Backfill step 2: the internal core team.
--
-- Matched on the email LOCAL PART, deliberately:
--   * ids differ between staging and production, and data migrations must not
--     hardcode generated ids;
--   * the domain differs per environment and per person (some accounts sit on
--     the misspelled nerasmclasses.onmicrosoft.com tenant domain, others on
--     neramclasses.com);
--   * Microsoft preserves admin-set UPN casing, so compare case-insensitively.
-- A person missing from an environment simply matches zero rows.
--
-- Both overrides are guarded on user_type IN ('admin','teacher') on purpose. A
-- migration must never hand Nexus authority to a row the rest of the system
-- still treats as a student. Some tenant accounts are mis-tagged as students by
-- the Entra sync (which defaults imports to user_type='student'); those must be
-- reclassified to a staff user_type FIRST, and only then do they pick up a
-- staff_role. Skipping them here is the safe outcome, not a missed case.

-- Tamil Selvan: manager, and a backup teacher, so he stays tutor-eligible.
UPDATE users
SET staff_role = 'manager'
WHERE lower(split_part(email, '@', 1)) = 'tamilselvan'
  AND user_type IN ('admin', 'teacher');

-- Shanthi: manager (full operational authority) but never takes a class.
UPDATE users
SET staff_role = 'manager',
    can_teach  = false
WHERE lower(split_part(email, '@', 1)) = 'shanthimano'
  AND user_type IN ('admin', 'teacher');
