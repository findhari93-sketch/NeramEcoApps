'use client';

/**
 * One class, read only.
 *
 * This replaces the Reconcile page, which had two faults beyond its looks: its
 * GET wrote absence rows, so opening a class changed the data, and its follow up
 * sent messages outside sendNudge. Correcting the register and chasing students
 * both live on, one menu item away, on the surfaces that already do them right.
 */
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import ClassAttendanceDialog from '@/components/timetable/attendance/ClassAttendanceDialog';
import ClassRegisterList from '@/components/attendance/ClassRegisterList';
import { formatClassDate, formatClock, formatWallClock, istRange } from '@/components/attendance/attendance-format';
import type { Insights } from '@/components/timetable/attendance/types';
import type { RegisterResponse } from '@/app/api/attendance/register/route';

function ClassRegisterPageContent() {
  const { classId } = useParams<{ classId: string }>();
  const searchParams = useSearchParams();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const view = searchParams.get('view') === 'register' ? 'register' : 'classes';
  const range = searchParams.get('range') || '30';
  const highlight = searchParams.get('student');
  const backHref = `/teacher/attendance?view=${view}&range=${range}`;

  // The same window the teacher was just looking at, not the register API's own
  // default. Without this, a class between 31 and 90 days old reached from the
  // 90-day view falls outside the (always 30-day) neighbour list, index comes
  // back -1, and prev/next silently go dead.
  const rangeDays = Number(range) || 30;
  const { from, to } = useMemo(() => istRange(rangeDays), [rangeDays]);

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const { data, error, isLoading } = useAuthSWR<Insights>(
    activeClassroom
      ? `/api/timetable/class-insights?class_id=${classId}&classroom_id=${activeClassroom.id}`
      : null,
  );

  // The same key the register page uses for this range, so arriving from it
  // costs nothing and a cold open (a shared link) fetches it once.
  const { data: register } = useAuthSWR<RegisterResponse>(
    activeClassroom
      ? `/api/attendance/register?classroom_id=${activeClassroom.id}&from=${from}&to=${to}`
      : null,
  );

  const neighbours = useMemo(() => {
    const list = register?.classes || [];
    const index = list.findIndex((c) => c.id === classId);
    if (index < 0) return { prev: null as string | null, next: null as string | null, index: -1, total: list.length };
    return {
      // Newest first, so "previous" is the class before this one in time.
      prev: list[index + 1]?.id ?? null,
      next: list[index - 1]?.id ?? null,
      index,
      total: list.length,
    };
  }, [register, classId]);

  const stepHref = (id: string) => `/teacher/attendance/${id}?view=${view}&range=${range}`;

  if (isLoading || !data) {
    return (
      <Box>
        <Skeleton variant="text" width={180} height={32} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mt: 2 }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {error.message || 'Could not load this class.'}
      </Alert>
    );
  }

  const cls = data.class;
  const held = data.summary.held;
  // Insights.class carries these as optional (the shape is shared with a
  // stub used where a class has no schedule of its own). A class a teacher is
  // reading attendance for always has one; the fallback only stops a crash if
  // that ever stops being true, matching the ?? guard class-insights callers
  // already use for start_time elsewhere.
  const scheduledDate = cls.scheduled_date ?? '';
  const startTime = cls.start_time ?? '00:00:00';
  const endTime = cls.end_time ?? '00:00:00';

  return (
    <Box sx={{ pb: 4 }}>
      <Button
        component={Link}
        href={backHref}
        startIcon={<ArrowBackIcon />}
        sx={{ textTransform: 'none', minHeight: 44, ml: -1 }}
      >
        Attendance
      </Button>

      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mt: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
            {cls.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatClassDate(scheduledDate)},{' '}
            {held.source === 'observed'
              ? `held ${formatClock(held.start)} to ${formatClock(held.end)} (booked to ${formatWallClock(endTime, scheduledDate)})`
              : `booked ${formatWallClock(startTime, scheduledDate)} to ${formatWallClock(endTime, scheduledDate)}`}
          </Typography>
        </Box>
        <IconButton
          aria-label="More about this class"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ width: 44, height: 44 }}
        >
          <MoreVertIcon />
        </IconButton>
      </Stack>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setRegisterOpen(true);
          }}
          sx={{ minHeight: 44 }}
        >
          Correct attendance
        </MenuItem>
        <MenuItem component={Link} href="/teacher/catch-up?tab=classes" sx={{ minHeight: 44 }}>
          Follow up in Catch-up
        </MenuItem>
      </Menu>

      {/* index < 0 means this class fell outside the fetched range (should not
          happen now that the fetch uses the same range as the back link, but a
          wrong count is worse than no caption, so this stays defensive). */}
      {neighbours.total > 1 && neighbours.index >= 0 && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ my: 1.5 }}>
          <IconButton
            component={neighbours.prev ? Link : 'button'}
            href={neighbours.prev ? stepHref(neighbours.prev) : undefined}
            disabled={!neighbours.prev}
            aria-label="Previous class"
            sx={{ width: 44, height: 44 }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="caption" color="text.secondary">
            class {neighbours.index + 1} of {neighbours.total}
          </Typography>
          <IconButton
            component={neighbours.next ? Link : 'button'}
            href={neighbours.next ? stepHref(neighbours.next) : undefined}
            disabled={!neighbours.next}
            aria-label="Next class"
            sx={{ width: 44, height: 44 }}
          >
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      )}

      {/*
        A class that has not been synced yet (or whose sync failed) has no
        cell to draw. The `attendance_sync_message` Alert below only fires
        when a sync was attempted and failed (`attendance_sync_status` set
        and not 'ok'), so a never-synced class, whose status column is null,
        used to fall straight through to ClassRegisterList and render every
        roster member as missed with no reason. Gating on `measured` instead
        covers both: never-synced (generic message here) and failed-sync
        (the specific reason, still shown).
      */}
      {!data.class.measured ? (
        <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
          {data.class.attendance_sync_message ||
            'Attendance has not been read from Teams for this class yet. Nobody here is marked present or missed until it has synced.'}
        </Alert>
      ) : (
        <>
          {data.class.attendance_sync_message && (
            <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>
              {data.class.attendance_sync_message}
            </Alert>
          )}

          <ClassRegisterList insights={data} highlightStudentId={highlight} />
        </>
      )}

      {activeClassroom && (
        <ClassAttendanceDialog
          open={registerOpen}
          onClose={() => setRegisterOpen(false)}
          classId={classId}
          classTitle={cls.title}
          classroomId={activeClassroom.id}
          teamsMeetingId={data.class.teams_meeting_id}
          getToken={getToken}
          initialTab="register"
        />
      )}
    </Box>
  );
}

/**
 * useSearchParams needs a Suspense boundary or the whole route opts out of
 * static generation and the build warns. Same reasoning as the register page.
 */
export default function ClassRegisterPage() {
  return (
    <Suspense
      fallback={
        <Box>
          <Skeleton variant="text" width={180} height={32} />
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mt: 2 }} />
        </Box>
      }
    >
      <ClassRegisterPageContent />
    </Suspense>
  );
}
