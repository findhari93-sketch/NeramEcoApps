'use client';

import { Chip } from '@neram/ui';
import type { CoaApprovalStatus } from '@neram/database';
import { COA_STATUS_CONFIG } from './constants';

interface COAStatusBadgeProps {
  status: CoaApprovalStatus;
  size?: 'small' | 'medium';
}

export default function COAStatusBadge({ status, size = 'small' }: COAStatusBadgeProps) {
  const config = COA_STATUS_CONFIG[status] ?? COA_STATUS_CONFIG.unknown;
  return (
    <Chip
      label={config.label}
      color={config.chipColor}
      size={size}
      sx={{ fontWeight: 600, fontSize: size === 'small' ? 11 : 13 }}
    />
  );
}
