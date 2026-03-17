'use client';

import {
  Box,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PageHeader from '@/components/PageHeader';

interface GuideSection {
  icon: React.ReactNode;
  title: string;
  color: string;
  items: string[];
}

const guideSections: GuideSection[] = [
  {
    icon: <ChecklistOutlinedIcon />,
    title: 'Checklist — Your Learning Path',
    color: '#4F46E5',
    items: [
      'The Checklist is your primary self-learning area. It contains a step-by-step list of tasks assigned by your teacher.',
      'Each checklist step must be completed in order — you cannot skip ahead.',
      'For simple tasks: click "Start" when you begin working, then "Mark Complete" when done.',
      'For module tasks: click "Start Module" to open the module content (videos, books, audio, questions). Work through each item at your own pace.',
      'Your progress is tracked automatically. Teachers can see when you started and completed each step.',
      'If you have multiple checklists (e.g., Aptitude, Drawing, Mathematics), use the tabs at the top to switch between them.',
    ],
  },
  {
    icon: <MenuBookOutlinedIcon />,
    title: 'Foundation — Core Learning Material',
    color: '#059669',
    items: [
      'Foundation modules contain structured learning content organized in chapters.',
      'Each chapter has videos, reading materials, and practice exercises.',
      'Work through chapters in order — they build on each other.',
      'Your video progress is saved automatically, so you can resume where you left off.',
      'Complete all items in a chapter before moving to the next one.',
    ],
  },
  {
    icon: <BrushOutlinedIcon />,
    title: 'Drawings — Submit & Get Feedback',
    color: '#D97706',
    items: [
      'Submit your drawings for teacher review and feedback.',
      'Upload clear photos of your work — good lighting helps!',
      'Teachers will review your submissions and provide detailed feedback.',
      'You can view all your past submissions and feedback in one place.',
      'Regular practice and submissions help you improve faster.',
    ],
  },
  {
    icon: <CalendarTodayOutlinedIcon />,
    title: 'Timetable — Your Schedule',
    color: '#7C3AED',
    items: [
      'View your class schedule and important dates.',
      'Timetable shows your daily and weekly class schedule.',
      'Check for any schedule changes or special classes.',
      'Plan your self-study time around your class schedule.',
    ],
  },
  {
    icon: <QuizOutlinedIcon />,
    title: 'Question Bank — Practice Questions',
    color: '#DC2626',
    items: [
      'Access practice questions organized by topic and difficulty.',
      'Use the question bank to test your understanding of concepts.',
      'Questions are categorized by subject and topic for easy navigation.',
      'Track which questions you\'ve attempted and your accuracy.',
      'Note: Question Bank is available only if enabled by your teacher.',
    ],
  },
  {
    icon: <PersonOutlinedIcon />,
    title: 'Profile — Your Information',
    color: '#78716C',
    items: [
      'View and update your personal information.',
      'Check your enrolled classroom and batch details.',
      'See your overall progress summary across all features.',
      'Contact your teacher or report issues from your profile.',
    ],
  },
];

export default function StudentGuidePage() {
  const theme = useTheme();

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Guide"
        subtitle="Learn how to use each section of Nexus"
      />

      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 100%)`,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary', lineHeight: 1.6 }}>
          Welcome to Nexus! This guide explains each section of the app and how to use it effectively.
          Start with the <strong>Checklist</strong> — it&apos;s your main learning area where you&apos;ll work through
          tasks step by step.
        </Typography>
      </Paper>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {guideSections.map((section, idx) => (
          <Accordion
            key={idx}
            defaultExpanded={idx === 0}
            disableGutters
            elevation={0}
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              overflow: 'hidden',
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                minHeight: 56,
                px: 2,
                '& .MuiAccordionSummary-content': {
                  alignItems: 'center',
                  gap: 1.5,
                },
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: alpha(section.color, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: section.color,
                  '& .MuiSvgIcon-root': { fontSize: '1.2rem' },
                }}
              >
                {section.icon}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {section.title}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
              <Box
                component="ul"
                sx={{
                  m: 0,
                  pl: 2.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                }}
              >
                {section.items.map((item, i) => (
                  <Box component="li" key={i}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        lineHeight: 1.5,
                        fontSize: '0.85rem',
                      }}
                    >
                      {item}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}
