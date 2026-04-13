'use client';

import { Box, Typography, Stack, Paper, Grid, Chip } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const TIER_FEATURES = [
  {
    tier: 'free',
    label: 'Basic (Free)',
    color: '#64748b',
    bg: '#f1f5f9',
    price: '0',
    features: [
      'College name, city, state listed',
      'COA approval status',
      'Basic fee info',
      'Accepted exams',
    ],
    limit: 'No lead notifications, no analytics',
  },
  {
    tier: 'silver',
    label: 'Silver',
    color: '#475569',
    bg: '#f8fafc',
    price: '15,000/yr',
    features: [
      'All Basic features',
      'Gallery photos (up to 10)',
      'Detailed fee breakdown',
      'Faculty profiles',
      'Infrastructure details',
    ],
    limit: 'No leads, no cutoff data',
  },
  {
    tier: 'gold',
    label: 'Gold',
    color: '#d97706',
    bg: '#fffbeb',
    price: '40,000/yr',
    features: [
      'All Silver features',
      'Placement stats',
      'TNEA cutoffs (5-year)',
      'Verified badge',
      'Lead notifications (20/month)',
      'Priority in listings',
    ],
    limit: 'No AI agent, no ambassador tools',
  },
  {
    tier: 'platinum',
    label: 'Platinum',
    color: '#7c3aed',
    bg: '#faf5ff',
    price: '80,000/yr',
    features: [
      'All Gold features',
      'Unlimited lead notifications',
      'Analytics dashboard',
      'Admin profile editor',
      'AI chat widget (Aintra)',
      'Ambassador program access',
      'Virtual tour upload',
    ],
    limit: 'Full access',
  },
];

export default function TierManagementPage() {
  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            bgcolor: '#7c3aed',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <EmojiEventsIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>
          Tier Management
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Assign tiers to colleges from the Colleges page. This page shows what each tier includes.
        Tier changes take effect immediately. Contact the billing team to invoice the college.
      </Typography>

      <Grid container spacing={2}>
        {TIER_FEATURES.map(({ tier, label, color, bg, price, features, limit }) => (
          <Grid item xs={12} sm={6} key={tier}>
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2,
                bgcolor: bg,
                borderColor: `${color}40`,
                height: '100%',
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1.5 }}
              >
                <Chip label={label} sx={{ bgcolor: color, color: 'white', fontWeight: 700 }} />
                <Typography variant="h6" fontWeight={800} sx={{ color }}>
                  {price === '0' ? 'Free' : `${price}`}
                </Typography>
              </Stack>
              <Stack gap={0.75}>
                {features.map((f) => (
                  <Typography
                    key={f}
                    variant="body2"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                  >
                    <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>
                      ✓
                    </Box>{' '}
                    {f}
                  </Typography>
                ))}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  {limit}
                </Typography>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
