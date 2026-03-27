'use client';

import { Box, Typography, Fade, useTheme, useMediaQuery } from '@neram/ui';

interface KeyboardShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts: { keys: string[]; description: string }[] = [
  { keys: ['J', '↓'], description: 'Next question' },
  { keys: ['K', '↑'], description: 'Previous question' },
  { keys: ['Enter'], description: 'Expand / collapse' },
  { keys: ['S'], description: 'Toggle studied' },
  { keys: ['1', '2', '3', '4'], description: 'Select MCQ option' },
  { keys: ['Esc'], description: 'Collapse / exit' },
  { keys: ['G', '+', '#'], description: 'Go to question #' },
  { keys: ['?'], description: 'Toggle this help' },
];

const kbdSx = {
  display: 'inline-block',
  background: 'rgba(255,255,255,0.15)',
  borderRadius: '4px',
  padding: '2px 8px',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.2)',
  lineHeight: 1.6,
  minWidth: '24px',
  textAlign: 'center' as const,
};

export default function KeyboardShortcutsOverlay({
  open,
  onClose,
}: KeyboardShortcutsOverlayProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // Only render on desktop
  if (!isDesktop) return null;

  return (
    <Fade in={open} timeout={200}>
      <Box
        onClick={onClose}
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1300,
          display: open ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Box
          onClick={(e) => e.stopPropagation()}
          sx={{
            maxWidth: 480,
            width: '90%',
            bgcolor: 'rgba(30, 30, 30, 0.95)',
            borderRadius: 3,
            p: 4,
            boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          }}
        >
          <Typography
            variant="h6"
            sx={{ color: '#fff', mb: 3, fontWeight: 600, textAlign: 'center' }}
          >
            Keyboard Shortcuts
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '12px 24px',
              alignItems: 'center',
            }}
          >
            {shortcuts.map((shortcut) => (
              <Box key={shortcut.description} sx={{ display: 'contents' }}>
                {/* Keys column */}
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                  {shortcut.keys.map((key, i) =>
                    key === '+' ? (
                      <Typography
                        key={i}
                        component="span"
                        sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', mx: 0.25 }}
                      >
                        +
                      </Typography>
                    ) : (
                      <Box key={i} component="kbd" sx={kbdSx}>
                        {key}
                      </Box>
                    ),
                  )}
                </Box>

                {/* Description column */}
                <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>
                  {shortcut.description}
                </Typography>
              </Box>
            ))}
          </Box>

          <Typography
            sx={{
              color: 'rgba(255,255,255,0.35)',
              fontSize: '0.75rem',
              textAlign: 'center',
              mt: 3,
            }}
          >
            Press <Box component="kbd" sx={{ ...kbdSx, fontSize: '0.7rem' }}>?</Box> or click
            anywhere to close
          </Typography>
        </Box>
      </Box>
    </Fade>
  );
}
