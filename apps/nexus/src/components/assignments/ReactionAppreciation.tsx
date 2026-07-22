'use client';

/**
 * The teacher's encouraging reaction, shown to the student on their reviewed
 * assignment. A warm emoji + praise line with a gentle pop-in (reduced-motion
 * safe). Renders nothing when no reaction was sent.
 */
import { Box, Typography, alpha } from '@neram/ui';
import type { GalleryReactionType } from '@neram/database/types';
import { reactionEmoji, praiseFor } from '@/lib/assignment-reactions';

export default function ReactionAppreciation({
  reaction,
}: {
  reaction: GalleryReactionType | null | undefined;
}) {
  if (!reaction) return null;
  const emoji = reactionEmoji(reaction);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.primary.main, 0.25),
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: 30,
          lineHeight: 1,
          animation: 'reactionPop 260ms ease-out',
          '@keyframes reactionPop': {
            '0%': { transform: 'scale(0.8)', opacity: 0 },
            '100%': { transform: 'scale(1)', opacity: 1 },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        {emoji}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Your teacher cheered your work
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {praiseFor(reaction)}
        </Typography>
      </Box>
    </Box>
  );
}
