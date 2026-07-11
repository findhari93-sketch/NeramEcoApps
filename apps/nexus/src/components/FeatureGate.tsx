'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Box, Button, Paper, Typography, alpha, useTheme } from '@neram/ui';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { featureForPath, type FeatureSurface } from '@/lib/feature-flags';

/**
 * Blocks a page whose feature has been turned off by the admin, even when the
 * URL is opened directly (the menu already hides it). Ungated routes and core
 * features always pass through. Renders inside the shell so the nav stays put
 * and the user can navigate away.
 */
export default function FeatureGate({
  surface,
  children,
}: {
  surface: FeatureSurface;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { featureFlags } = useNexusAuthContext();

  const feature = featureForPath(pathname);
  const blocked = !!feature && featureFlags[feature.id] === false;

  if (!blocked) return <>{children}</>;

  const homePath = surface === 'student' ? '/student/dashboard' : '/teacher/dashboard';
  return <FeatureUnavailable label={feature!.label} homePath={homePath} />;
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
