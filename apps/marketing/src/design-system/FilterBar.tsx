'use client';

import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import { tokens as t } from './tokens';

export interface FilterSelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  /** Label for the empty value (default "All"). */
  allLabel?: string;
}

/** A labelled native select styled as a 44px chip (T8 filter bar). */
export function FilterSelect({ label, value, options, onChange, allLabel = 'All' }: FilterSelectProps) {
  return (
    <Box
      component="label"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 44,
        px: 1.5,
        boxSizing: 'border-box',
        border: `1px solid ${t.lineStrong}`,
        borderRadius: `${t.radius}px`,
        bgcolor: t.surface,
        fontSize: '0.875rem',
        color: t.inkMuted,
        '&:focus-within': { outline: t.focusOutline, outlineOffset: '2px' },
      }}
    >
      {label}
      <Box
        component="select"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        sx={{ border: 0, bgcolor: 'transparent', font: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: t.ink, outline: 'none', cursor: 'pointer', maxWidth: 180 }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Box>
    </Box>
  );
}

export interface FilterBarProps {
  children: ReactNode;
  /** Shows a "Clear all" text button when set. */
  onClear?: () => void;
  /** Right-aligned summary ("Showing 24 reviews"). */
  summary?: ReactNode;
  /** Stick under the site header (default true). */
  sticky?: boolean;
}

/**
 * The white filter strip under a T8 hero: selects or pills, an optional
 * "Clear all", and a result count. Sticks below the header on scroll.
 */
export default function FilterBar({ children, onClear, summary, sticky = true }: FilterBarProps) {
  return (
    <Box
      sx={{
        position: sticky ? 'sticky' : 'static',
        top: { xs: 56, md: 64 },
        zIndex: 30,
        bgcolor: t.surface,
        borderBottom: `1px solid ${t.line}`,
      }}
    >
      <Box
        sx={{
          maxWidth: t.container.page,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          py: 1.5,
          boxSizing: 'content-box',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
        }}
      >
        {children}
        {onClear && (
          <Box
            component="button"
            type="button"
            onClick={onClear}
            sx={{
              minHeight: 44,
              px: 1.5,
              border: 0,
              bgcolor: 'transparent',
              font: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: t.inkMuted,
              textDecoration: 'underline',
              cursor: 'pointer',
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
            }}
          >
            Clear all
          </Box>
        )}
        {summary && (
          <Box component="span" sx={{ ml: 'auto', fontSize: '0.875rem', color: t.inkMuted }}>
            {summary}
          </Box>
        )}
      </Box>
    </Box>
  );
}
