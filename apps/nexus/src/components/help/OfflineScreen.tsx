'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Divider, Stack, Typography } from '@neram/ui';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import OpenInBrowserIcon from '@mui/icons-material/OpenInBrowser';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import SupportContactButtons from './SupportContactButtons';

const TAP = 48;

/** Seconds between automatic checks: quick at first, then settling at a minute. */
export const RETRY_STEPS = [15, 30, 60];

/**
 * The address the student was trying to open. The service worker serves this
 * screen IN PLACE of that page, so the address bar still holds it, but Next's
 * router rewrites the address to /offline as soon as it hydrates. Reading it
 * while this module loads, before hydration, keeps it for "Try again".
 */
const LANDED_AT: string =
  typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';

function retryTarget(): string {
  return LANDED_AT.startsWith('/offline') ? '/' : LANDED_AT;
}

/**
 * Can Nexus be reached? A fresh query string on every check, because the service
 * worker keeps .json files NetworkFirst: without it a cached manifest would answer
 * and the phone would look online while it is not.
 */
async function nexusReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const res = await fetch(`/manifest.json?reach=${Date.now()}`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

const QUICK_FIXES = [
  { icon: <SwapVertIcon />, text: 'Switch between Wi-Fi and mobile data, or turn Airplane mode on and off.' },
  { icon: <OpenInBrowserIcon />, text: 'Open nexus.neramclasses.com in Chrome. If it works there, sign in there for now.' },
  { icon: <RestartAltIcon />, text: 'Restart your phone, then open Nexus again.' },
];

/**
 * What a student sees instead of Android's "Can't connect to the site" box: why,
 * what happens next, what to try, and who to reach. Served from the phone's
 * cache by the service worker (next.config.js `fallbacks`), so it must never
 * need the network to render.
 */
export default function OfflineScreen() {
  // Null until mounted: the server cannot know, and a wrong first line would flash.
  const [online, setOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [nextIn, setNextIn] = useState(RETRY_STEPS[0]);
  const step = useRef(0);

  const check = useCallback(async () => {
    setChecking(true);
    const ok = await nexusReachable();
    if (ok) {
      window.location.replace(retryTarget());
      return;
    }
    setChecking(false);
    step.current = Math.min(step.current + 1, RETRY_STEPS.length - 1);
    setNextIn(RETRY_STEPS[step.current]);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void check();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [check]);

  // A countdown rather than a silent timer, so the student can see it is still
  // trying. Paused while the screen is hidden: no point checking in a pocket.
  useEffect(() => {
    if (checking) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setNextIn((s) => {
        if (s <= 1) {
          void check();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [checking, check]);

  const status = checking ? 'Checking the connection now.' : `Checking again in ${nextIn} seconds.`;

  return (
    <Box sx={{ textAlign: 'left' }}>
      <Box role="alert" sx={{ textAlign: 'center' }}>
        <Box
          aria-hidden
          sx={{
            width: 72,
            height: 72,
            mx: 'auto',
            mb: 2,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: 'primary.main',
            backgroundColor: (t) => `${t.palette.primary.main}14`,
          }}
        >
          <CloudOffOutlinedIcon sx={{ fontSize: 40 }} />
        </Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          Can&apos;t connect to Nexus
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {online === false
            ? 'Your phone is not connected to the internet. Your work is safe, and Nexus will open by itself as soon as you are back online.'
            : online
              ? 'Your phone is online, but Nexus is not answering. Your network may be blocking it, or we may have a short outage. Your work is safe.'
              : 'Nexus could not load just now. Your work is safe.'}
        </Typography>
      </Box>

      <Box
        aria-live="polite"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 2, minHeight: 24 }}
      >
        {checking && (
          <CircularProgress
            size={16}
            aria-hidden
            sx={{ '@media (prefers-reduced-motion: reduce)': { animation: 'none', '& circle': { animation: 'none' } } }}
          />
        )}
        <Typography variant="body2" color="text.secondary">
          {status}
        </Typography>
      </Box>

      <Button
        variant="contained"
        fullWidth
        startIcon={<RefreshIcon />}
        onClick={() => void check()}
        disabled={checking}
        sx={{ mt: 2, minHeight: TAP, textTransform: 'none', fontSize: '1rem' }}
      >
        Try again
      </Button>

      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mt: 4, mb: 1 }}>
        Quick fixes
      </Typography>
      <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {QUICK_FIXES.map((fix) => (
          <Box component="li" key={fix.text} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box aria-hidden sx={{ color: 'primary.main', display: 'flex', pt: 0.25 }}>
              {fix.icon}
            </Box>
            <Typography variant="body1" sx={{ lineHeight: 1.5 }}>
              {fix.text}
            </Typography>
          </Box>
        ))}
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Still stuck? Tell us
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
        WhatsApp works even on a weak signal, and the message is typed in for you. Take a screenshot of this
        screen and add it in the chat.
      </Typography>
      <SupportContactButtons problem="cant_open" />

      {online === true && (
        <Button
          component="a"
          href={`/help?problem=cant_open&from=${encodeURIComponent(retryTarget())}`}
          variant="text"
          fullWidth
          startIcon={<SupportAgentOutlinedIcon />}
          sx={{ mt: 1.5, minHeight: TAP, textTransform: 'none', fontSize: '1rem' }}
        >
          Send a help request with a screenshot
        </Button>
      )}
    </Box>
  );
}
