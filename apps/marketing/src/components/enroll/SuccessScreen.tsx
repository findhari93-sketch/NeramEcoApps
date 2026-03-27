'use client';

import { useState, useEffect } from 'react';
import { Box, Container, Typography, Button, Paper, Divider, Skeleton } from '@neram/ui';
import { CheckCircleOutlined, ArrowForward, Check } from '@mui/icons-material';
import { getAuth } from 'firebase/auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  stepKey: string;
  isCompleted: boolean;
  actionType: string;
  displayOrder: number;
}

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
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(true);

  useEffect(() => {
    async function fetchSteps() {
      try {
        const user = getAuth().currentUser;
        if (!user) { setLoadingSteps(false); return; }
        const token = await user.getIdToken();
        const res = await fetch('/api/enroll/onboarding-steps', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setOnboardingSteps(data.data || []);
        }
      } catch {
        // Fallback to no steps — will show default
      } finally {
        setLoadingSteps(false);
      }
    }
    fetchSteps();
  }, []);

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

        {/* What's next — onboarding steps from database */}
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

          {/* Step 1 is always "Enrollment confirmed" */}
          <Box display="flex" alignItems="center" gap={2} mb={1.5}>
            <Box
              sx={{
                width: 28, height: 28, borderRadius: '50%',
                bgcolor: 'success.main', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}
            >
              <Check sx={{ fontSize: 16 }} />
            </Box>
            <Typography variant="body2" color="success.main">
              Enrollment confirmed
            </Typography>
          </Box>

          {/* Dynamic onboarding steps from DB */}
          {loadingSteps ? (
            <>
              <Skeleton variant="text" width="80%" height={28} sx={{ ml: 5, mb: 1 }} />
              <Skeleton variant="text" width="70%" height={28} sx={{ ml: 5, mb: 1 }} />
              <Skeleton variant="text" width="60%" height={28} sx={{ ml: 5 }} />
            </>
          ) : onboardingSteps.length > 0 ? (
            onboardingSteps.map((step, idx) => (
              <Box key={step.id} display="flex" alignItems="flex-start" gap={2} mb={1.5}>
                <Box
                  sx={{
                    width: 28, height: 28, borderRadius: '50%',
                    bgcolor: step.isCompleted ? 'success.main' : 'grey.300',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}
                >
                  {step.isCompleted ? <Check sx={{ fontSize: 16 }} /> : idx + 2}
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {step.title}
                  </Typography>
                  {step.description && (
                    <Typography variant="caption" color="text.secondary">
                      {step.description}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))
          ) : (
            /* Fallback if no steps loaded */
            <>
              <Box display="flex" alignItems="center" gap={2} mb={1.5}>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'grey.300', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>2</Box>
                <Typography variant="body2">Open the Student App to complete your setup</Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={2} mb={1.5}>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'grey.300', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>3</Box>
                <Typography variant="body2">Start learning!</Typography>
              </Box>
            </>
          )}
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
