'use client';

/**
 * One image, the whole screen, for reading a teacher's marks or a reference
 * closely.
 *
 * Aspect aware. A photo fits the screen. A tall image (a worksheet, a long
 * poster of exercises) would fit as a thin strip, so it fits the WIDTH instead
 * and scrolls down, the way a page is read. The zoom button goes closer still
 * and scrolls both ways; on a phone the browser's own pinch zoom also works,
 * since nothing here fixes the scale.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Dialog, IconButton, useMediaQuery } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';

/** How much closer the zoom button goes, as a multiple of the fitted width. */
const ZOOM = 2.5;
/** Past this many times the screen's own shape, an image reads as "tall". */
const TALL_MARGIN = 1.15;

const controlSx = {
  width: 48,
  height: 48,
  bgcolor: 'rgba(0,0,0,0.55)',
  color: '#fff',
  '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: 2 },
} as const;

export default function StageViewerDialog({
  src,
  alt,
  onClose,
}: {
  src: string | null;
  alt: string;
  onClose: () => void;
}) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);

  // A new image always opens at fit, from the top.
  useEffect(() => {
    setRatio(null);
    setZoomed(false);
  }, [src]);

  const screenRatio = typeof window !== 'undefined' ? window.innerHeight / window.innerWidth : 1;
  const tall = ratio != null && ratio > screenRatio * TALL_MARGIN;

  const toggleZoom = () => {
    setZoomed((z) => !z);
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  };

  let imgSx: object;
  if (zoomed) {
    imgSx = { width: `${ZOOM * 100}%`, maxWidth: 'none', height: 'auto', flexShrink: 0 };
  } else if (tall) {
    // Fit the width, capped so a laptop does not blow a worksheet up to 1400px.
    imgSx = { width: '100%', maxWidth: 900, height: 'auto', flexShrink: 0 };
  } else {
    imgSx = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' };
  }

  return (
    <Dialog
      open={!!src}
      onClose={onClose}
      fullScreen
      transitionDuration={reduceMotion ? 0 : undefined}
      // role="dialog" sits on the Paper, so the label goes there.
      PaperProps={{ 'aria-label': alt, sx: { bgcolor: '#111' } } as object}
    >
      <Box
        sx={{
          position: 'fixed',
          top: 'max(8px, env(safe-area-inset-top))',
          right: 8,
          zIndex: 1,
          display: 'flex',
          gap: 1,
        }}
      >
        <IconButton
          onClick={toggleZoom}
          aria-label={zoomed ? 'Fit the image to the screen' : 'Zoom in on the image'}
          aria-pressed={zoomed}
          sx={controlSx}
        >
          {zoomed ? <ZoomOutIcon /> : <ZoomInIcon />}
        </IconButton>
        <IconButton onClick={onClose} aria-label="Close full screen view" sx={controlSx}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box
        ref={scrollRef}
        onClick={onClose}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: zoomed || tall ? 'auto' : 'hidden',
          display: 'flex',
          alignItems: zoomed || tall ? 'flex-start' : 'center',
          justifyContent: zoomed ? 'flex-start' : 'center',
          p: { xs: 1, md: 3 },
          // Clear the controls when a scrolled image starts at the very top.
          pt: zoomed || tall ? { xs: 8, md: 9 } : undefined,
        }}
      >
        {src && (
          <Box
            component="img"
            src={src}
            alt={alt}
            onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const img = e.currentTarget;
              if (img.naturalWidth) setRatio(img.naturalHeight / img.naturalWidth);
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{ display: 'block', ...imgSx }}
          />
        )}
      </Box>
    </Dialog>
  );
}
