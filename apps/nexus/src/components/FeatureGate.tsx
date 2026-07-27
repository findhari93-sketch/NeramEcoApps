'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Box, Button, Paper, Typography, alpha, useTheme } from '@neram/ui';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { featureForPath, type FeatureSurface } from '@/lib/feature-flags';
import type { Capability } from '@/lib/staff-capabilities';

/**
 * Paths that additionally need a capability, not just a feature flag.
 *
 * Longest matching prefix wins, mirroring featureForPath. Hiding the menu item is
 * not enough on its own: a bookmark or a typed URL would still render the page,
 * and although its API calls now fail, the user sees a broken screen rather than
 * an explanation.
 *
 * This is UI clarity, not the security boundary. Every route re-checks server
 * side.
 */
const CAPABILITY_PATHS: { path: string; capability: Capability; label: string }[] = [
  { path: '/teacher/classrooms', capability: 'structure.enrollment.add', label: 'Classrooms' },
];

function capabilityForPath(pathname: string) {
  return CAPABILITY_PATHS.filter((c) => pathname === c.path || pathname.startsWith(`${c.path}/`)).sort(
    (a, b) => b.path.length - a.path.length,
  )[0];
}

/**
 * Blocks a page whose feature has been turned off by the admin, or which this
 * user's tier does not allow, even when the URL is opened directly (the menu
 * already hides both). Ungated routes and core features always pass through.
 * Renders inside the shell so the nav stays put and the user can navigate away.
 */
export default function FeatureGate({
  surface,
  children,
}: {
  surface: FeatureSurface;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { featureFlags, can, loading } = useNexusAuthContext();

  const feature = featureForPath(pathname);
  const blocked = !!feature && featureFlags[feature.id] === false;

  const homePath = surface === 'student' ? '/student/dashboard' : '/teacher/dashboard';

  if (blocked) return <FeatureUnavailable label={feature!.label} homePath={homePath} />;

  // Wait for the capability map before judging: capabilities start all-false, so
  // deciding while loading would flash "not available" at someone who does have
  // access.
  const gate = capabilityForPath(pathname);
  if (!loading && gate && !can(gate.capability)) {
    return <NotYourRole label={gate.label} homePath={homePath} />;
  }

  return <>{children}</>;
}

/** Shown when the page exists and is switched on, but this tier may not use it. */
function NotYourRole({ label, homePath }: { label: string; homePath: string }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 4, md: 8 }, px: 2 }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          p: { xs: 3, sm: 4 },
          borderRadius: 4,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            mx: 'auto',
            mb: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.text.primary, 0.06),
          }}
        >
          <LockOutlinedIcon sx={{ fontSize: 32, color: 'text.secondary' }} />
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {label} is handled by the Neram team
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
          Your account is set up for teaching, so this section is not part of your tools. If you
          need something changed here, message the Neram team on Teams.
        </Typography>

        <Button
          variant="contained"
          onClick={() => router.push(homePath)}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minHeight: 44, px: 3 }}
        >
          Back to Home
        </Button>
      </Paper>
    </Box>
  );
}

function FeatureUnavailable({ label, homePath }: { label: string; homePath: string }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        pt: { xs: 4, md: 8 },
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          p: { xs: 3, sm: 4 },
          borderRadius: 4,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            mx: 'auto',
            mb: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.1),
          }}
        >
          <RocketLaunchOutlinedIcon sx={{ fontSize: 34, color: 'primary.main' }} />
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {label} is coming soon
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
          We are getting this ready for you. Your teacher will switch it on the moment it is
          tested and good to go. Please check back a little later.
        </Typography>

        <Button
          variant="contained"
          onClick={() => router.push(homePath)}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minHeight: 44, px: 3 }}
        >
          Back to Home
        </Button>
      </Paper>
    </Box>
  );
}
