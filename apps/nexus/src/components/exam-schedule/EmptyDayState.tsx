'use client';

import { Box, Typography } from '@neram/ui';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';

interface EmptyDayStateProps {
  isPast: boolean;
}

export default function EmptyDayState({ isPast }: EmptyDayStateProps) {
  return (
    <Box sx={{ py: 4, textAlign: 'center' }}>
      <EventBusyOutlinedIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
      <Typography variant="body2" color="text.secondary">
        {isPast ? 'No exams were scheduled' : 'No students have picked this date yet'}
      </Typography>
    </Box>
  );
}
