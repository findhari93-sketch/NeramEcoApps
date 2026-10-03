import { Box, Typography, Grid, Card, CardContent, Button } from '@neram/ui';
import Link from 'next/link';

interface ToolLink {
  title: string;
  description: string;
  /** The live tool inside the app (asks for sign-in) */
  href: string;
  /** The public SEO page for the same tool, used to hide the current page from the list */
  seoHref: string;
  /** Theme palette token for the accent line */
  accent: string;
}

const ALL_TOOLS: ToolLink[] = [
  {
    title: 'Cutoff Calculator',
    description: 'Calculate your NATA cutoff score and percentile based on section-wise marks.',
    href: '/tools/nata/cutoff-calculator',
    seoHref: '/tools/cutoff-calculator',
    accent: 'secondary.main',
  },
  {
    title: 'College Predictor',
    description: 'Find B.Arch colleges matching your score or rank, from real counseling data.',
    href: '/tools/counseling/college-predictor',
    seoHref: '/tools/college-predictor',
    accent: 'primary.main',
  },
  {
    title: 'Exam Centers',
    description: 'Locate NATA exam centers near you across 96 cities and 26 states.',
    href: '/tools/nata/exam-centers',
    seoHref: '/tools/exam-centers',
    accent: 'success.main',
  },
  {
    title: 'Question Bank',
    description: 'Practice with community-shared NATA questions, past papers, and mock tests.',
    href: '/tools/nata/question-bank',
    seoHref: '/tools/question-bank',
    accent: 'info.main',
  },
];

interface RelatedToolsProps {
  /** The href of the current tool page (to exclude it from the list) */
  currentHref: string;
}

export function RelatedTools({ currentHref }: RelatedToolsProps) {
  const otherTools = ALL_TOOLS.filter((tool) => tool.href !== currentHref && tool.seoHref !== currentHref);

  return (
    <Box component="section" aria-labelledby="related-tools-heading" sx={{ py: { xs: 6, md: 8 }, bgcolor: 'action.hover' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 } }}>
        <Typography
          id="related-tools-heading"
          variant="h2"
          component="h2"
          align="center"
          gutterBottom
          sx={{ fontWeight: 700, mb: 1, fontSize: { xs: '1.75rem', md: '2.25rem' } }}
        >
          Explore More NATA Tools
        </Typography>
        <Typography
          variant="body1"
          align="center"
          color="text.secondary"
          sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}
        >
          Complete your NATA 2026 preparation with our free suite of architecture exam tools.
        </Typography>

        <Grid container spacing={{ xs: 2, md: 3 }} justifyContent="center">
          {otherTools.map((tool) => (
            <Grid item xs={12} sm={6} md={4} key={tool.href}>
              <Card
                variant="outlined"
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: '3px solid',
                  borderTopColor: tool.accent,
                  transition: 'border-color 0.2s',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                    {tool.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                    {tool.description}
                  </Typography>
                  <Button
                    component={Link}
                    href={tool.href}
                    variant="outlined"
                    sx={{ mt: 'auto', minHeight: 44, alignSelf: 'flex-start' }}
                  >
                    Try {tool.title}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}
