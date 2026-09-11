'use client';

/**
 * A bottom sheet on a phone, a small dialog from 600px up.
 *
 * Every question the recordings page asks (replace this video, remove this
 * recording, use this file) goes through here, so a teacher on a phone always
 * answers with a thumb at the bottom of the screen and never meets a centred
 * modal stacked on another one. Kept local to the recordings screens rather than
 * added to @neram/ui, which would rebuild all four apps.
 */

import { useId } from 'react';
import { Box, Dialog, Drawer, IconButton, Typography, useMediaQuery, useTheme } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

export interface ResponsiveSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons, secondary first and primary last. On a phone the primary sits on top. */
  actions?: React.ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md';
  /** While a request is running, so the sheet cannot be dismissed mid-save. */
  disableClose?: boolean;
}

export default function ResponsiveSheet({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  maxWidth = 'sm',
  disableClose = false,
}: ResponsiveSheetProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const titleId = useId();
  const close = disableClose ? undefined : onClose;

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: { xs: 2, sm: 3 }, pt: { xs: 1, sm: 2.5 }, pb: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0, pt: 1 }}>
        <Typography id={titleId} component="h2" sx={{ fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.35 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.5, lineHeight: 1.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      <IconButton onClick={onClose} disabled={disableClose} aria-label="Close" sx={{ width: 48, height: 48, mr: -1 }}>
        <CloseIcon />
      </IconButton>
    </Box>
  );

  const body = children ? <Box sx={{ px: { xs: 2, sm: 3 }, pb: 1 }}>{children}</Box> : null;

  const footer = actions ? (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column-reverse', sm: 'row' },
        justifyContent: 'flex-end',
        gap: 1,
        px: { xs: 2, sm: 3 },
        pt: 1.5,
        pb: { xs: 'calc(16px + env(safe-area-inset-bottom))', sm: 2.5 },
        '& > .MuiButton-root': { minHeight: 48, width: { xs: '100%', sm: 'auto' } },
      }}
    >
      {actions}
    </Box>
  ) : null;

  if (phone) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={close}
        PaperProps={{
          role: 'dialog',
          'aria-labelledby': titleId,
          sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92dvh' },
        }}
      >
        <Box aria-hidden sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }} />
        {header}
        <Box sx={{ overflowY: 'auto' }}>{body}</Box>
        {footer}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={close} maxWidth={maxWidth} fullWidth aria-labelledby={titleId} PaperProps={{ sx: { borderRadius: 3 } }}>
      {header}
      {body}
      {footer}
    </Dialog>
  );
}
