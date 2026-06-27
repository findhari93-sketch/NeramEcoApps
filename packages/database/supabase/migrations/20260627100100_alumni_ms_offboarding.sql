-- Microsoft offboarding on graduation: store what we changed so it can be reversed.
--
-- When a student is graduated to alumni we (optionally) remove their Microsoft 365
-- license and disable their Entra sign-in (accountEnabled=false). To make restore a
-- true reversal, we record the exact license SKU ids we removed, so restore can
-- re-add the same licenses. Null when no licenses were removed (or MS offboarding
-- was skipped).
--
-- Idempotent: safe to run more than once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_removed_ms_licenses JSONB;

COMMENT ON COLUMN users.alumni_removed_ms_licenses IS 'SKU ids of the M365 licenses removed when this user was graduated to alumni, so restore can re-add them. Null when none were removed.';
