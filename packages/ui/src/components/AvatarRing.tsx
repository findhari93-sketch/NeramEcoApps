'use client';

/**
 * AvatarRing
 *
 * The frame that tells staff who a person is to Neram at a glance:
 *
 *   student  solid gold      our own enrolled student
 *   paused   dashed gold     our student, on a break (photo greyed a little)
 *   alumni   solid silver    studied with us before
 *   lead     solid slate     everyone still deciding
 *   staff    solid blue      Neram staff (the brand blue)
 *   other    dotted slate    parents, guests, outside reviewers: people who
 *                            are not in the student funnel at all
 *   none     no ring         only while the facts are still loading
 *
 * Every variant occupies the same box, size + 6px (a 2px ring and a 1px gap on
 * each side), so a list lines up whatever mix of people it holds, and a ring that
 * arrives after the data loads never moves anything. The ring is drawn on a
 * pseudo-element so it can fade in without touching layout.
 *
 * Every person wears a ring once their facts are known, so a bare photo only
 * ever means "still loading". Gold is the one warm, bright colour on purpose:
 * most rows in Admin are leads, and "our student" has to jump out of a list.
 *
 * Colour is never the only cue: the dashed and hairline variants differ by
 * shape, and PersonAvatar puts the words in a tooltip and the aria-label.
 */
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

export type AvatarRingVariant = 'student' | 'paused' | 'alumni' | 'lead' | 'staff' | 'other' | 'none';

/** The deeper amber stop keeps part of the ring above 3:1 against white. */
export const GOLD_RING_GRADIENT =
  'linear-gradient(135deg, #FFD700 0%, #F0A500 45%, #B7791F 70%, #FFD700 100%)';
export const SILVER_RING_GRADIENT =
  'linear-gradient(135deg, #E2E8F0 0%, #94A3B8 45%, #64748B 70%, #E2E8F0 100%)';
/** The dashed paused ring cannot carry a gradient, so it uses the deep gold stop. */
export const PAUSED_RING_COLOR = '#B7791F';
/** Neutral slate for leads (solid) and people outside the funnel (dotted): 3.6:1 on white. */
export const NEUTRAL_RING_COLOR = '#7C8899';
/** The brand blue (primary 500) for staff: 6.5:1 on white. */
export const STAFF_RING_COLOR = '#1565C0';

/** Pixels the ring adds to the avatar's size. */
export const AVATAR_RING_EXTRA = 6;

function ringStyle(variant: AvatarRingVariant): Record<string, unknown> {
  switch (variant) {
    case 'student':
      return { background: GOLD_RING_GRADIENT };
    case 'alumni':
      return { background: SILVER_RING_GRADIENT };
    case 'paused':
      return { border: `2px dashed ${PAUSED_RING_COLOR}` };
    case 'lead':
      return { border: `2px solid ${NEUTRAL_RING_COLOR}` };
    case 'staff':
      return { border: `2px solid ${STAFF_RING_COLOR}` };
    case 'other':
      return { border: `2px dotted ${NEUTRAL_RING_COLOR}` };
    default:
      return { opacity: 0 };
  }
}

export interface AvatarRingProps {
  variant: AvatarRingVariant;
  /** The avatar's own size; the frame is size + 6. */
  size: number;
  /** The avatar, plus any corner marks positioned against this frame. */
  children: ReactNode;
  sx?: SxProps<Theme>;
}

export function AvatarRing({ variant, size, children, sx }: AvatarRingProps): JSX.Element {
  const gradient = variant === 'student' || variant === 'alumni';
  return (
    <Box
      data-ring={variant}
      sx={[
        {
          position: 'relative',
          width: size + AVATAR_RING_EXTRA,
          height: size + AVATAR_RING_EXTRA,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          // Its own stacking context, so the ring layers (z-index -1) sit under
          // the photo and the corner marks without positioning either of them.
          isolation: 'isolate',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            borderRadius: '50%',
            boxSizing: 'border-box',
            transition: 'opacity 150ms ease-out',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            ...ringStyle(variant),
          },
          // The 1px gap between a gradient ring and the photo.
          '&::after': gradient
            ? {
                content: '""',
                position: 'absolute',
                inset: 2,
                zIndex: -1,
                borderRadius: '50%',
                bgcolor: 'background.paper',
              }
            : undefined,
          ...(variant === 'paused'
            ? { '& .MuiAvatar-root': { filter: 'grayscale(0.6)', opacity: 0.85 } }
            : {}),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

export default AvatarRing;
