'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Box, Button, Typography, useTheme } from '@neram/ui';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/** Banner height in px. TopBar offsets its sticky `top` by this while active. */
export const IMPERSONATION_BANNER_HEIGHT = 48;

/**
 * Persistent, unmistakable banner shown whenever a teacher/admin is viewing the
 * app as a student ("View as Student"). Fixed to the top, full width, above the
 * app bar. A spacer of equal height keeps page content from hiding behind it.
 * Mounted app-wide (in providers) so it also appears on the onboarding/login
 * routes a student might be sitting on.
 */
export default function ImpersonationBanner() {
  const { impersonation, exitImpersonation } = useNexusAuthContext();
  const router = useRouter();
  const theme = useTheme();
  const [exiting, setExiting] = useState(false);

  // Impersonation state is read from sessionStorage, which is empty during SSR
  // but populated on the client. Render nothing until mounted so the first
  // client render matches the server HTML (no hydration mismatch on reload).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !impersonation.active || !impersonation.student) return null;

  const studentName = impersonation.student.name || 'Student';
  const impersonator = impersonation.impersonatorName;

  const handleExit = async () => {
    setExiting(true);
    try {
      await exitImpersonation();
    } finally {
      // Back to the teacher/admin's own dashboard; RoleGuard re-grants access.
      // (/teacher has no index page and would 404 — use the canonical route.)
      router.push('/teacher/dashboard');
    }
  };

  return (
    <>
      {/* Spacer in normal flow so content starts below the fixed banner */}
      <Box sx={{ height: `${IMPERSONATION_BANNER_HEIGHT}px`, flexShrink: 0 }} aria-hidden />

      <Box
        role="status"
        aria-label={`You are viewing the app as ${studentName}. Use the exit button to return to your own account.`}
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: `${IMPERSONATION_BANNER_HEIGHT}px`,
          // Above the fixed sidebar (theme.zIndex.drawer) so the banner spans the
          // full width at the very top; still below MUI modals/snackbars (1300/1400)
          // so the student picker dialog and toasts layer on top of it.
          zIndex: theme.zIndex.drawer + 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: { xs: 1.5, sm: 2.5 },
          // High-visibility amber with dark text (contrast > 7:1).
          background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)',
          color: '#1F2937',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}
      >
        <VisibilityOutlinedIcon sx={{ fontSize: '1.25rem', flexShrink: 0 }} />

        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
          <Typography
            noWrap
            sx={{ fontWeight: 800, fontSize: { xs: '0.8rem', sm: '0.9rem' }, lineHeight: 1.2 }}
          >
            Viewing as {studentName}
          </Typography>
          {impersonator && (
            <Typography
              noWrap
              sx={{
                display: { xs: 'none', sm: 'block' },
                fontSize: '0.75rem',
                fontWeight: 600,
                opacity: 0.85,
                lineHeight: 1.2,
              }}
            >
              (you are {impersonator})
            </Typography>
          )}
        </Box>

        <Button
          onClick={handleExit}
          disabled={exiting}
          variant="contained"
          startIcon={<LogoutIcon sx={{ fontSize: '1rem' }} />}
          aria-label="Exit student view"
          disableElevation
          sx={{
            flexShrink: 0,
            minHeight: 40,
            minWidth: 88,
            px: 2,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            bgcolor: '#1F2937',
            color: '#fff',
            '&:hover': { bgcolor: '#111827' },
            '&.Mui-disabled': { bgcolor: 'rgba(31,41,55,0.5)', color: '#fff' },
          }}
        >
          {exiting ? 'Exiting...' : 'Exit'}
        </Button>
      </Box>
    </>
  );
}
