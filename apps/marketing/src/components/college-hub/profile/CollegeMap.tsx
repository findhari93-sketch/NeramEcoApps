'use client';

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import { mapEmbedUrl } from '@/lib/college-hub/map';
import { tokens } from '@/design-system';
import { alpha } from '@mui/material/styles';

/**
 * Map of the campus (canvas: location card). Google Maps loads only when the
 * visitor asks for it, so the page stays fast and no third-party script runs
 * before then.
 */
export default function CollegeMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: { xs: '4 / 3', sm: '16 / 7' },
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: tokens.line,
        bgcolor: tokens.surfaceHover,
      }}
    >
      {open ? (
        <Box
          component="iframe"
          title={`Map showing ${name}`}
          src={mapEmbedUrl({ lat, lng })}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      ) : (
        <Box
          component="button"
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Show ${name} on the map`}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            border: 0,
            p: 0,
            cursor: 'pointer',
            font: 'inherit',
            color: tokens.ink,
            // A quiet street-grid backdrop so the placeholder reads as a map.
            backgroundColor: tokens.surfaceHover,
            backgroundImage:
              `linear-gradient(90deg, ${tokens.surface} 2px, transparent 2px), linear-gradient(${tokens.surface} 2px, transparent 2px), linear-gradient(35deg, transparent 48%, ${tokens.line} 48%, ${tokens.line} 54%, transparent 54%)`,
            backgroundSize: '64px 64px, 64px 64px, 100% 100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.25,
            '&:hover .show': { bgcolor: tokens.navy800 },
            '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: -2 },
          }}
        >
          <PlaceIcon aria-hidden sx={{ fontSize: 44, color: 'error.main', filter: `drop-shadow(0 2px 2px ${alpha(tokens.navy900, 0.25)})` }} />
          <Box
            className="show"
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minHeight: 44, px: 2.25, borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.navy900, color: tokens.paper, fontWeight: 600, fontSize: '0.92rem', transition: 'background-color 150ms' }}
          >
            <MapOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
            Show map
          </Box>
          <Typography component="span" sx={{ fontSize: '0.78rem', color: tokens.inkMuted, bgcolor: alpha(tokens.surface, 0.85), px: 1, borderRadius: 1 }}>
            Loads Google Maps
          </Typography>
        </Box>
      )}
    </Box>
  );
}
