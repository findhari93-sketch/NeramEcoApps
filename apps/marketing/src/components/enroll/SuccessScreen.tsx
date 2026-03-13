'use client';

import { Box, Container, Typography, Button, Paper, Divider } from '@neram/ui';
import { CheckCircleOutlined, ArrowForward, Check } from '@mui/icons-material';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';

interface EnrollmentSummary {
  studentName?: string | null;
  courseName?: string | null;
  totalFee?: number | null;
  amountPaid?: number | null;
  enrolledAt?: string | null;
}

interface SuccessScreenProps {
  applicationNumber: string;
  enrollmentSummary?: EnrollmentSummary;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '';
  return `\u20B9${Number(amount).toLocaleString('en-IN')}`;
}

export default function SuccessScreen({ applicationNumber, enrollmentSummary }: SuccessScreenProps) {
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

        {/* Enrollment Summary (shown on revisit) */}
        {enrollmentSummary && (enrollmentSummary.studentName || enrollmentSummary.courseName) && (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              border: '1px solid',
              borderColor: 'success.light',
              borderRadius: 2,
              bgcolor: 'success.50',
              textAlign: 'left',
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} color="success.dark" mb={1.5}>
              Enrollment Details
            </Typography>
            {enrollmentSummary.studentName && (
              <Box display="flex" justifyContent="space-between" mb={0.75}>
                <Typography variant="body2" color="text.secondary">Student</Typography>
                <Typography variant="body2" fontWeight={600}>{enrollmentSummary.studentName}</Typography>
              </Box>
            )}
            {enrollmentSummary.courseName && (
              <Box display="flex" justifyContent="space-between" mb={0.75}>
                <Typography variant="body2" color="text.secondary">Course</Typography>
                <Typography variant="body2" fontWeight={600}>{enrollmentSummary.courseName}</Typography>
              </Box>
            )}
            {enrollmentSummary.totalFee != null && (
              <Box display="flex" justifyContent="space-between" mb={0.75}>
                <Typography variant="body2" color="text.secondary">Total Fee</Typography>
                <Typography variant="body2" fontWeight={600}>{formatCurrency(enrollmentSummary.totalFee)}</Typography>
              </Box>
            )}
            {enrollmentSummary.amountPaid != null && (
              <Box display="flex" justifyContent="space-between" mb={0.75}>
                <Typography variant="body2" color="text.secondary">Amount Paid</Typography>
                <Typography variant="body2" fontWeight={600} color="success.main">{formatCurrency(enrollmentSummary.amountPaid)}</Typography>
              </Box>
            )}
            {enrollmentSummary.enrolledAt && (
              <>
                <Divider sx={{ my: 1 }} />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Enrolled On</Typography>
                  <Typography variant="body2">{formatDate(enrollmentSummary.enrolledAt)}</Typography>
                </Box>
              </>
            )}
          </Paper>
        )}

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
          href={`/sso?redirect=${encodeURIComponent(APP_URL)}`}
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
          You&apos;ll be automatically signed in to the Student App with your Google account.
        </Typography>
      </Box>
    </Container>
  );
}
