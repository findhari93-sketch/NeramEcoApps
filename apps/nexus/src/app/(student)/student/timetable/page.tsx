'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Box, Button, Chip, IconButton, Snackbar, Typography, alpha } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useTimetableView } from '@/hooks/useTimetableView';
import AgendaView from '@/components/timetable/views/AgendaView';
import GridView from '@/components/timetable/views/GridView';
import TimetableToolbar from '@/components/timetable/views/TimetableToolbar';
import ClassReviewForm from '@/components/timetable/ClassReviewForm';
import ClassDetailPanel from '@/components/timetable/ClassDetailPanel';
import RsvpReasonDialog, { type RsvpDeclinePayload } from '@/components/timetable/RsvpReasonDialog';
import TimetableNotificationBell from '@/components/timetable/TimetableNotificationBell';
import { type ClassCardData } from '@/components/timetable/ClassCard';
import { type HolidayInfo, formatTime } from '@/components/timetable/date-utils';
import { describeReason } from '@/lib/rsvp-reasons';
import { type PlanShape } from '@/lib/plan-shape';

/** "Thu 23" for the dialog subtitle. */
function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
  });
}

interface ClassroomInfo {
  id: string;
  name: string;
  type: string;
}

/** Teams sync is expensive (several Graph calls), so once per session window. */
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const SYNC_CACHE_KEY = 'nexus_student_timetable_sync';

