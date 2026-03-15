import { Box, Container, Typography, Card } from '@neram/ui';
import Link from 'next/link';

export interface RelatedLink {
  title: string;
  description: string;
  href: string;
}

interface RelatedContentProps {
  heading?: string;
  links: RelatedLink[];
  locale?: string;
}

export default function RelatedContent({
  heading = 'Related Resources',
  links,
  locale,
}: RelatedContentProps) {
  if (links.length === 0) return null;

  const getHref = (href: string) => {
    if (!locale || locale === 'en') return href;
    return `/${locale}${href}`;
  };

  return (
    <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
      <Container maxWidth="md">
        <Typography variant="h3" gutterBottom sx={{ fontWeight: 600, mb: 3, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
          {heading}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {links.map((link) => (
            <Link key={link.href} href={getHref(link.href)} style={{ textDecoration: 'none' }}>
              <Card
                sx={{
                  p: 2,
                  height: '100%',
                  color: 'inherit',
                  transition: 'box-shadow 0.2s',
                  '&:hover': { boxShadow: 3 },
                }}
              >
                <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 600 }}>
                  {link.title} &rarr;
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {link.description}
                </Typography>
              </Card>
            </Link>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
