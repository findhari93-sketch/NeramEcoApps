import type { ToolScreenshot } from '@/lib/tools/types';
import { Box, Container, Typography, Button, Grid } from '@neram/ui';
import Image from 'next/image';
import Link from 'next/link';

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <Box
      sx={{
        height: 200,
        bgcolor: '#E0E0E0',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography sx={{ color: 'text.secondary' }}>
        Screenshot coming soon
      </Typography>
    </Box>
  );
}

function isPlaceholder(path: string): boolean {
  return !path || path.includes('placeholder');
}

export default function ToolScreenshots({
  screenshots,
  appUrl,
}: {
  screenshots: ToolScreenshot;
  appUrl: string;
}) {
  return (
    <Box sx={{ py: { xs: 5, md: 8 } }}>
      <Container maxWidth="md">
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            textAlign: 'center',
            mb: 4,
          }}
        >
          See It in Action
        </Typography>

        <Grid container spacing={3} justifyContent="center">
          {/* Desktop screenshot */}
          <Grid item xs={12} sm={8}>
            {isPlaceholder(screenshots.desktop) ? (
              <ScreenshotPlaceholder label="Desktop" />
            ) : (
              <Box sx={{ position: 'relative', width: '100%', height: 300, borderRadius: 2, overflow: 'hidden' }}>
                <Image
                  src={screenshots.desktop}
                  alt={screenshots.alt}
                  fill
                  style={{ objectFit: 'contain' }}
                  loading="lazy"
                />
              </Box>
            )}
          </Grid>

          {/* Mobile screenshot */}
          <Grid item xs={6} sm={4}>
            {isPlaceholder(screenshots.mobile) ? (
              <ScreenshotPlaceholder label="Mobile" />
            ) : (
              <Box sx={{ position: 'relative', width: '100%', height: 300, borderRadius: 2, overflow: 'hidden' }}>
                <Image
                  src={screenshots.mobile}
                  alt={`${screenshots.alt} (mobile view)`}
                  fill
                  style={{ objectFit: 'contain' }}
                  loading="lazy"
                />
              </Box>
            )}
          </Grid>
        </Grid>

        {screenshots.caption && (
          <Typography
            sx={{
              textAlign: 'center',
              color: 'text.secondary',
              mt: 2,
              fontSize: '0.9rem',
              fontStyle: 'italic',
            }}
          >
            {screenshots.caption}
          </Typography>
        )}

        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Button
            component={Link}
            href={appUrl}
            variant="contained"
            color="primary"
            sx={{
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              minHeight: 48,
            }}
          >
            Try It Now
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
