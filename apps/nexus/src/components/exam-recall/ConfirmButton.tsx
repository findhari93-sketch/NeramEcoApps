'use client';

import { IconButton, Tooltip, Typography, Stack } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

interface ConfirmButtonProps {
  confirmed: boolean;
  count: number;
  onClick: () => void;
  disabled?: boolean;
}

export default function ConfirmButton({ confirmed, count, onClick, disabled }: ConfirmButtonProps) {
  return (
    <Tooltip title="I also got this question in my exam" arrow>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          color={confirmed ? 'primary' : 'default'}
          sx={{
            transition: 'all 0.2s',
            ...(confirmed && {
              bgcolor: 'primary.50',
              '&:hover': { bgcolor: 'primary.100' },
            }),
          }}
        >
          {confirmed ? (
            <CheckCircleIcon sx={{ fontSize: '1.25rem' }} />
          ) : (
            <CheckCircleOutlineIcon sx={{ fontSize: '1.25rem' }} />
          )}
        </IconButton>
        <Typography
          variant="caption"
          color={confirmed ? 'primary' : 'text.secondary'}
          fontWeight={confirmed ? 600 : 400}
        >
          {count}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
