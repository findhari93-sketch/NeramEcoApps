'use client';

import { useEffect, useState } from 'react';
import { Box, Dialog, IconButton, Typography, useMediaQuery } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';

/**
 * A question bank figure, opened full size.
 *
 * Not packages/ui's ImageViewerDialog, for two reasons. That one is built for
 * profile photos: it uses `width: 'auto'`, so a 240px answer figure opens as a
 * 240px speck in the middle of a full screen, which is the opposite of what a
 * student taps it for. And it paints the surround black, while these figures
 * are line art on a transparent background, so the drawing disappears.
 *
 * Here the surround is white, the way the figure was printed, and the picture
 * fills the space. Tapping it again goes closer still, because the source
 * scans are small (79 to 280px across for an option) and a student comparing
 * four of them needs the detail, not the frame.
 */

const ZOOM = 2.6;

export interface FigureViewerProps {
  open: boolean;
  onClose: () => void;
  src: string;
  /** Names the figure for a screen reader, e.g. "Option B". */
  label: string;
  /** The option's own words, when it has any worth reading. */
  caption?: string | null;
}

export default function FigureViewer({ open, onClose, src, label, caption }: FigureViewerProps) {
  const fullScreen = useMediaQuery('(max-width: 599.95px)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [zoomed, setZoomed] = useState(false);

  // A new figure always opens at fit, never at whatever the last one was left at.
  useEffect(() => {
    if (open) setZoomed(false);
  }, [open, src]);

  if (!src) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={fullScreen}
      transitionDuration={reduceMotion ? 0 : undefined}
      // role="dialog" sits on the Paper, not on the root, so a label passed to
      // Dialog itself never reaches a screen reader.
      PaperProps={{
        'aria-label': `${label}, full size`,
        sx: {
          bgcolor: 'common.white',
          borderRadius: fullScreen ? 0 : 2,
          height: fullScreen ? '100%' : '86vh',
          m: fullScreen ? 0 : 2,
          overflow: 'hidden',
        },
      } as object}
    >
      <Box sx={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            display: 'flex',
            gap: 0.5,
          }}
        >
          <IconButton
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? 'Fit the figure to the screen' : 'Look closer at the figure'}
            sx={{
              width: 44,
              height: 44,
              color: 'common.black',
              bgcolor: 'rgba(255,255,255,0.86)',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': { bgcolor: 'common.white' },
            }}
          >
            {zoomed ? <ZoomOutIcon /> : <ZoomInIcon />}
          </IconButton>
          <IconButton
            onClick={onClose}
            aria-label="Close the figure"
            sx={{
              width: 44,
              height: 44,
              color: 'common.black',
              bgcolor: 'rgba(255,255,255,0.86)',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': { bgcolor: 'common.white' },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        <Box
          onClick={() => setZoomed((z) => !z)}
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            alignItems: zoomed ? 'flex-start' : 'center',
            justifyContent: zoomed ? 'flex-start' : 'center',
            p: { xs: 1.5, sm: 3 },
            cursor: zoomed ? 'zoom-out' : 'zoom-in',
          }}
        >
          <Box
            component="img"
            src={src}
            alt={label}
            sx={
              zoomed
                ? { width: `${ZOOM * 100}%`, maxWidth: 'none', height: 'auto', flexShrink: 0, display: 'block' }
                : { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }
            }
          />
        </Box>

        {caption ? (
          <Typography
            variant="body2"
            sx={{
              px: 2,
              py: 1.25,
              color: 'text.secondary',
              borderTop: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
            }}
          >
            {caption}
          </Typography>
        ) : null}
      </Box>
    </Dialog>
  );
}
