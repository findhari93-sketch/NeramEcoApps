'use client';

/**
 * A picture on the student pad (the teacher's snip of the paper, a question
 * bank question's figure, or a figure option), sized to the pad. A tap opens
 * it larger, which is how a student on a phone reads a small snip. The larger
 * view is a dialog inside the pad's own page: in Teams that is the side panel's
 * frame, so it never covers the meeting stage beyond the pad.
 */

import { useState, type ReactNode } from 'react';
import { Box, ImageViewerDialog, Skeleton, Typography } from '@neram/ui';

export default function QuestionPicture({
  url,
  title,
  compact,
  alt,
  openLabel,
  badge,
  maxHeight,
  minHeight = 120,
}: {
  url: string;
  /** What the picture belongs to ("Q.38"), for the alt text and the larger view's name. */
  title: string;
  compact: boolean;
  alt?: string;
  openLabel?: string;
  /** A small label over the corner, such as an option letter. */
  badge?: ReactNode;
  maxHeight?: string | number;
  minHeight?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const altText = alt ?? `Picture for ${title}`;

  if (failed) {
    return (
      <Typography variant="body2" color="text.secondary">
        The picture could not load. Look at the shared screen instead.
      </Typography>
    );
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={openLabel ?? `Show the picture for ${title} full screen`}
        sx={{
          position: 'relative',
          display: 'block',
          width: '100%',
          maxWidth: '100%',
          minHeight: loaded ? 48 : minHeight,
          p: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
          cursor: 'zoom-in',
          touchAction: 'manipulation',
          '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        {!loaded && <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, height: '100%' }} />}
        <Box
          component="img"
          src={url}
          alt={altText}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          sx={{
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            maxHeight: maxHeight ?? (compact ? '30vh' : '45vh'),
            objectFit: 'contain',
          }}
        />
        {badge && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: 6,
              left: 6,
              minWidth: 28,
              height: 28,
              px: 0.75,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontWeight: 800,
              fontSize: '0.95rem',
              lineHeight: 1,
            }}
          >
            {badge}
          </Box>
        )}
      </Box>
      <ImageViewerDialog open={open} onClose={() => setOpen(false)} src={url} alt={altText} name={title} />
    </>
  );
}
