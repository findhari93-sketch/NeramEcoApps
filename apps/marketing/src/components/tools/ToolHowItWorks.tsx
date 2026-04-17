import type { ToolStep } from '@/lib/tools/types';
import { Box, Container, Typography, Grid, Card, CardContent } from '@neram/ui';

const CATEGORY_COLORS: Record<string, string> = {
  nata: '#0D47A1',
  counseling: '#1B5E20',
  insights: '#4A148C',
};

export default function ToolHowItWorks({
  steps,
  toolName,
  category = 'nata',
}: {
  steps: ToolStep[];
  toolName: string;
  category?: string;
}) {
  const accentColor = CATEGORY_COLORS[category] || '#0D47A1';

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
          How {toolName} Works
        </Typography>

        <Grid container spacing={3}>
          {steps.map((step, index) => (
            <Grid item xs={12} sm={6} key={index}>
              <Card
                elevation={0}
                sx={{
                  border: '1px solid #E0E0E0',
                  height: '100%',
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: accentColor,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem',
                      mb: 2,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Typography
                    component="h3"
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      mb: 1,
                    }}
                  >
                    {step.title}
                  </Typography>
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      lineHeight: 1.6,
                    }}
                  >
                    {step.desc}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
