'use client';

import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ['→', 'J'], description: 'Next question' },
  { keys: ['←', 'K'], description: 'Previous question' },
  { keys: ['A', 'B', 'C', 'D'], description: 'Choose an option (or 1 to 4)' },
  { keys: ['Enter'], description: 'Check the answer, then go to the next' },
  { keys: ['G', '18'], description: 'Jump to question 18' },
  { keys: ['?'], description: 'Show these shortcuts' },
];

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The practice screen's keys. A real dialog, so it traps focus and Escape
 * closes it, in the theme's colours rather than hardcoded dark greys.
 */
export default function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="qb-shortcuts-title">
      <DialogTitle id="qb-shortcuts-title" sx={{ display: 'flex', alignItems: 'center', fontWeight: 700 }}>
        Keyboard shortcuts
        <IconButton onClick={onClose} aria-label="Close" sx={{ ml: 'auto', width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 1.5, m: 0 }}>
          {SHORTCUTS.map((s) => (
            <Box key={s.description} sx={{ display: 'contents' }}>
              <Box component="dt" sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                {s.keys.map((k) => (
                  <Box
                    key={k}
                    component="kbd"
                    sx={{
                      minWidth: 28,
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'action.hover',
                      fontFamily: 'inherit',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    {k}
                  </Box>
                ))}
              </Box>
              <Typography component="dd" variant="body2" sx={{ m: 0, alignSelf: 'center' }}>
                {s.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
