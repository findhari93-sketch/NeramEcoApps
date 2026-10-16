'use client';

import { Box, Typography } from '@neram/ui';
import { CtaButton, QuickCheck, tokens } from '@/design-system';

const APP_TOOL_URL = 'https://app.neramclasses.com/tools/nata/image-crop';

const SPECS = [
  { label: 'Photograph', dim: '200 x 230 px', size: '10 to 200 KB', format: 'JPEG' },
  { label: 'Signature', dim: '150 x 60 px', size: '4 to 30 KB', format: 'JPEG' },
];

export default function ImageResizerTeaser() {
  return (
    <QuickCheck title="Resize NATA photo and signature" headingId="image-resizer-quick-check">
      <Typography sx={{ fontSize: '1rem', color: tokens.inkMuted, lineHeight: 1.5 }}>
        Crop and compress your application photo and signature to the exact dimensions and file
        size required by the NATA 2026 application portal.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {SPECS.map((spec) => (
          <Box
            key={spec.label}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: { xs: 0.5, sm: 2 },
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1.5,
              border: `1px solid ${tokens.line}`,
              borderRadius: `${tokens.radius}px`,
              bgcolor: tokens.ground,
            }}
          >
            <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: tokens.ink }}>{spec.label}</Typography>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                columnGap: 2,
                rowGap: 0.25,
                fontSize: '0.875rem',
                color: tokens.inkMuted,
              }}
            >
              <Box component="strong" sx={{ fontFamily: tokens.fontMono, color: tokens.ink }}>
                {spec.dim}
              </Box>
              <span>{spec.size}</span>
              <span>{spec.format}</span>
            </Box>
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: '0.8125rem', color: tokens.inkMuted, textAlign: 'center' }}>
        Free, runs in your browser, no signup, no upload to a server.
      </Typography>

      <CtaButton href={APP_TOOL_URL} external fullWidth>
        Open Image Resizer
      </CtaButton>
    </QuickCheck>
  );
}
