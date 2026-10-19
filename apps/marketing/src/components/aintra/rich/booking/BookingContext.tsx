'use client';

import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import { Box, Typography } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { tokens } from '@/design-system';

/**
 * What a booking card needs from the chat around it. Only the site-wide Aintra
 * drawer provides it; elsewhere (the canvas, the NATA chatbot) a [[book:...]]
 * line falls back to plain links to the booking pages.
 */
export interface AintraBookingContextValue {
  /** The chat session, written on the callback so staff can open the chat. */
  sessionId: string;
  /** Opens the chat's own sign-in dialog (Google or phone). */
  openSignIn: () => void;
}

const AintraBookingContext = createContext<AintraBookingContextValue | null>(null);

export function AintraBookingProvider({ value, children }: { value: AintraBookingContextValue; children: ReactNode }) {
  return <AintraBookingContext.Provider value={value}>{children}</AintraBookingContext.Provider>;
}

export function useAintraBooking(): AintraBookingContextValue | null {
  return useContext(AintraBookingContext);
}

export const focusRing = { '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } };

/** A selectable pill: 48px tall, text plus a tick, never colour alone. */
export function ChoicePill({
  selected,
  onClick,
  children,
  sub,
  label,
  disabled,
  compact,
}: {
  /** In an even grid: centred text, the tick in the corner so it never squeezes the words. */
  compact?: boolean;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /** A second, smaller line ("10 am to 12 pm"). */
  sub?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      sx={{
        position: 'relative',
        flex: '0 0 auto',
        minHeight: 48,
        px: compact ? 1 : 1.75,
        py: sub ? 0.5 : 0,
        borderRadius: `${tokens.radius}px`,
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        fontFamily: 'inherit',
        gap: 0.75,
        opacity: disabled ? 0.45 : 1,
        transition: 'background-color 150ms, border-color 150ms',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        ...focusRing,
      }}
    >
      {selected && (
        <CheckCircleIcon aria-hidden sx={compact ? { position: 'absolute', top: 3, right: 3, fontSize: 14 } : { fontSize: 18 }} />
      )}
      <Box sx={{ textAlign: compact ? 'center' : 'left', minWidth: 0 }}>
        <Typography component="span" sx={{ display: 'block', color: 'inherit', fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.25 }}>
          {children}
        </Typography>
        {sub && (
          <Typography component="span" sx={{ display: 'block', color: 'inherit', opacity: 0.85, fontSize: '0.75rem', lineHeight: 1.3 }}>
            {sub}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
}

/**
 * A row of pills. 'scroll' slides sideways on a phone instead of wrapping into
 * a wall, and brings the chosen pill into view; 'grid' splits the width evenly
 * (for three or four short choices that must all be seen at once).
 */
export function PillRow({ label, children, layout = 'scroll', columns = 3 }: { label: string; children: ReactNode; layout?: 'scroll' | 'grid'; columns?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = ref.current;
    if (layout !== 'scroll' || !row) return;
    const chosen = row.querySelector<HTMLElement>('[aria-pressed="true"]');
    // Horizontal only: never move the chat itself.
    if (chosen && (chosen.offsetLeft + chosen.offsetWidth > row.scrollLeft + row.clientWidth || chosen.offsetLeft < row.scrollLeft)) {
      row.scrollLeft = Math.max(0, chosen.offsetLeft - 16);
    }
  });
  if (layout === 'grid') {
    return (
      <Box
        role="group"
        aria-label={label}
        sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 1, '& > *': { minWidth: 0, px: 1 } }}
      >
        {children}
      </Box>
    );
  }
  return (
    <Box
      ref={ref}
      role="group"
      aria-label={label}
      sx={{
        position: 'relative',
        display: 'flex',
        gap: 1,
        overflowX: 'auto',
        pb: 0.5,
        scrollSnapType: 'x proximity',
        overscrollBehaviorX: 'contain',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        '& > *': { scrollSnapAlign: 'start' },
      }}
    >
      {children}
    </Box>
  );
}

/** The card frame every booking card shares. */
export function BookingCardFrame({ icon, title, children, labelledBy }: { icon: ReactNode; title: string; children: ReactNode; labelledBy: string }) {
  // A chat can hold several cards: each heading id must be unique.
  const headingId = `${labelledBy}-${useId().replace(/:/g, '')}`;
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: `${tokens.radius}px`,
        bgcolor: 'background.paper',
        p: { xs: 1.75, sm: 2 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', color: 'primary.main' }}>
          {icon}
        </Box>
        <Typography id={headingId} component="h3" sx={{ fontWeight: 800, fontSize: '1.0625rem', lineHeight: 1.3 }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

export function FieldLabel({ children }: { id?: string; children: ReactNode }) {
  return (
    <Typography component="p" sx={{ fontWeight: 700, fontSize: '0.875rem', mb: 0.75 }}>
      {children}
    </Typography>
  );
}
