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
  Button,
} from '@neram/ui';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import type { StudentSummary, ExamIntentBuckets } from '@/types/exam-schedule';

interface StudentsPopupProps {
  open: boolean;
  onClose: () => void;
  mode: 'all' | 'submitted';
  students: StudentSummary[];
  submittedStudents?: StudentSummary[];
  totalStudents: number;
  isTeacher?: boolean;
  buckets?: ExamIntentBuckets;
}

type BucketFilter = 'all' | 'date_booked' | 'applied_no_date' | 'planning' | 'not_this_year' | 'no_response';

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

function filterByBucket(students: StudentSummary[], bucket: BucketFilter): StudentSummary[] {
  switch (bucket) {
    case 'date_booked':
      return students.filter(s => s.has_date);
    case 'applied_no_date':
      return students.filter(s => !s.has_date && s.plan_state === 'applied');
    case 'planning':
      return students.filter(s => !s.has_date && (s.plan_state === 'planning_to_write' || s.plan_state === 'still_thinking'));
    case 'not_this_year':
      return students.filter(s => s.plan_state === 'not_this_year');
    case 'no_response':
      return students.filter(s => !s.has_date && !s.plan_state);
    default:
      return students;
  }
}

function StudentRow({ student, bucket }: { student: StudentSummary; bucket: BucketFilter }) {
  const theme = useTheme();
  const isNotThisYear = student.plan_state === 'not_this_year';

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
          bgcolor: isNotThisYear ? alpha(theme.palette.text.primary, 0.15) : getAvatarColor(student.name),
          flexShrink: 0,
        }}
      >
        {getInitials(student.name)}
      </Avatar>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          sx={{ color: isNotThisYear ? 'text.secondary' : 'text.primary' }}
        >
          {student.name}
        </Typography>

        {/* Sub-info based on bucket */}
        {bucket === 'date_booked' && student.exam_date && (
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
        )}
        {bucket === 'applied_no_date' && (
          <Typography variant="caption" color="text.secondary">
            {student.application_number ? `App: ${student.application_number}` : 'Applied, no app number'}
          </Typography>
        )}
        {bucket === 'not_this_year' && (
          <Typography variant="caption" color="text.disabled">
            Writing in {student.target_year ?? 'future year'}
          </Typography>
        )}
        {(bucket === 'all') && (
          <Typography variant="caption" color="text.secondary">
            {isNotThisYear ? `Writing ${student.target_year ?? 'future'}` :
              student.has_date ? `${formatDate(student.exam_date!)}${student.exam_city ? ` in ${student.exam_city}` : ''}` :
              student.plan_state === 'applied' ? 'Applied, no date' :
              student.plan_state === 'planning_to_write' || student.plan_state === 'still_thinking' ? 'Planning to apply' :
              'No response'}
          </Typography>
        )}
      </Box>

      {/* Session chip for date-booked */}
      {student.has_date && student.exam_session && (
        <Chip
          icon={student.exam_session === 'morning'
            ? <WbSunnyOutlinedIcon sx={{ fontSize: '0.75rem' }} />
            : <WbTwilightOutlinedIcon sx={{ fontSize: '0.75rem' }} />
          }
          label={student.exam_session === 'morning' ? 'AM' : 'PM'}
          size="small"
          variant="outlined"
          sx={{ height: 24, fontSize: '0.65rem', fontWeight: 600, flexShrink: 0, '& .MuiChip-icon': { ml: 0.5 } }}
        />
      )}
    </Box>
  );
}

function CopyButton({ students }: { students: StudentSummary[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const names = students.map(s => s.name).join('\n');
    navigator.clipboard.writeText(names).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={copied ? <CheckOutlinedIcon /> : <ContentCopyOutlinedIcon />}
      onClick={handleCopy}
      color={copied ? 'success' : 'inherit'}
      sx={{ textTransform: 'none', fontWeight: 600, minHeight: 32, fontSize: '0.75rem' }}
    >
      {copied ? 'Copied!' : 'Copy Names'}
    </Button>
  );
}

function TeacherAllContent({ students, buckets }: { students: StudentSummary[]; buckets?: ExamIntentBuckets }) {
  const [bucket, setBucket] = useState<BucketFilter>('all');
  const filtered = filterByBucket(students, bucket);

  const filters: { value: BucketFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: students.length },
    { value: 'date_booked', label: 'Date Booked', count: buckets?.date_booked ?? students.filter(s => s.has_date).length },
    { value: 'applied_no_date', label: 'Applied', count: buckets?.applied_no_date ?? 0 },
    { value: 'planning', label: 'Planning', count: buckets?.planning ?? 0 },
    { value: 'not_this_year', label: 'Not This Year', count: buckets?.not_this_year ?? 0 },
    { value: 'no_response', label: 'No Response', count: buckets?.no_response ?? 0 },
  ];

  return (
    <Box>
      {/* Filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
        {filters.map(f => (
          <Chip
            key={f.value}
            label={`${f.label} (${f.count})`}
            size="small"
            variant={bucket === f.value ? 'filled' : 'outlined'}
            color={bucket === f.value ? 'primary' : 'default'}
            onClick={() => setBucket(f.value)}
            sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.7rem' }}
          />
        ))}
      </Box>

      {/* Copy button */}
      {filtered.length > 0 && (
        <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
          <CopyButton students={filtered} />
        </Box>
      )}

      {/* Student list */}
      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No students in this category
        </Typography>
      ) : (
        filtered.map(s => <StudentRow key={s.student_id} student={s} bucket={bucket} />)
      )}
    </Box>
  );
}

function SubmittedContent({ students, submittedStudents }: { students: StudentSummary[]; submittedStudents: StudentSummary[] }) {
  const notSubmitted = students.filter(s => !s.has_date && s.plan_state !== 'not_this_year');

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Submitted
        </Typography>
        <Chip label={submittedStudents.length} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
      </Box>

      {submittedStudents.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, pl: 1 }}>No submissions yet</Typography>
      ) : (
        submittedStudents.map(s => <StudentRow key={s.student_id} student={s} bucket="date_booked" />)
      )}

      {notSubmitted.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Yet to Submit
            </Typography>
            <Chip label={notSubmitted.length} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
          </Box>
          {notSubmitted.map(s => <StudentRow key={s.student_id} student={s} bucket="all" />)}
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
  isTeacher = false,
  buckets,
}: StudentsPopupProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const title = mode === 'all'
    ? `All Students (${totalStudents})`
    : `Submitted (${submittedStudents.length}/${totalStudents})`;

  const content = (
    <Box>
      {isMobile && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
          <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.15) }} />
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: isMobile ? 1 : 0, pb: 1.5 }}>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1rem' }}>{title}</Typography>
        <IconButton size="small" onClick={onClose} sx={{ ml: 1 }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      <Box sx={{ px: 2, py: 1.5, maxHeight: isMobile ? '65vh' : '55vh', overflowY: 'auto' }}>
        {mode === 'all' && isTeacher ? (
          <TeacherAllContent students={students} buckets={buckets} />
        ) : mode === 'all' ? (
          <TeacherAllContent students={students} buckets={buckets} />
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
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80vh' } }}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ p: 0 }}>{content}</DialogTitle>
      <DialogContent sx={{ p: 0 }} />
    </Dialog>
  );
}
