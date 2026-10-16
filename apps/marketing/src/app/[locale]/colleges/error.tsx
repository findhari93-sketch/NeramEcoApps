'use client';

import { Box, Container, Typography, Button } from '@mui/material';
import { tokens } from '@/design-system';

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
          bgcolor: tokens.surface,
          border: '1px solid',
          borderColor: 'error.main',
          borderRadius: 1,
          p: 3,
          mb: 3,
          textAlign: 'left',
        }}
      >
        <Typography variant="subtitle2" color="error" fontWeight={700} gutterBottom>
          {error.name}: {error.message}
        </Typography>
        {error.digest && (
          <Typography variant="caption" color={tokens.inkMuted}>
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
