'use client';

/**
 * Who missed a class and then actually made it up.
 *
 * The overview API used to drop a student the moment they had nothing
 * outstanding, which meant the one question a teacher asks after chasing
 * someone for a week, "did they do it", had no answer anywhere. Finished items
 * now travel in their own list and land here.
 *
 * Deliberately not a leaderboard. It is ordered by when the work was finished so
 * it reads as "what cleared this week", and it shows how long each one took,
 * because a class cleared the next day and a class cleared three weeks later are
 * different outcomes even though both are green.
 */
import { Alert, Box, Chip, Stack, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import { turnaround } from '@/lib/catchup-turnaround';
import { StudentIdentity, shortDate, timeAgo } from './shared';
import type { TabProps } from './types';

export default function CaughtUpTab({ data }: TabProps) {
  const theme = useTheme();

  if (data.completed.length === 0) {
    return (
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        Nobody has finished a catch-up in the last 60 days. When a student clears a class they
        missed, it appears here.
      </Alert>
    );
  }

  return (
    <Stack spacing={1}>
      {data.completed.map((row) => (
        <Box
          key={row.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: RADIUS.control,
            border: '1px solid',
            borderColor: alpha(theme.palette.success.main, 0.3),
            bgcolor: alpha(theme.palette.success.main, 0.04),
            flexWrap: 'wrap',
          }}
        >
          <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 22 }} />
          <StudentIdentity
            student={row.student}
            size={34}
            secondary={
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {row.class.title || 'Class'} · {shortDate(row.class.scheduled_date)} ·{' '}
                {turnaround(row.class.scheduled_date, row.caught_up_at)}
              </Typography>
            }
          />
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {row.reason_code && (
              <Chip
                size="small"
                label={reasonShortLabel(row.reason_code)}
                sx={{
                  height: 22,
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  bgcolor: alpha(theme.palette.text.primary, 0.06),
                }}
              />
            )}
            {row.excused && (
              <Chip
                size="small"
                label="excused"
                sx={{ height: 22, fontWeight: 700, fontSize: '0.7rem' }}
              />
            )}
            <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
              {timeAgo(row.caught_up_at)}
            </Typography>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
