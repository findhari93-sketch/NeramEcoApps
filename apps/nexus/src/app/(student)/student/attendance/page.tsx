'use client';

/**
 * A student's own attendance record.
 *
 * Every other surface in Nexus could tell you how a student was doing except
 * the student. They had one percentage on their dashboard, computed across
 * every classroom they had ever been in and rendered as 0% when nothing had
 * been synced. Their teacher could see when they joined and when they left;
 * their parent could see it too. They could not.
 *
 * So this reads the same loadChildAttendance the teacher's register and the
 * parent's dashboard read, and shows the same verdict. If a student and their
 * teacher are ever looking at different numbers, one of them is going to be
 * told they are wrong about their own attendance.
 *
 * The tiles ARE the filter: pressing "Missed 3" shows the three. Pressing it
 * again goes back to everything.
 */

import { Suspense, useMemo, useState } from 'react';
import { Alert, Box, Divider, Skeleton, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useAuthSWR } from '@/lib/nexus-swr';
import AttendanceStrip from '@/components/parent/AttendanceStrip';
import StudentStatFilters, { type StatFilterTile } from '@/components/tests/StudentStatFilters';
import type { StudentAttendanceResponse } from '@/app/api/student/attendance/route';
import type { AttendanceLabel, ClassAttendanceView } from '@/lib/parent-attendance';

type TileKey =
  | 'all'
  | 'attended'
  | 'missed'
  | 'reason'
  | 'excused'
  | 'away'
  | 'not_measured';

/**
 * Which classes each tile opens onto.
 *
 * 'attended' is every label that means they were in the room, including the
 * partial ones: someone who joined ten minutes late still attended, and hiding
 * that class from their Attended list would make the count and the list
 * disagree.
 */
const TILE_LABELS: Record<Exclude<TileKey, 'all'>, AttendanceLabel[]> = {
  attended: ['attended', 'joined_late', 'left_early', 'partly_attended'],
  missed: ['missed'],
  reason: ['missed_with_reason'],
  excused: ['missed_excused'],
  away: ['missed_away'],
  not_measured: ['not_recorded'],
};

function StudentAttendance() {
  const [tile, setTile] = useState<TileKey>('all');

  // dedupingInterval 0: a student who has just given a reason for a class comes
  // straight back to this screen, and SWR's default 15s window would replay the
  // answer from before they said it.
  const { data, error, isLoading } = useAuthSWR<StudentAttendanceResponse>(
    '/api/student/attendance',
    { dedupingInterval: 0 },
  );

  const summary = data?.summary;

  const tiles = useMemo<StatFilterTile<TileKey>[]>(() => {
    if (!summary) return [];
    return [
      { key: 'all', label: 'All classes', value: summary.totalClasses, hint: 'Everything so far', tone: 'neutral' },
      { key: 'attended', label: 'Attended', value: summary.attended, hint: 'You were in the room', tone: 'success' },
      { key: 'missed', label: 'Missed', value: summary.missedNoReason, hint: 'No reason given yet', tone: 'error' },
      { key: 'reason', label: 'Reason given', value: summary.missedWithReason, hint: 'You told us why', tone: 'info' },
      { key: 'excused', label: 'Excused', value: summary.excused, hint: 'A teacher waived these', tone: 'neutral' },
      { key: 'away', label: 'Away', value: summary.missedAway, hint: 'You told us in advance', tone: 'neutral' },
      {
        key: 'not_measured',
        label: 'Not measured',
        value: summary.notMeasuredClasses,
        // The honesty rule, said out loud to the person it is protecting.
        hint: 'Attendance was never recorded, so these are not counted',
        tone: 'neutral',
      },
    ];
  }, [summary]);

  const classes = data?.classes ?? [];
  const shown = tile === 'all' ? classes : classes.filter((c) => TILE_LABELS[tile].includes(c.label));

  // The classes come back newest first, so the most recent finished class is
  // the first one anybody measured. "How did my last class go" is the question
  // this page gets opened for.
  const lastClass = classes.find((c) => c.measurement === 'measured');

  const strip = (c: ClassAttendanceView) => (
    <AttendanceStrip
      key={c.classId}
      date={c.date}
      title={c.title}
      startTime={c.startTime}
      endTime={c.endTime}
      scheduledMinutes={c.scheduledMinutes}
      measurement={c.measurement}
      label={c.label}
      attended={c.attended}
      durationMinutes={c.durationMinutes}
      segments={c.segments}
      reasonNote={c.reasonNote}
    />
  );

  return (
    <Box>
      <PageHeader
        title="Attendance"
        subtitle={
          summary
            ? `${summary.totalClasses} ${summary.totalClasses === 1 ? 'class' : 'classes'} so far`
            : 'Your own record, class by class'
        }
      />

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          {error.message || 'Could not load your attendance.'}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={96} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {data && (
        <>
          {/* The sentence, not a percentage. describeAttendance is the one place
              that decides how to phrase a period nobody synced, so "0%" cannot
              reach a student about their own attendance. */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {data.sentence}
          </Typography>

          <StudentStatFilters<TileKey>
            tiles={tiles}
            active={tile}
            onChange={setTile}
            allKey="all"
            ariaLabel="Filter your classes"
          />

          {lastClass && tile === 'all' && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary">
                Your last class
              </Typography>
              <Box sx={{ mt: 0.5 }}>{strip(lastClass)}</Box>
              <Divider sx={{ mt: 2 }} />
            </Box>
          )}

          {shown.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {classes.length === 0
                ? 'No classes have finished yet.'
                : 'Nothing in this group.'}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {shown.map(strip)}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default function StudentAttendancePage() {
  return (
    <Suspense fallback={null}>
      <StudentAttendance />
    </Suspense>
  );
}
