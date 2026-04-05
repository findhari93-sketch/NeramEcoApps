'use client';

import { useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const isChunkError =
      /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
        error.message
      );
    if (isChunkError && typeof window !== 'undefined') {
      const key = 'chunk-reload-attempted';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(key);
    }
  }, [error]);

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          textAlign: 'center',
          py: 6,
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: 'warning.light',
            opacity: 0.15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 3,
            position: 'relative',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}
          >
            ⚠️
          </Box>
        </Box>

        <Typography
          variant="h4"
          component="h1"
          fontWeight={700}
          gutterBottom
          color="text.primary"
        >
          Something went wrong
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mb: 4, maxWidth: 400 }}
        >
          We&apos;re sorry. An unexpected error occurred while loading this
          page. Please try again or return to the homepage.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => reset()}
            sx={{ px: 3, py: 1.5 }}
          >
            Try Again
          </Button>
          <Button
            variant="outlined"
            startIcon={<HomeIcon />}
            href="/"
            sx={{ px: 3, py: 1.5 }}
          >
            Go Home
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
