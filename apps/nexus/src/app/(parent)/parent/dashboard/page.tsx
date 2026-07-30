'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Skeleton,
  Alert,
  Stack,
  Chip,
  UserAvatar,
  alpha,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useRouter } from 'next/navigation';
import AttendanceStrip from '@/components/parent/AttendanceStrip';
import EnrollmentNotice from '@/components/parent/EnrollmentNotice';
import ParentMetricGrid from '@/components/parent/ParentMetricGrid';
import ExamCountdown from '@/components/ExamCountdown';
import type { ExamCountdownTarget } from '@/lib/exam-countdown';
import type { EnrollmentNotice as Notice } from '@/lib/parent-enrollment';

/**
 * The parent home screen.
 *
 * Answers one question, in this order: is my child okay, what are the numbers
 * behind that, and what happened recently. Everything else is a tab away.
 *
 * Two rules this page exists to honour:
 *  - counts, not percentages ("7 of 9 classes", never "78%"), because a bare
 *    percentage reads like a grade being handed to the parent;
 *  - anything we have not measured says so in words and shows no number at all.
 *    Rendering 0 for "no attendance was ever synced" would tell every parent in
 *    the school that their child attended nothing.
 */

type StripProps = React.ComponentProps<typeof AttendanceStrip>;

interface OverviewResponse {
  child: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    classroom_name: string | null;
  };
  /** Why the numbers may be empty: paused, ended, or joined late. */
  notice: Notice | null;
  windowDays: number;
  attendance: {
    measuredClasses: number;
    notMeasuredClasses: number;
    attended: number;
    missed: number;
    droppedMidClass: number;
    attendanceRate: number | null;
  };
  attendanceSentence: string;
  assignments: {
    total: number;
    needsDoing: number;
    overdue: number;
    waitingOnTeacher: number;
    marked: number;
    averagePercent: number | null;
  };
  /** Missed classes made up. Null-safe: older responses may not carry it. */
  catchup?: {
    total: number;
    done: number;
    open: number;
    sentence: string;
  } | null;
  verdict: { band: string; headline: string; detail: string };
  /** The exam this child is preparing for, or null when none is set. */
  examCountdown: ExamCountdownTarget | null;
  upcomingClasses: Array<{
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
  }>;
  recentClasses: Array<StripProps & { classId: string }>;
}

const BAND_COLOUR: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  on_track: 'success',
  slipping: 'warning',
  needs_attention: 'error',
  not_enough_data: 'info',
};

