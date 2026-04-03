'use client';

import { Chip } from '@neram/ui';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryIcon from '@mui/icons-material/History';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import type { QBConfidenceTier } from '@neram/database';

const TIER_CONFIG: Record<QBConfidenceTier, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  1: { label: 'Verified', color: '#15803D', bg: '#DCFCE7', icon: <VerifiedIcon sx={{ fontSize: 14 }} /> },
  2: { label: 'Recalled', color: '#B45309', bg: '#FEF3C7', icon: <HistoryIcon sx={{ fontSize: 14 }} /> },
  3: { label: 'Topic Signal', color: '#6B7280', bg: '#F3F4F6', icon: <LightbulbOutlinedIcon sx={{ fontSize: 14 }} /> },
};

interface ConfidenceTierBadgeProps {
  tier: QBConfidenceTier;
  size?: 'small' | 'medium';
}

export default function ConfidenceTierBadge({ tier, size = 'small' }: ConfidenceTierBadgeProps) {
  const config = TIER_CONFIG[tier];

  return (
    <Chip
      label={config.label}
      icon={config.icon as React.ReactElement}
      size={size}
      sx={{
        bgcolor: config.bg,
        color: config.color,
        fontWeight: 600,
        fontSize: size === 'small' ? '0.7rem' : '0.8rem',
        height: size === 'small' ? 22 : 28,
        '& .MuiChip-icon': { color: config.color },
        borderRadius: 1,
      }}
    />
  );
}
