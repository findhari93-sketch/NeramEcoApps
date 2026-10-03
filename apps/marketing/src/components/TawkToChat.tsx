'use client';

import { useEffect, useState } from 'react';
import Fab from '@mui/material/Fab';
import CircularProgress from '@mui/material/CircularProgress';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { hideTawk, openTawkChat } from '@/lib/tawk';

type LauncherState = 'idle' | 'loading' | 'open' | 'error';

/**
 * Live chat launcher for the contact and centre pages.
 *
 * A small button renders first; the Tawk.to embed (script, iframe and socket)
 * downloads only when the visitor taps it, so phones on slow networks no
 * longer pay for it on every visit. Once Tawk is open, its own bubble takes
 * over and this button steps aside.
 */
export default function TawkToChat() {
  const [state, setState] = useState<LauncherState>('idle');

  // Leaving the page hides the Tawk bubble (the script cannot be unloaded).
  useEffect(() => () => hideTawk(), []);

  if (state === 'open') return null;

  const loading = state === 'loading';
  const label = state === 'error' ? 'Try live chat again' : 'Live chat';

  const handleClick = async () => {
    if (loading) return;
    setState('loading');
    const ok = await openTawkChat();
    setState(ok ? 'open' : 'error');
  };

  return (
    <Fab
      variant="extended"
      color="primary"
      onClick={handleClick}
      aria-busy={loading}
      data-testid="tawk-launcher"
      sx={{
        position: 'fixed',
        right: { xs: 16, sm: 20 },
        bottom: { xs: 16, sm: 20 },
        zIndex: 1200,
        minHeight: 48,
        px: 2,
        gap: 1,
        textTransform: 'none',
        fontSize: 16,
        fontWeight: 600,
        '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.dark', outlineOffset: 3 },
      }}
    >
      {loading ? (
        <CircularProgress
          size={20}
          thickness={5}
          sx={{
            color: 'inherit',
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              '& .MuiCircularProgress-circle': { animation: 'none', strokeDasharray: '40px, 200px' },
            },
          }}
        />
      ) : (
        <ChatBubbleOutlineIcon sx={{ fontSize: 22 }} aria-hidden />
      )}
      {loading ? 'Connecting to live chat' : label}
    </Fab>
  );
}
