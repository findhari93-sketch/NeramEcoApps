import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import Link from 'next/link';
import { TIER_CONFIG } from '@/lib/college-hub/constants';
import type { CollegeTier } from '@/lib/college-hub/types';

const TIER_ORDER: Record<CollegeTier, number> = { free: 0, silver: 1, gold: 2, platinum: 3 };

export function hasTierAccess(collegeTier: CollegeTier, requiredTier: CollegeTier): boolean {
  return (TIER_ORDER[collegeTier] ?? 0) >= (TIER_ORDER[requiredTier] ?? 0);
}

export type TierGateVisitorRole = 'student' | 'college_admin' | 'neram_staff';

interface TierGateProps {
  requiredTier: CollegeTier;
  featureName: string;
  collegeTier: CollegeTier;
  isAdmin?: boolean;
  visitorRole?: TierGateVisitorRole;
  children: React.ReactNode;
}

export default function TierGate({
  requiredTier,
  featureName,
  collegeTier,
  isAdmin = false,
  visitorRole = 'student',
  children,
}: TierGateProps) {
  // Access granted: show the content.
  if (isAdmin || visitorRole === 'neram_staff' || hasTierAccess(collegeTier, requiredTier)) {
    return <>{children}</>;
  }

  // Public student view: hide the whole section. No lock, no CTA, no "coming soon"
  // so students never see that Neram runs paid tiers.
  if (visitorRole === 'student') {
    return null;
  }

  // College admin view (viewing their own profile in college-dashboard):
  // show the upgrade card and link to their partnership submission page.
  const config = TIER_CONFIG[requiredTier];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 3, sm: 4 },
        borderRadius: 2,
        bgcolor: config.bgColor,
        borderColor: config.borderColor,
        textAlign: 'center',
      }}
    >
      <Stack alignItems="center" gap={1.5}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            bgcolor: `${config.color}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LockIcon sx={{ color: config.color, fontSize: 24 }} />
        </Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ color: config.color }}>
          {featureName} is a {config.label} Feature
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
          Upgrade to the {config.label} plan to unlock {featureName.toLowerCase()} on your profile.
        </Typography>
        <Button
          component={Link}
          href="/college-dashboard/partnership"
          variant="contained"
          size="small"
          sx={{
            bgcolor: config.color,
            '&:hover': { bgcolor: config.color, opacity: 0.9 },
            mt: 0.5,
          }}
        >
          Upgrade your plan
        </Button>
      </Stack>
    </Paper>
  );
}
