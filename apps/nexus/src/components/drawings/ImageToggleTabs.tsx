'use client';

import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Chip, Typography } from '@neram/ui';

export interface OverlayAnnotation {
  area: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
}

interface ImageToggleTabsProps {
  originalImageUrl: string;
  overlayAnnotations?: OverlayAnnotation[] | null;
  overlayImageUrl?: string | null;       // teacher's canvas draw-over
  correctedImageUrl?: string | null;     // uploaded corrected reference
  height?: string | number;
}

// Maps rough area names to approximate percentage positions on the image
const AREA_POSITIONS: Record<string, { top: string; left: string }> = {
  'top-left':      { top: '12%', left: '15%' },
  'top-center':    { top: '12%', left: '50%' },
  'top-right':     { top: '12%', left: '78%' },
  'center-left':   { top: '50%', left: '12%' },
  'center':        { top: '50%', left: '50%' },
  'center-right':  { top: '50%', left: '78%' },
  'bottom-left':   { top: '80%', left: '15%' },
  'bottom-center': { top: '80%', left: '50%' },
  'bottom-right':  { top: '80%', left: '78%' },
};

const SEVERITY_COLORS: Record<string, 'error' | 'warning' | 'success' | 'info'> = {
  high:   'error',
  medium: 'warning',
  low:    'success',
};

export default function ImageToggleTabs({
  originalImageUrl,
  overlayAnnotations,
  overlayImageUrl,
  correctedImageUrl,
  height = '100%',
}: ImageToggleTabsProps) {
  const hasOverlay = !!(overlayAnnotations?.length || overlayImageUrl);
  const hasCorrected = !!correctedImageUrl;

  const [tab, setTab] = useState<'original' | 'overlay' | 'corrected'>('original');

  // If current tab becomes unavailable (e.g. corrected was removed), fall back
  const activeTab = tab === 'corrected' && !hasCorrected
    ? 'original'
    : tab === 'overlay' && !hasOverlay
    ? 'original'
    : tab;

  const displayImageUrl =
    activeTab === 'overlay' && overlayImageUrl
      ? overlayImageUrl
      : activeTab === 'corrected'
      ? correctedImageUrl!
      : originalImageUrl;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, width: '100%' }}>
      {/* Toggle row */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pb: 1, flexShrink: 0 }}>
        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_, v) => { if (v) setTab(v); }}
          size="small"
          sx={{
            bgcolor: 'rgba(255,255,255,0.92)',
            borderRadius: 1,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            '& .MuiToggleButton-root': {
              py: 0.4, px: 1.5,
              textTransform: 'none',
              fontSize: '0.75rem',
              fontWeight: 600,
            },
          }}
        >
          <ToggleButton value="original">My Drawing</ToggleButton>
          <ToggleButton value="overlay" disabled={!hasOverlay}>Overlay</ToggleButton>
          {hasCorrected && (
            <ToggleButton value="corrected">Corrected</ToggleButton>
          )}
        </ToggleButtonGroup>
      </Box>

      {/* Image area */}
      <Box sx={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <Box
          component="img"
          src={displayImageUrl}
          alt="Drawing"
          sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />

        {/* AI overlay annotation labels (only when overlay tab and no overlayImageUrl) */}
        {activeTab === 'overlay' && !overlayImageUrl && overlayAnnotations?.map((ann, i) => {
          const pos = AREA_POSITIONS[ann.area] || AREA_POSITIONS['center'];
          return (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                top: pos.top,
                left: pos.left,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <Chip
                label={ann.label}
                size="small"
                color={SEVERITY_COLORS[ann.severity] || 'warning'}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  opacity: 0.92,
                }}
              />
            </Box>
          );
        })}

        {/* Caption for corrected image */}
        {activeTab === 'corrected' && (
          <Box sx={{
            position: 'absolute', bottom: 8, left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
          }}>
            <Box sx={{ bgcolor: 'rgba(0,0,0,0.55)', borderRadius: 1, px: 1.5, py: 0.4 }}>
              <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600 }}>
                Corrected Reference
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
