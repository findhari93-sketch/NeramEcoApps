import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import VerifiedIcon from '@mui/icons-material/Verified';

interface ClaimProfileCTAProps {
  collegeSlug: string;
  collegeName: string;
}

export default function ClaimProfileCTA({ collegeName }: ClaimProfileCTAProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2.5, sm: 3 },
        borderRadius: 2,
        borderColor: '#7c3aed',
        background: 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: '#ede9fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#7c3aed',
          }}
        >
          <BusinessIcon />
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Are you from {collegeName}?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Claim this profile to update details, add photos, respond to queries, and get leads from interested students.
          </Typography>
          <Stack direction="row" gap={1} sx={{ mt: 1 }} flexWrap="wrap">
            {['Verified badge', 'Lead notifications', 'Profile analytics'].map((f) => (
              <Stack key={f} direction="row" alignItems="center" gap={0.25}>
                <VerifiedIcon sx={{ fontSize: 13, color: '#7c3aed' }} />
                <Typography variant="caption" color="text.secondary">{f}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Button
          variant="contained"
          href="/contact"
          sx={{
            bgcolor: '#7c3aed',
            '&:hover': { bgcolor: '#6d28d9' },
            borderRadius: 2,
            px: 3,
            py: 1.25,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Claim Profile
        </Button>
      </Stack>
    </Paper>
  );
}
