'use client';

import { Box, Typography } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import type { Mode } from '@/lib/assistant/types';

/**
 * Says an answer was written by the model, and in which mode. A label, not a
 * control: no hit area, no hover, no border or fill. Exam help answers come from
 * the question bank tools; My Nexus answers come from the student's own data.
 */
export default function ModeChip({ mode }: { mode: Mode }) {
  const exam = mode === 'exam';
  const Icon = exam ? SchoolOutlinedIcon : AutoAwesomeOutlinedIcon;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, color: 'text.secondary' }}>
      <Icon sx={{ fontSize: 16 }} aria-hidden />
      <Typography component="span" variant="caption" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{exam ? 'Exam help' : 'My Nexus'}</Typography>
    </Box>
  );
}
