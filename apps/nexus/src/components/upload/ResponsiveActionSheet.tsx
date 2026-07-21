'use client';

/**
 * One drawer that reads right on every screen: a bottom sheet on phones (thumb
 * reachable, rounded top) and a right-hand side drawer on tablets/laptops (a
 * full-width bottom bar looks oversized on desktop). Renders a shared header
 * (title + 44px close) and scrolls its body; an optional sticky footer holds the
 * primary action.
 *
 * Used by every student submission surface so they all behave consistently.
 */
import { ReactNode } from 'react';
import { Box, Drawer, IconButton, Stack, Typography, useIsMobile } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

interface ResponsiveActionSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Sticky footer, usually the primary submit button. */
  footer?: ReactNode;
  /** Desktop (right drawer) width in px. Default 440. */
  desktopWidth?: number;
}

export default function ResponsiveActionSheet({
  open,
  onClose,
  title,
  children,
  footer,
  desktopWidth = 440,
}: ResponsiveActionSheetProps) {
  const isMobile = useIsMobile();

  const paperSx = isMobile
    ? { maxHeight: '92vh', borderTopLeftRadius: 20, borderTopRightRadius: 20 }
    : { width: desktopWidth, maxWidth: '100vw', height: '100%' };

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { display: 'flex', flexDirection: 'column', ...paperSx } }}
    >
      {isMobile && (
        <Box sx={{ width: 40, height: 4, bgcolor: 'grey.300', borderRadius: 2, mx: 'auto', mt: 1 }} />
      )}

      <Stack
        direction="row"
        alignItems="center"
        sx={{ px: 2.5, pt: isMobile ? 1.5 : 2.5, pb: 1.5, flexShrink: 0 }}
      >
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>
          {title}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box sx={{ px: 2.5, pb: 2.5, overflowY: 'auto', flex: 1 }}>{children}</Box>

      {footer && (
        <Box
          sx={{
            px: 2.5,
            py: 2,
            flexShrink: 0,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          {footer}
        </Box>
      )}
    </Drawer>
  );
}