export default function ParentDashboardPage() {
  const { getToken } = useNexusAuthContext();
  const router = useRouter();

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/parent/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the summary.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the summary.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Fetch once on mount. Deliberately no polling: a dashboard left open on a
  // phone would otherwise generate serverless invocations all day for data that
  // changes a few times a week.
  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={64} />
        <Skeleton variant="rounded" height={110} />
        <Skeleton variant="rounded" height={150} />
        <Skeleton variant="rounded" height={200} />
      </Stack>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) return null;

  const firstName = data.child.name?.split(' ')[0] || 'Your child';
  const bandColour = BAND_COLOUR[data.verdict.band] ?? 'info';

  return (
    <Stack spacing={2.5}>
      {/* Who this is about */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <UserAvatar
          src={data.child.avatar_url}
          name={data.child.name || 'Student'}
          size={44}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 18 }} noWrap>
            {data.child.name || 'Your child'}
          </Typography>
          {data.child.classroom_name && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {data.child.classroom_name}
            </Typography>
          )}
        </Box>
      </Box>

      {/*
        Above the verdict on purpose. When a child is paused the verdict below is
        computed from suppressed numbers, so the parent has to read why before
        they read the conclusion, not after.
      */}
      <EnrollmentNotice notice={data.notice} />

      {/* The one answer */}
      <Card
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: (t) => alpha(t.palette[bandColour].main, 0.4),
          bgcolor: (t) => alpha(t.palette[bandColour].main, 0.07),
        }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: `${bandColour}.main`,
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontWeight: 700, fontSize: 17 }}>
              {data.verdict.headline}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 16, lineHeight: 1.55 }}>
            {data.verdict.detail}
          </Typography>
        </CardContent>
      </Card>

      {/*
        How long until the exam.

        Its own card rather than a fourth cell in the grid below: that grid is
        three columns at sm, so a fourth cell would leave a hole. Its own card
        also means "no exam date set" is expressed by rendering nothing at all,
        which needs no copy and cannot be misread. ExamCountdown returns null in
        that case, so the Card is conditional on there being something to say.
      */}
      {data.examCountdown && (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 2.5 }}>
            <ExamCountdown target={data.examCountdown} variant="metric" />
          </CardContent>
        </Card>
      )}

      {/*
        Four numbers, as counts rather than percentages, and every one of them
        taps through to the tab that explains it. A number a parent cannot drill
        into is a number they have to take on trust.

        Anything unmeasured renders a sentence, never a zero. ParentMetricGrid
        enforces that by requiring an emptyLabel alongside a nullable value.
      */}
      <ParentMetricGrid
        metrics={[
          {
            label: 'Attended',
            value:
              data.attendance.measuredClasses > 0
                ? `${data.attendance.attended} of ${data.attendance.measuredClasses}`
                : null,
            emptyLabel: 'Not recorded yet',
            hint: `last ${data.windowDays} days`,
            tone:
              data.attendance.measuredClasses === 0
                ? 'neutral'
                : data.attendance.attended === data.attendance.measuredClasses
                  ? 'success'
                  : 'warning',
            onClick: () => router.push('/parent/timetable'),
          },
          {
            label: 'Work to do',
            value: data.assignments.total > 0 ? data.assignments.needsDoing : null,
            emptyLabel: 'None set yet',
            hint:
              data.assignments.overdue > 0
                ? `${data.assignments.overdue} overdue`
                : 'nothing overdue',
            tone:
              data.assignments.overdue > 0
                ? 'error'
                : data.assignments.needsDoing > 0
                  ? 'warning'
                  : 'success',
            onClick: () => router.push('/parent/assignments'),
          },
          {
            label: 'Average',
            // null, never 0. An average of no marks is not zero, and a 0% on a
            // parent's home screen reads as a failing child.
            value:
              data.assignments.averagePercent !== null
                ? `${data.assignments.averagePercent}%`
                : null,
            emptyLabel: 'Nothing marked yet',
            hint: data.assignments.marked > 0 ? `${data.assignments.marked} marked` : undefined,
            tone:
              data.assignments.averagePercent === null
                ? 'neutral'
                : data.assignments.averagePercent >= 60
                  ? 'success'
                  : 'warning',
            onClick: () => router.push('/parent/assignments'),
          },
          {
            // The question the parent actually asked: how many of the classes he
            // missed has he made up.
            label: 'Catch-up',
            value: data.catchup && data.catchup.total > 0
              ? `${data.catchup.done} of ${data.catchup.total}`
              : null,
            emptyLabel: 'Nothing to catch up',
            hint: data.catchup && data.catchup.open > 0 ? `${data.catchup.open} still open` : undefined,
            tone:
              !data.catchup || data.catchup.total === 0
                ? 'success'
                : data.catchup.open > 0
                  ? 'warning'
                  : 'success',
            onClick: () => router.push('/parent/timetable'),
          },
        ]}
      />

      {/*
        Two honesty lines, kept apart on purpose. The enrolment notice above is
        about the child's standing; these are about OUR records and OUR backlog.
        Merging them would make an unsynced class look like something the child
        did.
      */}
      <Stack spacing={0.5}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.5 }}>
          {data.attendanceSentence}
        </Typography>
        {data.catchup && data.catchup.total > 0 && (
          <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.5 }}>
            {data.catchup.sentence}
          </Typography>
        )}
      </Stack>

      {/* Next up */}
      {data.upcomingClasses.length > 0 && (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 1.5 }}>
              Coming up
            </Typography>
            <Stack spacing={1.25}>
              {data.upcomingClasses.map((c) => (
                <Box
                  key={c.id}
                  sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
                >
                  <Typography sx={{ fontSize: 15 }} noWrap>
                    {c.title}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={new Intl.DateTimeFormat('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'Asia/Kolkata',
                    }).format(Date.parse(`${c.scheduled_date}T00:00:00+05:30`))}
                    sx={{ flexShrink: 0 }}
                  />
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Recent classes */}
      {data.recentClasses.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 1.5 }}>
            Recent classes
          </Typography>
          <Stack spacing={1.5}>
            {data.recentClasses.map((c) => (
              <AttendanceStrip key={c.classId} {...c} />
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

function Metric({
  label,
  value,
  caption,
  muted,
}: {
  label: string;
  value: string;
  caption: string;
  muted?: boolean;
}) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: 700,
          // Smaller when the value is a phrase like "Not recorded", so a
          // non-number never masquerades as a headline figure.
          fontSize: muted ? 16 : 20,
          lineHeight: 1.25,
          color: muted ? 'text.secondary' : 'text.primary',
        }}
      >
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
        {caption}
      </Typography>
    </Box>
  );
}
