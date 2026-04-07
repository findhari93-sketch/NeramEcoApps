'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Popover,
  alpha,
  useTheme,
} from '@neram/ui';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import type { NotSubmittedStudent } from '@/types/exam-schedule';

interface NotSubmittedNudgeProps {
  students: NotSubmittedStudent[];
  isTeacher: boolean;
  currentUserId: string;
  onAddMyDate: () => void;
  onRemind: (ids: string[]) => void;
  reminding: boolean;
}

export default function NotSubmittedNudge({
  students,
  isTeacher,
  currentUserId,
  onAddMyDate,
  onRemind,
  reminding,
}: NotSubmittedNudgeProps) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (students.length === 0) return null;

  const iAmInList = students.some((s) => s.id === currentUserId);

  // Students only see this if they haven't submitted
  if (!isTeacher && !iAmInList) return null;

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderLeft: `3px solid ${theme.palette.warning.main}`,
          bgcolor: alpha(theme.palette.warning.main, 0.04),
          minHeight: 48,
        }}
      >
        <InfoOutlinedIcon sx={{ color: 'warning.main', fontSize: '1.2rem', flexShrink: 0 }} />
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {isTeacher
            ? <><strong>{students.length}</strong> student{students.length !== 1 ? 's' : ''} haven&apos;t picked a date</>
            : <>You haven&apos;t picked your exam date yet</>
          }
        </Typography>
        {isTeacher ? (
          <Button
            size="small"
            variant="outlined"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36, flexShrink: 0 }}
          >
            View
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            onClick={onAddMyDate}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36, flexShrink: 0 }}
          >
            Pick Now
          </Button>
        )}
      </Paper>

      {/* Teacher popover with student list */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 300, maxHeight: 400 } } }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
          Not Submitted ({students.length})
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
          {students.map((s) => (
            <Typography key={s.id} variant="body2" sx={{ py: 0.25 }}>
              {s.name}
            </Typography>
          ))}
        </Box>
        <Button
          fullWidth
          variant="outlined"
          size="small"
          startIcon={<NotificationsActiveOutlinedIcon />}
          onClick={() => { onRemind([]); setAnchorEl(null); }}
          disabled={reminding}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 40 }}
        >
          {reminding ? 'Sending...' : 'Remind All'}
        </Button>
      </Popover>
    </>
  );
}
