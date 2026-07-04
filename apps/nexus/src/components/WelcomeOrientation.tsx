'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  Avatar,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import WavingHandOutlinedIcon from '@mui/icons-material/WavingHandOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const SEEN_KEY = 'nexus_welcome_seen_v1';
const ACCENT = '#7C3AED'; // Nexus purple

interface Slide {
  icon: React.ReactNode;
  title: string;
  body: string;
}

/**
 * One-time welcome orientation for students. Shown on the first visit to the
 * student app to teach the basics of Nexus, then never again (tracked in
 * localStorage). It collects nothing: details already come from the
 * application form, so this is purely "here's how Nexus works".
 *
 * Mounted in the student layout, so it only renders for students who have
 * passed the access gate and onboarding/profile gates.
 */
export default function WelcomeOrientation() {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, isStudent } = useNexusAuthContext();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const firstName = user?.name ? user.name.split(' ')[0] : 'there';

  const slides: Slide[] = [
    {
      icon: <WavingHandOutlinedIcon sx={{ fontSize: 44 }} />,
      title: `Welcome to Nexus, ${firstName}!`,
      body: "This is your learning home for the year. Here's a 20-second tour so you know your way around.",
    },
    {
      icon: <CalendarTodayOutlinedIcon sx={{ fontSize: 44 }} />,
      title: 'Join your live classes',
      body: 'Your Timetable shows every upcoming class with a one-tap join link, and recordings of past classes are saved there too.',
    },
    {
      icon: <BrushOutlinedIcon sx={{ fontSize: 44 }} />,
      title: 'Submit work, get feedback',
      body: 'Upload your drawings and take tests. Your teachers review them and give you personal feedback to help you improve.',
    },
    {
      icon: <VideoLibraryOutlinedIcon sx={{ fontSize: 44 }} />,
      title: 'Learn at your own pace',
      body: 'The Library and Question Bank are open whenever you want to revise a topic or practice more.',
    },
    {
      icon: <LeaderboardOutlinedIcon sx={{ fontSize: 44 }} />,
      title: "You're all set",
      body: 'Track your attendance, checklists, and ranking as you go. More features will open up through the year. Let us know if you need anything.',
    },
  ];

  useEffect(() => {
    if (!user || !isStudent) return;
    if (typeof window === 'undefined') return;
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      /* ignore storage errors */
    }
  }, [user, isStudent]);

  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const isLast = step === slides.length - 1;
  const slide = slides[step];

  return (
    <Dialog
      open={open}
      onClose={finish}
      fullScreen={fullScreen}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 4 } }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: fullScreen ? '100dvh' : 460,
          p: { xs: 3, sm: 4 },
        }}
      >
        {/* Skip */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          {!isLast && (
            <Button onClick={finish} size="small" sx={{ color: 'text.secondary', minHeight: 40, textTransform: 'none' }}>
              Skip
            </Button>
          )}
        </Box>

        {/* Slide body */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            px: { xs: 1, sm: 2 },
          }}
        >
          <Avatar sx={{ width: 92, height: 92, mb: 3, bgcolor: alpha(ACCENT, 0.12), color: ACCENT }}>
            {slide.icon}
          </Avatar>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 1.5, fontSize: { xs: '1.4rem', sm: '1.6rem' }, lineHeight: 1.25 }}>
            {slide.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, maxWidth: 360 }}>
            {slide.body}
          </Typography>
        </Box>

        {/* Dots */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, my: 3 }}>
          {slides.map((_, i) => (
            <Box
              key={i}
              sx={{
                width: i === step ? 22 : 8,
                height: 8,
                borderRadius: 4,
                bgcolor: i === step ? ACCENT : alpha(ACCENT, 0.25),
                transition: 'all 200ms',
              }}
            />
          ))}
        </Box>

        {/* Controls */}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {step > 0 && (
            <Button
              variant="outlined"
              onClick={() => setStep((s) => s - 1)}
              sx={{ flex: 1, py: 1.4, borderRadius: 3, textTransform: 'none', fontWeight: 600, minHeight: 48 }}
            >
              Back
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            sx={{
              flex: 2,
              py: 1.4,
              borderRadius: 3,
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 48,
              bgcolor: ACCENT,
              '&:hover': { bgcolor: '#6D28D9' },
            }}
          >
            {isLast ? 'Start exploring' : 'Next'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
