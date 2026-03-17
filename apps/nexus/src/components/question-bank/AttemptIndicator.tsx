'use client';

import { Box, Badge } from '@neram/ui';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import type { QBAttemptSummary } from '@neram/database';

interface AttemptIndicatorProps {
  summary: QBAttemptSummary | null;
}

export default function AttemptIndicator({ summary }: AttemptIndicatorProps) {
  if (!summary || summary.total_attempts === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <RadioButtonUncheckedIcon
          sx={{ color: 'grey.400', fontSize: 22 }}
          aria-label="Not attempted"
        />
      </Box>
    );
  }

  const icon = summary.last_was_correct ? (
    <CheckCircleOutlinedIcon
      sx={{ color: 'success.main', fontSize: 22 }}
      aria-label="Last attempt correct"
    />
  ) : (
    <CancelOutlinedIcon
      sx={{ color: 'error.main', fontSize: 22 }}
      aria-label="Last attempt incorrect"
    />
  );

  if (summary.total_attempts > 1) {
    return (
      <Badge
        badgeContent={summary.total_attempts}
        color="default"
        sx={{
          '& .MuiBadge-badge': {
            fontSize: '0.6rem',
            minWidth: 16,
            height: 16,
            bgcolor: 'grey.600',
            color: '#fff',
          },
        }}
      >
        {icon}
      </Badge>
    );
  }

  return <Box sx={{ display: 'flex', alignItems: 'center' }}>{icon}</Box>;
}
