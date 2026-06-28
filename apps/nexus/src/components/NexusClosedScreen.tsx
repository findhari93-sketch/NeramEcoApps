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
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Shown when a signed-in student is blocked by the Nexus access gate during the
 * 2026-27 rebuild (the /api/auth/me gate returns 403 error 'nexus_closed').
 * Warm and reassuring (not an error): we're setting things up and will let you
 * in soon. The only action is Sign Out, so a gated student is never stuck.
 */
export default function NexusClosedScreen({ message }: { message?: string }) {
  const { user, signOut } = useNexusAuthContext();
  const accent = '#7C3AED'; // Nexus purple

  const firstName = user?.name ? user.name.split(' ')[0] : '';

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
            bgcolor: alpha(accent, 0.12),
            color: accent,
          }}
        >
          <AutoAwesomeOutlinedIcon sx={{ fontSize: 46 }} />
        </Avatar>

        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            mb: 1.5,
            fontSize: { xs: '1.5rem', sm: '1.9rem' },
            background: `linear-gradient(135deg, ${accent} 0%, #4F46E5 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1.25,
          }}
        >
          {firstName
            ? `Hang tight, ${firstName}. Your classroom is almost ready.`
            : 'Your classroom is almost ready.'}
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ lineHeight: 1.7, fontSize: { xs: '0.98rem', sm: '1.05rem' }, mb: 3 }}
        >
          {message ||
            "We're getting Nexus ready for the new batch. We're opening it up step by step so everything is smooth and easy to use. You'll be let in very soon."}
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
              Nothing to do right now. The Neram team will notify you the moment
              your access is switched on. Until then, you can close this tab, your
              spot is saved.
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
