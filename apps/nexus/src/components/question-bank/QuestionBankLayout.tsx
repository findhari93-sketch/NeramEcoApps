'use client';

import { Box, useTheme, useMediaQuery } from '@neram/ui';
import ExamSidebar from './ExamSidebar';
import ExamMobileSelector from './ExamMobileSelector';
import type { QBExamTree } from '@neram/database';

interface QuestionBankLayoutProps {
  children: React.ReactNode;
  examTree: QBExamTree | null;
  examTreeLoading: boolean;
  selectedExam: string | null;
  selectedYear: number | null;
  selectedSession: string | null;
  onSelect: (exam: string | null, year: number | null, session: string | null) => void;
}

export default function QuestionBankLayout({
  children,
  examTree,
  examTreeLoading,
  selectedExam,
  selectedYear,
  selectedSession,
  onSelect,
}: QuestionBankLayoutProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  if (isDesktop) {
    return (
      <Box sx={{ display: 'flex', height: '100%' }}>
        {/* Sidebar */}
        <Box
          sx={{
            width: 260,
            minWidth: 260,
            borderRight: 1,
            borderColor: 'divider',
            overflowY: 'auto',
          }}
        >
          <ExamSidebar
            examTree={examTree}
            loading={examTreeLoading}
            selectedExam={selectedExam}
            selectedYear={selectedYear}
            selectedSession={selectedSession}
            onSelect={onSelect}
          />
        </Box>

        {/* Content */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 3,
            maxWidth: 800,
          }}
        >
          {children}
        </Box>
      </Box>
    );
  }

  // Mobile layout
  return (
    <Box>
      {/* Mobile selector - sticky at top */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'background.default' }}>
        <ExamMobileSelector
          examTree={examTree}
          loading={examTreeLoading}
          selectedExam={selectedExam}
          selectedYear={selectedYear}
          selectedSession={selectedSession}
          onSelect={onSelect}
        />
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {children}
      </Box>
    </Box>
  );
}
