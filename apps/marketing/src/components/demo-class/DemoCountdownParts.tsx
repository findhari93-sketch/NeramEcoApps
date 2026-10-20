'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@neram/ui';
import EventIcon from '@mui/icons-material/Event';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { tokens as tk } from '@/design-system';
import type { DemoCountdown } from '@/lib/demo-countdown';
import { demoGoogleUrl, demoIcsUrl, demoOutlookUrl, type DemoCalendarInput } from '@/lib/demo-calendar-links';

/**
 * The current time, ticking every `everyMs`. Null until mounted, so server and
 * client render the same markup (no hydration mismatch on a countdown).
 */
export function useDemoClock(everyMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

const focus = { '&:focus-visible': { outline: tk.focusOutline, outlineOffset: 2 } } as const;

/** A green dot that pulses only when the visitor allows motion. */
export function LiveDot({ size = 8 }: { size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: tk.statusDone,
        flexShrink: 0,
        '@media (prefers-reduced-motion: no-preference)': {
          animation: 'neramLivePulse 1.6s ease-in-out infinite',
          '@keyframes neramLivePulse': {
            '0%, 100%': { boxShadow: `0 0 0 0 rgba(63,174,90,0.55)` },
            '50%': { boxShadow: `0 0 0 5px rgba(63,174,90,0)` },
          },
        },
      }}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Big tabular digits: days, hours and minutes when more than a day away,
 * otherwise hours, minutes and seconds. Live and soon get a status line instead.
 */
export function CountdownTiles({ countdown: c }: { countdown: DemoCountdown }) {
  if (c.phase === 'over') return null;
  if (c.phase === 'live') {
    return (
      <Box
        role="status"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.25, borderRadius: `${tk.radius}px`, bgcolor: 'rgba(46,125,50,0.08)', border: `1px solid rgba(46,125,50,0.24)` }}
      >
        <LiveDot />
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: tk.success }}>Live now. Join the class</Typography>
      </Box>
    );
  }
  const units =
    c.days > 0
      ? [
          { v: String(c.days), u: c.days === 1 ? 'day' : 'days' },
          { v: pad(c.hours), u: 'hrs' },
          { v: pad(c.minutes), u: 'min' },
        ]
      : [
          { v: pad(c.hours), u: 'hrs' },
          { v: pad(c.minutes), u: 'min' },
          { v: pad(c.seconds), u: 'sec' },
        ];
  return (
    <Box role="timer" aria-label={c.label} sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
      {units.map((x) => (
        <Box
          key={x.u}
          aria-hidden
          sx={{ textAlign: 'center', py: 1, borderRadius: `${tk.radius}px`, bgcolor: tk.ground, border: `1px solid ${tk.line}` }}
        >
          <Box sx={{ fontSize: 26, lineHeight: '32px', fontWeight: 700, color: c.phase === 'soon' ? tk.success : tk.ink, fontVariantNumeric: 'tabular-nums' }}>
            {x.v}
          </Box>
          <Box sx={{ fontSize: 12, lineHeight: '16px', color: tk.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{x.u}</Box>
        </Box>
      ))}
    </Box>
  );
}

/** One row, three targets: Google and Outlook add-event pages, and an .ics for Apple and everything else. */
export function AddToCalendarRow({ event, title = 'Set a reminder in your calendar' }: { event: DemoCalendarInput; title?: string }) {
  const items = [
    { key: 'google', label: 'Google', href: demoGoogleUrl(event), external: true },
    { key: 'outlook', label: 'Outlook', href: demoOutlookUrl(event), external: true },
    { key: 'apple', label: 'Apple', href: demoIcsUrl(event), external: false, aria: 'Apple or any other calendar (.ics file)' },
  ];
  return (
    <Box>
      <Typography component="h3" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 14, fontWeight: 700, color: tk.ink, mb: 1 }}>
        <NotificationsActiveOutlinedIcon aria-hidden sx={{ fontSize: 18, color: tk.inkMuted }} />
        {title}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
        {items.map((i) => (
          <Box
            key={i.key}
            component="a"
            href={i.href}
            aria-label={i.aria ?? `Add to ${i.label} Calendar`}
            {...(i.external ? { target: '_blank', rel: 'noopener noreferrer' } : { download: 'neram-demo-class.ics' })}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              minHeight: 44,
              px: 1,
              borderRadius: `${tk.radius}px`,
              border: `1px solid ${tk.lineStrong}`,
              bgcolor: tk.surface,
              color: tk.ink,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'border-color 150ms ease, background-color 150ms ease',
              '&:hover': { borderColor: tk.ink, bgcolor: tk.surfaceHover },
              ...focus,
            }}
          >
            <EventIcon aria-hidden sx={{ fontSize: 16, color: tk.inkMuted }} />
            {i.label}
          </Box>
        ))}
      </Box>
      <Typography sx={{ fontSize: 12, lineHeight: '18px', color: tk.inkMuted, mt: 0.75 }}>
        Apple also works for Samsung and any other calendar app.
      </Typography>
    </Box>
  );
}
