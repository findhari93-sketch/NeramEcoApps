'use client';

import { Box, Container, Typography, Button } from '@mui/material';

export default function CollegesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        College Hub Error
      </Typography>
      <Box
        sx={{
          bgcolor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 2,
          p: 3,
          mb: 3,
          textAlign: 'left',
        }}
      >
        <Typography variant="subtitle2" color="error" fontWeight={700} gutterBottom>
          {error.name}: {error.message}
        </Typography>
        {error.digest && (
          <Typography variant="caption" color="text.secondary">
            Digest: {error.digest}
          </Typography>
        )}
        <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
          {error.stack?.slice(0, 500)}
        </Typography>
      </Box>
      <Button variant="contained" onClick={reset}>
        Try Again
      </Button>
    </Container>
  );
}
