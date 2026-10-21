'use client';

import { useEffect } from 'react';
import { Box, Typography } from '@neram/ui';
import { Drawer, IconButton, Popover, useMediaQuery } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VideocamIcon from '@mui/icons-material/Videocam';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { formatDemoDate, formatDemoTime } from '@neram/database/demo-schedule';
import { tokens as tk } from '@/design-system';
import { Link } from '@/i18n/routing';
import { demoCountdown } from '@/lib/demo-countdown';
import { writeDemoActive, type DemoActiveFlag } from '@/lib/demo-cta';
import { AddToCalendarRow, CountdownTiles, useDemoClock } from './DemoCountdownParts';
import { fetchMyDemo } from './demo-client';

// The Aintra chat launcher sits at the modal layer (1300); the quick view must cover it.
const ABOVE_CHAT = 1350;
const focus = { '&:focus-visible': { outline: tk.focusOutline, outlineOffset: 2 } } as const;

/**
 * The header's "My demo" at a glance: when, a live countdown, Join, and
 * one-tap calendar reminders. A popover on laptops, a bottom sheet on phones.
 */
export default function DemoQuickView({
  flag,
  open,
  anchorEl,
  onClose,
  signedIn,
}: {
  flag: DemoActiveFlag & { start: string; token: string };
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  signedIn: boolean;
}) {
  const phone = useMediaQuery('(max-width:899.95px)');
  const now = useDemoClock(1000);

  // The flag can be stale after a reschedule: refresh it each time the panel opens.
  useEffect(() => {
    if (!open || !signedIn) return;
    fetchMyDemo()
      .then((d) => d.request && writeDemoActive(d.request))
      .catch(() => {});
  }, [open, signedIn]);

  const start = new Date(flag.start);
  const minutes = flag.minutes ?? 45;
  const c = demoCountdown(start, minutes, now ?? start);
  const joinable = c.phase === 'soon' || c.phase === 'live';

  const body = (
    <Box sx={{ p: 2, display: 'grid', gap: 2, color: tk.ink }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tk.gold800 }}>
            Your demo class
          </Typography>
          <Typography component="h2" id="demo-quick-title" sx={{ fontSize: 20, lineHeight: '28px', fontWeight: 700, mt: 0.25 }}>
            {formatDemoDate(start)}, {formatDemoTime(start)}
          </Typography>
          <Typography sx={{ fontSize: 14, color: tk.inkMuted }}>
            {minutes} min on Microsoft Teams{flag.hostName ? ` with ${flag.hostName}` : ''}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44, mr: -1, mt: -1, color: tk.inkMuted, ...focus }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {now ? <CountdownTiles countdown={c} /> : <Box sx={{ height: 58, borderRadius: `${tk.radius}px`, bgcolor: tk.ground }} />}

      {flag.joinUrl && (
        <Box
          component="a"
          href={flag.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            minHeight: 48,
            borderRadius: `${tk.radius}px`,
            bgcolor: joinable ? tk.success : tk.navy900,
            color: tk.surface,
            fontSize: 16,
            fontWeight: 700,
            textDecoration: 'none',
            transition: 'opacity 150ms ease',
            '&:hover': { opacity: 0.92 },
            ...focus,
          }}
        >
          <VideocamIcon aria-hidden sx={{ fontSize: 20 }} />
          {joinable ? 'Join now' : 'Join on Teams'}
        </Box>
      )}
      {flag.joinUrl && (
        <Typography sx={{ fontSize: 13, lineHeight: '18px', color: tk.inkMuted, mt: -1 }}>
          Laptop: opens in Chrome or Edge, no download. Phone: use the free Teams app, join as a guest.
        </Typography>
      )}

      <AddToCalendarRow
        event={{ ref: flag.ref, token: flag.token, start, minutes, joinUrl: flag.joinUrl ?? null, hostName: flag.hostName, origin: '' }}
      />

      <Box
        component={Link}
        href="/demo-class/my"
        onClick={onClose}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
          pt: 1.5,
          borderTop: `1px solid ${tk.line}`,
          color: tk.ink,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          '&:hover': { color: tk.gold800 },
          ...focus,
        }}
      >
        Booking details, {flag.ref}
        <ChevronRightIcon aria-hidden sx={{ fontSize: 20 }} />
      </Box>
    </Box>
  );

  if (phone) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        sx={{ zIndex: ABOVE_CHAT }}
        PaperProps={{
          'aria-labelledby': 'demo-quick-title',
          sx: { bgcolor: tk.surface, backgroundImage: 'none', borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' },
        }}
      >
        <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: tk.lineStrong, mx: 'auto', mt: 1 }} />
        <Box sx={{ maxWidth: 560, mx: 'auto', width: '100%' }}>{body}</Box>
      </Drawer>
    );
  }
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      sx={{ zIndex: ABOVE_CHAT }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{
        'aria-labelledby': 'demo-quick-title',
        sx: { mt: 1, width: 360, bgcolor: tk.surface, backgroundImage: 'none', borderRadius: `${tk.radius}px`, border: `1px solid ${tk.line}`, boxShadow: tk.shadowMegaMenu },
      }}
    >
      {body}
    </Popover>
  );
}
