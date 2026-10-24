-- Student language, third round: Telugu joins the five.
--
-- Admin now shows the language mark on every person's avatar (PersonAvatar) and
-- lets staff confirm it, and Andhra Pradesh and Telangana leads arrive often
-- enough that Telugu has to be offerable before the first one enrols. The mark is
-- a Latin T, like K and M, because staff do not read the script.
--
-- Only the CHECK widens. No row changes, and NULL keeps meaning "nobody recorded
-- it" (shown as English, or as a grey "likely" guess in Admin that is never saved).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_home_language_check;
ALTER TABLE public.users ADD CONSTRAINT users_home_language_check
  CHECK (home_language IN ('english', 'tamil', 'hindi', 'kannada', 'malayalam', 'telugu'));

COMMENT ON COLUMN public.users.home_language IS
  'Staff recorded in Nexus (capability coord.student.stage) or Admin (person page and demo desk). The one language besides English that the person follows best: english, tamil, hindi, kannada, malayalam or telugu. NULL means nobody has recorded it: Nexus shows it as English, Admin may show a grey guess from locale or place that is never written back. Audited in user_profile_history (field home_language) and, from Nexus, nexus_enrollment_classification_events (axis language). Never shown to students. Unrelated to preferred_language, which is the interface locale.';

NOTIFY pgrst, 'reload schema';
