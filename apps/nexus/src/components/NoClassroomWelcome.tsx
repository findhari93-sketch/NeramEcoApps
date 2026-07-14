'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  alpha,
  Avatar,
  Stack,
} from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { DEFAULT_ADMIN_TEAMS_EMAILS } from '@/lib/constants';

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
  const { user, signOut } = useNexusAuthContext();
  const [adminEmails, setAdminEmails] = useState<string[]>(DEFAULT_ADMIN_TEAMS_EMAILS);

  // Fetch the admin Teams contacts so the "Talk to Admin" button opens the
  // right chat. Public settings endpoint, no auth needed.
  useEffect(() => {
    let cancelled = false;

    async function loadContacts() {
      try {
        const res = await fetch('/api/settings?key=admin_teams_contacts');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (Array.isArray(data.value) && data.value.length > 0) {
          setAdminEmails(data.value);
        }
      } catch {
        // Fall back to the default contacts on any error.
      }
    }

    loadContacts();
    return () => { cancelled = true; };
  }, []);

  const teamsDeepLink = useCallback(() => {
    const message = `Hi, I've signed in to Nexus but I'm not in a classroom yet. Could you please add me to the right classroom?\n\nName: ${user?.name || 'N/A'}\nEmail: ${user?.email || 'N/A'}`;
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

        {/* Contact section — a teacher adds you to your classroom, then you're in */}
        <Box sx={{ width: '100%' }}>
          <Card
            variant="outlined"
            sx={{
              borderRadius: 3,
              border: `1px solid ${alpha(primaryColor, 0.2)}`,
              bgcolor: alpha(primaryColor, 0.03),
            }}
          >
            <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.75 }}>
                You&#39;re almost in
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 3, lineHeight: 1.6 }}
              >
                Your teacher adds you to your classroom, then you get full access.
                If you haven&#39;t been added yet, reach out on Teams and we&#39;ll set you up.
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
        </Box>

        {/* Footer note */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 4, textAlign: 'center', opacity: 0.7 }}
        >
          Neram Classes, India&#39;s #1 Online NATA Coaching
        </Typography>
      </Box>
    </Box>
  );
}
