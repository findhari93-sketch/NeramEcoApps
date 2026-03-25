'use client';

import { Box, Typography, Button, Paper, Divider } from '@neram/ui';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';

interface WelcomeStepProps {
  userName: string;
  onNext: () => void;
}

const rules = [
  {
    icon: <DescriptionOutlinedIcon sx={{ color: 'primary.main' }} />,
    title: 'Identity Verification',
    desc: 'Upload your Aadhaar card, passport photo, and signature for verification.',
  },
  {
    icon: <DevicesOutlinedIcon sx={{ color: 'primary.main' }} />,
    title: '2-Device Limit',
    desc: 'You can use Nexus on 1 laptop/desktop + 1 mobile phone only.',
  },
  {
    icon: <VerifiedUserOutlinedIcon sx={{ color: 'primary.main' }} />,
    title: 'Admin Review',
    desc: 'Your documents will be reviewed. You\'ll get full access once approved.',
  },
  {
    icon: <GavelOutlinedIcon sx={{ color: 'primary.main' }} />,
    title: 'Terms of Use',
    desc: 'Using unregistered devices or sharing accounts may result in access termination.',
  },
];

export default function WelcomeStep({ userName, onNext }: WelcomeStepProps) {
  const firstName = userName?.split(' ')[0] || 'Student';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Hero */}
      <Box sx={{ textAlign: 'center', pt: { xs: 2, sm: 4 } }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            fontSize: { xs: '1.5rem', sm: '2rem' },
            mb: 1,
          }}
        >
          Welcome, {firstName}!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
          Before you begin using Nexus, we need to verify your identity and set up your account.
        </Typography>
      </Box>

      {/* Rules */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          What you&apos;ll need to do
        </Typography>

        {rules.map((rule, i) => (
          <Box key={rule.title}>
            <Box sx={{ display: 'flex', gap: 2, py: 1.5, alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  bgcolor: 'primary.50',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {rule.icon}
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {rule.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {rule.desc}
                </Typography>
              </Box>
            </Box>
            {i < rules.length - 1 && <Divider />}
          </Box>
        ))}
      </Paper>

      {/* CTA */}
      <Button
        variant="contained"
        size="large"
        onClick={onNext}
        sx={{
          py: 1.5,
          borderRadius: 2,
          fontWeight: 600,
          fontSize: '1rem',
          textTransform: 'none',
        }}
      >
        Let&apos;s Get Started
      </Button>
    </Box>
  );
}
