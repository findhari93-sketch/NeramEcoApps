'use client';

import { Box, Avatar } from '@neram/ui';
import type { AccountTier } from '@neram/database';

interface AvatarWithRingProps {
  src?: string | null;
  name?: string;
  size?: number;
  tier: AccountTier;
  onClick?: () => void;
  sx?: Record<string, unknown>;
}

const GOLD_GRADIENT = 'linear-gradient(135deg, #FFD700, #FFA000, #FFD700)';

/**
 * Avatar with a conditional gold gradient ring for enrolled students.
 * Like Google's colored circle around pro account profile pictures.
 */
export default function AvatarWithRing({
  src,
  name,
  size = 24,
  tier,
  onClick,
  sx,
}: AvatarWithRingProps) {
  const showRing = tier === 'enrolled_student';
  const ringWidth = size >= 80 ? 3 : 2;
  const gap = 1;
  const outerSize = size + (ringWidth + gap) * 2;

  if (!showRing) {
    return (
      <Avatar
        src={src || undefined}
        onClick={onClick}
        sx={{
          width: size,
          height: size,
          fontSize: size * 0.45,
          cursor: onClick ? 'pointer' : undefined,
          ...sx,
        }}
      >
        {name?.charAt(0)?.toUpperCase() || 'S'}
      </Avatar>
    );
  }

  return (
    <Box
      onClick={onClick}
      sx={{
        width: outerSize,
        height: outerSize,
        borderRadius: '50%',
        background: GOLD_GRADIENT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <Box
        sx={{
          width: outerSize - ringWidth * 2,
          height: outerSize - ringWidth * 2,
          borderRadius: '50%',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Avatar
          src={src || undefined}
          sx={{
            width: size,
            height: size,
            fontSize: size * 0.45,
            ...sx,
          }}
        >
          {name?.charAt(0)?.toUpperCase() || 'S'}
        </Avatar>
      </Box>
    </Box>
  );
}
