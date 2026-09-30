-- Sketchbook practice days follow each student's own clock (NXS-0129).
--
-- A student in Dubai uploaded a Wednesday night sketch at 10:44 pm her time,
-- which is 12:14 am Thursday in IST, and her week showed a Thursday dot. The
-- sketchbook is a personal habit, so its days now follow the student's device
-- time zone. Classes, tests and deadlines stay on IST: they are shared moments.
--
-- 1. users.timezone
--    IANA name from the student's Nexus device, written by /api/auth/me. NULL
--    means Asia/Kolkata. A trigger nulls any name Postgres does not know, so a
--    bad value can never break a date cast below.
--
-- 2. drawing_submissions.practice_tz
--    The student's time zone frozen on the row when submitted_at is set, so a
--    trip abroad never moves past dots. Filled by a trigger, which covers every
--    write path (sketchbook, assignment, question bank, free practice). Rows
--    from before this migration stay NULL and follow users.timezone.
--
-- 3. nexus_practice_date(ts, tz)
--    The day a drawing counts for: the local date of ts minus 4 hours, so a
--    sketch uploaded at 12:30 am counts for the evening before it.
--
-- 4. nexus_drawing_days(student_ids, since) now uses nexus_practice_date.

ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text;
COMMENT ON COLUMN users.timezone IS
  'IANA time zone of the student''s Nexus device (e.g. Asia/Dubai). NULL means Asia/Kolkata. Only the sketchbook uses it.';

CREATE OR REPLACE FUNCTION public.users_timezone_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.timezone IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    NEW.timezone := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_timezone_guard ON users;
CREATE TRIGGER trg_users_timezone_guard
  BEFORE INSERT OR UPDATE OF timezone ON users
  FOR EACH ROW EXECUTE FUNCTION public.users_timezone_guard();

ALTER TABLE drawing_submissions ADD COLUMN IF NOT EXISTS practice_tz text;
COMMENT ON COLUMN drawing_submissions.practice_tz IS
  'The student''s time zone when submitted_at was set. NULL falls back to users.timezone, then Asia/Kolkata.';

CREATE OR REPLACE FUNCTION public.drawing_submissions_practice_tz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN
    NEW.practice_tz := (SELECT u.timezone FROM users u WHERE u.id = NEW.student_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_submissions_practice_tz ON drawing_submissions;
CREATE TRIGGER trg_drawing_submissions_practice_tz
  BEFORE INSERT OR UPDATE OF submitted_at ON drawing_submissions
  FOR EACH ROW EXECUTE FUNCTION public.drawing_submissions_practice_tz();

CREATE OR REPLACE FUNCTION public.nexus_practice_date(p_ts timestamptz, p_tz text)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ((p_ts - interval '4 hours') AT TIME ZONE coalesce(nullif(p_tz, ''), 'Asia/Kolkata'))::date
$$;

-- A practice day is any local day with ANY drawing upload, as before. The since
-- bound is widened by a day because a local day can start before the IST one;
-- the app clamps every date to the student's tracking start (clampDates).
CREATE OR REPLACE FUNCTION public.nexus_drawing_days(p_student_ids uuid[], p_since date)
RETURNS TABLE (student_id uuid, practice_date date, drawings int, sketches int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ds.student_id,
         public.nexus_practice_date(ds.submitted_at, coalesce(ds.practice_tz, u.timezone)) AS practice_date,
         count(*)::int AS drawings,
         (count(*) FILTER (WHERE ds.source_type = 'sketchbook'))::int AS sketches
  FROM drawing_submissions ds
  LEFT JOIN users u ON u.id = ds.student_id
  WHERE ds.student_id = ANY (p_student_ids)
    AND ds.submitted_at IS NOT NULL
    AND ds.submitted_at >= ((p_since - 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
  GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION public.nexus_drawing_days(uuid[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_drawing_days(uuid[], date) TO service_role;
REVOKE ALL ON FUNCTION public.nexus_practice_date(timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_practice_date(timestamptz, text) TO service_role;

NOTIFY pgrst, 'reload schema';
