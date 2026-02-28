// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Container,
  Divider,
  Stack,
  Chip,
  CircularProgress,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SchoolIcon from '@mui/icons-material/School';
import GroupsIcon from '@mui/icons-material/Groups';
import LaptopIcon from '@mui/icons-material/Laptop';
import PersonIcon from '@mui/icons-material/Person';
import GetAppIcon from '@mui/icons-material/GetApp';
import SecurityIcon from '@mui/icons-material/Security';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { useFirebaseAuth } from '@neram/auth';

interface StudentInfo {
  enrolled: boolean;
  enrollmentDate: string | null;
  courseName: string;
  receiptNumber: string | null;
  amountPaid: number;
  batchAssigned: boolean;
}

export default function WelcomePage() {
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const [info, setInfo] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStudentInfo() {
      try {
        const response = await fetch('/api/payment/student-status');
        if (response.ok) {
          const data = await response.json();
          setInfo(data);
        }
      } catch {
        // Ignore - show generic welcome
      } finally {
        setLoading(false);
      }
    }
    fetchStudentInfo();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const userName = user?.displayName?.split(' ')[0] || 'Student';

  const getAuthenticatorUrl = () => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/iPad|iPhone|iPod/.test(ua)) {
        return 'https://apps.apple.com/app/microsoft-authenticator/id983156458';
      }
    }
    return 'https://play.google.com/store/apps/details?id=com.azure.authenticator';
  };

  const steps = [
    {
      icon: <PersonIcon />,
      title: 'Complete Your Profile',
      description: 'Add your photo, parent contact, and emergency details',
      action: () => router.push('/profile'),
      buttonText: 'Complete Profile',
      color: '#1565C0',
      done: false,
    },
    {
      icon: <GroupsIcon />,
      title: 'Join WhatsApp Group',
      description: 'Get daily class updates, study materials & doubt sessions',
      action: () => window.open('https://chat.whatsapp.com/neramclasses', '_blank'),
      buttonText: 'Join Group',
      color: '#25D366',
      done: false,
    },
    {
      icon: <GetAppIcon />,
      title: 'Install Microsoft Teams',
      description: 'Download Microsoft Teams for attending online classes and accessing study materials',
      action: () => window.open('https://www.microsoft.com/en-in/microsoft-teams/download-app', '_blank'),
      buttonText: 'Download Teams',
      color: '#6264A7',
      done: false,
    },
    {
      icon: <SecurityIcon />,
      title: 'Set Up Microsoft Authenticator',
      description: 'Required for secure login to your classroom account',
      action: () => window.open(getAuthenticatorUrl(), '_blank'),
      buttonText: 'Download Authenticator',
      color: '#00A4EF',
      done: false,
    },
    {
      icon: <VpnKeyIcon />,
      title: 'Receive Your Classroom Login',
      description: 'Your classroom login credentials will be shared securely by the admin. Check your email or WhatsApp.',
      action: undefined,
      buttonText: 'Pending...',
      color: '#FF9800',
      done: false,
    },
    {
      icon: <SchoolIcon />,
      title: 'Batch Allocation',
      description: info?.batchAssigned
        ? 'You have been assigned to a batch!'
        : 'You\'ll be assigned to a batch within 2 business days. We\'ll notify you!',
      action: info?.batchAssigned ? () => router.push('/dashboard') : undefined,
      buttonText: info?.batchAssigned ? 'View Batch' : 'Pending...',
      color: '#FF9800',
      done: info?.batchAssigned || false,
    },
    {
      icon: <LaptopIcon />,
      title: 'Access Neram Nexus',
      description: 'Your online classroom will be set up once batch is allocated',
      action: undefined,
      buttonText: 'Coming Soon',
      color: '#7C4DFF',
      done: false,
    },
  ];

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 4 } }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          textAlign: 'center',
          py: 4,
          px: 3,
          mb: 3,
          background: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
          borderRadius: 1.5,
        }}
      >
        <Box
          sx={{
            width: 80, height: 80, borderRadius: '50%', bgcolor: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mx: 'auto', mb: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />
        </Box>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Welcome, {userName}!
        </Typography>
        <Typography color="text.secondary">
          Your enrollment at Neram Classes is confirmed
        </Typography>

        {info?.receiptNumber && (
          <Chip
            label={`Receipt: ${info.receiptNumber}`}
            sx={{ mt: 1.5, fontFamily: 'monospace', fontWeight: 600, bgcolor: 'white' }}
          />
        )}
      </Paper>

      {/* Payment Summary */}
      {info && (
        <Paper elevation={0} sx={{ p: 2.5, mb: 3, border: '1px solid #e0e0e0', borderRadius: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Enrollment Details</Typography>
          <Stack spacing={0.75}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Course</Typography>
              <Typography variant="body2" fontWeight={500}>{info.courseName}</Typography>
            </Box>
            {info.enrollmentDate && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Enrolled On</Typography>
                <Typography variant="body2">
                  {new Date(info.enrollmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Typography>
              </Box>
            )}
            {info.amountPaid > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Amount Paid</Typography>
                <Typography variant="body2" fontWeight={600} color="success.main">
                  Rs. {info.amountPaid.toLocaleString('en-IN')}
                </Typography>
              </Box>
            )}
          </Stack>
        </Paper>
      )}

      {/* Next Steps */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Your Next Steps
        </Typography>
        <Chip
          label={`${steps.filter(s => s.done).length}/${steps.length} completed`}
          size="small"
          color={steps.every(s => s.done) ? 'success' : 'default'}
          sx={{ fontWeight: 600, fontSize: 11 }}
        />
      </Box>

      <Stack spacing={2}>
        {steps.map((step, i) => (
          <Paper
            key={i}
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 1,
              border: '1px solid',
              borderColor: step.done ? '#C8E6C9' : '#e0e0e0',
              bgcolor: step.done ? '#F1F8E9' : 'white',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <Box
                sx={{
                  width: 40, height: 40, borderRadius: 1,
                  bgcolor: step.done ? '#E8F5E9' : `${step.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: step.done ? 'success.main' : step.color,
                  flexShrink: 0,
                }}
              >
                {step.done ? <CheckCircleIcon /> : step.icon}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {step.title}
                  </Typography>
                  {step.done && (
                    <Chip label="Done" size="small" color="success" sx={{ height: 20, fontSize: 11 }} />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: step.action ? 1.5 : 0 }}>
                  {step.description}
                </Typography>
                {step.action && !step.done && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={step.action}
                    sx={{ borderColor: step.color, color: step.color, fontWeight: 600 }}
                  >
                    {step.buttonText}
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        ))}
      </Stack>

      {/* Go to Dashboard */}
      <Button
        variant="contained"
        fullWidth
        onClick={() => router.push('/dashboard')}
        sx={{ mt: 3, py: 1.5, fontWeight: 600, borderRadius: 1 }}
      >
        Go to Dashboard
      </Button>
    </Container>
  );
}