export default function StudentTimetable() {
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [allClasses, setAllClasses] = useState<ClassCardData[]>([]);
  const [enrolledClassrooms, setEnrolledClassrooms] = useState<ClassroomInfo[]>([]);
  const [classroomFilter, setClassroomFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [liveBannerDismissed, setLiveBannerDismissed] = useState(false);

  // Everything below now arrives with the schedule in a single request.
  const [myRsvps, setMyRsvps] = useState<Record<string, 'attending' | 'not_attending'>>({});
  const [myRsvpReasons, setMyRsvpReasons] = useState<Record<string, string | null>>({});
  const [myAttendance, setMyAttendance] = useState<Record<string, boolean>>({});
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>({});
  // Terms decide the shape of the day: evenings only during the regular year,
  // mornings too once the crash course starts.
  const [planShapes, setPlanShapes] = useState<PlanShape[]>([]);
  // Classes missed and not yet caught up on, from any week. An absence from a
  // fortnight ago is exactly the one that gets forgotten.
  const [openAbsences, setOpenAbsences] = useState<
    Array<{ class_id: string; title: string; scheduled_date: string; reason_given: boolean }>
  >([]);

  const classes =
    classroomFilter === 'all'
      ? allClasses
      : allClasses.filter((c) => c.classroom?.id === classroomFilter);

  // Agenda is the default everywhere: six columns do not fit a phone, and for a
  // one-hour-a-day timetable a list answers "what is on" faster than a grid.
  const viewState = useTimetableView(classes, 'agenda', planShapes);
  const { week, band, view } = viewState;

  const [selectedClass, setSelectedClass] = useState<ClassCardData | null>(null);
  const [reviewClass, setReviewClass] = useState<ClassCardData | null>(null);
  const [existingReview, setExistingReview] = useState<{ rating?: number; comment?: string }>({});
  const [rsvpReasonTarget, setRsvpReasonTarget] = useState<{
    classId: string;
    classTitle: string;
    classSubtitle?: string;
  } | null>(null);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const liveClass = !liveBannerDismissed
    ? allClasses.find((c) => c.status === 'live' && (c.teams_meeting_join_url || c.teams_meeting_url))
    : null;

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/timetable/my-schedule?start=${week.start}&end=${week.end}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setAllClasses(data.classes || []);
        setEnrolledClassrooms(data.classrooms || []);

        const rsvpMap: Record<string, 'attending' | 'not_attending'> = {};
        const reasonMap: Record<string, string | null> = {};
        for (const [classId, rsvp] of Object.entries(
          (data.rsvps || {}) as Record<string, { response: string; reason: string | null }>,
        )) {
          if (rsvp.response === 'not_attending' || rsvp.response === 'attending') {
            rsvpMap[classId] = rsvp.response;
          }
          reasonMap[classId] = rsvp.reason;
        }
        setMyRsvps(rsvpMap);
        setMyRsvpReasons(reasonMap);

        const attendanceMap: Record<string, boolean> = {};
        for (const [classId, a] of Object.entries(
          (data.attendance || {}) as Record<string, { attended: boolean }>,
        )) {
          attendanceMap[classId] = a.attended;
        }
        setMyAttendance(attendanceMap);

        setHolidays(data.holidays || {});
        setPlanShapes(data.planShapes || []);
        setOpenAbsences(data.openAbsences || []);
      }
    } catch (err) {
      console.error('Failed to load timetable:', err);
    } finally {
      setLoading(false);
    }
  }, [week.start, week.end, getToken]);

  const fetchScheduleRef = useRef(fetchSchedule);
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    fetchScheduleRef.current = fetchSchedule;
    getTokenRef.current = getToken;
  }, [fetchSchedule, getToken]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // Pull new Teams meetings and recordings, then refresh. Rate-limited to once
  // per 5 minutes per tab: this route makes several MS Graph calls, and it used
  // to run on EVERY mount, so navigating back and forth was re-syncing each time.
  useEffect(() => {
    const syncOnMount = async () => {
      try {
        const last = sessionStorage.getItem(SYNC_CACHE_KEY);
        if (last && Date.now() - parseInt(last, 10) < SYNC_COOLDOWN_MS) return;

        const token = await getTokenRef.current();
        if (!token) return;

        // Stamp before the call so a slow or failing sync cannot be retried in a
        // tight loop by a user navigating repeatedly.
        sessionStorage.setItem(SYNC_CACHE_KEY, Date.now().toString());

        const res = await fetch('/api/timetable/sync-now', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) await fetchScheduleRef.current();
      } catch {
        // Sync failure is silent: the user already sees their existing data.
      }
    };
    syncOnMount();
  }, []); // Empty deps: run exactly once on mount

  useEffect(() => {
    setLiveBannerDismissed(false);
  }, [allClasses]);

  /**
   * Opting back in is a DELETE server-side: no row means attending. The local
   * state mirrors that by dropping the class from the opt-out maps rather than
   * writing 'attending' into them.
   */
  const submitRsvp = async (
    classId: string,
    response: 'attending' | 'not_attending',
    decline?: RsvpDeclinePayload,
  ) => {
    const cls = allClasses.find((c) => c.id === classId);
    const classroomId = cls?.classroom?.id || activeClassroom?.id;
    if (!classroomId) return;

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: classroomId,
          response,
          reason_code: decline?.reasonCode,
          reason: decline?.note || undefined,
          wants_catchup: decline?.wantsCatchup,
        }),
      });

      if (res.ok) {
        if (response === 'attending') {
          setMyRsvps((prev) => {
            const next = { ...prev };
            delete next[classId];
            return next;
          });
          setMyRsvpReasons((prev) => {
            const next = { ...prev };
            delete next[classId];
            return next;
          });
        } else {
          setMyRsvps((prev) => ({ ...prev, [classId]: 'not_attending' }));
          setMyRsvpReasons((prev) => ({
            ...prev,
            [classId]: describeReason(decline?.reasonCode, decline?.note),
          }));
        }

        setSnackbar({
          open: true,
          message:
            response === 'attending'
              ? 'You are back on the list for this class'
              : 'Marked not attending, catch-up saved',
          severity: 'success',
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Could not update your RSVP', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Could not update your RSVP', severity: 'error' });
    }
  };

  const handleRsvp = async (classId: string, response: 'attending' | 'not_attending') => {
    if (response === 'not_attending') {
      const cls = allClasses.find((c) => c.id === classId);
      if (cls) handleDecline(cls);
      return;
    }
    await submitRsvp(classId, 'attending');
  };

  const handleDecline = (cls: ClassCardData) => {
    setRsvpReasonTarget({
      classId: cls.id,
      classTitle: cls.title,
      classSubtitle: `${formatDayLabel(cls.scheduled_date)}, ${formatTime(cls.start_time)}`,
    });
  };

  const handleRsvpReasonSubmit = async (payload: RsvpDeclinePayload) => {
    if (!rsvpReasonTarget) return;
    setRsvpSubmitting(true);
    await submitRsvp(rsvpReasonTarget.classId, 'not_attending', payload);
    setRsvpSubmitting(false);
    setRsvpReasonTarget(null);
  };

  // Catch-up gets its own guided screen in a later phase. Until then, opening
  // the class detail is the honest thing to do: it already holds the recording.
  const handleCatchUp = (cls: ClassCardData) => setSelectedClass(cls);

  const handleOpenRate = async (cls: ClassCardData) => {
    setReviewClass(cls);
    try {
      const token = await getToken();
      if (!token) return;

      const reviewClassroomId = cls.classroom?.id || activeClassroom?.id || '';
      const res = await fetch(
        `/api/timetable/reviews?class_id=${cls.id}&classroom_id=${reviewClassroomId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const data = await res.json();
        setExistingReview(data.review ? { rating: data.review.rating, comment: data.review.comment } : {});
      }
    } catch {
      setExistingReview({});
    }
  };

  const handleSubmitReview = async (rating: number, comment: string) => {
    if (!reviewClass) return;
    const reviewClassroomId = reviewClass.classroom?.id || activeClassroom?.id;
    if (!reviewClassroomId) return;
    const token = await getToken();
    if (!token) return;

    const res = await fetch('/api/timetable/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        class_id: reviewClass.id,
        classroom_id: reviewClassroomId,
        rating,
        comment,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to submit review');
    }

    setSnackbar({ open: true, message: 'Thanks for rating the class', severity: 'success' });
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800, letterSpacing: '-.02em' }}>
            Timetable
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Evening classes. You are attending everything unless you say otherwise.
          </Typography>
        </Box>
        {activeClassroom && (
          <TimetableNotificationBell classroomId={activeClassroom.id} getToken={getToken} />
        )}
      </Box>

      {/* Classroom filter, only when the student is in more than one */}
      {enrolledClassrooms.length > 1 && (
        <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
          <Chip
            label="All"
            size="small"
            variant={classroomFilter === 'all' ? 'filled' : 'outlined'}
            color={classroomFilter === 'all' ? 'primary' : 'default'}
            onClick={() => setClassroomFilter('all')}
            sx={{ minHeight: 32, fontWeight: 600 }}
          />
          {enrolledClassrooms.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              size="small"
              variant={classroomFilter === c.id ? 'filled' : 'outlined'}
              color={classroomFilter === c.id ? 'primary' : 'default'}
              onClick={() => setClassroomFilter(c.id)}
              sx={{ minHeight: 32 }}
            />
          ))}
        </Box>
      )}

      {liveClass && (
        <Alert
          severity="success"
          variant="filled"
          sx={{ mb: 2, alignItems: 'center' }}
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                href={liveClass.teams_meeting_join_url || liveClass.teams_meeting_url || ''}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ fontWeight: 700, borderColor: 'currentColor', minHeight: 40 }}
              >
                Join now
              </Button>
              <IconButton
                size="small"
                color="inherit"
                aria-label="Dismiss"
                onClick={() => setLiveBannerDismissed(true)}
                sx={{ minWidth: 40, minHeight: 40 }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {liveClass.title} is live now
          </Typography>
        </Alert>
      )}

      {/* Needs your attention. Sits above the week because a missed class is
          more urgent than the one coming up, and nothing else surfaces it. */}
      {openAbsences.length > 0 && (
        <Box
          sx={{
            mb: 2,
            p: 2,
            borderRadius: 2,
            border: (t) => `1px solid ${alpha(t.palette.warning.main, 0.4)}`,
            bgcolor: (t) => alpha(t.palette.warning.main, 0.06),
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.25 }}>
            {openAbsences.length === 1
              ? 'You missed a class'
              : `You missed ${openAbsences.length} classes`}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
            Watch the recording and finish the work to catch up.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {openAbsences.slice(0, 4).map((a) => (
              <Box
                key={a.class_id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 140, fontWeight: 600 }} noWrap>
                  {a.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {a.scheduled_date}
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => router.push(`/student/timetable/${a.class_id}/catch-up`)}
                  sx={{ textTransform: 'none', minHeight: 40 }}
                >
                  {a.reason_given ? 'Catch up' : 'Tell us why'}
                </Button>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <TimetableToolbar state={viewState} />

      {view === 'grid' ? (
        // The grid works on a phone too: it scrolls sideways with a sticky hour
        // gutter. Agenda is the default, so getting here is a deliberate choice.
        <GridView
          classes={classes}
          week={week}
          band={band}
          loading={loading}
          holidays={holidays}
          role="student"
          onClassClick={setSelectedClass}
        />
      ) : (
        <AgendaView
          classes={classes}
          week={week}
          loading={loading}
          holidays={holidays}
          role="student"
          myRsvps={myRsvps}
          myRsvpReasons={myRsvpReasons}
          myAttendance={myAttendance}
          onClassClick={setSelectedClass}
          onDecline={handleDecline}
          onCatchUp={handleCatchUp}
        />
      )}

      <ClassDetailPanel
        cls={selectedClass}
        open={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        role="student"
        classroomId={selectedClass?.classroom?.id || activeClassroom?.id || ''}
        getToken={getToken}
        myRsvp={selectedClass ? myRsvps[selectedClass.id] : null}
        myAttended={selectedClass ? (myAttendance[selectedClass.id] ?? null) : null}
        onRsvp={handleRsvp}
        onRate={handleOpenRate}
      />

      <RsvpReasonDialog
        open={!!rsvpReasonTarget}
        onClose={() => setRsvpReasonTarget(null)}
        classTitle={rsvpReasonTarget?.classTitle || ''}
        classSubtitle={rsvpReasonTarget?.classSubtitle}
        onSubmit={handleRsvpReasonSubmit}
        submitting={rsvpSubmitting}
      />

      {reviewClass && (
        <ClassReviewForm
          open={!!reviewClass}
          onClose={() => setReviewClass(null)}
          classTitle={reviewClass.title}
          existingRating={existingReview.rating}
          existingComment={existingReview.comment}
          onSubmit={handleSubmitReview}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
