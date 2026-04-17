import { Box, Container, Typography, Button, Stack } from '@neram/ui';
import Link from 'next/link';

export default function ToolCTA({ appUrl }: { appUrl: string }) {
  return (
    <Box
      sx={{
        bgcolor: 'primary.main',
        color: '#fff',
        textAlign: 'center',
        py: { xs: 6, md: 10 },
      }}
    >
      <Container maxWidth="md">
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            mb: 3,
          }}
        >
          Ready to Get Started?
        </Typography>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          justifyContent="center"
          alignItems="center"
        >
          <Button
            component={Link}
            href={appUrl}
            variant="contained"
            sx={{
              bgcolor: '#fff',
              color: 'primary.main',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              minHeight: 48,
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.9)',
              },
            }}
          >
            Use This Tool Free
          </Button>

          <Button
            component={Link}
            href="/apply"
            variant="outlined"
            sx={{
              borderColor: '#fff',
              color: '#fff',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              minHeight: 48,
              '&:hover': {
                borderColor: '#fff',
                bgcolor: 'rgba(255,255,255,0.1)',
              },
            }}
          >
            Join Coaching
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}
