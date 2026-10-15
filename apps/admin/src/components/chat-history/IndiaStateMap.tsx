'use client';

/**
 * India choropleth: one fill per state from a single-hue ramp of the theme's
 * primary colour, with a numeric legend. Every state is a focusable button
 * (Enter or Space selects it), so the map works without a mouse; the ranked
 * lists next to it carry the same numbers as text.
 *
 * Paths are pre-projected by scripts/generate-india-map.mjs (official Survey of
 * India boundary), so nothing is projected in the browser.
 */

import { useMemo } from 'react';
import { Box, Tooltip, Typography, useTheme } from '@neram/ui';
import { lighten } from '@mui/material/styles';
import { INDIA_MAP_VIEWBOX, INDIA_STATE_PATHS } from './india-state-paths';

/** UTs too small to see or click at this scale: they get a dot at the centroid. */
const TINY = new Set(['chandigarh', 'delhi', 'puducherry', 'lakshadweep', 'dadra-and-nagar-haveli-and-daman-and-diu', 'goa', 'sikkim', 'tripura']);

const STEPS = 5;

export interface IndiaStateMapProps {
  /** Chatters per @neram/geo state slug. Missing means 0. */
  values: Record<string, number>;
  names: Record<string, string>;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  unit?: string;
}

/** Upper bounds of each colour step, from the distinct non-zero values. */
function breaksFor(values: number[]): number[] {
  const nonZero = [...new Set(values.filter((v) => v > 0))].sort((a, b) => a - b);
  if (nonZero.length === 0) return [];
  if (nonZero.length <= STEPS) return nonZero;
  return Array.from({ length: STEPS }, (_, i) => nonZero[Math.min(nonZero.length - 1, Math.ceil(((i + 1) * nonZero.length) / STEPS) - 1)]);
}

export default function IndiaStateMap({ values, names, selected, onSelect, unit = 'chatters' }: IndiaStateMapProps) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const empty = theme.palette.grey[200];

  const breaks = useMemo(() => breaksFor(Object.values(values)), [values]);
  const ramp = useMemo(() => {
    // Lightest to darkest. With fewer distinct values than steps, use the dark end.
    const all = [0.8, 0.62, 0.44, 0.24, 0];
    return all.slice(all.length - Math.max(1, breaks.length)).map((k) => lighten(primary, k));
  }, [primary, breaks.length]);

  const fillFor = (v: number) => {
    if (!v) return empty;
    const i = breaks.findIndex((b) => v <= b);
    return ramp[i === -1 ? ramp.length - 1 : i];
  };

  const legend = breaks.map((b, i) => {
    const lo = i === 0 ? 1 : breaks[i - 1] + 1;
    return { color: ramp[i], label: lo >= b ? `${b}` : `${lo} to ${b}` };
  });

  const activate = (slug: string) => onSelect(selected === slug ? null : slug);

  const shapeProps = (slug: string) => {
    const v = values[slug] ?? 0;
    const name = names[slug] ?? slug;
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': `${name}: ${v} ${unit}`,
      'aria-pressed': selected === slug,
      'data-state': slug,
      onClick: () => activate(slug),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(slug);
        }
      },
      fill: fillFor(v),
      className: selected === slug ? 'is-selected' : undefined,
    };
  };

  return (
    <Box>
      <Box
        component="svg"
        viewBox={INDIA_MAP_VIEWBOX}
        role="group"
        aria-label={`Map of India, ${unit} by state`}
        sx={{
          display: 'block',
          width: '100%',
          maxHeight: 560,
          '& [role="button"]': {
            cursor: 'pointer',
            stroke: theme.palette.background.paper,
            strokeWidth: 0.8,
            outline: 'none',
            '@media (prefers-reduced-motion: no-preference)': { transition: 'fill 200ms, stroke 150ms' },
          },
          '& [role="button"]:hover': { stroke: theme.palette.text.secondary, strokeWidth: 1.2 },
          '& [role="button"]:focus-visible, & .is-selected': {
            stroke: theme.palette.text.primary,
            strokeWidth: 2,
          },
        }}
      >
        {INDIA_STATE_PATHS.map((p) => (
          <Tooltip
            key={p.slug}
            title={`${names[p.slug] ?? p.slug}: ${values[p.slug] ?? 0} ${unit}`}
            followCursor
            disableInteractive
          >
            <path d={p.d} {...shapeProps(p.slug)} />
          </Tooltip>
        ))}
        {INDIA_STATE_PATHS.filter((p) => TINY.has(p.slug) && (values[p.slug] ?? 0) > 0).map((p) => (
          <Tooltip key={`dot-${p.slug}`} title={`${names[p.slug] ?? p.slug}: ${values[p.slug]} ${unit}`} disableInteractive>
            <circle cx={p.cx} cy={p.cy} r={6} {...shapeProps(p.slug)} aria-hidden tabIndex={-1} />
          </Tooltip>
        ))}
      </Box>

      {legend.length > 0 && (
        <Box
          component="ul"
          aria-label="Legend"
          sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}
        >
          <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: empty, border: 1, borderColor: 'divider' }} />
            <Typography variant="caption" color="text.secondary">0</Typography>
          </Box>
          {legend.map((l) => (
            <Box component="li" key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: l.color }} />
              <Typography variant="caption" color="text.secondary">{l.label}</Typography>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {unit} per state
          </Typography>
        </Box>
      )}
    </Box>
  );
}
