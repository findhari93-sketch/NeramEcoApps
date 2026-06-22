'use client';

import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Avatar,
  alpha,
} from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Shown when a signed-in student has been graduated to alumni and is locked out
 * of Nexus. Warm and celebratory (not an error), with a single way out: sign out.
 */
export default function AlumniAccessEnded({ message }: { message?: string }) {
  const { user, signOut } = useNexusAuthContext();
  const accent = '#7C3AED'; // Nexus purple
  const gold = '#D97706';

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
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: { xs: 1.5, sm: 2 } }}>
        <Button
          variant="text"
          size="small"
          startIcon={<LogoutOutlinedIcon />}
          onClick={signOut}
          sx={{ color: 'text.secondary', minHeight: 44 }}
        >
          Sign Out
        </Button>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2.5, sm: 4 },
          pb: { xs: 6, md: 8 },
          maxWidth: 560,
          mx: 'auto',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <Avatar
          sx={{
            width: 88,
            height: 88,
            mb: 3,
            bgcolor: alpha(gold, 0.12),
            color: gold,
          }}
        >
          <EmojiEventsOutlinedIcon sx={{ fontSize: 48 }} />
        </Avatar>

        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            mb: 1.5,
            fontSize: { xs: '1.6rem', sm: '2rem' },
            background: `linear-gradient(135deg, ${accent} 0%, #4F46E5 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {user?.name ? `Congratulations, ${user.name.split(' ')[0]}!` : 'Congratulations!'}
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ lineHeight: 1.7, fontSize: { xs: '0.98rem', sm: '1.05rem' }, mb: 3 }}
        >
          {message ||
            "You've completed the program and are now a Neram alumnus. Your Nexus access has ended."}
        </Typography>

        <Card
          variant="outlined"
          sx={{
            width: '100%',
            borderRadius: 3,
            border: `1px solid ${alpha(accent, 0.18)}`,
            bgcolor: alpha(accent, 0.04),
            mb: 3,
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Your hard work lives on. Your best drawings may be featured in our
              Alumni Hall of Fame to inspire the next batch. If you need anything,
              reach out to the Neram team.
            </Typography>
          </CardContent>
        </Card>

        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={signOut}
          sx={{
            py: 1.5,
            borderRadius: 3,
            fontSize: '1rem',
            fontWeight: 700,
            textTransform: 'none',
            bgcolor: accent,
            '&:hover': { bgcolor: '#6D28D9' },
            minHeight: 52,
          }}
        >
          Sign Out
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 4, opacity: 0.7 }}>
          Neram Classes, India&#39;s trusted online NATA coaching
        </Typography>
      </Box>
    </Box>
  );
}
