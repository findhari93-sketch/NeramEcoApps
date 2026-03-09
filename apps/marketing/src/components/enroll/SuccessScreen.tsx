'use client';

import { Box, Container, Typography, Button, Paper } from '@neram/ui';
import { CheckCircleOutlined, ArrowForward, Check } from '@mui/icons-material';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';

interface SuccessScreenProps {
  applicationNumber: string;
}

export default function SuccessScreen({ applicationNumber }: SuccessScreenProps) {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
      <Box textAlign="center">
        <CheckCircleOutlined sx={{ fontSize: 80, color: 'success.main', mb: 3 }} />

        <Typography variant="h4" fontWeight={700} gutterBottom>
          Welcome to Neram Classes!
        </Typography>

        <Typography variant="body1" color="text.secondary" mb={2}>
          Your enrollment is complete. Here&apos;s your application number:
        </Typography>

        <Typography
          variant="h5"
          sx={{
            fontFamily: 'monospace',
            bgcolor: 'grey.100',
            py: 1.5,
            px: 3,
            borderRadius: 1,
            display: 'inline-block',
            mb: 4,
          }}
        >
          {applicationNumber}
        </Typography>

        {/* What's next */}
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 4,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            textAlign: 'left',
          }}
        >
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            What happens next?
          </Typography>
          {[
            { step: '1', text: 'Enrollment confirmed', done: true },
            { step: '2', text: 'Open the Student App to complete a quick onboarding questionnaire' },
            { step: '3', text: 'Upload your Aadhar card and passport photo in the app' },
            { step: '4', text: 'Start learning!' },
          ].map((item) => (
            <Box key={item.step} display="flex" alignItems="center" gap={2} mb={1.5}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: item.done ? 'success.main' : 'grey.300',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {item.done ? <Check sx={{ fontSize: 16 }} /> : item.step}
              </Box>
              <Typography variant="body2" color={item.done ? 'success.main' : 'text.primary'}>
                {item.text}
              </Typography>
            </Box>
          ))}
        </Paper>

        <Button
          variant="contained"
          size="large"
          fullWidth
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<ArrowForward />}
          sx={{
            py: 1.5,
            fontSize: '1rem',
            fontWeight: 600,
            borderRadius: 1,
            mb: 2,
          }}
        >
          Continue to Student App
        </Button>

        <Typography variant="caption" color="text.secondary">
          The app will guide you through a quick onboarding questionnaire to personalize your experience.
        </Typography>
      </Box>
    </Container>
  );
}
