'use client';

import { IconButton, Tooltip, Typography, Stack } from '@neram/ui';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';

interface VouchButtonProps {
  vouched: boolean;
  count: number;
  onClick: () => void;
  disabled?: boolean;
}

export default function VouchButton({ vouched, count, onClick, disabled }: VouchButtonProps) {
  return (
    <Tooltip title="This version is accurate" arrow>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          color={vouched ? 'primary' : 'default'}
          sx={{
            transition: 'all 0.2s',
            ...(vouched && {
              bgcolor: 'primary.50',
              '&:hover': { bgcolor: 'primary.100' },
            }),
          }}
        >
          {vouched ? (
            <ThumbUpIcon sx={{ fontSize: '1.25rem' }} />
          ) : (
            <ThumbUpOutlinedIcon sx={{ fontSize: '1.25rem' }} />
          )}
        </IconButton>
        <Typography
          variant="caption"
          color={vouched ? 'primary' : 'text.secondary'}
          fontWeight={vouched ? 600 : 400}
        >
          {count}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
