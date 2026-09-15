'use client';

/**
 * The stage before anything is handed in: what the teacher wants drawn, large,
 * with a strip to move between references. With no reference at all, a quiet
 * placeholder that says where the drawing will go.
 */
import { useState } from 'react';
import { Box, IconButton, Stack, Typography } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';

export default function ReferenceStage({
  images,
  onExpand,
}: {
  images: string[];
  onExpand: (src: string) => void;
}) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ flex: 1, minHeight: 0, px: 3, textAlign: 'center' }}>
        <BrushOutlinedIcon sx={{ fontSize: 40, color: { xs: 'grey.500', md: 'grey.600' } }} aria-hidden />
        <Typography sx={{ fontWeight: 700, color: { xs: 'grey.100', md: 'text.primary' } }}>
          Your drawing will appear here
        </Typography>
        <Typography variant="body2" sx={{ color: { xs: 'grey.400', md: 'text.secondary' }, maxWidth: 320 }}>
          Read the brief, draw on paper, then take a clear photo and hand it in.
        </Typography>
      </Stack>
    );
  }

  const current = images[Math.min(index, images.length - 1)];

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pb: 1, flexShrink: 0 }}>
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            fontWeight: 700,
            color: { xs: 'grey.100', md: 'text.secondary' },
          }}
        >
          Reference from your teacher{images.length > 1 ? ` (${index + 1} of ${images.length})` : ''}
        </Typography>
        <IconButton
          onClick={() => onExpand(current)}
          aria-label="Open the reference full screen"
          sx={{ width: 44, height: 44, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}
        >
          <OpenInFullRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Box
          component="img"
          src={current}
          alt={images.length > 1 ? `Reference ${index + 1} from your teacher` : 'Reference from your teacher'}
          sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', borderRadius: 1 }}
        />
      </Box>

      {images.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ pt: 1, px: 1, overflowX: 'auto', flexShrink: 0 }} role="group" aria-label="References">
          {images.map((src, i) => (
            <Box
              key={`${src}-${i}`}
              component="button"
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show reference ${i + 1}`}
              aria-pressed={i === index}
              sx={{
                p: 0,
                width: 48,
                height: 48,
                flexShrink: 0,
                borderRadius: 1,
                overflow: 'hidden',
                cursor: 'pointer',
                border: '2px solid',
                borderColor: i === index ? 'primary.main' : 'transparent',
                bgcolor: 'grey.800',
                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: 2 },
              }}
            >
              <Box component="img" src={src} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
