-- Personal (Google/Gmail) email for students, kept as a personal-detail field.
--
-- Many students sign into the student app with a personal Google account while
-- Neram issues them an @neramclasses.com Microsoft account. When the duplicate
-- rows are merged, the @neramclasses.com address stays as the primary `email`
-- (business identity) and the personal Gmail is preserved here.
--
-- Intentionally NOT UNIQUE: the unique business identity remains users.email.

ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_email TEXT;

COMMENT ON COLUMN users.personal_email IS
  'Student personal email (e.g. their Google/Gmail used for app login). Kept as a personal detail; primary identity stays users.email.';
