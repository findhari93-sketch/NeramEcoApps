'use client';

import { Box, Typography, Button, alpha, useTheme } from '@neram/ui';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import { useRouter } from 'next/navigation';
import StudentAvatar from '@/components/students/StudentAvatar';
import type { RecentlyCompletedStudent } from '@/types/exam-schedule';

/**
 * Who has just sat the exam, as faces.
 *
 * Was a stacked AvatarGroup of hand-coloured initials, which overlapped the one
 * thing worth seeing here. Each face now wears the info ring, so a glance says
 * which of them is a Break Year student and which is still in Class 11.
 *
 * Three faces rather than four: a ring reserves size + 8, so an un-stacked row
 * is about twice the width of an overlapped one, and the strip has to survive
 * 375px alongside its caption and its button. The rest go to the "+N more".
 *
 * On the student route there is no facts provider, so every face here falls back
 * to a plain avatar. That is deliberate: a classmate must not read dormancy.
 */
const FACES_SHOWN = 3;

interface RecentlyCompletedStripProps {
  students: RecentlyCompletedStudent[];
  isTeacher: boolean;
}

export default function RecentlyCompletedStrip({ students, isTeacher }: RecentlyCompletedStripProps) {
  const theme = useTheme();
  const router = useRouter();

  if (students.length === 0) return null;

  const recallPath = isTeacher ? '/teacher/exam-recall' : '/student/exam-recall';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.5,
        rowGap: 0.5,
        px: 2,
        py: 1,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.success.main, 0.06),
      }}
    >
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ flexShrink: 0 }}>
        Recently completed
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
        {students.slice(0, FACES_SHOWN).map((s) => (
          <StudentAvatar
            key={s.student_id}
            userId={s.student_id}
            name={s.name}
            size={28}
            tapToView={false}
          />
        ))}
      </Box>
      {students.length > FACES_SHOWN && (
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          +{students.length - FACES_SHOWN} more
        </Typography>
      )}
      <Button
        size="small"
        variant="text"
        endIcon={<ArrowForwardOutlinedIcon sx={{ fontSize: '0.9rem' }} />}
        onClick={() => router.push(recallPath)}
        sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, ml: 'auto', minHeight: 32 }}
      >
        Exam Recall
      </Button>
    </Box>
  );
}
