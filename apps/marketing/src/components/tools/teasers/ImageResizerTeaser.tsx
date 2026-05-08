'use client';

import { Box, Button, Paper, Stack, Typography } from '@neram/ui';
import Link from 'next/link';

const APP_TOOL_URL = 'https://app.neramclasses.com/tools/nata/image-crop';

const SPECS = [
  { label: 'Photograph', dim: '200 x 230 px', size: '10 to 200 KB', format: 'JPEG' },
  { label: 'Signature', dim: '150 x 60 px', size: '4 to 30 KB', format: 'JPEG' },
];

export default function ImageResizerTeaser() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        border: '1px solid #E0E0E0',
        borderRadius: 2,
      }}
    >
      <Typography
        component="h2"
        sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' }, mb: 1 }}
      >
        Resize NATA Photo and Signature
      </Typography>

      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 2.5, lineHeight: 1.5 }}>
        Crop and compress your application photo and signature to the exact dimensions and file
        size required by the NATA 2026 application portal.
      </Typography>

      <Stack spacing={1.5} sx={{ mb: 2.5 }}>
        {SPECS.map((spec) => (
          <Box
            key={spec.label}
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: { xs: 0.5, sm: 2 },
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              p: 1.5,
              border: '1px solid #EEE',
              borderRadius: 1.5,
              backgroundColor: '#FAFAFA',
            }}
          >
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{spec.label}</Typography>
            <Stack
              direction="row"
              spacing={2}
              sx={{ fontSize: '0.85rem', color: 'text.secondary', flexWrap: 'wrap' }}
            >
              <span><strong>{spec.dim}</strong></span>
              <span>{spec.size}</span>
              <span>{spec.format}</span>
            </Stack>
          </Box>
        ))}
      </Stack>

      <Button
        component={Link}
        href={APP_TOOL_URL}
        variant="contained"
        fullWidth
        sx={{
          minHeight: 48,
          fontWeight: 700,
          fontSize: '1rem',
        }}
      >
        Open Image Resizer
      </Button>

      <Typography
        sx={{
          mt: 1.5,
          fontSize: '0.8rem',
          color: 'text.secondary',
          textAlign: 'center',
        }}
      >
        Free, runs in your browser, no signup, no upload to a server.
      </Typography>
    </Paper>
  );
}
