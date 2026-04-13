import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import Link from 'next/link';
import { TIER_CONFIG } from '@/lib/college-hub/constants';
import type { CollegeTier } from '@/lib/college-hub/types';

const TIER_ORDER: Record<CollegeTier, number> = { free: 0, silver: 1, gold: 2, platinum: 3 };

export function hasTierAccess(collegeTier: CollegeTier, requiredTier: CollegeTier): boolean {
  return (TIER_ORDER[collegeTier] ?? 0) >= (TIER_ORDER[requiredTier] ?? 0);
}

interface TierGateProps {
  requiredTier: CollegeTier;
  featureName: string;
  collegeTier: CollegeTier;
  isAdmin?: boolean;
  children: React.ReactNode;
}

export default function TierGate({
  requiredTier,
  featureName,
  collegeTier,
  isAdmin = false,
  children,
}: TierGateProps) {
  if (isAdmin || hasTierAccess(collegeTier, requiredTier)) {
    return <>{children}</>;
  }

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
          This college needs to upgrade to the {config.label} plan to unlock {featureName.toLowerCase()} on their
          profile.
        </Typography>
        <Button
          component={Link}
          href="/contact"
          variant="contained"
          size="small"
          sx={{
            bgcolor: config.color,
            '&:hover': { bgcolor: config.color, opacity: 0.9 },
            mt: 0.5,
          }}
        >
          Are you from this college? Upgrade
        </Button>
      </Stack>
    </Paper>
  );
}
