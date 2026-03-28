'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Checkbox,
  LinearProgress,
  Chip,
} from '@neram/ui';
import {
  CheckCircleOutlined,
  CheckCircle,
  RadioButtonUnchecked,
  OpenInNew,
  WhatsApp,
  Laptop,
  Groups,
  Person,
  Google,
} from '@mui/icons-material';
import { useFirebaseAuth } from '@neram/auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';

interface OnboardingStep {
  id: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedByType: string | null;
  stepKey: string;
  title: string;
  description: string | null;
  iconName: string | null;
  actionType: 'link' | 'in_app' | 'manual';
  actionConfig: Record<string, unknown>;
  displayOrder: number;
  isRequired: boolean;
}

interface EnrollmentData {
  studentId: string;
  enrollmentDate: string;
  courseName: string | null;
  batchName: string | null;
  paymentStatus: string;
  totalFee: number;
  feePaid: number;
  feeDue: number;
  leadProfile: {
    application_number: string | null;
    interest_course: string | null;
    first_name: string | null;
    father_name: string | null;
    parent_phone: string | null;
  } | null;
  onboardingSteps: OnboardingStep[];
}

function getOnboardingIcon(iconName: string | null) {
  switch (iconName) {
    case 'WhatsApp': return <WhatsApp sx={{ color: '#25D366' }} />;
    case 'Laptop': return <Laptop sx={{ color: '#0078D4' }} />;
    case 'Groups': return <Groups sx={{ color: '#0078D4' }} />;
    case 'Person': return <Person sx={{ color: '#1976d2' }} />;
    default: return null;
  }
}

