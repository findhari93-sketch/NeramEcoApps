'use client';

import { Chip } from '@neram/ui';

interface AdminBadgeProps {
  isAdminPost?: boolean;
  authorUserType?: string;
  size?: 'small' | 'medium';
}

export default function AdminBadge({ isAdminPost, authorUserType, size = 'small' }: AdminBadgeProps) {
  if (!isAdminPost && authorUserType !== 'admin') return null;

  return (
    <Chip
      label="Official"
      size={size}
      color="warning"
      variant="outlined"
      sx={{
        height: size === 'small' ? 24 : 28,
        fontSize: size === 'small' ? '0.75rem' : '0.8125rem',
        fontWeight: 700,
      }}
    />
  );
}
