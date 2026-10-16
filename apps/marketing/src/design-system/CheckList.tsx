import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { v } from './tokens';

export interface CheckListProps {
  items: ReactNode[];
  /**
   * ruled: "features as a ruled list" (T1, T7): check_circle, 1px rules, two
   * columns from ~560px. compact: a tight list of checks inside a card.
   */
  variant?: 'ruled' | 'compact';
  /** Minimum column width for the ruled grid (default 260). */
  columnMin?: number;
}

/** A list with gold800 checks (gold500 on dark, via the Surface variable). */
export default function CheckList({ items, variant = 'ruled', columnMin = 260 }: CheckListProps) {
  const ruled = variant === 'ruled';
  return (
    <Box
      component="ul"
      sx={{
        m: 0,
        p: 0,
        listStyle: 'none',
        ...(ruled
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${columnMin}px), 1fr))`,
              columnGap: 3,
              borderTop: `1px solid ${v.line}`,
            }
          : { display: 'flex', flexDirection: 'column', gap: 0.75 }),
      }}
    >
      {items.map((item, i) => (
        <Box
          component="li"
          key={i}
          sx={
            ruled
              ? {
                  display: 'flex',
                  gap: 1.25,
                  alignItems: 'center',
                  py: 1.75,
                  borderBottom: `1px solid ${v.line}`,
                  fontSize: '1rem',
                  fontWeight: 500,
                }
              : { display: 'flex', gap: 1, alignItems: 'flex-start', fontSize: '0.9375rem', lineHeight: 1.4 }
          }
        >
          {ruled ? (
            <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 20, color: v.eyebrow, flexShrink: 0 }} />
          ) : (
            <CheckIcon aria-hidden sx={{ fontSize: 18, color: v.eyebrow, flexShrink: 0, mt: '1px' }} />
          )}
          {item}
        </Box>
      ))}
    </Box>
  );
}
