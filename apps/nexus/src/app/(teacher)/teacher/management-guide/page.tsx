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
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import ViewModuleOutlinedIcon from '@mui/icons-material/ViewModuleOutlined';
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PageHeader from '@/components/PageHeader';

interface GuideSection {
  title: string;
  icon: React.ReactNode;
  color: string;
  summary: string;
  steps: string[];
  tips?: string[];
}

export default function ManagementGuidePage() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<string | false>('classrooms');

  const handleChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const sections: GuideSection[] = [
    {
      title: 'Classrooms & Batches',
      icon: <SchoolOutlinedIcon />,
      color: '#607D8B',
      summary: 'Create classrooms, organize students into batches, and manage enrollments.',
      steps: [
        'Navigate to Classrooms from the sidebar to see all your classrooms.',
        'Tap "+ New Classroom" to create a classroom — set the name, type (NATA, JEE, Revit, Other), and description.',
        'Tap a classroom card to view its details with 3 tabs: Overview, Batches, Students.',
        'In the Batches tab, create batches (e.g., "Batch A", "Batch B") to organize students.',
        'In the Students tab, click "Add Student" to search and enroll students by name or email.',
        'Filter enrolled students by batch using the chip bar.',
        'Select multiple students and use "Assign Batch" to move them between batches.',
        'Switch your active classroom using the chip in the top bar — all app data updates accordingly.',
      ],
      tips: [
        'Batches are for organizing students only — all students see the same content regardless of batch.',
        'You can move students between batches at any time without affecting their progress.',
        'Batch names must be unique within a classroom.',
        'Classroom types: NATA, JEE, Revit, Other.',
        'Your last selected classroom is remembered when you return.',
      ],
    },
    {
      title: 'Students',
      icon: <PeopleOutlinedIcon />,
      color: theme.palette.success.main,
      summary: 'View all enrolled students, filter by batch, and track their progress.',
      steps: [
        'See all students enrolled in your active classroom.',
        'Use the search bar to find students by name or email.',
        'Filter students by batch using the chip bar (All, batch names, Unassigned).',
        'Each student card shows attendance % and checklist completion %.',
        'Click on a student to view their detailed profile.',
        'View per-student: attendance percentage, checklist completion, topic progress.',
        'Check student documents (Aadhaar, marksheets) if uploaded.',
      ],
      tips: [
        'Students are auto-created when they first sign in with Microsoft.',
        'Use "Add Student" in Classrooms → Students tab to search and enroll students into a classroom.',
        'Use batch filters to quickly review a specific group of students.',
      ],
    },
    {
      title: 'Modules',
      icon: <ViewModuleOutlinedIcon />,
      color: '#5C6BC0',
      summary: 'Create and manage learning modules with foundation chapters, videos, and quizzes.',
      steps: [
        'Go to Modules from the sidebar to see all modules.',
        'Click "+ New Module" to create a module — set the name, description, and type.',
        'Inside a module, add foundation chapters with YouTube videos.',
        'Each chapter has sections with start/end timestamps tied to the video.',
        'Add quiz questions to each section: question text, four options (A-D), correct answer, and explanation.',
        'Use the Publish toggle to make chapters visible to students. Unpublished chapters show a "Draft" badge.',
        'Monitor student progress across chapters — who completed, in progress, or not started.',
      ],
      tips: [
        'Use the embedded video preview to capture exact timestamps for sections.',
        'Students must watch the full section video before the quiz appears — they cannot skip ahead.',
        'If a student fails the quiz, they must rewatch the section before retrying.',
        'Students sorted by status: stuck students (red) appear first so you can follow up.',
      ],
    },
    {
      title: 'Checklists',
      icon: <PlaylistAddCheckOutlinedIcon />,
      color: theme.palette.secondary.main,
      summary: 'Create and manage checklist templates. Assign theory tasks for students to complete.',
      steps: [
        'Go to Checklists to see all checklist templates.',
        'Click "+ New Checklist" to create a checklist template.',
        'Add items to the checklist — each item is a task for students.',
        'Assign a topic to each item (e.g., Mathematics, Drawing).',
        'Optionally attach resources: YouTube videos, PDFs, or links.',
        'Assign the checklist to a classroom — students see items in their Checklist tab.',
        'View completion stats: how many students finished each item.',
      ],
      tips: [
        'Group related items under the same topic for organization.',
        'Students see a progress bar on their dashboard showing completion %.',
        'You can deactivate items without deleting them.',
      ],
    },
    {
      title: 'Question Bank',
      icon: <LibraryBooksOutlinedIcon />,
      color: '#7C4DFF',
      summary: 'Build and manage your exam question library. Add questions manually or bulk upload from NTA answer sheets.',
      steps: [
        'Open QB from the sidebar to see the Question Bank dashboard.',
        'The toggle at the top enables/disables student access to the QB for your classroom.',
        'View stats: Total Questions, With Solutions, and breakdown By Difficulty (Easy/Medium/Hard).',
        'Use the 4 action cards to navigate: Add Question, All Questions, Bulk Upload, Papers.',
      ],
      tips: [
        'Enable the toggle only after you have enough questions with solutions ready.',
        'The toggle is per-classroom — each classroom has independent QB access control.',
        'Recent Additions at the bottom shows the last 10 questions added.',
      ],
    },
    {
      title: 'QB: Add Question',
      icon: <LibraryBooksOutlinedIcon />,
      color: '#7C4DFF',
      summary: 'Add questions one at a time using the 6-step form wizard.',
      steps: [
        'Click "Add Question" from the QB dashboard.',
        'Step 1 — Source & Format: Choose Exam Type (JEE Paper 2 or NATA), Year, Session, Question Number, and Format (MCQ, Numerical, Drawing Prompt, or Image-Based).',
        'Step 2 — Content: Type the question text. For MCQ, add 4-8 options and select the correct one. For Numerical, enter the answer and tolerance range.',
        'Step 3 — Classification: Pick categories (mathematics, aptitude, drawing, etc.), difficulty (Easy/Medium/Hard), exam relevance (JEE/NATA/Both), and optionally a topic.',
        'Step 4 — Solution: Add a brief explanation, detailed solution text, YouTube video URL (auto-embeds), and/or solution image.',
        'Step 5 — Repeat Linking: Link questions that repeat across different years/exams (coming soon).',
        'Step 6 — Review: Preview the complete question before saving.',
      ],
      tips: [
        'You can save a question at any step — it starts as Draft status.',
        'Questions go through a lifecycle: Draft → Answer Keyed → Complete → Active.',
        'A question becomes "Complete" when it has both an answer and a solution.',
        'Only "Active" questions are visible to students.',
        '14 categories available: mathematics, history_of_architecture, general_knowledge, aptitude, drawing, puzzle, perspective, building_materials, building_services, planning, sustainability, famous_architects, current_affairs, visualization_3d.',
      ],
    },
    {
      title: 'QB: All Questions',
      icon: <LibraryBooksOutlinedIcon />,
      color: '#7C4DFF',
      summary: 'Browse, search, filter, and manage all questions in your bank.',
      steps: [
        'Click "All Questions" from the QB dashboard.',
        'Use the search bar to find questions by text.',
        'Filter by: Difficulty (Easy/Medium/Hard), Category, Exam Relevance (JEE/NATA/Both), or Status (Draft/Answer Keyed/Complete/Active).',
        'Each question card shows: text preview, source badges (exam type, year, session, Q#), difficulty chip, and category chips.',
        'Click the edit button on any question to modify it.',
        'Toggle Active/Inactive to control student visibility per question.',
        'Load more questions with the pagination button at the bottom.',
      ],
      tips: [
        'Questions display a status badge when not Active (Draft = gray, Answer Keyed = orange, Complete = blue).',
        'Inactive questions show an "Inactive" badge even if they are Complete.',
        'Use filters to quickly find questions that need solutions added.',
      ],
    },
    {
      title: 'QB: Bulk Upload',
      icon: <LibraryBooksOutlinedIcon />,
      color: '#7C4DFF',
      summary: 'Import questions in bulk using 3 methods: Upload JSON (AI-generated), Upload PDF, or Paste Text.',
      steps: [
        'Click "Bulk Upload" from the QB dashboard.',
        'Step 1: Select Exam Type (JEE Paper 2 or NATA), Year (2012-2027), and Session.',
        'Step 2: Choose an upload method — Upload JSON (recommended), Upload PDF, or Paste Text.',
        'Upload JSON: Use an AI tool (Gemini, Claude, ChatGPT) to extract questions from a PDF into JSON format. Copy the provided prompt, upload the PDF to the AI, and save the output as a .json file.',
        'Upload PDF: Drop or browse for an NTA answer sheet PDF. Text is extracted and parsed automatically. Works best with text-selectable PDFs.',
        'Paste Text: Copy all text from an NTA answer sheet and paste it directly.',
        'Step 3: Review all parsed questions in the preview panel. Each question shows type, section, text, and images.',
        'Edit any question: click to expand, toggle edit mode, modify text, upload/paste/replace images.',
        'Use section filters (Math MCQ, Numerical, Aptitude, Drawing) or search by question number/text.',
        'Click "Import" to create the paper with all questions in Draft status.',
      ],
      tips: [
        'JSON upload is the best method — AI tools can extract question text AND images from PDFs.',
        'To generate JSON: Open Google Gemini or Claude, upload the PDF, paste the provided prompt, and save the output.',
        'Google Gemini works best for PDFs with diagrams — it extracts images as base64.',
        'You can paste images directly from the snipping tool (Win+Shift+S) into the image upload zone.',
        'The parser auto-classifies questions: Q1-20 = Math MCQ, Q21-25 = Math Numerical, Q26-75 = Aptitude, Q76+ = Drawing.',
        'All questions are editable in the review panel AND after import — you can always fix mistakes.',
        'If a paper for the same exam/year/session already exists, questions are added to the existing paper.',
        'After bulk upload, go to the Paper detail to set answer keys and add solutions.',
      ],
    },
    {
      title: 'QB: Papers',
      icon: <LibraryBooksOutlinedIcon />,
      color: '#7C4DFF',
      summary: 'Manage uploaded exam papers. Track progress from draft to active.',
      steps: [
        'Click "Papers" from the QB dashboard to see all uploaded papers.',
        'Each paper shows: Exam type, Year, Session, upload date, and a progress bar.',
        'The progress bar shows 4 stages: Draft (gray) → Answer Keyed (orange) → Complete (blue) → Active (green).',
        'Click a paper to open the detail view with the answer key grid.',
        'In the detail view, set correct answers for each question to move them to "Answer Keyed" status.',
        'Add explanations and solutions to move questions to "Complete" status.',
        'Click "Activate" to publish all complete questions to students.',
      ],
      tips: [
        'Work through papers in order: first set all answer keys, then add solutions, then activate.',
        'You can activate individual questions without activating the entire paper.',
        'The progress bar gives a quick visual of how much work remains on each paper.',
        'Recommended workflow: Bulk Upload → Set Answer Keys → Add Solutions → Activate.',
      ],
    },
    {
      title: 'Tests',
      icon: <QuizOutlinedIcon />,
      color: '#9C27B0',
      summary: 'Create tests from the question bank. View student attempts and scores.',
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
      title: 'Questions (Student Submitted)',
      icon: <QuizOutlinedIcon />,
      color: '#FF6F00',
      summary: 'Review questions submitted by students. Approve, edit, or reject them.',
      steps: [
        'Open Questions from the sidebar to see student-submitted questions.',
        'Review each question for accuracy, formatting, and completeness.',
        'Edit the question if needed — fix text, options, or difficulty.',
        'Approve the question to add it to the verified question bank.',
        'Reject with feedback so the student knows what to improve.',
      ],
      tips: [
        'Approved questions become available for test creation.',
        'Encouraging students to submit questions helps them learn through question-crafting.',
        'You can batch-review multiple questions at once.',
      ],
    },
    {
      title: 'Student Issues',
      icon: <BugReportOutlinedIcon />,
      color: '#E65100',
      summary: 'Review and resolve issues reported by students during their learning experience.',
      steps: [
        'Go to Issues from the sidebar to see all student-reported issues.',
        'Issues can be about: video problems, incorrect quiz questions, confusing content, or technical bugs.',
        'Filter issues by status: Open, In Progress, or Resolved.',
        'Click on an issue to view the full details including the student\'s description and context.',
        'Mark an issue as "In Progress" when you start working on it.',
        'Resolve the issue by adding resolution notes explaining what was fixed or clarified.',
        'Students are notified when their reported issue is resolved.',
      ],
      tips: [
        'Check issues regularly — quick responses build student trust.',
        'If a quiz question is reported as incorrect, update it in Modules → chapter editor.',
        'Resolution notes are visible to the student, so be clear and helpful.',
      ],
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Management Guide"
        subtitle="How to use each management feature"
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
          This guide covers classroom management, content creation, question bank, and student support features.
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

      {sections.map((section) => {
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
