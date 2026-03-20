'use client';

import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Typography,
  Skeleton,
} from '@neram/ui';
import type { QBExamTree } from '@neram/database';

interface ExamMobileSelectorProps {
  examTree: QBExamTree | null;
  loading: boolean;
  selectedExam: string | null;
  selectedYear: number | null;
  selectedSession: string | null;
  onSelect: (exam: string | null, year: number | null, session: string | null) => void;
}

function capitalizeSession(session: string): string {
  return session.charAt(0).toUpperCase() + session.slice(1).toLowerCase();
}

export default function ExamMobileSelector({
  examTree,
  loading,
  selectedExam,
  selectedYear,
  selectedSession,
  onSelect,
}: ExamMobileSelectorProps) {
  const selectedExamData = examTree?.exams.find((e) => e.exam_type === selectedExam);
  const selectedYearData = selectedExamData?.years.find((y) => y.year === selectedYear);
  const hasSessions = (selectedYearData?.sessions.length ?? 0) > 0;

  const handleExamChange = (_: React.MouseEvent<HTMLElement>, value: string | null) => {
    if (value === null) {
      // Deselecting the current exam
      onSelect(null, null, null);
    } else {
      onSelect(value, null, null);
    }
  };

  const handleYearClick = (year: number) => {
    if (selectedYear === year) return; // already selected
    onSelect(selectedExam, year, null);
  };

  const handleSessionClick = (session: string) => {
    if (selectedSession === session) {
      // Deselect session
      onSelect(selectedExam, selectedYear, null);
    } else {
      onSelect(selectedExam, selectedYear, session);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          px: 2,
          py: 1,
        }}
      >
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1, mb: 0.5 }} />
        <Box sx={{ display: 'flex', gap: 0.5, overflow: 'hidden' }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" width={72} height={32} sx={{ borderRadius: 4 }} />
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        px: 2,
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      {/* Row 1: Exam toggle */}
      <ToggleButtonGroup
        value={selectedExam}
        exclusive
        onChange={handleExamChange}
        fullWidth
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8125rem',
            py: 0.75,
          },
        }}
      >
        {examTree?.exams.map((exam) => (
          <ToggleButton key={exam.exam_type} value={exam.exam_type}>
            {exam.label}
          </ToggleButton>
        )) ?? [
          <ToggleButton key="NATA" value="NATA">NATA</ToggleButton>,
          <ToggleButton key="JEE_PAPER_2" value="JEE_PAPER_2">JEE Paper 2</ToggleButton>,
        ]}
      </ToggleButtonGroup>

      {/* Prompt when no exam selected */}
      {!selectedExam && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 0.5 }}>
          Select an exam
        </Typography>
      )}

      {/* Row 2: Year chips (horizontal scroll) */}
      {selectedExam && selectedExamData && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            overflowX: 'auto',
            pb: 0.25,
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {selectedExamData.years.map((yearEntry) => (
            <Chip
              key={yearEntry.year}
              label={`${yearEntry.year} (${yearEntry.count})`}
              onClick={() => handleYearClick(yearEntry.year)}
              variant={selectedYear === yearEntry.year ? 'filled' : 'outlined'}
              color={selectedYear === yearEntry.year ? 'primary' : 'default'}
              size="small"
              sx={{ flexShrink: 0 }}
            />
          ))}
        </Box>
      )}

      {/* Row 3: Session chips (conditional, horizontal scroll) */}
      {selectedExam && selectedYear && hasSessions && selectedYearData && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            overflowX: 'auto',
            pb: 0.25,
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {selectedYearData.sessions.map((sess) => (
            <Chip
              key={sess.session}
              label={`${capitalizeSession(sess.session)} (${sess.count})`}
              onClick={() => handleSessionClick(sess.session)}
              variant={selectedSession === sess.session ? 'filled' : 'outlined'}
              color={selectedSession === sess.session ? 'primary' : 'default'}
              size="small"
              sx={{ flexShrink: 0 }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
