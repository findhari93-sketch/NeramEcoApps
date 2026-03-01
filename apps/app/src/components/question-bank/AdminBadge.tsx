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
      sx={{
        height: size === 'small' ? 20 : 24,
        fontSize: size === 'small' ? '0.65rem' : '0.75rem',
        fontWeight: 700,
        backgroundColor: 'warning.light',
        color: 'warning.dark',
        border: '1px solid',
        borderColor: 'warning.main',
      }}
    />
  );
}
