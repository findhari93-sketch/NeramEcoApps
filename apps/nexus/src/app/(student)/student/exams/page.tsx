'use client';

import { Box, Typography } from '@neram/ui';
import ExamSelectionPanel from '@/components/documents/ExamSelectionPanel';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

export default function ExamsPage() {
  const { activeClassroom, getToken } = useNexusAuthContext();

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Exam Tracker
      </Typography>
      <ExamSelectionPanel
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
      />
    </Box>
  );
}
