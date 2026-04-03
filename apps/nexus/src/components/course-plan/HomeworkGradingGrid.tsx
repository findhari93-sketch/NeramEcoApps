'use client';

import { useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@neram/ui';

// ---- Types ----

export interface HomeworkItem {
  id: string;
  title: string;
  type?: string;
  max_points?: number | null;
  due_date?: string | null;
  sort_order?: number;
  session?: { id: string; day_number?: number; title?: string } | null;
}

export interface StudentItem {
  id: string;
  name: string;
  email?: string | null;
  avatar_url?: string | null;
}

export interface SubmissionItem {
  id: string;
  homework_id: string;
  student_id: string;
  status: string; // pending | submitted | reviewed | returned | viewed
  points_earned?: number | null;
  teacher_feedback?: string | null;
  text_response?: string | null;
  attachments?: any[];
  submitted_at?: string | null;
  reviewed_at?: string | null;
}

interface HomeworkGradingGridProps {
  homework: HomeworkItem[];
  students: StudentItem[];
  submissions: SubmissionItem[];
  onCellClick: (submission: SubmissionItem | null, homework: HomeworkItem, student: StudentItem) => void;
}

// ---- Helpers ----

const STATUS_COLORS: Record<string, string> = {
  reviewed: '#e8f5e9',   // green
  submitted: '#e3f2fd',  // blue
  returned: '#fff3e0',   // orange
  viewed: '#f3e5f5',     // purple-ish
  pending: 'transparent',
};

const STATUS_LABELS: Record<string, string> = {
  reviewed: 'Reviewed',
  submitted: 'Submitted',
  returned: 'Returned',
  viewed: 'Viewed',
  pending: '—',
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---- Component ----

export default function HomeworkGradingGrid({
  homework,
  students,
  submissions,
  onCellClick,
}: HomeworkGradingGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Build a lookup: submissionMap[studentId][homeworkId] → submission
  const submissionMap = useMemo(() => {
    const map: Record<string, Record<string, SubmissionItem>> = {};
    for (const s of submissions) {
      if (!map[s.student_id]) map[s.student_id] = {};
      map[s.student_id][s.homework_id] = s;
    }
    return map;
  }, [submissions]);

  // Per-student overall percentage
  const studentOverall = useMemo(() => {
    const result: Record<string, number | null> = {};
    for (const student of students) {
      let totalMax = 0;
      let totalEarned = 0;
      let hasAny = false;
      for (const hw of homework) {
        const sub = submissionMap[student.id]?.[hw.id];
        if (sub && sub.points_earned != null && hw.max_points) {
          totalMax += hw.max_points;
          totalEarned += sub.points_earned;
          hasAny = true;
        }
      }
      result[student.id] = hasAny && totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : null;
    }
    return result;
  }, [homework, students, submissionMap]);

  // Class average per homework
  const classAverage = useMemo(() => {
    const result: Record<string, number | null> = {};
    for (const hw of homework) {
      let count = 0;
      let total = 0;
      for (const student of students) {
        const sub = submissionMap[student.id]?.[hw.id];
        if (sub && sub.points_earned != null && hw.max_points) {
          total += (sub.points_earned / hw.max_points) * 100;
          count++;
        }
      }
      result[hw.id] = count > 0 ? Math.round(total / count) : null;
    }
    return result;
  }, [homework, students, submissionMap]);

  const stickyColWidth = isMobile ? 160 : 220;

  if (homework.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="body1" color="text.secondary">
          No homework assigned yet.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer
      sx={{
        maxHeight: 'calc(100vh - 240px)',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Table stickyHeader size={isMobile ? 'small' : 'medium'}>
        {/* ---- Header ---- */}
        <TableHead>
          <TableRow>
            {/* Student column header */}
            <TableCell
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 3,
                bgcolor: 'background.paper',
                minWidth: stickyColWidth,
                maxWidth: stickyColWidth,
                fontWeight: 700,
                borderRight: '2px solid',
                borderRightColor: 'divider',
              }}
            >
              Student
            </TableCell>

            {/* Overall column */}
            <TableCell
              align="center"
              sx={{
                fontWeight: 700,
                minWidth: 70,
                bgcolor: 'background.paper',
              }}
            >
              Overall
            </TableCell>

            {/* One column per homework */}
            {homework.map((hw) => (
              <TableCell
                key={hw.id}
                align="center"
                sx={{
                  fontWeight: 600,
                  minWidth: isMobile ? 100 : 120,
                  whiteSpace: 'nowrap',
                  bgcolor: 'background.paper',
                }}
              >
                <Tooltip title={hw.title} arrow>
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: isMobile ? 90 : 110,
                      }}
                    >
                      {hw.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
                      {formatDate(hw.due_date)}
                      {hw.max_points ? ` / ${hw.max_points}pts` : ''}
                    </Typography>
                  </Box>
                </Tooltip>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {/* ---- Class Average Row ---- */}
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 2,
                bgcolor: 'action.hover',
                fontWeight: 700,
                borderRight: '2px solid',
                borderRightColor: 'divider',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Class Average
              </Typography>
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 700 }}>
              —
            </TableCell>
            {homework.map((hw) => (
              <TableCell key={hw.id} align="center" sx={{ fontWeight: 700 }}>
                {classAverage[hw.id] != null ? `${classAverage[hw.id]}%` : '—'}
              </TableCell>
            ))}
          </TableRow>

          {/* ---- Student Rows ---- */}
          {students.map((student) => (
            <TableRow key={student.id} hover>
              {/* Student name - sticky */}
              <TableCell
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  bgcolor: 'background.paper',
                  borderRight: '2px solid',
                  borderRightColor: 'divider',
                  minWidth: stickyColWidth,
                  maxWidth: stickyColWidth,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    src={student.avatar_url || undefined}
                    sx={{ width: 28, height: 28, fontSize: '0.75rem' }}
                  >
                    {getInitials(student.name)}
                  </Avatar>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {student.name}
                  </Typography>
                </Box>
              </TableCell>

              {/* Overall % */}
              <TableCell align="center">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {studentOverall[student.id] != null ? `${studentOverall[student.id]}%` : '—'}
                </Typography>
              </TableCell>

              {/* Homework cells */}
              {homework.map((hw) => {
                const sub = submissionMap[student.id]?.[hw.id] || null;
                const status = sub?.status || 'pending';
                const bgColor = STATUS_COLORS[status] || 'transparent';

                return (
                  <TableCell
                    key={hw.id}
                    align="center"
                    onClick={() => onCellClick(sub, hw, student)}
                    sx={{
                      bgcolor: bgColor,
                      cursor: 'pointer',
                      minHeight: 48,
                      '&:hover': {
                        outline: `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: -2,
                      },
                      transition: 'outline 150ms ease',
                    }}
                  >
                    {sub && sub.points_earned != null && hw.max_points ? (
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {sub.points_earned}/{hw.max_points}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        {STATUS_LABELS[status] || status}
                      </Typography>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}

          {students.length === 0 && (
            <TableRow>
              <TableCell colSpan={homework.length + 2} sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  No students enrolled.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
