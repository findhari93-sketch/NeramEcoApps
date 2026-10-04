import { Box, Container, Typography, Button } from '@neram/ui';
import { APP_URL } from '@/lib/seo/constants';
import { Breadcrumbs } from '@/components/coaching-location/parts';

// Same blue as the /tools hub and tool landing heroes, so the family reads as one.
export const HERO_BG = 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)';

const focusRing = { '&:focus-visible': { outline: '3px solid #FFFFFF', outlineOffset: 2 } };

export function AiArchitekHero() {
  return (
    <Box component="header" sx={{ background: HERO_BG, color: '#FFFFFF', pt: { xs: 2, md: 3 }, pb: { xs: 5, md: 8 } }}>
      <Container maxWidth="md">
        <Box
          sx={{
            // The shared breadcrumb is styled for light pages; recolour it for the blue hero.
            '& a': { color: '#FFFFFF !important' },
            '& span, & svg': { color: 'rgba(255,255,255,0.85) !important' },
            '& a:focus-visible': { outlineColor: '#FFFFFF !important' },
          }}
        >
          <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'aiArchitek' }]} />
        </Box>

        <Typography
          component="p"
          sx={{ fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', mb: 1, opacity: 0.95 }}
        >
          By Neram Classes
        </Typography>
        <Typography
          component="h1"
          sx={{ fontSize: { xs: '1.875rem', sm: '2.375rem', md: '3rem' }, fontWeight: 800, lineHeight: 1.15, mb: 2 }}
        >
          aiArchitek: India&apos;s First AI-Powered NATA Coaching Classroom
        </Typography>
        <Typography sx={{ fontSize: { xs: '1.0625rem', md: '1.25rem' }, lineHeight: 1.6, mb: 3, maxWidth: 680 }}>
          Prepare smarter for NATA and B.Arch admission with free tools, real practice questions, college discovery and
          AI-assisted learning, all built by the team that teaches the classes.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 3 }}>
          <Button
            component="a"
            href={`${APP_URL}/tools`}
            variant="contained"
            sx={{
              minHeight: 48,
              px: 3,
              fontWeight: 700,
              // `background`, not bgcolor: the theme paints a gradient image on contained buttons.
              background: '#FFFFFF',
              color: '#0D47A1',
              '&:hover': { background: '#E3F2FD' },
              ...focusRing,
            }}
          >
            Try aiArchitek free
          </Button>
          <Button
            component="a"
            href="#tools"
            variant="outlined"
            sx={{
              minHeight: 48,
              px: 3,
              fontWeight: 700,
              color: '#FFFFFF',
              borderColor: 'rgba(255,255,255,0.8)',
              '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.1)' },
              ...focusRing,
            }}
          >
            Explore NATA tools
          </Button>
        </Box>

        <Typography sx={{ fontSize: '0.9375rem', opacity: 0.95 }}>
          Built by Neram Classes · Architecture-focused · Available across India
        </Typography>
      </Container>
    </Box>
  );
}
