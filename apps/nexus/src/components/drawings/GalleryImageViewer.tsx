'use client';

import { useState } from 'react';
import { Box, Typography } from '@neram/ui';

export type GalleryImageMode = 'original' | 'overlay' | 'reference';

interface Props {
  originalImageUrl: string;
  correctedImageUrl: string | null;
  /** Default mode for this card. Redo-origin items should default to 'overlay' so
   *  students see teacher corrections layered on the attempt at a glance. */
  defaultMode?: GalleryImageMode;
  height?: number;
}

/**
 * Single-image viewer with a 3-option segmented control: Original / Overlay /
 * Reference. Overlay layers the teacher correction on top of the student's
 * drawing using mix-blend-mode: multiply, mirroring the overlay view on the
 * review detail page.
 */
export default function GalleryImageViewer({
  originalImageUrl,
  correctedImageUrl,
  defaultMode = 'original',
  height = 280,
}: Props) {
  const canShowCorrection = !!correctedImageUrl;
  const [mode, setMode] = useState<GalleryImageMode>(canShowCorrection ? defaultMode : 'original');

  const options: Array<{ value: GalleryImageMode; label: string; available: boolean }> = [
    { value: 'original', label: 'Original', available: true },
    { value: 'overlay', label: 'Overlay', available: canShowCorrection },
    { value: 'reference', label: 'Reference', available: canShowCorrection },
  ];

  return (
    <Box sx={{ position: 'relative', bgcolor: '#f5f5f5' }}>
      {/* Image stack */}
      <Box sx={{ position: 'relative', width: '100%', height }}>
        {mode === 'reference' && canShowCorrection ? (
          <Box
            component="img"
            src={correctedImageUrl!}
            alt="Teacher reference"
            sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <Box
            component="img"
            src={originalImageUrl}
            alt="Student drawing"
            sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}

        {/* Overlay layer: corrected image over original */}
        {mode === 'overlay' && canShowCorrection && (
          <Box
            component="img"
            src={correctedImageUrl!}
            alt="Teacher correction overlay"
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>

      {/* Segmented control */}
      {canShowCorrection && (
        <Box
          sx={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            display: 'flex',
            bgcolor: 'rgba(0,0,0,0.55)',
            borderRadius: 4,
            p: '2px',
          }}
        >
          {options.map((opt) => {
            const disabled = !opt.available;
            const active = mode === opt.value;
            return (
              <Box
                key={opt.value}
                onClick={() => !disabled && setMode(opt.value)}
                sx={{
                  px: 1.25,
                  py: 0.4,
                  borderRadius: 3,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  bgcolor: active ? '#fff' : 'transparent',
                  color: active ? '#111' : disabled ? 'rgba(255,255,255,0.4)' : '#fff',
                  transition: 'all 0.15s',
                  userSelect: 'none',
                }}
              >
                {opt.label}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Label for the current image */}
      {mode !== 'overlay' && (
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            px: 1,
            py: 0.25,
            bgcolor: mode === 'reference' ? 'rgba(124,58,237,0.85)' : 'rgba(0,0,0,0.6)',
            color: '#fff',
            borderRadius: 1,
            fontSize: '0.65rem',
          }}
        >
          {mode === 'reference' ? 'Teacher Ref' : 'Student'}
        </Typography>
      )}
    </Box>
  );
}
