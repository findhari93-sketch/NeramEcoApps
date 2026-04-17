import type { ToolFeature } from '@/lib/tools/types';
import { Box, Container, Typography, Grid, Paper } from '@neram/ui';

export default function ToolFeatures({
  features,
}: {
  features: ToolFeature[];
}) {
  return (
    <Box sx={{ py: { xs: 5, md: 8 }, bgcolor: '#FAFAFA' }}>
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
          Key Features
        </Typography>

        <Grid container spacing={3}>
          {features.map((feature, index) => (
            <Grid item xs={12} sm={6} key={index}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid #E0E0E0',
                  borderRadius: 2,
                  height: '100%',
                }}
              >
                <Typography
                  component="h3"
                  sx={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    mb: 1,
                  }}
                >
                  {feature.title}
                </Typography>
                <Typography
                  sx={{
                    color: 'text.secondary',
                    lineHeight: 1.6,
                  }}
                >
                  {feature.desc}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
