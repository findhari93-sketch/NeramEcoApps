'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  alpha,
  useTheme,
  Avatar,
  Stack,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { DEFAULT_ADMIN_TEAMS_EMAILS } from '@/lib/constants';

type RequestState = 'idle' | 'loading' | 'submitted' | 'error';

interface AccessRequest {
  id: string;
  status: string;
  created_at: string;
}

const VALUE_PROPS = [
  {
    icon: <VideocamOutlinedIcon sx={{ fontSize: 32 }} />,
    title: 'Live Classes',
    desc: 'Interactive sessions with expert faculty',
  },
  {
    icon: <SchoolOutlinedIcon sx={{ fontSize: 32 }} />,
    title: 'Foundation Lessons',
    desc: 'Structured video lessons with quizzes',
  },
  {
    icon: <QuizOutlinedIcon sx={{ fontSize: 32 }} />,
    title: 'Question Bank',
    desc: 'Practice with curated NATA questions',
  },
  {
    icon: <BrushOutlinedIcon sx={{ fontSize: 32 }} />,
    title: 'Drawing Feedback',
    desc: 'Expert reviews on your sketches',
  },
];

export default function NoClassroomWelcome() {
  const theme = useTheme();
  const { user, getToken, signOut } = useNexusAuthContext();
  const [requestState, setRequestState] = useState<RequestState>('loading');
  const [existingRequest, setExistingRequest] = useState<AccessRequest | null>(null);
  const [adminEmails, setAdminEmails] = useState<string[]>(DEFAULT_ADMIN_TEAMS_EMAILS);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing request and admin contacts on mount
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function init() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        // Fetch existing request and admin emails in parallel
        const [requestRes, settingsRes] = await Promise.all([
          fetch('/api/classroom-access', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/settings?key=admin_teams_contacts'),
        ]);

        if (!cancelled) {
          if (requestRes.ok) {
            const data = await requestRes.json();
            if (data.request && data.request.status === 'pending') {
              setExistingRequest(data.request);
              setRequestState('submitted');
            } else {
              setRequestState('idle');
            }
          } else {
            setRequestState('idle');
          }

          if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            if (Array.isArray(settingsData.value) && settingsData.value.length > 0) {
              setAdminEmails(settingsData.value);
            }
          }
        }
      } catch {
        if (!cancelled) setRequestState('idle');
      }
    }

    init();
    return () => { cancelled = true; };
  }, [user, getToken]);

  const handleSubmitRequest = useCallback(async () => {
    setRequestState('loading');
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/classroom-access', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit request');
      }

      const data = await res.json();
      setExistingRequest(data.request);
      setRequestState('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setRequestState('error');
    }
  }, [getToken]);

  const teamsDeepLink = useCallback(() => {
    const message = `Hi, I've submitted a classroom access request on Nexus. Could you please add me to the appropriate classroom?\n\nName: ${user?.name || 'N/A'}\nEmail: ${user?.email || 'N/A'}`;
    const emails = adminEmails.join(',');
    return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(emails)}&message=${encodeURIComponent(message)}`;
  }, [user, adminEmails]);

  const primaryColor = '#7C3AED'; // Nexus purple

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {/* Slim top bar with sign out */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          p: { xs: 1.5, sm: 2 },
        }}
      >
        <Button
          variant="text"
          size="small"
          startIcon={<LogoutOutlinedIcon />}
          onClick={signOut}
          sx={{ color: 'text.secondary' }}
        >
          Sign Out
        </Button>
      </Box>

      {/* Main content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          px: { xs: 2.5, sm: 4, md: 6 },
          pb: { xs: 4, md: 6 },
          maxWidth: 640,
          mx: 'auto',
          width: '100%',
        }}
      >
        {/* Hero Section */}
        <Box
          sx={{
            textAlign: 'center',
            mb: { xs: 4, md: 5 },
            mt: { xs: 2, md: 4 },
          }}
        >
          {/* Logo/Brand mark */}
          <Avatar
            sx={{
              width: 72,
              height: 72,
              mx: 'auto',
              mb: 2.5,
              bgcolor: alpha(primaryColor, 0.1),
              color: primaryColor,
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            N
          </Avatar>

          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              mb: 1.5,
              fontSize: { xs: '1.75rem', sm: '2.125rem' },
              background: `linear-gradient(135deg, ${primaryColor} 0%, #4F46E5 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Welcome to Neram Classes
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              maxWidth: 460,
              mx: 'auto',
              lineHeight: 1.6,
              fontSize: { xs: '0.95rem', sm: '1.05rem' },
            }}
          >
            India&#39;s most trusted online NATA coaching.
            You&#39;ve made an excellent choice joining us!
            Get access to expert-led classes, structured lessons, and comprehensive practice.
          </Typography>

          {user && (
            <Chip
              label={`Signed in as ${user.name}`}
              size="small"
              sx={{
                mt: 2,
                bgcolor: alpha(primaryColor, 0.08),
                color: primaryColor,
                fontWeight: 500,
              }}
            />
          )}
        </Box>

        {/* Value Props */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
            width: '100%',
            mb: { xs: 4, md: 5 },
          }}
        >
          {VALUE_PROPS.map((prop) => (
            <Card
              key={prop.title}
              variant="outlined"
              sx={{
                borderRadius: 3,
                border: `1px solid ${alpha(primaryColor, 0.12)}`,
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: alpha(primaryColor, 0.3) },
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                <Box sx={{ color: primaryColor, mb: 1 }}>{prop.icon}</Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {prop.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                  {prop.desc}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* CTA / Status Section */}
        <Box sx={{ width: '100%', textAlign: 'center' }}>
          {requestState === 'loading' && (
            <CircularProgress size={32} sx={{ color: primaryColor }} />
          )}

          {requestState === 'idle' && (
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleSubmitRequest}
              sx={{
                py: 1.75,
                borderRadius: 3,
                fontSize: '1rem',
                fontWeight: 700,
                textTransform: 'none',
                bgcolor: primaryColor,
                '&:hover': { bgcolor: '#6D28D9' },
                minHeight: 56,
              }}
            >
              Request Classroom Access
            </Button>
          )}

          {requestState === 'error' && (
            <>
              <Typography color="error" sx={{ mb: 2 }}>
                {error || 'Something went wrong. Please try again.'}
              </Typography>
              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleSubmitRequest}
                sx={{
                  py: 1.75,
                  borderRadius: 3,
                  fontSize: '1rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  bgcolor: primaryColor,
                  '&:hover': { bgcolor: '#6D28D9' },
                  minHeight: 56,
                }}
              >
                Try Again
              </Button>
            </>
          )}

          {requestState === 'submitted' && (
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                border: `1px solid ${alpha('#16A34A', 0.3)}`,
                bgcolor: alpha('#16A34A', 0.04),
              }}
            >
              <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
                <CheckCircleOutlineIcon
                  sx={{ fontSize: 48, color: '#16A34A', mb: 1.5 }}
                />
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Request Submitted
                </Typography>
                <Chip
                  label="Pending Review"
                  size="small"
                  sx={{
                    bgcolor: alpha('#F59E0B', 0.12),
                    color: '#D97706',
                    fontWeight: 600,
                    mb: 2.5,
                  }}
                />
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 3, lineHeight: 1.6 }}
                >
                  Your request has been sent to the admin team.
                  They&#39;ll add you to the right classroom shortly.
                  You can also reach out directly on Teams for a faster response.
                </Typography>

                <Stack spacing={1.5}>
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={<ChatOutlinedIcon />}
                    href={teamsDeepLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      py: 1.5,
                      borderRadius: 2.5,
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      textTransform: 'none',
                      bgcolor: '#6264A7', // Teams purple
                      '&:hover': { bgcolor: '#525497' },
                      minHeight: 52,
                    }}
                  >
                    Talk to Admin on Teams
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Opens Microsoft Teams with a pre-filled message
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Box>

        {/* Footer note */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 4, textAlign: 'center', opacity: 0.7 }}
        >
          Neram Classes &mdash; India&#39;s #1 Online NATA Coaching
        </Typography>
      </Box>
    </Box>
  );
}
