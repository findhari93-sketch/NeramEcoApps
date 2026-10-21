'use client';

import { Box, IconButton, Tooltip, Typography } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import { useAintra } from './AintraProvider';
import AintraAvatar from './AintraAvatar';

/** Aintra's button in the phone top bar, next to the notification bell. */
export function AintraTopBarButton() {
  const aintra = useAintra();
  if (!aintra) return null;
  return (
    <Tooltip title="Ask Aintra, your Neram assistant">
      <IconButton onClick={() => aintra.open()} aria-label="Open Aintra, your Neram assistant" data-testid="aintra-opener" sx={{ width: 44, height: 44, p: 0.5 }}>
        <AintraAvatar size={32} />
      </IconButton>
    </Tooltip>
  );
}

/** Aintra's row in the laptop sidebar. */
export function AintraSidebarButton() {
  const aintra = useAintra();
  if (!aintra) return null;
  return (
    <ButtonBase
      onClick={() => aintra.open()}
      aria-label="Open Aintra, your Neram assistant"
      data-testid="aintra-opener-sidebar"
      sx={{
        width: '100%',
        minHeight: 56,
        px: 1.5,
        py: 1,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        justifyContent: 'flex-start',
        gap: 1.25,
        textAlign: 'left',
        fontFamily: 'inherit',
        bgcolor: 'background.paper',
        transition: 'background-color 150ms',
        '&:hover': { bgcolor: 'action.hover' },
        '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <AintraAvatar size={32} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.9375rem', lineHeight: 1.2 }}>Ask Aintra</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
          Your Neram assistant
        </Typography>
      </Box>
    </ButtonBase>
  );
}