export default function MyEnrollmentPage() {
  const { user, loading: authLoading, signInWithGoogle } = useFirebaseAuth();
  const [data, setData] = useState<EnrollmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingStep, setTogglingStep] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const firebaseUser = (user.raw as any);
      const idToken = await firebaseUser?.getIdToken();
      const res = await fetch('/api/my-enrollment', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setData(json.data);
      } else if (json.code === 'NOT_ENROLLED') {
        setError('not_enrolled');
      } else {
        setError(json.error || 'Failed to load enrollment data');
      }
    } catch {
      setError('Failed to load enrollment data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [authLoading, user, fetchData]);

  const handleToggleStep = async (step: OnboardingStep) => {
    if (!user) return;
    setTogglingStep(step.id);
    try {
      const firebaseUser = (user.raw as any);
      const idToken = await firebaseUser?.getIdToken();
      const res = await fetch(`/api/enroll/onboarding-steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ isCompleted: !step.isCompleted }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setData((prev) => prev ? {
          ...prev,
          onboardingSteps: prev.onboardingSteps.map((s) =>
            s.id === step.id ? { ...s, isCompleted: json.data.isCompleted, completedAt: json.data.completedAt } : s
          ),
        } : prev);
      }
    } catch { /* silent */ } finally {
      setTogglingStep(null);
    }
  };

  // Auth loading
  if (authLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={40} />
      </Container>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          My Enrollment
        </Typography>
        <Typography color="text.secondary" mb={3}>
          Sign in with Google to view your enrollment details and onboarding steps.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={signInWithGoogle}
          startIcon={<Google />}
          sx={{ py: 1.5, fontSize: '1rem', fontWeight: 600, borderRadius: 1, textTransform: 'none' }}
        >
          Sign in with Google
        </Button>
      </Container>
    );
  }

  // Loading data
  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary" mt={2}>Loading enrollment data...</Typography>
      </Container>
    );
  }

  // Not enrolled
  if (error === 'not_enrolled') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          No Enrollment Found
        </Typography>
        <Typography color="text.secondary" mb={3}>
          You haven&apos;t completed enrollment yet. If you have an enrollment link, please use it to complete your enrollment.
        </Typography>
        <Button variant="contained" href="/" sx={{ borderRadius: 1 }}>
          Go to Homepage
        </Button>
      </Container>
    );
  }

  // Error
  if (error || !data) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="error">{error || 'Something went wrong'}</Alert>
      </Container>
    );
  }

  const completedSteps = data.onboardingSteps.filter((s) => s.isCompleted).length;
  const totalSteps = data.onboardingSteps.length;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          border: '1px solid',
          borderColor: 'success.light',
          borderRadius: 2,
          bgcolor: 'success.50',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CheckCircleOutlined sx={{ fontSize: 32, color: 'success.main' }} />
            <Box>
              <Typography variant="h6" fontWeight={700} color="success.dark">
                Enrollment Complete
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Student ID: <strong>{data.studentId}</strong>
                {data.courseName && ` | ${data.courseName}`}
              </Typography>
            </Box>
          </Box>
          <Chip
            label={data.paymentStatus === 'paid' ? 'Fully Paid' : 'Payment Pending'}
            color={data.paymentStatus === 'paid' ? 'success' : 'warning'}
            size="small"
          />
        </Box>
      </Paper>

      {/* Enrollment Details */}
      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>Enrollment Details</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Student ID</Typography>
            <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>{data.studentId}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Enrollment Date</Typography>
            <Typography variant="body2">{new Date(data.enrollmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Course</Typography>
            <Typography variant="body2">{data.courseName || data.leadProfile?.interest_course?.toUpperCase() || '-'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Batch</Typography>
            <Typography variant="body2">{data.batchName || 'Not assigned'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Total Fee</Typography>
            <Typography variant="body2">₹{Number(data.totalFee).toLocaleString('en-IN')}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Amount Paid</Typography>
            <Typography variant="body2" color={data.feeDue > 0 ? 'warning.main' : 'success.main'} fontWeight={600}>
              ₹{Number(data.feePaid).toLocaleString('en-IN')}
              {data.feeDue > 0 && ` (Due: ₹${Number(data.feeDue).toLocaleString('en-IN')})`}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Onboarding Steps */}
      {totalSteps > 0 && (
        <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Complete Your Onboarding
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {completedSteps} of {totalSteps} complete
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={(completedSteps / totalSteps) * 100}
            sx={{ mb: 2, borderRadius: 1, height: 6 }}
          />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.onboardingSteps.map((step) => (
              <Paper
                key={step.id}
                variant="outlined"
                sx={{
                  p: { xs: 1.5, md: 2 },
                  borderRadius: 1.5,
                  bgcolor: step.isCompleted ? 'success.50' : 'transparent',
                  borderColor: step.isCompleted ? 'success.light' : 'divider',
                  opacity: togglingStep === step.id ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Checkbox
                    checked={step.isCompleted}
                    onChange={() => handleToggleStep(step)}
                    disabled={togglingStep === step.id}
                    icon={<RadioButtonUnchecked />}
                    checkedIcon={<CheckCircle />}
                    sx={{ p: 0.5, mt: 0.25 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                      {step.iconName && (
                        <Box sx={{ display: 'flex', fontSize: 20 }}>
                          {getOnboardingIcon(step.iconName)}
                        </Box>
                      )}
                      <Typography
                        variant="body1"
                        fontWeight={600}
                        sx={{
                          textDecoration: step.isCompleted ? 'line-through' : 'none',
                          color: step.isCompleted ? 'text.secondary' : 'text.primary',
                        }}
                      >
                        {step.title}
                      </Typography>
                    </Box>
                    {step.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {step.description}
                      </Typography>
                    )}
                    {step.actionType === 'link' && !!(step.actionConfig?.url) && (
                      <Button
                        size="small"
                        variant="outlined"
                        href={step.actionConfig.url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                        sx={{ borderRadius: 1, textTransform: 'none', fontSize: 12, py: 0.25 }}
                      >
                        Open
                      </Button>
                    )}
                    {step.actionType === 'in_app' && !!(step.actionConfig?.route) && (
                      <Button
                        size="small"
                        variant="outlined"
                        href={`${APP_URL}${step.actionConfig.route}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                        sx={{ borderRadius: 1, textTransform: 'none', fontSize: 12, py: 0.25 }}
                      >
                        Go to Student App
                      </Button>
                    )}
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        </Paper>
      )}

      {/* Go to App button */}
      <Box sx={{ textAlign: 'center' }}>
        <Button
          variant="contained"
          size="large"
          href={`/sso?redirect=${encodeURIComponent(APP_URL)}`}
          sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none', px: 4 }}
        >
          Go to Student App
        </Button>
      </Box>
    </Container>
  );
}
