import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { tokens as t } from './tokens';

export type TimelineState = 'done' | 'now' | 'next';

export interface TimelineItem {
  label: ReactNode;
  date: ReactNode;
  state: TimelineState;
  /** Muted line under the label. */
  note?: ReactNode;
}

const STATE_LABEL: Record<TimelineState, string> = { done: 'Done', now: 'Current', next: 'Upcoming' };

function dotSx(state: TimelineState) {
  return {
    width: 12,
    height: 12,
    borderRadius: '50%',
    justifySelf: 'center',
    boxSizing: 'border-box',
    bgcolor: state === 'done' ? t.success : state === 'now' ? t.gold500 : t.surface,
    border: state === 'next' ? `2px solid ${t.lineStrong}` : 'none',
    boxShadow: state === 'now' ? `0 0 0 4px ${t.goldTintBg}` : 'none',
  } as const;
}

/**
 * A schedule as a ruled list (T5): ink top rule, one row per milestone with a
 * state dot (done = green, now = gold with a halo, next = hollow), the label
 * and a mono date. The state is also in visually hidden text, not colour only.
 */
export default function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', borderTop: `1px solid ${t.ink}` }}>
      {items.map((item, i) => (
        <Box
          component="li"
          key={i}
          aria-current={item.state === 'now' ? 'step' : undefined}
          sx={{
            display: 'grid',
            // Phones: the date drops under the label so long labels keep their width.
            gridTemplateColumns: { xs: '28px minmax(0, 1fr)', sm: '28px minmax(0, 1fr) auto' },
            columnGap: 1.75,
            rowGap: 0.5,
            alignItems: 'center',
            py: 1.75,
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <Box aria-hidden sx={dotSx(item.state)} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
            <Typography component="span" sx={{ fontSize: '1rem', fontWeight: item.state === 'now' ? 700 : 600, lineHeight: 1.4 }}>
              <Box component="span" sx={visuallyHidden}>
                {STATE_LABEL[item.state]}:{' '}
              </Box>
              {item.label}
            </Typography>
            {item.note && (
              <Typography component="span" sx={{ fontSize: '0.875rem', lineHeight: 1.5, color: t.inkMuted }}>
                {item.note}
              </Typography>
            )}
          </Box>
          <Typography
            component="span"
            sx={{
              fontFamily: t.fontMono,
              fontSize: '0.875rem',
              fontWeight: 700,
              color: t.inkMuted,
              gridColumn: { xs: 2, sm: 'auto' },
              whiteSpace: { sm: 'nowrap' },
              textAlign: { xs: 'left', sm: 'right' },
            }}
          >
            {item.date}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// Clip-based visually hidden text. Never `width: 1` in sx (that is 100%).
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
