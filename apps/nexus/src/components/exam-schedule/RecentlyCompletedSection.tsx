'use client';

import { Box, Typography, Paper, Button, Chip, alpha, useTheme } from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import { useRouter } from 'next/navigation';
import type { ExamScheduleRecentlyCompleted } from '@/types/exam-schedule';

interface RecentlyCompletedSectionProps {
  students: ExamScheduleRecentlyCompleted[];
  isTeacher: boolean;
  currentUserId: string;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export default function RecentlyCompletedSection({ students, isTeacher, currentUserId }: RecentlyCompletedSectionProps) {
  const theme = useTheme();
  const router = useRouter();

  if (students.length === 0) return null;

  // Group by completion date
  const grouped: Record<string, ExamScheduleRecentlyCompleted[]> = {};
  for (const s of students) {
    const dateKey = s.completed_at.split('T')[0];
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(s);
  }

  const recallPath = isTeacher ? '/teacher/exam-recall' : '/student/exam-recall';

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Recently Completed
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.5 },
          bgcolor: alpha(theme.palette.success.main, 0.04),
          borderColor: alpha(theme.palette.success.main, 0.2),
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.entries(grouped).map(([dateKey, group]) => (
            <Box key={dateKey}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <CheckCircleOutlinedIcon sx={{ color: 'success.main', fontSize: '1.1rem' }} />
                <Typography variant="body2" fontWeight={600}>
                  {formatRelativeDate(dateKey)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, pl: 3.5 }}>
                {group.map((s) => {
                  const isMe = s.student_id === currentUserId;
                  return (
                    <Chip
                      key={s.student_id}
                      label={`${s.name}${s.city ? ` (${s.city})` : ''}${isMe ? ' - You' : ''}`}
                      size="small"
                      color={isMe ? 'primary' : 'default'}
                      variant={isMe ? 'filled' : 'outlined'}
                      sx={{ fontSize: '0.75rem' }}
                    />
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>

        <Button
          variant="text"
          size="small"
          endIcon={<ArrowForwardOutlinedIcon />}
          onClick={() => router.push(recallPath)}
          sx={{ textTransform: 'none', fontWeight: 600, mt: 2, minHeight: 44 }}
        >
          Contribute to Exam Recall
        </Button>
      </Paper>
    </Box>
  );
}
