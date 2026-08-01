'use client';

import { useMemo } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Skeleton,
  Typography,
  UserAvatar,
  alpha,
  useTheme,
} from '@neram/ui';
import { rankByTimeInRoom } from '@/lib/attendance-quality';
import type { AttendanceTabProps, StudentInsight } from './types';

/**
 * Who came, ranked by how long they were actually in the room.
 *
 * The order IS the analysis. The people at the top left early, dropped out or
 * never really settled; the people at the bottom sat through the whole thing.
 * A flat alphabetical list of thirty names hides both.
 *
 * The bar next to each row is a div, not a chart. This tab used to pull recharts
 * behind a dynamic ssr:false import to draw thirty bars, which at 375px was
 * unreadable and cost a separate chunk on a screen a teacher opens after every
 * class. A sorted list with a proportional bar says the same thing, wraps
 * properly, and reads as a ranking rather than as a graph nobody asked for.
 */

function formatDuration(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function Kpi({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const color = { default: 'text.primary', good: 'success.main', warn: 'warning.main', bad: 'error.main' }[tone];
  return (
    <Box
      sx={{
        flex: '1 1 96px',
        minWidth: 92,
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 800, color, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  );
}

function AttendedRow({
  student,
  longest,
  scheduled,
  selected,
  onSelect,
}: {
  student: StudentInsight;
  longest: number;
  scheduled: number;
  selected: boolean;
  onSelect: (id: string, next: boolean) => void;
}) {
  const theme = useTheme();
  const minutes = student.duration_minutes;
  const known = minutes != null && Number.isFinite(minutes);
  const width = known && longest > 0 ? Math.max(2, ((minutes as number) / longest) * 100) : 0;
  const tone = student.barelyAttended
    ? theme.palette.error.main
    : student.leftEarly || student.droppedMidClass || student.joinedLate
      ? theme.palette.warning.main
      : theme.palette.success.main;

  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 0.75,
        minHeight: 48,
        borderRadius: 1,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Checkbox
        checked={selected}
        onChange={(e) => onSelect(student.id, e.target.checked)}
        sx={{ p: 1.25 }}
        inputProps={{ 'aria-label': `Select ${student.name}` }}
      />
      <UserAvatar name={student.name} src={student.avatar_url} size={32} tapToView={false} />
      <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {student.name}
        </Typography>
        {known ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, minWidth: 46, fontVariantNumeric: 'tabular-nums' }}
            >
              {formatDuration(minutes)}
            </Typography>
            <Box
              sx={{
                flex: 1,
                height: 6,
                borderRadius: 99,
                bgcolor: alpha(theme.palette.text.disabled, 0.15),
                overflow: 'hidden',
              }}
            >
              <Box sx={{ width: `${width}%`, height: '100%', bgcolor: tone }} />
            </Box>
            {scheduled > 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                of {scheduled}m
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled">
            Duration not reported by Teams
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
          {student.barelyAttended && (
            <Chip size="small" color="error" variant="outlined" label="Barely attended" />
          )}
          {student.joinedLate && <Chip size="small" color="warning" variant="outlined" label="Late" />}
          {student.leftEarly && <Chip size="small" color="warning" variant="outlined" label="Left early" />}
          {student.droppedMidClass && (
            <Chip size="small" color="warning" variant="outlined" label="Dropped and rejoined" />
          )}
          {student.rsvp === 'not_attending' && (
            <Chip size="small" color="info" variant="outlined" label="Came anyway" />
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function AttendedTab({
  insights,
  insightsLoading,
  selected,
  onSelect,
}: AttendanceTabProps) {
  const ranked = useMemo(
    () => rankByTimeInRoom((insights?.students ?? []).filter((s) => s.attended)),
    [insights],
  );

  if (insightsLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (!insights) return <Alert severity="info">Could not load this class.</Alert>;

  const s = insights.summary;
  const longest = ranked.reduce(
    (max, r) => (r.duration_minutes != null && r.duration_minutes > max ? r.duration_minutes : max),
    0,
  );

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Kpi label="Attended" value={`${s.present}/${s.rosterSize}`} tone="good" />
        <Kpi label="Average stay" value={`${s.avgDuration}m`} />
        <Kpi label="Joined late" value={s.lateCount} tone={s.lateCount ? 'warn' : 'default'} />
        <Kpi label="Left early" value={s.leftEarlyCount} tone={s.leftEarlyCount ? 'warn' : 'default'} />
        <Kpi
          label="Barely there"
          value={s.barelyAttendedCount}
          tone={s.barelyAttendedCount ? 'bad' : 'default'}
        />
      </Box>

      {ranked.length === 0 ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          Nobody is recorded as having attended. If that is wrong, open Register and either sync
          from Teams or mark the class by hand.
        </Alert>
      ) : (
        <>
          <Typography
            variant="caption"
            sx={{ fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', display: 'block', mb: 0.5 }}
          >
            Shortest time in the room first
          </Typography>
          {s.barelyAttendedCount > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Anyone in for under {s.barelyAttendedCutoff} minutes of a {s.scheduledMinutes} minute
              class is flagged. They still count as present.
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {ranked.map((student) => (
              <AttendedRow
                key={student.id}
                student={student}
                longest={longest}
                scheduled={s.scheduledMinutes}
                selected={selected.has(student.id)}
                onSelect={onSelect}
              />
            ))}
          </Box>
        </>
      )}
    </>
  );
}
