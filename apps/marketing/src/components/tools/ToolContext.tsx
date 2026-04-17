import { Box, Container, Typography, Button } from '@neram/ui';
import Link from 'next/link';

export default function ToolContext({
  contextHeading,
  contextContent,
  appUrl,
}: {
  contextHeading: string;
  contextContent: string;
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
          {contextHeading}
        </Typography>

        <Box
          dangerouslySetInnerHTML={{ __html: contextContent }}
          sx={{
            '& p': {
              mb: 2,
              lineHeight: 1.8,
              color: 'text.secondary',
            },
            '& strong': {
              color: 'text.primary',
            },
          }}
        />

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
            Get Started Free
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
