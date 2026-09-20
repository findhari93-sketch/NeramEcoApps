-- A stretch of days a student told us in advance they cannot attend.
--
-- The per-class RSVP (nexus_class_rsvp) answers "not this Thursday". It cannot
-- answer "I have quarterly exams for the next fortnight", so a student sitting
-- school exams had to decline eight classes one at a time. Nobody does that, and
-- the register then read them as eight unexplained misses, indistinguishable
-- from a student who had simply stopped coming.
--
-- Deliberately NOT nexus_enrollments.participation_status = 'dormant'. A paused
-- student is dropped from the roster by loadClassroomRoster, so they generate no
-- absence rows and appear in no register cell at all. Being away is not the same
-- as not being watched: an away student still owes the catch-up work.

CREATE TABLE IF NOT EXISTS nexus_student_away_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Both ends inclusive. ends_on NULL means open ended: "I will be back after my
  -- board exam, I do not know the date". That is a real thing students say, and
  -- forcing them to invent a date would make the data worse, not better.
  starts_on DATE NOT NULL,
  ends_on DATE,

  -- When a human should look at this again.
  --
  -- The hole this closes: an open-ended window makes every future class an
  -- explained miss, forever. The student stops appearing on any chase list and
  -- becomes indistinguishable from a diligent one, which is exactly dormancy's
  -- failure mode arriving through a nicer door. The register depends on
  -- "missed, no reason" staying the group that means somebody should ring.
  --
  -- The rule, and it is the important half: staleness changes what the standing
  -- view says, NEVER what the register says. A register opened in December must
  -- give the same answer about October that it gave in October. So a class
  -- inside a live window is `away` forever, regardless of this date; only the
  -- standing view reads it, to surface "away, unconfirmed since 12 Nov". The
  -- tempting alternative, expiring the window for grouping after N days, would
  -- silently turn explained misses into unexplained ones weeks later.
  review_on DATE NOT NULL,

  -- "after my board exam". Free text, because the useful version of this is
  -- rarely a date, and forcing one would make the data worse, not better.
  expected_return_note TEXT,

  -- The same closed set as nexus_class_rsvp.reason_code and
  -- nexus_class_absences.reason_code, so one vocabulary covers a single evening
  -- and a fortnight. 'clash' already reads "School or exam clash". To add a code,
  -- widen this constraint, the other two, AND apps/nexus/src/lib/rsvp-reasons.ts.
  reason_code TEXT NOT NULL CHECK (reason_code IN ('unwell', 'family', 'clash', 'other')),
  reason_note TEXT,

  -- Who declared it. A student declares their own; a teacher records the ones
  -- told to them on WhatsApp. Auto-accepted either way: this is a reason, not an
  -- excuse, and excusing stays the teacher's separate lever (absences.excused_at).
  source TEXT NOT NULL CHECK (source IN ('student', 'teacher', 'parent')),
  created_by UUID REFERENCES users(id),

  -- Ending a window early, because they came back sooner. Never a delete: a
  -- teacher looking at last month's register needs the row that explained it.
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nexus_away_windows_ends_after_start
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

-- The only hot read: every window for a set of students, to decide which
-- classes in a date range are explained. Partial, because a cancelled window can
-- never explain anything and there is no query that wants one by student.
CREATE INDEX IF NOT EXISTS idx_away_windows_student_active
  ON nexus_student_away_windows (student_id, starts_on)
  WHERE cancelled_at IS NULL;

-- NOTE ON OVERLAP. Two windows covering the same day would be the natural thing
-- to forbid with an EXCLUDE constraint over
-- daterange(starts_on, COALESCE(ends_on,'infinity'), '[]') WHERE cancelled_at IS NULL.
-- That needs the btree_gist extension, which is NOT installed on this production
-- database, and installing an extension there is a larger risk than the problem
-- given how reliably migrations here drift between staging and prod. So overlap
-- is refused in the write path instead, and made harmless rather than merely
-- unlikely in the read path: coveringWindow() in apps/nexus/src/lib/away-windows.ts
-- sorts before it picks, so two overlapping rows cannot hand one screen a
-- different answer than another for the same night.

DROP TRIGGER IF EXISTS nexus_student_away_windows_updated_at ON nexus_student_away_windows;
CREATE TRIGGER nexus_student_away_windows_updated_at
  BEFORE UPDATE ON nexus_student_away_windows
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- Service-role only; authorization happens in the API layer, matching every
-- other Nexus table.
ALTER TABLE nexus_student_away_windows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_student_away_windows;
CREATE POLICY "service_role_full_access" ON nexus_student_away_windows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Which window explains this absence, for the consumers that filter in SQL and
-- so cannot call the rules module: the inactivity watchlist's no_show count, the
-- nightly chase list, the RSVP attending count.
--
-- Deliberately a foreign key and not a value stuffed into reason_code. This
-- column is MACHINE owned, so a recompute is free to set it, clear it, or point
-- it somewhere else. reason_code and reason_note are HUMAN owned, and every
-- writer upserts with ignoreDuplicates precisely so a recompute can never
-- overwrite what a student typed. That distinction is what makes a class
-- rescheduled into, or out of, a window self-heal: read-time recomputes from the
-- window every time, and derivation is allowed to correct its own cache.
ALTER TABLE nexus_class_absences
  ADD COLUMN IF NOT EXISTS away_window_id UUID
  REFERENCES nexus_student_away_windows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_absences_away_window
  ON nexus_class_absences (away_window_id)
  WHERE away_window_id IS NOT NULL;

-- The teacher's notification when a student declares a window.
--
-- A student stepping out of one class raises only the timetable bell (see
-- notifyRsvpToTeacher). Disappearing for three weeks deserves the normal door,
-- sendNudge with audience 'staff', and that requires an event type in this enum.
--
-- ADD VALUE is safe inside the migration's transaction on PG12+ so long as
-- nothing USES the value in that same transaction. Nothing here does: the first
-- write happens later, from the route.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'away_window_declared';
