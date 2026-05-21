'use client';

import { Box, Paper, Typography, Stack, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

const INSTITUTE_GROUPS = [
  {
    type: 'IIT',
    color: '#1565C0',
    institutes: ['IIT Kharagpur', 'IIT Roorkee', 'IIT BHU'],
  },
  {
    type: 'NIT',
    color: '#2E7D32',
    institutes: [
      'NIT Trichy', 'NIT Calicut', 'NIT Rourkela', 'MNIT Jaipur',
      'MANIT Bhopal', 'VNIT Nagpur', 'NIT Hamirpur', 'NIT Patna',
      'NIT Raipur', 'NIT Kurukshetra',
    ],
  },
  {
    type: 'SPA',
    color: '#7B1FA2',
    institutes: ['SPA Delhi', 'SPA Bhopal', 'SPA Vijayawada'],
  },
  {
    type: 'GFTI',
    color: '#E65100',
    institutes: ['IIEST Shibpur', 'BIT Mesra', 'SMVDU', 'Mizoram University'],
  },
];

export default function JosaaBarchPredictorTeaser() {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <AccountBalanceIcon color="primary" />
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          21 JoSAA Institutes Covered
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Real closing-rank data from JoSAA 2023, 2024 and 2025 across IITs, NITs, SPAs and GFTIs that
        admit B.Arch students via JEE Main Paper 2A.
      </Typography>

      <Stack spacing={2}>
        {INSTITUTE_GROUPS.map((group) => (
          <Box key={group.type}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: group.color, letterSpacing: 0.5 }}>
              {group.type} ({group.institutes.length})
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
              {group.institutes.map((name) => (
                <Chip key={name} label={name} size="small" variant="outlined" sx={{ borderColor: group.color, color: group.color }} />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button
          component={Link}
          href="https://app.neramclasses.com/tools/counseling/josaa-predictor"
          variant="contained"
          size="large"
          sx={{ minHeight: 48 }}
        >
          Open Predictor in App →
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Free • Sign in with phone OTP to see your full results
        </Typography>
      </Box>
    </Paper>
  );
}
