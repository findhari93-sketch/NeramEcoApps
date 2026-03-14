import { Box, Typography, Grid, Card, CardContent, Button } from '@neram/ui';
import Link from 'next/link';

interface ToolLink {
  title: string;
  description: string;
  href: string;
  color: string;
}

const ALL_TOOLS: ToolLink[] = [
  {
    title: 'Cutoff Calculator',
    description: 'Calculate your NATA cutoff score and percentile based on section-wise marks.',
    href: '/tools/cutoff-calculator',
    color: '#e8a020',
  },
  {
    title: 'College Predictor',
    description: 'Find B.Arch colleges matching your NATA score from 5,000+ colleges across India.',
    href: '/tools/college-predictor',
    color: '#1a8fff',
  },
  {
    title: 'Exam Centers',
    description: 'Locate NATA exam centers near you across 96 cities and 26 states.',
    href: '/tools/exam-centers',
    color: '#22c55e',
  },
  {
    title: 'Question Bank',
    description: 'Practice with community-shared NATA questions, past papers, and mock tests.',
    href: '/tools/question-bank',
    color: '#a855f7',
  },
];

interface RelatedToolsProps {
  /** The href of the current tool page (to exclude it from the list) */
  currentHref: string;
}

export function RelatedTools({ currentHref }: RelatedToolsProps) {
  const otherTools = ALL_TOOLS.filter((tool) => tool.href !== currentHref);

  return (
    <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: 3 }}>
        <Typography
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

        <Grid container spacing={3} justifyContent="center">
          {otherTools.map((tool) => (
            <Grid item xs={12} sm={6} md={4} key={tool.href}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: `3px solid ${tool.color}`,
                  '&:hover': { boxShadow: 4 },
                  transition: 'box-shadow 0.2s',
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    {tool.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                    {tool.description}
                  </Typography>
                  <Button
                    component={Link}
                    href={tool.href}
                    variant="outlined"
                    size="small"
                    sx={{ mt: 'auto' }}
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
