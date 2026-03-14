'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  alpha,
  useTheme,
  Divider,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PageHeader from '@/components/PageHeader';

interface GuideSection {
  title: string;
  icon: React.ReactNode;
  color: string;
  summary: string;
  steps: string[];
  tips?: string[];
}

export default function GuidePage() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<string | false>('dashboard');

  const handleChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const sections: GuideSection[] = [
    {
      title: 'Dashboard',
      icon: <DashboardOutlinedIcon />,
      color: theme.palette.primary.main,
      summary: 'Your home screen showing today\'s classes, student count, and quick actions.',
      steps: [
        'View the greeting header with your active classroom name.',
        'Check stat cards: Classes Today, Students enrolled, and Open Tickets.',
        'See today\'s scheduled classes with their time and status (scheduled, live, completed).',
        'Click "Start" on a class card to open the Teams meeting link.',
        'Use Quick Actions to jump directly to Students, Attendance, Timetable, or Checklist.',
      ],
      tips: [
        'Switch classrooms using the chip in the top bar (if you have multiple).',
        'The dashboard refreshes when you switch classrooms.',
      ],
    },
    {
      title: 'Timetable',
      icon: <CalendarTodayOutlinedIcon />,
      color: theme.palette.info.main,
      summary: 'Create and manage your class schedule. View classes by day or week.',
      steps: [
        'Navigate to Timetable from the sidebar.',
        'Use the date picker to browse different days.',
        'Click "+ New Class" to schedule a class.',
        'Fill in: Title, Topic, Date, Start Time, End Time.',
        'Optionally add a Teams Meeting URL for online classes.',
        'Edit or cancel existing classes by clicking on them.',
      ],
      tips: [
        'Past classes automatically show as "completed".',
        'Cancelled classes are soft-deleted — they won\'t appear to students.',
        'You can reschedule by editing the date and time.',
      ],
    },
    {
      title: 'Students',
      icon: <PeopleOutlinedIcon />,
      color: theme.palette.success.main,
      summary: 'View all enrolled students, their attendance, and checklist progress.',
      steps: [
        'See all students enrolled in your active classroom.',
        'Use the search bar to find students by name.',
        'Click on a student to view their detailed profile.',
        'View per-student: attendance percentage, checklist completion, topic progress.',
        'Check student documents (Aadhaar, marksheets) if uploaded.',
      ],
      tips: [
        'Students are auto-created when they first sign in with Microsoft.',
        'Enrollment is managed by the admin — you can view but not add students directly.',
      ],
    },
    {
      title: 'Evaluate (Drawings)',
      icon: <RateReviewOutlinedIcon />,
      color: theme.palette.warning.main,
      summary: 'Review and grade student drawing submissions. Provide feedback and corrections.',
      steps: [
        'Open Evaluate to see pending drawing submissions.',
        'Submissions are organized by Drawing Level > Category > Exercise.',
        'Click on a submission to view the student\'s work.',
        'Grade the submission: Approve, mark for Redo, or assign a grade.',
        'Add teacher notes and optionally upload a corrected version.',
        'Students see your feedback in their Drawings section.',
      ],
      tips: [
        'Students can submit multiple attempts for each exercise.',
        'Use the correction overlay to mark directly on their drawing.',
        'Filter by status (Pending, Approved, Redo) to manage your queue.',
      ],
    },
    {
      title: 'Attendance',
      icon: <EventNoteOutlinedIcon />,
      color: '#E91E63',
      summary: 'Mark attendance for each scheduled class. View attendance history.',
      steps: [
        'Open Attendance and select a scheduled class from the list.',
        'You\'ll see all enrolled students with checkboxes.',
        'Mark each student as Present or Absent.',
        'Click "Save Attendance" to record it.',
        'View past attendance records by selecting earlier dates.',
      ],
      tips: [
        'Attendance can be marked during or after a class.',
        'Students can see their own attendance percentage on their dashboard.',
        'The dashboard stat "Classes Today" counts from attendance records.',
      ],
    },
    {
      title: 'Checklist',
      icon: <ChecklistOutlinedIcon />,
      color: theme.palette.secondary.main,
      summary: 'Create theory checklist items for students to complete. Track their progress.',
      steps: [
        'Open Checklist to see all items for your classroom.',
        'Click "+ New Item" to create a checklist task.',
        'Assign it to a topic (e.g., Mathematics, Drawing).',
        'Optionally attach resources: YouTube videos, PDFs, or links.',
        'Students tick off items as they complete them.',
        'View completion stats: how many students finished each item.',
      ],
      tips: [
        'Group related items under the same topic for organization.',
        'Students see a progress bar on their dashboard showing completion %.',
        'You can deactivate items without deleting them.',
      ],
    },
    {
      title: 'Tests',
      icon: <QuizOutlinedIcon />,
      color: '#9C27B0',
      summary: 'Create tests from a question bank. View student attempts and scores.',
      steps: [
        'Open Tests to see all tests for your classroom.',
        'Click "+ New Test" to create a test.',
        'Choose test type: Untimed, Timed, Per-Question Timer, or Model Test.',
        'Add questions from the verified question bank.',
        'Set: Total marks, passing marks, duration, shuffle options.',
        'Publish the test to make it visible to students.',
        'View student attempts, scores, and time spent after submission.',
      ],
      tips: [
        'Questions can be MCQ, True/False, Short Answer, Drawing, or Numerical.',
        'Students can submit questions for your review — approve them to add to the bank.',
        'Tests support negative marking per question.',
        'Use "Show answers after" to control when students see correct answers.',
      ],
    },
    {
      title: 'Classroom Management',
      icon: <SwapHorizIcon />,
      color: '#607D8B',
      summary: 'Switch between classrooms and understand enrollment.',
      steps: [
        'If you teach multiple classrooms, use the classroom switcher in the top bar.',
        'Click the classroom chip to see all your assigned classrooms.',
        'Select a different classroom — the entire app updates to show that classroom\'s data.',
        'Each classroom has its own topics, schedule, students, and checklist.',
      ],
      tips: [
        'Your last selected classroom is remembered when you return.',
        'Classrooms are created and managed by the admin.',
        'Classroom types: NATA, JEE, Revit, Other.',
      ],
    },
    {
      title: 'Parent Access',
      icon: <GroupsOutlinedIcon />,
      color: '#00897B',
      summary: 'Invite parents to view their child\'s progress.',
      steps: [
        'Parents can be linked to students to view progress.',
        'Generate a 6-digit invite code from the student\'s profile.',
        'Share the code with the parent — it expires after 7 days.',
        'Parents sign in with Microsoft and enter the code to link.',
        'Once linked, parents see: attendance, checklist progress, drawing submissions, and upcoming classes.',
      ],
      tips: [
        'Each invite code can only be used once.',
        'Parents have read-only access — they cannot modify anything.',
        'A student can have multiple parents linked.',
      ],
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Nexus Guide"
        subtitle="How to use each feature"
      />

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          mb: 2.5,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Welcome to Nexus — the Learning Management Platform for Neram Classes.
          This guide covers every feature available to teachers and admins.
          Tap on any section below to expand it.
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {sections.map((s) => (
            <Chip
              key={s.title}
              label={s.title}
              size="small"
              onClick={() => setExpanded(expanded === s.title.toLowerCase().replace(/[^a-z]/g, '') ? false : s.title.toLowerCase().replace(/[^a-z]/g, ''))}
              sx={{
                fontWeight: 500,
                fontSize: '0.75rem',
                bgcolor: alpha(s.color, 0.08),
                color: s.color,
                border: `1px solid ${alpha(s.color, 0.2)}`,
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha(s.color, 0.14) },
              }}
            />
          ))}
        </Box>
      </Paper>

      {sections.map((section, idx) => {
        const panelId = section.title.toLowerCase().replace(/[^a-z]/g, '');
        return (
          <Accordion
            key={section.title}
            expanded={expanded === panelId}
            onChange={handleChange(panelId)}
            elevation={0}
            disableGutters
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px !important',
              mb: 1.5,
              overflow: 'hidden',
              '&:before': { display: 'none' },
              '&.Mui-expanded': {
                borderColor: alpha(section.color, 0.3),
              },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                minHeight: 56,
                px: { xs: 2, sm: 2.5 },
                '&.Mui-expanded': {
                  bgcolor: alpha(section.color, 0.04),
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: alpha(section.color, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '& .MuiSvgIcon-root': { fontSize: '1.15rem', color: section.color },
                    flexShrink: 0,
                  }}
                >
                  {section.icon}
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {section.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                    {section.summary}
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mb: 1.5 }}>
                {section.summary}
              </Typography>

              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary', mb: 1, display: 'block' }}>
                How to use
              </Typography>
              <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                {section.steps.map((step, i) => (
                  <Box
                    component="li"
                    key={i}
                    sx={{ mb: 0.75, '&::marker': { color: section.color, fontWeight: 700 } }}
                  >
                    <Typography variant="body2" color="text.primary">
                      {step}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {section.tips && section.tips.length > 0 && (
                <>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary', mt: 2, mb: 1, display: 'block' }}>
                    Tips
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {section.tips.map((tip, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: 'flex',
                          gap: 1,
                          alignItems: 'flex-start',
                          px: 1.5,
                          py: 1,
                          borderRadius: 2,
                          bgcolor: alpha(section.color, 0.04),
                          border: `1px solid ${alpha(section.color, 0.08)}`,
                        }}
                      >
                        <Typography variant="body2" sx={{ color: section.color, fontWeight: 700, flexShrink: 0 }}>
                          *
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {tip}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
