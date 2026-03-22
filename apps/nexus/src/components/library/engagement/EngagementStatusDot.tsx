'use client';

import { Box, Typography } from '@neram/ui';

type EngagementStatus = 'active' | 'moderate' | 'inactive' | 'new';

interface EngagementStatusDotProps {
  status: EngagementStatus;
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<EngagementStatus, { color: string; label: string }> = {
  active: { color: '#4caf50', label: 'Active' },
  moderate: { color: '#ff9800', label: 'Moderate' },
  inactive: { color: '#f44336', label: 'Inactive' },
  new: { color: '#9e9e9e', label: 'New' },
};

export default function EngagementStatusDot({ status, showLabel = false }: EngagementStatusDotProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: config.color,
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <Typography
          variant="caption"
          sx={{ fontWeight: 500, color: config.color, fontSize: '0.7rem' }}
        >
          {config.label}
        </Typography>
      )}
    </Box>
  );
}
