'use client';

import { Box, Typography, Avatar, AvatarGroup, Button, alpha, useTheme } from '@neram/ui';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import { useRouter } from 'next/navigation';
import type { RecentlyCompletedStudent } from '@/types/exam-schedule';

interface RecentlyCompletedStripProps {
  students: RecentlyCompletedStudent[];
  isTeacher: boolean;
}

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || '?').toUpperCase();
}

function getColor(name: string): string {
  const colors = ['#6C63FF', '#FF6584', '#43AA8B', '#F9C74F', '#4CC9F0', '#F77F00', '#9B5DE5', '#00BBF9'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
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
        gap: 1.5,
        px: 2,
        py: 1,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.success.main, 0.06),
      }}
    >
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ flexShrink: 0 }}>
        Recently completed
      </Typography>
      <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: '0.6rem' } }}>
        {students.map((s) => (
          <Avatar key={s.student_id} sx={{ bgcolor: getColor(s.name) }}>
            {getInitials(s.name)}
          </Avatar>
        ))}
      </AvatarGroup>
      {students.length > 4 && (
        <Typography variant="caption" color="text.secondary">
          +{students.length - 4} more
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
