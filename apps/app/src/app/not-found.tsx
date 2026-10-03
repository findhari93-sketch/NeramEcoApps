'use client';

// Client component: MUI Button takes Link as a prop, which a server component
// cannot pass. A 404 status already keeps this out of search results.
import Link from 'next/link';
import { Box, Typography, Button } from '@neram/ui';

/** Branded 404. Two clear ways forward, never a dead end. */
export default function NotFound() {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 1.5,
        px: 3,
        bgcolor: 'background.default',
      }}
    >
      <Typography
        component="p"
        sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}
      >
        Error 404
      </Typography>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
        We could not find that page
      </Typography>
      <Typography sx={{ color: 'text.secondary', maxWidth: 440, mb: 2 }}>
        The link may be old or mistyped. Your tools and saved work are still here.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, width: { xs: '100%', sm: 'auto' }, maxWidth: 360 }}>
        <Button component={Link} href="/tools/all" variant="contained" size="large">
          Browse all tools
        </Button>
        <Button component={Link} href="/dashboard" variant="outlined" size="large">
          Go to home
        </Button>
      </Box>
    </Box>
  );
}
