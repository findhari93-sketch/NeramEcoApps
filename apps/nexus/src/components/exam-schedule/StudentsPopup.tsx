'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  Drawer,
  Divider,
  alpha,
  useTheme,
  useMediaQuery,
  IconButton,
} from '@neram/ui';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import type { StudentSummary } from '@/types/exam-schedule';

interface StudentsPopupProps {
  open: boolean;
  onClose: () => void;
  mode: 'all' | 'submitted';
  students: StudentSummary[];
  submittedStudents?: StudentSummary[];
  totalStudents: number;
}

type YearFilter = 'all' | '2025-26' | 'future';

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || '?').toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = ['#6C63FF', '#FF6584', '#43AA8B', '#F9C74F', '#4CC9F0', '#F77F00', '#9B5DE5', '#00BBF9'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function StudentRow({ student }: { student: StudentSummary }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1.25,
        px: 0.5,
        borderRadius: 1.5,
        '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
      }}
    >
      <Avatar
        sx={{
          width: 36,
          height: 36,
          fontSize: '0.8rem',
          fontWeight: 700,
          bgcolor: student.not_this_year
            ? alpha(theme.palette.text.primary, 0.15)
            : getAvatarColor(student.name),
          flexShrink: 0,
        }}
      >
        {getInitials(student.name)}
      </Avatar>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            sx={{ color: student.not_this_year ? 'text.secondary' : 'text.primary' }}
          >
            {student.name}
          </Typography>
          {student.academic_year && (
            <Chip
              label={student.academic_year}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: student.not_this_year
                  ? alpha(theme.palette.text.primary, 0.06)
                  : alpha(theme.palette.primary.main, 0.08),
                color: student.not_this_year ? 'text.disabled' : 'primary.main',
              }}
            />
          )}
        </Box>

        {student.not_this_year ? (
          <Typography variant="caption" color="text.disabled">
            Not writing this year
          </Typography>
        ) : student.has_date && student.exam_date ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {formatDate(student.exam_date)}
            </Typography>
            {student.exam_city && (
              <>
                <Typography variant="caption" color="text.disabled">·</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <LocationOnOutlinedIcon sx={{ fontSize: '0.65rem', color: 'text.disabled' }} />
                  <Typography variant="caption" color="text.secondary">{student.exam_city}</Typography>
                </Box>
              </>
            )}
          </Box>
        ) : (
          <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 500 }}>
            No date yet
          </Typography>
        )}
      </Box>

      {/* Session chip */}
      {student.has_date && student.exam_session && (
        <Chip
          icon={student.exam_session === 'morning'
            ? <WbSunnyOutlinedIcon sx={{ fontSize: '0.75rem' }} />
            : <WbTwilightOutlinedIcon sx={{ fontSize: '0.75rem' }} />
          }
          label={student.exam_session === 'morning' ? 'AM' : 'PM'}
          size="small"
          variant="outlined"
          sx={{
            height: 24,
            fontSize: '0.65rem',
            fontWeight: 600,
            flexShrink: 0,
            '& .MuiChip-icon': { ml: 0.5 },
          }}
        />
      )}

      {/* Not this year badge */}
      {student.not_this_year && (
        <Chip
          label="Not this year"
          size="small"
          sx={{
            height: 22,
            fontSize: '0.6rem',
            fontWeight: 600,
            flexShrink: 0,
            bgcolor: alpha(theme.palette.text.primary, 0.06),
            color: 'text.disabled',
          }}
        />
      )}
    </Box>
  );
}

function AllStudentsContent({ students }: { students: StudentSummary[] }) {
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');

  const filtered = students.filter(s => {
    if (yearFilter === '2025-26') return s.academic_year === '2025-26';
    if (yearFilter === 'future') return s.not_this_year;
    return true;
  });

  // Sort: has date first (by date asc), no date second, not-this-year last
  const sorted = [...filtered].sort((a, b) => {
    if (a.not_this_year && !b.not_this_year) return 1;
    if (!a.not_this_year && b.not_this_year) return -1;
    if (a.has_date && !b.has_date) return -1;
    if (!a.has_date && b.has_date) return 1;
    return (a.exam_date || '').localeCompare(b.exam_date || '');
  });

  const filterOptions: { value: YearFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: '2025-26', label: '2025-26' },
    { value: 'future', label: 'Future years' },
  ];

  return (
    <Box>
      {/* Year filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {filterOptions.map(opt => (
          <Chip
            key={opt.value}
            label={opt.label}
            size="small"
            variant={yearFilter === opt.value ? 'filled' : 'outlined'}
            color={yearFilter === opt.value ? 'primary' : 'default'}
            onClick={() => setYearFilter(opt.value)}
            sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.72rem' }}
          />
        ))}
      </Box>

      {/* Student list */}
      <Box>
        {sorted.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No students match this filter
          </Typography>
        ) : (
          sorted.map(s => <StudentRow key={s.student_id} student={s} />)
        )}
      </Box>
    </Box>
  );
}

function SubmittedContent({ students, submittedStudents }: { students: StudentSummary[]; submittedStudents: StudentSummary[] }) {
  const notSubmitted = students.filter(s => !s.has_date);

  return (
    <Box>
      {/* Submitted section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Submitted
        </Typography>
        <Chip label={submittedStudents.length} size="small"
          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
      </Box>

      {submittedStudents.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, pl: 1 }}>
          No submissions yet
        </Typography>
      ) : (
        submittedStudents.map(s => <StudentRow key={s.student_id} student={s} />)
      )}

      {notSubmitted.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Yet to Submit
            </Typography>
            <Chip label={notSubmitted.length} size="small"
              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
          </Box>
          {notSubmitted.map(s => <StudentRow key={s.student_id} student={s} />)}
        </>
      )}
    </Box>
  );
}

export default function StudentsPopup({
  open,
  onClose,
  mode,
  students,
  submittedStudents = [],
  totalStudents,
}: StudentsPopupProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const title = mode === 'all'
    ? `All Students (${totalStudents})`
    : `Submitted (${submittedStudents.length}/${totalStudents})`;

  const content = (
    <Box>
      {/* Drag handle (mobile only) */}
      {isMobile && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
          <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.15) }} />
        </Box>
      )}

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: isMobile ? 1 : 0, pb: 1.5 }}>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1rem' }}>
          {title}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ ml: 1 }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      <Box sx={{ px: 2, py: 1.5, maxHeight: isMobile ? '65vh' : '55vh', overflowY: 'auto' }}>
        {mode === 'all' ? (
          <AllStudentsContent students={students} />
        ) : (
          <SubmittedContent students={students} submittedStudents={submittedStudents} />
        )}
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '80vh',
          },
        }}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ p: 0 }}>
        {content}
      </DialogTitle>
      <DialogContent sx={{ p: 0 }} />
    </Dialog>
  );
}
