'use client';

import { Box, Chip, Skeleton, Typography } from '@neram/ui';
import { EmptyNote } from './FieldGrid';
import ProfileSection from './ProfileSection';
import ProgressRow from './ProgressRow';
import { formatDateIN } from '@/lib/student-profile-fields';
import { ATTENDANCE_LABEL_TEXT, type AttendanceLabel } from '@/lib/parent-attendance';
import type { StudentPerformancePayload } from '@/lib/student-profile-types';

/**
 * Colour only. The WORDING comes from ATTENDANCE_LABEL_TEXT so a teacher and a
 * parent read the identical phrase for the same class. Restating it here would
 * let the two drift, which is exactly the failure that module was written to
 * prevent.
 */
const LABEL_COLOR: Record<AttendanceLabel, 'success' | 'error' | 'warning' | 'default'> = {
  attended: 'success',
  joined_late: 'warning',
  left_early: 'warning',
  partly_attended: 'warning',
  missed: 'error',
  missed_with_reason: 'warning',
  not_recorded: 'default',
};

/**
 * Attendance over the rolling window.
 *
 * THE ONE RULE: when `summary.attendanceRate` is null we render the sentence the
 * server computed and NO percentage. Attendance sync runs on a delegated
 * Microsoft token and fails wholesale, so a class nobody synced has no rows and
 * looks exactly like "the whole roster was absent". Printing 0% there would
 * accuse a student of missing classes we simply never recorded.
 */
export default function AttendanceSection({
  performance,
  loading,
  error,
  onFirstOpen,
}: {
  performance: StudentPerformancePayload | null;
  loading: boolean;
  error: string | null;
  onFirstOpen: () => void;
}) {
  const summary = performance?.attendance.summary;

  return (
    <ProfileSection
      id="profile-attendance"
      title="Attendance"
      headline={
        summary
          ? summary.attendanceRate === null
            ? 'Not recorded for this period'
            : `${summary.attended} of ${summary.measuredClasses} classes`
          : null
      }
      defaultExpanded
      onFirstOpen={onFirstOpen}
    >
      {loading && <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />}
      {error && !loading && <EmptyNote>{error}</EmptyNote>}

      {performance && summary && !loading && (
        <>
          <ProgressRow
            label={`Attendance, last ${performance.windowDays} days`}
            value={summary.attendanceRate}
            caption={
              summary.attendanceRate === null
                ? null
                : `${summary.attended} of ${summary.measuredClasses}`
            }
            emptyNote={performance.attendance.sentence}
          />

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
            <Stat label="Attended" value={summary.attended} />
            <Stat label="Missed" value={summary.missed} />
            <Stat label="Missed with a reason" value={summary.missedWithReason} />
            <Stat label="Joined late" value={summary.late} />
            <Stat label="Left early" value={summary.leftEarly} />
            <Stat label="Dropped mid-class" value={summary.droppedMidClass} />
            <Stat label="Minutes present" value={summary.presentMinutes} />
            {summary.notMeasuredClasses > 0 && (
              <Stat label="Not recorded" value={summary.notMeasuredClasses} />
            )}
          </Box>

          {summary.notMeasuredClasses > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1.5 }}
            >
              {summary.notMeasuredClasses} class
              {summary.notMeasuredClasses === 1 ? ' has' : 'es have'} no attendance recorded,
              so {summary.notMeasuredClasses === 1 ? 'it is' : 'they are'} left out of the
              figures above rather than counted as missed.
            </Typography>
          )}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>
            Class by class
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {performance.attendance.views.map((v) => (
              <Box
                key={v.classId}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 1,
                  minHeight: 48,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                    {v.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[
                      formatDateIN(v.date),
                      v.durationMinutes !== null && v.scheduledMinutes
                        ? `Present ${v.durationMinutes} of ${v.scheduledMinutes} min`
                        : null,
                      v.late ? 'Joined late' : null,
                      v.leftEarly ? 'Left early' : null,
                      v.reasonNote || null,
                    ]
                      .filter(Boolean)
                      .join(' . ')}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={ATTENDANCE_LABEL_TEXT[v.label] ?? v.label}
                  color={LABEL_COLOR[v.label] ?? 'default'}
                  variant={v.label === 'not_recorded' ? 'outlined' : 'filled'}
                  sx={{ fontWeight: 700, flexShrink: 0 }}
                />
              </Box>
            ))}
          </Box>

          {performance.attendance.views.length === 0 && (
            <EmptyNote>No classes were scheduled in this period.</EmptyNote>
          )}
        </>
      )}
    </ProfileSection>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ px: 1.5, py: 1, borderRadius: 1, bgcolor: 'action.hover', minWidth: 96 }}>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 800, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}
