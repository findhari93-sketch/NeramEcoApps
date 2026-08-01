'use client';

import dynamic from 'next/dynamic';
import { Alert, Box, Chip, Divider, Skeleton, Typography, UserAvatar, alpha } from '@neram/ui';
import { reasonShortLabel, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { type DurationDatum } from '../AttendanceDurationChart';
import type { AttendanceTabProps } from './types';

// recharts is heavy; keep it out of the initial bundle and off the server. This
// tab is itself lazily loaded by the shell, so opening the register alone never
// costs the chart library at all.
const AttendanceDurationChart = dynamic(() => import('../AttendanceDurationChart'), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />,
});

function Kpi({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneColor = {
    default: 'text.primary',
    good: 'success.main',
    warn: 'warning.main',
    bad: 'error.main',
  }[tone];
  return (
    <Box
      sx={{
        flex: '1 1 120px',
        minWidth: 110,
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 800, color: toneColor, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function MatrixCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'bad' | 'muted' | 'info';
}) {
  return (
    <Box
      sx={{
        flex: '1 1 45%',
        minWidth: 130,
        p: 1.5,
        borderRadius: 2,
        bgcolor: (t) =>
          alpha(
            tone === 'good'
              ? t.palette.success.main
              : tone === 'bad'
                ? t.palette.error.main
                : tone === 'info'
                  ? t.palette.info.main
                  : t.palette.text.disabled,
            0.12,
          ),
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

/**
 * What the register adds up to: RSVP (who was expected) against what actually
 * happened, how long people stayed, and the reasons the absent gave.
 *
 * Read-only by design. Every correction is made one tab over, and the shell
 * refetches this the moment one is, so the numbers here can never describe a
 * roster the teacher has already fixed.
 */
export default function HowItWentTab({ insights, insightsLoading }: AttendanceTabProps) {
  if (insightsLoading) {
    return <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} />;
  }
  if (!insights) {
    return <Alert severity="info">Could not load insights.</Alert>;
  }

  const chartData: DurationDatum[] = insights.students
    .filter((s) => s.attended)
    .map((s) => ({
      name: s.name.split(' ')[0],
      minutes: s.duration_minutes ?? 0,
      flag: s.droppedMidClass ? 'dropped' : s.leftEarly ? 'leftEarly' : s.joinedLate ? 'late' : 'ok',
    }));

  const reasons = (Object.entries(insights.reasonTally) as [RsvpReasonCode, number][]).filter(
    ([, n]) => n > 0,
  );

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Kpi
          label="Attended"
          value={`${insights.summary.present}/${insights.summary.rosterSize}`}
          sub={`${insights.summary.attendanceRate}% present`}
          tone="good"
        />
        <Kpi label="Avg time" value={`${insights.summary.avgDuration}m`} />
        <Kpi
          label="Joined late"
          value={insights.summary.lateCount}
          tone={insights.summary.lateCount ? 'warn' : 'default'}
        />
        <Kpi
          label="Left early"
          value={insights.summary.leftEarlyCount}
          tone={insights.summary.leftEarlyCount ? 'warn' : 'default'}
        />
        <Kpi
          label="Dropped mid-class"
          value={insights.summary.droppedCount}
          tone={insights.summary.droppedCount ? 'bad' : 'default'}
        />
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        RSVP said vs what happened
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <MatrixCell label="Said attending, came" value={insights.buckets.attendingAttended} tone="good" />
        <MatrixCell label="Said attending, absent" value={insights.buckets.attendingAbsent} tone="bad" />
        <MatrixCell
          label="Said can't make it, absent"
          value={insights.buckets.declinedAbsent}
          tone="muted"
        />
        <MatrixCell label="Said can't make it, came" value={insights.buckets.declinedAttended} tone="info" />
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        How long each student stayed
      </Typography>
      <AttendanceDurationChart data={chartData} />

      {reasons.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Reasons given for not attending
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
            {reasons.map(([code, n]) => (
              <Chip key={code} size="small" label={`${reasonShortLabel(code)}: ${n}`} />
            ))}
          </Box>
        </>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Students
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {insights.students.map((s) => (
          <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
            <UserAvatar name={s.name} src={s.avatar_url} size={32} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {s.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {s.attended ? `${s.duration_minutes ?? 0} min` : 'Did not attend'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {s.attended ? (
                <Chip size="small" color="success" variant="outlined" label="Attended" />
              ) : (
                <Chip
                  size="small"
                  variant="outlined"
                  label={
                    s.rsvp === 'not_attending' ? `Declined: ${reasonShortLabel(s.reason)}` : 'Absent'
                  }
                />
              )}
              {s.joinedLate && <Chip size="small" color="warning" variant="outlined" label="Late" />}
              {s.leftEarly && <Chip size="small" color="warning" variant="outlined" label="Left early" />}
              {s.droppedMidClass && <Chip size="small" color="error" variant="outlined" label="Dropped" />}
              {s.rsvp === 'not_attending' && s.attended && (
                <Chip size="small" color="info" variant="outlined" label="Came anyway" />
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </>
  );
}
