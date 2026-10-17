'use client';

import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@neram/ui';
import { INBOX_SHORTCUTS } from '@/lib/support-inbox/keyboard';

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="shortcuts-title">
      <DialogTitle id="shortcuts-title" sx={{ fontWeight: 700 }}>
        Keyboard shortcuts
      </DialogTitle>
      <DialogContent dividers>
        <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1.25, alignItems: 'center' }}>
          {INBOX_SHORTCUTS.map((s) => (
            <Box key={s.label + s.keys} sx={{ display: 'contents' }}>
              <Box component="dt" sx={{ m: 0 }}>
                <Box
                  component="kbd"
                  sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, px: 1, py: 0.25, border: 1, borderColor: 'divider', borderBottomWidth: 2, borderRadius: 1, bgcolor: 'grey.50', whiteSpace: 'nowrap' }}
                >
                  {s.keys}
                </Box>
              </Box>
              <Typography component="dd" sx={{ m: 0, fontSize: 14 }}>
                {s.label}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Shortcuts are off while you type in a field.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ minHeight: 44 }} autoFocus>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
