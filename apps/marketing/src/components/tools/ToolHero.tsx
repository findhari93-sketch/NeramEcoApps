import { ToolConfig } from '@/lib/tools/types';
import { Box, Container, Typography, Button, Chip, Stack } from '@neram/ui';
import Link from 'next/link';

const CATEGORY_GRADIENTS: Record<ToolConfig['category'], string> = {
  nata: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
  counseling: 'linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)',
  insights: 'linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%)',
};

export default function ToolHero({ config }: { config: ToolConfig }) {
  const gradient = CATEGORY_GRADIENTS[config.category];

  return (
    <Box
      sx={{
        background: gradient,
        color: '#fff',
        py: { xs: 6, md: 10 },
        textAlign: 'center',
      }}
    >
      <Container maxWidth="md">
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: '1.75rem', md: '2.5rem' },
            fontWeight: 800,
            mb: 2,
          }}
        >
          {config.title}
        </Typography>

        <Typography
          sx={{
            fontSize: { xs: '1rem', md: '1.25rem' },
            mb: 3,
            opacity: 0.92,
            lineHeight: 1.6,
          }}
        >
          {config.subtitle}
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          justifyContent="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 4 }}
        >
          {config.trustBadges.map((badge) => (
            <Chip
              key={badge}
              label={badge}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
              }}
            />
          ))}
        </Stack>

        <Button
          component={Link}
          href={config.appUrl}
          variant="contained"
          sx={{
            bgcolor: '#fff',
            color: config.category === 'nata'
              ? '#0D47A1'
              : config.category === 'counseling'
                ? '#1B5E20'
                : '#4A148C',
            fontWeight: 700,
            px: 4,
            py: 1.5,
            fontSize: '1.1rem',
            '&:hover': {
              bgcolor: 'rgba(255,255,255,0.9)',
            },
            minHeight: 48,
          }}
        >
          Use This Tool Free &rarr;
        </Button>
      </Container>
    </Box>
  );
}
