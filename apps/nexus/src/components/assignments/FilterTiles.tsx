'use client';

/**
 * Stat tiles that ARE the filter: a count, a short label, and pressing one shows
 * that slice of the list. Replaces the pattern of four decorative tiles stacked
 * over a separate toggle row, which on a phone pushed the list itself below the
 * fold.
 *
 * One row at every width (2 to 4 tiles). The label wraps rather than truncates,
 * so "Not submitted" still reads at 375px, and every tile is at least 56px tall.
 */
import { Box, CardActionArea, Typography, alpha } from '@neram/ui';

export interface FilterTile<V extends string> {
  value: V;
  label: string;
  count: number | string;
  /** Tints the count, for a status that carries meaning (Inactive, Drafts). */
  color?: string;
  /** Draws the eye to a tile that needs doing, even when it is not selected. */
  attention?: boolean;
}

export default function FilterTiles<V extends string>({
  tiles,
  value,
  onChange,
  ariaLabel,
  sx,
}: {
  tiles: FilterTile<V>[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel: string;
  sx?: object;
}) {
  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`,
        gap: 1,
        ...sx,
      }}
    >
      {tiles.map((t) => {
        const on = t.value === value;
        return (
          <CardActionArea
            key={t.value}
            aria-pressed={on}
            onClick={() => onChange(t.value)}
            sx={(theme) => ({
              minWidth: 0,
              minHeight: 56,
              px: 0.5,
              py: 1,
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              border: '1px solid',
              borderColor: on ? 'primary.main' : 'divider',
              bgcolor: on ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
              boxShadow: on ? `inset 0 0 0 1px ${theme.palette.primary.main}` : 'none',
              transition: 'background-color 150ms, border-color 150ms',
              '&:hover': { borderColor: on ? 'primary.main' : 'primary.light' },
              '&.Mui-focusVisible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            })}
          >
            <Typography
              component="span"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                lineHeight: 1.2,
                color: t.color ?? (on ? 'primary.main' : 'text.primary'),
              }}
            >
              {t.count}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: '0.75rem',
                lineHeight: 1.25,
                fontWeight: on || t.attention ? 700 : 500,
                color: on ? 'primary.main' : t.attention ? 'text.primary' : 'text.secondary',
                textAlign: 'center',
                overflowWrap: 'anywhere',
              }}
            >
              {t.label}
            </Typography>
          </CardActionArea>
        );
      })}
    </Box>
  );
}
