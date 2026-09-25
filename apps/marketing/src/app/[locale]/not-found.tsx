import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { NOT_FOUND_LINKS } from '@/lib/not-found-links';

/**
 * 404 inside the site layout, so a lost visitor keeps the header, footer and
 * search. The root app/not-found.tsx only serves paths outside [locale].
 */
export default function LocaleNotFound() {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 6, md: 10 }, textAlign: 'center' }}>
      <Typography
        component="p"
        sx={{ fontSize: { xs: 56, md: 72 }, fontWeight: 800, lineHeight: 1, color: 'primary.main', mb: 1 }}
      >
        404
      </Typography>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1.5 }}>
        Page not found
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 16, lineHeight: 1.6, mb: 4 }}>
        The page you are looking for does not exist or has moved. Try one of these instead.
      </Typography>

      <Box
        component="nav"
        aria-label="Popular pages"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
          mb: 4,
        }}
      >
        {NOT_FOUND_LINKS.map((link) => (
          <Button
            key={link.href}
            component={Link}
            href={link.href}
            variant="outlined"
            fullWidth
            sx={{ minHeight: 48, textTransform: 'none', fontSize: 16 }}
          >
            {link.label}
          </Button>
        ))}
      </Box>

      <Button
        component={Link}
        href="/"
        variant="contained"
        size="large"
        sx={{ minHeight: 48, px: 4, textTransform: 'none', fontSize: 16 }}
      >
        Go to homepage
      </Button>
    </Container>
  );
}
