'use client';

import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import { tokens as t } from '../tokens';

export interface PillProps {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  /** aria-pressed for filters/toggles (default); use 'radio' inside a radiogroup. */
  role?: 'toggle' | 'radio';
  disabled?: boolean;
}

/**
 * A selectable pill (filters, demo class options). Selected = navy900 fill
 * with paper text; unselected = white with a 2px line border. 44px tall.
 */
export default function Pill({ selected = false, onClick, children, role = 'toggle', disabled }: PillProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(role === 'radio' ? { role: 'radio', 'aria-checked': selected } : { 'aria-pressed': selected })}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        minHeight: 44,
        px: 2,
        borderRadius: `${t.radiusPill}px`,
        border: `2px solid ${selected ? t.navy900 : t.line}`,
        bgcolor: selected ? t.navy900 : t.surface,
        color: selected ? t.paper : t.ink,
        font: 'inherit',
        fontSize: '0.9375rem',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
        '&:hover:not([disabled])': selected ? {} : { borderColor: t.ink },
        '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
        '&[disabled]': { opacity: 0.5, cursor: 'not-allowed' },
        '& svg': { fontSize: 18 },
      }}
    >
      {children}
    </Box>
  );
}
