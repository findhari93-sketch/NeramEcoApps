'use client';

import { useRouter } from 'next/navigation';
import { Box, Typography, IconButton } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TopicIntelligenceList from '@/components/question-bank/TopicIntelligenceList';

export default function TopicIntelligencePage() {
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
        <IconButton size="small" onClick={() => router.push('/student/question-bank')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700} fontSize={{ xs: '1rem', md: '1.25rem' }}>
          Topic Intelligence
        </Typography>
      </Box>

      {/* Info banner */}
      <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Topics sorted by how often they appear across NATA sessions. Focus on Critical and High priority topics for maximum exam coverage.
        </Typography>
      </Box>

      {/* Topic list */}
      <TopicIntelligenceList />
    </Box>
  );
}
