'use client';

import { useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Box } from '@neram/ui';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { tokens as tk } from '@/design-system';
import { demoCountdown } from '@/lib/demo-countdown';
import type { DemoActiveFlag } from '@/lib/demo-cta';
import { LiveDot, useDemoClock } from '@/components/demo-class/DemoCountdownParts';
import { fromTier } from './header-tier';

// Loaded on first tap, so pages without a booked demo never pay for it.
const DemoQuickView = dynamic(() => import('@/components/demo-class/DemoQuickView'), { ssr: false });

export type ConfirmedDemoFlag = DemoActiveFlag & { start: string; token: string };

export function isConfirmedDemoFlag(f: DemoActiveFlag | null): f is ConfirmedDemoFlag {
  return !!f && f.status === 'approved' && !!f.start && !!f.token;
}

/**
 * "My demo" with the time left, for a confirmed demo. Opens the quick view
 * (countdown, Join, calendar reminders) instead of navigating. Once the demo
 * is over it renders `fallback`, the plain My demo link.
 */
export default function DemoHeaderChip({
  flag,
  variant,
  light,
  label,
  signedIn,
  fallback,
}: {
  flag: ConfirmedDemoFlag;
  variant: 'bar' | 'phone';
  light: boolean;
  label: string;
  signedIn: boolean;
  fallback: ReactNode;
}) {
  const now = useDemoClock(30_000);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const c = now ? demoCountdown(new Date(flag.start), flag.minutes ?? 45, now) : null;
  if (c?.phase === 'over') return <>{fallback}</>;
  const hot = c?.phase === 'soon' || c?.phase === 'live';
  const ink = light ? tk.ink : tk.paper;
  const timeColor = hot ? tk.surface : light ? tk.gold800 : tk.gold500;

  const time = c && (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: hot ? 0.75 : 0,
        py: hot ? 0.25 : 0,
        borderRadius: `${tk.radiusPill}px`,
        bgcolor: hot ? tk.success : 'transparent',
        color: timeColor,
        fontSize: variant === 'phone' ? 13 : 14,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {c.phase === 'live' && <LiveDot size={6} />}
      {variant === 'phone' ? c.tiny : c.short}
    </Box>
  );

  return (
    <>
      <Box
        component="button"
        type="button"
        ref={ref}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={c ? `${label}. ${c.label}` : label}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: variant === 'phone' ? 0.5 : 1,
          height: 44,
          minWidth: 44,
          px: variant === 'phone' ? 1 : '11px',
          flexShrink: 0,
          boxSizing: 'border-box',
          border: `1px solid ${hot ? tk.success : light ? tk.lineStrong : 'rgba(245,240,232,0.24)'}`,
          borderRadius: `${tk.radius}px`,
          bgcolor: 'transparent',
          color: ink,
          font: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          transition: 'border-color 150ms ease',
          '&:hover': { borderColor: tk.gold500 },
          '&:focus-visible': { outline: tk.focusOutline, outlineOffset: 2 },
          ...(variant === 'bar' && { [fromTier('full')]: { px: '14px' } }),
        }}
      >
        <EventAvailableOutlinedIcon aria-hidden sx={{ fontSize: variant === 'phone' ? 18 : 20 }} />
        {variant === 'bar' && (
          <Box component="span" sx={{ display: 'none', [fromTier('full')]: { display: 'inline' } }}>
            {label}
          </Box>
        )}
        {variant === 'bar' && c && !hot && (
          <Box component="span" aria-hidden sx={{ display: 'none', width: '1px', height: 16, bgcolor: light ? tk.line : tk.lineDark, [fromTier('full')]: { display: 'inline-block' } }} />
        )}
        {time}
      </Box>
      {mounted && <DemoQuickView flag={flag} open={open} anchorEl={ref.current} onClose={() => setOpen(false)} signedIn={signedIn} />}
    </>
  );
}
