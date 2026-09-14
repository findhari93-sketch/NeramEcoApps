'use client';

import { useRouter } from 'next/navigation';
import { Box, Typography, IconButton } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RecalledPaperBrowser from '@/components/question-bank/RecalledPaperBrowser';
import { qbExamPath } from '@/lib/qb-exam-routes';

export default function RecalledPapersPage() {
  const router = useRouter();

  const handleSessionClick = (paperId: string, session: string) => {
    router.push(
      // `exam`, not `exam_type`: the questions page reads `exam`, so this link
      // used to open an unscoped search across both exams.
      `/student/question-bank/questions?exam=NATA&session=${encodeURIComponent(session)}&paper_source=recalled`
    );
  };

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
        <IconButton
          onClick={() => router.push(qbExamPath('student', 'NATA'))}
          aria-label="Back to NATA Question Bank"
          sx={{ width: 44, height: 44 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700} fontSize={{ xs: '1rem', md: '1.25rem' }}>
          NATA Recalled Papers
        </Typography>
      </Box>

      {/* Info banner */}
      <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Questions recalled by students after NATA exam sessions. Verified questions can be practiced; recalled questions are for reference.
        </Typography>
      </Box>

      {/* Session list */}
      <RecalledPaperBrowser onSessionClick={handleSessionClick} />
    </Box>
  );
}
