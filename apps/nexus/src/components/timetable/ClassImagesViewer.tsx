'use client';

/**
 * Full-screen look at a class's images, one at a time.
 *
 * The shared @neram/ui ImageViewerDialog shows a single image, which is right for
 * an avatar but wrong here: a class has several pictures and the point of tapping
 * the cover is to flip through the rest. This adds arrows, a counter, the keyboard
 * and a swipe, and stays inside nexus rather than reshaping a component seven
 * other screens depend on.
 *
 * Always shows the full-size url. Only the small tiles settle for the thumbnail.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Dialog, IconButton, Typography, useMediaQuery, useTheme } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { ClassImageRef } from '@/lib/class-cover';

/** Below this a drag reads as a tap or a scroll, not a page turn. */
const SWIPE_THRESHOLD_PX = 44;

interface ClassImagesViewerProps {
  open: boolean;
  onClose: () => void;
  /** Already in display order. */
  images: ClassImageRef[];
  startIndex?: number;
  /** The class title, shown when an image has no caption of its own. */
  title?: string | null;
}

export default function ClassImagesViewer({
  open,
  onClose,
  images,
  startIndex = 0,
  title,
}: ClassImagesViewerProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [index, setIndex] = useState(startIndex);
  const [loaded, setLoaded] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = images.length;
  const current = images[index];

  // Re-enter at whichever image was tapped, not wherever the last visit ended.
  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)));
  }, [open, startIndex, count]);

  useEffect(() => {
    setLoaded(false);
  }, [index]);

  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      // Wraps, so a two-image class does not need the user to know which arrow
      // still works.
      setIndex((prev) => (prev + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step]);

  // Decode the neighbour ahead of time so an arrow or swipe lands on a picture
  // rather than a spinner.
  useEffect(() => {
    if (!open || count < 2) return;
    const next = images[(index + 1) % count];
    if (!next) return;
    const preload = new Image();
    preload.src = next.url;
  }, [open, index, count, images]);

  if (!current) return null;

  const caption = current.caption || title || null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullScreen={fullScreen}
      // Stop bubbling so opening this from a tile inside a clickable class row
      // does not also trigger that row's navigation.
      onClick={(e) => e.stopPropagation()}
      PaperProps={{
        sx: {
          borderRadius: fullScreen ? 0 : 2,
          overflow: 'hidden',
          bgcolor: '#000',
          m: fullScreen ? 0 : 2,
          ...(fullScreen ? { width: '100%', height: '100%', maxHeight: '100%' } : {}),
        },
      }}
    >
      <Box
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const from = touchStartX.current;
          touchStartX.current = null;
          if (from === null) return;
          const delta = (e.changedTouches[0]?.clientX ?? from) - from;
          if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
          step(delta < 0 ? 1 : -1);
        }}
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#000',
          width: '100%',
          minHeight: fullScreen ? '100dvh' : 280,
          touchAction: 'pan-y',
        }}
      >
        <IconButton
          onClick={onClose}
          aria-label="Close image"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.45)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
          }}
        >
          <CloseIcon />
        </IconButton>

        {count > 1 && (
          <Typography
            sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 2,
              px: 1.25,
              py: 0.375,
              borderRadius: 999,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#fff',
              bgcolor: 'rgba(0,0,0,0.5)',
              userSelect: 'none',
            }}
          >
            {index + 1} of {count}
          </Typography>
        )}

        {!loaded && <CircularProgress size={36} sx={{ position: 'absolute', color: 'rgba(255,255,255,0.7)' }} />}

        <Box
          component="img"
          key={current.id}
          src={current.url}
          alt={caption || 'Class image'}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          sx={{
            maxWidth: '100%',
            maxHeight: fullScreen ? '100dvh' : '85vh',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            display: 'block',
            margin: 'auto',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        />

        {count > 1 && (
          <>
            <IconButton
              onClick={() => step(-1)}
              aria-label="Previous image"
              sx={{
                position: 'absolute',
                left: 8,
                zIndex: 2,
                width: 48,
                height: 48,
                color: '#fff',
                bgcolor: 'rgba(0,0,0,0.45)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={() => step(1)}
              aria-label="Next image"
              sx={{
                position: 'absolute',
                right: 8,
                zIndex: 2,
                width: 48,
                height: 48,
                color: '#fff',
                bgcolor: 'rgba(0,0,0,0.45)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}

        {caption && (
          <Typography
            variant="body2"
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              px: 2,
              py: 1.25,
              color: '#fff',
              fontWeight: 500,
              userSelect: 'none',
              background: 'linear-gradient(to top, rgba(0,0,0,0.72), transparent)',
            }}
          >
            {caption}
          </Typography>
        )}
      </Box>
    </Dialog>
  );
}
