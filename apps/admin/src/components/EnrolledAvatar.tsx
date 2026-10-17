'use client';

/**
 * The gold ring that marks an enrolled Neram student, so staff can tell our own
 * students from leads at a glance (CRM Users, Aintra Inbox).
 *
 * Enrolled means a student_profiles row or a linked classroom account, the
 * same rule CRM uses. The ring adds 6px to the avatar: 2px of gold and a 1px
 * white gap on each side.
 */
import type { ReactNode } from 'react';
import { Box, UserAvatar } from '@neram/ui';

export const GOLD_RING_GRADIENT = 'linear-gradient(135deg, #FFD700, #FFA000, #FFD700)';

/** Wraps any avatar of `size` px in the gold ring when `enrolled`; otherwise renders it as is. */
export function GoldRing({ enrolled, size, children, sx }: { enrolled: boolean; size: number; children: ReactNode; sx?: object }) {
  if (!enrolled) return <>{children}</>;
  return (
    <Box
      title="Enrolled student"
      sx={{
        width: size + 6,
        height: size + 6,
        borderRadius: '50%',
        background: GOLD_RING_GRADIENT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...sx,
      }}
    >
      <Box
        sx={{
          width: size + 2,
          height: size + 2,
          borderRadius: '50%',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default function EnrolledAvatar({
  src,
  name,
  size,
  enrolled,
  sx,
}: {
  src?: string | null;
  name?: string | null;
  size: number;
  enrolled: boolean;
  sx?: object;
}) {
  return (
    <GoldRing enrolled={enrolled} size={size} sx={sx}>
      <UserAvatar src={src ?? undefined} name={name ?? undefined} size={size} tapToView={false} sx={enrolled ? undefined : { flexShrink: 0, ...sx }} />
    </GoldRing>
  );
}
