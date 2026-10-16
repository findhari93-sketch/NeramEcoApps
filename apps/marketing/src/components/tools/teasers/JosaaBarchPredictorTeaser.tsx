'use client';

import { Box, Typography } from '@neram/ui';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import { CtaButton, QuickCheck, tokens } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/counseling/josaa-predictor';

const INSTITUTE_GROUPS = [
  {
    type: 'IIT',
    institutes: ['IIT Kharagpur', 'IIT Roorkee', 'IIT BHU'],
  },
  {
    type: 'NIT',
    institutes: [
      'NIT Trichy', 'NIT Calicut', 'NIT Rourkela', 'MNIT Jaipur',
      'MANIT Bhopal', 'VNIT Nagpur', 'NIT Hamirpur', 'NIT Patna',
      'NIT Raipur', 'NIT Kurukshetra',
    ],
  },
  {
    type: 'SPA',
    institutes: ['SPA Delhi', 'SPA Bhopal', 'SPA Vijayawada'],
  },
  {
    type: 'GFTI',
    institutes: ['IIEST Shibpur', 'BIT Mesra', 'SMVDU', 'Mizoram University'],
  },
];

export default function JosaaBarchPredictorTeaser() {
  return (
    <QuickCheck
      headingId="josaa-barch-quick-check"
      title={
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <AccountBalanceOutlinedIcon aria-hidden sx={{ fontSize: 22, color: tokens.gold800 }} />
          21 JoSAA institutes covered
        </Box>
      }
    >
      <Typography sx={{ fontSize: '1rem', color: tokens.inkMuted, lineHeight: 1.5 }}>
        Real closing-rank data from JoSAA 2023, 2024 and 2025 across IITs, NITs, SPAs and GFTIs that
        admit B.Arch students via JEE Main Paper 2A.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {INSTITUTE_GROUPS.map((group) => (
          <Box key={group.type}>
            <Typography
              component="h3"
              sx={{
                m: 0,
                fontFamily: tokens.fontMono,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: tokens.gold800,
              }}
            >
              {group.type} ({group.institutes.length})
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {group.institutes.map((name) => (
                <Box
                  component="li"
                  key={name}
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    border: `1px solid ${tokens.line}`,
                    borderRadius: `${tokens.radiusPill}px`,
                    fontSize: '0.8125rem',
                    lineHeight: 1.4,
                    color: tokens.ink,
                  }}
                >
                  {name}
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: '0.8125rem', color: tokens.inkMuted, textAlign: 'center' }}>
        Free • Sign in with phone OTP to see your full results
      </Typography>

      <CtaButton href={FULL_TOOL} external fullWidth>
        Open Predictor in App
      </CtaButton>
    </QuickCheck>
  );
}
