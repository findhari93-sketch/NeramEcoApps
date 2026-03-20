'use client';

import { useState } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Typography,
  Skeleton,
} from '@neram/ui';
import { useTheme, alpha } from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import EngineeringIcon from '@mui/icons-material/Engineering';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { QBExamTree, QBExamTreeExam, QBExamTreeYear } from '@neram/database';

interface ExamSidebarProps {
  examTree: QBExamTree | null;
  loading: boolean;
  selectedExam: string | null;
  selectedYear: number | null;
  selectedSession: string | null;
  onSelect: (exam: string | null, year: number | null, session: string | null) => void;
}

const EXAM_ICONS: Record<string, React.ReactNode> = {
  NATA: <SchoolIcon fontSize="small" />,
  JEE_PAPER_2: <EngineeringIcon fontSize="small" />,
};

function capitalizeSession(session: string): string {
  return session.charAt(0).toUpperCase() + session.slice(1).toLowerCase();
}

export default function ExamSidebar({
  examTree,
  loading,
  selectedExam,
  selectedYear,
  selectedSession,
  onSelect,
}: ExamSidebarProps) {
  const theme = useTheme();
  const [expandedExams, setExpandedExams] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

  const toggleExamExpand = (examType: string) => {
    setExpandedExams((prev) => {
      const next = new Set(prev);
      if (next.has(examType)) {
        next.delete(examType);
      } else {
        next.add(examType);
      }
      return next;
    });
  };

  const toggleYearExpand = (key: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExamClick = (examType: string) => {
    toggleExamExpand(examType);
    onSelect(examType, null, null);
  };

  const handleYearClick = (examType: string, year: number, hasSessions: boolean) => {
    if (hasSessions) {
      toggleYearExpand(`${examType}-${year}`);
    }
    onSelect(examType, year, null);
  };

  const handleSessionClick = (examType: string, year: number, session: string) => {
    onSelect(examType, year, session);
  };

  const isExamSelected = (examType: string) =>
    selectedExam === examType && selectedYear === null && selectedSession === null;

  const isYearSelected = (examType: string, year: number) =>
    selectedExam === examType && selectedYear === year && selectedSession === null;

  const isSessionSelected = (examType: string, year: number, session: string) =>
    selectedExam === examType && selectedYear === year && selectedSession === session;

  if (loading) {
    return (
      <Box
        sx={{
          width: 260,
          height: '100%',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          p: 2,
        }}
      >
        <Skeleton variant="text" width="60%" height={28} sx={{ mb: 2 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1, borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 260,
        height: '100%',
        overflowY: 'auto',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          Exam Papers
        </Typography>
      </Box>

      <List disablePadding dense>
        {examTree?.exams.map((exam: QBExamTreeExam) => {
          const examExpanded = expandedExams.has(exam.exam_type);

          return (
            <Box key={exam.exam_type}>
              {/* Exam level */}
              <ListItemButton
                onClick={() => handleExamClick(exam.exam_type)}
                selected={isExamSelected(exam.exam_type)}
                sx={{
                  px: 2,
                  py: 0.75,
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                    },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {EXAM_ICONS[exam.exam_type] || <SchoolIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText
                  primary={exam.label}
                  secondary={`${exam.total_count} questions`}
                  primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                  secondaryTypographyProps={{ fontSize: '0.7rem' }}
                />
                {examExpanded ? (
                  <ExpandMoreIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                ) : (
                  <ChevronRightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                )}
              </ListItemButton>

              {/* Year level */}
              <Collapse in={examExpanded} timeout="auto" unmountOnExit>
                <List disablePadding dense>
                  {exam.years.map((yearEntry: QBExamTreeYear) => {
                    const yearKey = `${exam.exam_type}-${yearEntry.year}`;
                    const yearExpanded = expandedYears.has(yearKey);
                    const hasSessions = yearEntry.sessions.length > 0;

                    return (
                      <Box key={yearEntry.year}>
                        <ListItemButton
                          onClick={() => handleYearClick(exam.exam_type, yearEntry.year, hasSessions)}
                          selected={isYearSelected(exam.exam_type, yearEntry.year)}
                          sx={{
                            pl: 4,
                            pr: 2,
                            py: 0.5,
                            '&.Mui-selected': {
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                              '&:hover': {
                                bgcolor: alpha(theme.palette.primary.main, 0.12),
                              },
                            },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={`${yearEntry.year} (${yearEntry.count})`}
                            primaryTypographyProps={{ fontSize: '0.8125rem' }}
                          />
                          {hasSessions && (
                            yearExpanded ? (
                              <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                            ) : (
                              <ChevronRightIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                            )
                          )}
                        </ListItemButton>

                        {/* Session level */}
                        {hasSessions && (
                          <Collapse in={yearExpanded} timeout="auto" unmountOnExit>
                            <List disablePadding dense>
                              {yearEntry.sessions.map((sess) => (
                                <ListItemButton
                                  key={sess.session}
                                  onClick={() => handleSessionClick(exam.exam_type, yearEntry.year, sess.session)}
                                  selected={isSessionSelected(exam.exam_type, yearEntry.year, sess.session)}
                                  sx={{
                                    pl: 7,
                                    pr: 2,
                                    py: 0.4,
                                    '&.Mui-selected': {
                                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                                      '&:hover': {
                                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                                      },
                                    },
                                  }}
                                >
                                  <ListItemIcon sx={{ minWidth: 24 }}>
                                    <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={`${capitalizeSession(sess.session)} (${sess.count})`}
                                    primaryTypographyProps={{ fontSize: '0.75rem' }}
                                  />
                                </ListItemButton>
                              ))}
                            </List>
                          </Collapse>
                        )}
                      </Box>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>
    </Box>
  );
}
