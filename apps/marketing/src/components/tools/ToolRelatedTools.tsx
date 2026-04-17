import { TOOL_BY_SLUG } from '@/lib/tools/configs';
import { Box, Container, Typography, Grid, Paper } from '@neram/ui';
import Link from 'next/link';

export default function ToolRelatedTools({
  relatedToolSlugs,
}: {
  relatedToolSlugs: string[];
}) {
  const relatedTools = relatedToolSlugs
    .map((slug) => {
      const tool = TOOL_BY_SLUG[slug];
      if (!tool) return null;
      return {
        slug: tool.slug,
        title: tool.title,
        description: tool.metaDescription,
      };
    })
    .filter((t): t is { slug: string; title: string; description: string } => t !== null);

  if (relatedTools.length === 0) return null;

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
          More Free Tools
        </Typography>

        <Grid container spacing={3}>
          {relatedTools.map((tool) => (
            <Grid item xs={12} sm={6} md={4} key={tool.slug}>
              <Paper
                component={Link}
                href={`/tools/${tool.slug}`}
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #E0E0E0',
                  borderRadius: 2,
                  height: '100%',
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  },
                }}
              >
                <Typography
                  component="h3"
                  sx={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    mb: 1,
                  }}
                >
                  {tool.title}
                </Typography>
                <Typography
                  sx={{
                    color: 'text.secondary',
                    lineHeight: 1.6,
                    fontSize: '0.9rem',
                  }}
                >
                  {tool.description}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
