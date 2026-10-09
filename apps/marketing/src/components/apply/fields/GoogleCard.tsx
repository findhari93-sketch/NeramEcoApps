'use client';

import { Box, CircularProgress, Typography } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import ArrowForward from '@mui/icons-material/ArrowForward';

interface GoogleCardProps {
  title: string;
  body: string;
  onClick: () => void;
  /** Google sign-in is in progress: the card is disabled and shows a spinner. */
  busy?: boolean;
}

/** Google's four-colour "G", inline so it never waits on a network request. */
function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * The sign-in card at the top of About you: a full-width 2 px ink box with the
 * Google mark, a title, one line under it and an arrow. It opens the existing
 * sign-in dialog (Google or phone OTP), which fills the name and email.
 */
export default function GoogleCard({ title, body, onClick, busy = false }: GoogleCardProps) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      focusRipple
      sx={{
        width: '100%',
        minHeight: 64,
        px: 2,
        py: 1.5,
        gap: 1.75,
        justifyContent: 'flex-start',
        textAlign: 'left',
        border: '2px solid',
        borderColor: 'text.primary',
        bgcolor: '#fff',
        transition: 'background-color 150ms',
        '&:hover': { bgcolor: '#f4f3ef' },
        '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgba(232, 160, 32, 0.35)' },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', flex: 'none' }}>
        <GoogleG />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: 13, lineHeight: 1.4, color: 'text.secondary', mt: 0.25 }}>
          {body}
        </Typography>
      </Box>
      {busy ? (
        <CircularProgress size={20} sx={{ flex: 'none', color: 'text.primary' }} aria-hidden />
      ) : (
        <ArrowForward aria-hidden sx={{ flex: 'none', color: 'text.primary', fontSize: 20 }} />
      )}
    </ButtonBase>
  );
}
