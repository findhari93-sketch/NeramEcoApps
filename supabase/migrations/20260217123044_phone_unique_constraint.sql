-- Migration: Add unique constraint on users.phone
-- Prevents duplicate phone numbers across user accounts
--
-- Before adding the constraint, we need to handle existing duplicates.
-- Strategy: Keep the user who has the most profile data (lead_profile, phone_verified),
-- and nullify the phone on the other duplicate(s).

-- Step 1: Nullify phone on duplicate users (keep the one with most data / earliest created)
-- For each phone number that appears multiple times, keep the "best" user and null out the rest
WITH ranked_duplicates AS (
  SELECT
    id,
    phone,
    ROW_NUMBER() OVER (
      PARTITION BY phone
      ORDER BY
        -- Prefer phone_verified users
        phone_verified DESC,
        -- Prefer users with email (Google-linked)
        (CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) DESC,
        -- Prefer earlier created users
        created_at ASC
    ) AS rn
  FROM users
  WHERE phone IS NOT NULL
)
UPDATE users
SET phone = NULL, phone_verified = FALSE, updated_at = NOW()
WHERE id IN (
  SELECT id FROM ranked_duplicates WHERE rn > 1
);

-- Step 2: Normalize phone numbers to consistent format before adding constraint
-- Ensure all phones start with country code
UPDATE users
SET phone = '+91' || phone
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND LENGTH(phone) = 10;

-- Step 3: Add unique constraint on phone (allows NULLs - multiple users can have no phone)
ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);

-- Step 4: Add a comment explaining the constraint
COMMENT ON CONSTRAINT users_phone_unique ON users IS
  'Each phone number can only be associated with one user account. NULL phones are allowed (not verified yet).';
