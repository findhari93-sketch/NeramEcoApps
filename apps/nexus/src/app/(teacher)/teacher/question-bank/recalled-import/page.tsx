'use client';

import { Box, Typography, IconButton, Alert } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';

export default function RecalledImportPage() {
  const router = useRouter();

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: { xs: 1, md: 2 },
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          bgcolor: 'background.default',
          zIndex: 10,
        }}
      >
        <IconButton size="small" onClick={() => router.push('/teacher/question-bank')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700} fontSize={{ xs: '1rem', md: '1.25rem' }}>
          Import Recalled Questions
        </Typography>
      </Box>

      <Box sx={{ p: { xs: 1.5, md: 3 } }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Review exam recall threads and promote them to the Question Bank with a confidence tier.
          Tier 1 (Verified) questions will be available for student practice.
          Tier 2 (Recalled) questions will be visible for reference.
          Tier 3 (Topic Signal) will appear only in Topic Intelligence.
        </Alert>

        <Typography variant="body2" color="text.secondary">
          Go to the Exam Recall dashboard to review student submissions, then use the
          &quot;Promote to QB&quot; action to add questions here with a confidence tier.
        </Typography>
      </Box>
    </Box>
  );
}
