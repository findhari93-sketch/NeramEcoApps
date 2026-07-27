'use client';

import { Box, Button, Typography } from '@neram/ui';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AddIcon from '@mui/icons-material/Add';

interface CalendarEmptyStateProps {
  role: 'teacher' | 'student' | 'parent';
  period: 'day' | 'week' | 'month';
  /** Teacher only. Omitted when the view already offers slot clicks. */
  onAdd?: () => void;
  /**
   * Draw over the view instead of replacing it. The week grid's empty band is
   * itself the affordance for scheduling, so its empty state must not swallow
   * the click targets underneath.
   */
  overlay?: boolean;
}

const PERIOD_NOUN: Record<CalendarEmptyStateProps['period'], string> = {
  day: 'this day',
  week: 'this week',
  month: 'this month',
};

/**
 * The "nothing scheduled" state, which the band grid never had: an empty week
 * used to render as a silent, featureless block.
 */
export default function CalendarEmptyState({
  role,
  period,
  onAdd,
  overlay = false,
}: CalendarEmptyStateProps) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        px: 3,
        ...(overlay
          ? {
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              // The grid underneath stays clickable: an empty slot is how a
              // teacher schedules a class.
              pointerEvents: 'none',
              zIndex: 1,
            }
          : { py: 6 }),
      }}
    >
      <EventBusyIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
      <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 600 }}>
        No classes {PERIOD_NOUN[period]}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
        {role === 'teacher'
          ? 'Tap an empty slot, or use New, to schedule one'
          : 'Check back later'}
      </Typography>
      {role === 'teacher' && onAdd && !overlay && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={onAdd}
          sx={{ mt: 2, minHeight: 44, textTransform: 'none', fontWeight: 600 }}
        >
          Schedule a class
        </Button>
      )}
    </Box>
  );
}
