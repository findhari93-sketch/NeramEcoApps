'use client';

import { Box, Typography } from '@neram/ui';

/**
 * Three pulsing dots while Aintra works, with the tool status beside them when
 * a lookup is running ("Searching colleges..."). Still dots under reduced motion.
 */
export default function TypingIndicator({ status }: { status?: string }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label={status || 'Aintra is typing'}
      data-testid="aintra-typing"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, minHeight: 32 }}
    >
      <Box
        aria-hidden
        sx={{
          display: 'inline-flex',
          gap: '5px',
          '& span': {
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            opacity: 0.35,
            animation: 'aintraDot 1.2s ease-in-out infinite',
          },
          '& span:nth-of-type(2)': { animationDelay: '0.15s' },
          '& span:nth-of-type(3)': { animationDelay: '0.3s' },
          '@keyframes aintraDot': {
            '0%, 80%, 100%': { opacity: 0.35, transform: 'translateY(0)' },
            '40%': { opacity: 1, transform: 'translateY(-3px)' },
          },
          '@media (prefers-reduced-motion: reduce)': { '& span': { animation: 'none', opacity: 0.6 } },
        }}
      >
        <span />
        <span />
        <span />
      </Box>
      {status && (
        <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          {status}
        </Typography>
      )}
    </Box>
  );
}
