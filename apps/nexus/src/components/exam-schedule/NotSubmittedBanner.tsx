'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Collapse,
  alpha,
  useTheme,
  IconButton,
} from '@neram/ui';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import type { ExamScheduleNotSubmitted } from '@/types/exam-schedule';

interface NotSubmittedBannerProps {
  students: ExamScheduleNotSubmitted[];
  isTeacher: boolean;
  currentUserId: string;
  onRemind: (ids: string[]) => void;
  onAddMyDate: () => void;
  reminding: boolean;
}

export default function NotSubmittedBanner({
  students,
  isTeacher,
  currentUserId,
  onRemind,
  onAddMyDate,
  reminding,
}: NotSubmittedBannerProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (students.length === 0) return null;

  const iAmInList = students.some((s) => s.id === currentUserId);

  // Student view: only show if they haven't submitted
  if (!isTeacher && !iAmInList) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.5 },
        bgcolor: alpha(theme.palette.warning.main, 0.06),
        borderColor: alpha(theme.palette.warning.main, 0.3),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <WarningAmberOutlinedIcon sx={{ color: 'warning.main', fontSize: '1.5rem' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {isTeacher ? (
            <Typography variant="body2" fontWeight={600}>
              {students.length} student{students.length !== 1 ? 's' : ''} haven&apos;t submitted exam dates
            </Typography>
          ) : (
            <Typography variant="body2" fontWeight={600}>
              You haven&apos;t submitted your exam date yet
            </Typography>
          )}
        </Box>
        {isTeacher ? (
          <IconButton
            size="small"
            onClick={() => setExpanded(!expanded)}
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        ) : (
          <Button
            variant="contained"
            size="small"
            onClick={onAddMyDate}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 40 }}
          >
            Add Now
          </Button>
        )}
      </Box>

      {/* Teacher: expandable student list */}
      {isTeacher && (
        <Collapse in={expanded}>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {students.map((student) => (
              <Box
                key={student.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1,
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {student.name}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => onRemind([student.id])}
                  disabled={reminding}
                  sx={{ minWidth: 40, minHeight: 40 }}
                  title="Send reminder"
                >
                  <NotificationsActiveOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
              </Box>
            ))}
            <Button
              variant="outlined"
              size="small"
              startIcon={<NotificationsActiveOutlinedIcon />}
              onClick={() => onRemind([])}
              disabled={reminding}
              sx={{ textTransform: 'none', fontWeight: 600, mt: 1, minHeight: 44 }}
            >
              {reminding ? 'Sending...' : 'Remind All'}
            </Button>
          </Box>
        </Collapse>
      )}
    </Paper>
  );
}
