'use client';

/**
 * Bottom sheet on phones, dialog from sm up. The actions stay pinned at the
 * bottom of the sheet (clear of the home indicator) while the body scrolls.
 */

import { useId } from 'react';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  SwipeableDrawer,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

export interface ResponsiveSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Blocks closing (e.g. while sending). */
  busy?: boolean;
  actions: React.ReactNode;
  children: React.ReactNode;
}

export default function ResponsiveSheet({ open, onClose, title, busy, actions, children }: ResponsiveSheetProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Slide and fade are decoration: skip them for people who asked for less motion.
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const transitionDuration = reduceMotion ? 0 : undefined;
  const titleId = useId();
  const close = () => {
    if (!busy) onClose();
  };

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={close}
        onOpen={() => {}}
        disableSwipeToOpen
        transitionDuration={transitionDuration}
        PaperProps={
          {
            role: 'dialog',
            'aria-labelledby': titleId,
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '92dvh',
              display: 'flex',
              flexDirection: 'column',
            },
          } as object
        }
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }} aria-hidden="true">
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 0.5 }}>
          <Typography id={titleId} component="h2" sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
            {title}
          </Typography>
          <IconButton onClick={close} aria-label="Close" disabled={busy} sx={{ width: 48, height: 48 }}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={{ px: 2, pb: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>{children}</Box>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            px: 2,
            pt: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid',
            borderColor: 'divider',
            '& > *': { flex: 1 },
          }}
        >
          {actions}
        </Box>
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="sm"
      fullWidth
      aria-labelledby={titleId}
      transitionDuration={transitionDuration}
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700, pr: 8 }}>
        {title}
        <IconButton
          onClick={close}
          aria-label="Close"
          disabled={busy}
          sx={{ position: 'absolute', right: 8, top: 8, width: 48, height: 48 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>{actions}</DialogActions>
    </Dialog>
  );
}
