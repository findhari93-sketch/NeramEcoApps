'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from '@neram/ui';
import Link from 'next/link';

export default function COACheckerTeaser() {
  const [query, setQuery] = useState('');

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
        Check COA Approval Status
      </Typography>

      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 2, lineHeight: 1.5 }}>
        Search for any architecture college to check its Council of Architecture (COA) recognition status.
      </Typography>

      <TextField
        label="College Name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. School of Planning and Architecture"
        fullWidth
        sx={{
          mb: 2,
          '& .MuiInputBase-root': { minHeight: 48 },
        }}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Button
          component={Link}
          href={`https://app.neramclasses.com/tools/counseling/coa-checker${query ? `?q=${encodeURIComponent(query)}` : ''}`}
          variant="contained"
          fullWidth
          sx={{
            minHeight: 48,
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          Search COA Status
        </Button>

        {query && (
          <Button
            component={Link}
            href={`https://app.neramclasses.com/tools/counseling/coa-checker?q=${encodeURIComponent(query)}`}
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            Check full approval details and history
          </Button>
        )}
      </Box>
    </Paper>
  );
}
