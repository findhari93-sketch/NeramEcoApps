'use client';

/**
 * Everything the Question Bank section can do besides the paper list, shown at
 * the foot of each exam page.
 *
 * Below the list rather than above it: these are occasional jobs, and the page
 * opens on the papers that still need work. Tools that can take an exam open
 * scoped to this page's exam; the rest (tags, recall, reclassify) span both
 * exams and open as they always have.
 */

import { useRouter } from 'next/navigation';
import { Box, Card, CardActionArea, Typography } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import type { QBExamType } from '@neram/database';
import { examRelevanceFor } from '@/lib/qb-exam-routes';

/**
 * The rest of the section, in one place.
 *
 * Every route here existed and had no door: the only way in was a typed URL or
 * a bookmark, so the work they do (bulk solutions, re-classification, reported
 * questions) looked like it did not exist.
 */
export const MORE_TOOLS: { label: string; desc: string; href: string }[] = [
  { label: 'Tag coverage', desc: 'Give untagged questions a topic so tests can find them', href: '/teacher/question-bank/tag-coverage' },
  { label: 'Manage papers', desc: 'Publish, activate questions, delete', href: '/teacher/question-bank/papers' },
  { label: 'Student progress', desc: 'Who has read, practised and sat each paper', href: '/teacher/question-bank/papers/overview' },
  { label: 'Bulk solutions', desc: 'Upload explanations for many questions', href: '/teacher/question-bank/solutions' },
  { label: 'Drawing questions', desc: 'Prompts, references and marking notes', href: '/teacher/question-bank/drawing-management' },
  { label: 'Import recalled', desc: 'Turn recalled questions into bank entries', href: '/teacher/question-bank/recalled-import' },
  { label: 'Re-classify topics', desc: 'Move questions between categories in bulk', href: '/teacher/question-bank/reclassify' },
  { label: 'Fix numbering clashes', desc: 'Questions crammed onto the same number', href: '/teacher/question-bank/section-collisions' },
  { label: 'Reported questions', desc: 'What students flagged as wrong', href: '/teacher/question-bank/reports' },
];

interface HubLink {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: React.ReactNode;
  color: string;
}

/** The section's primary destinations, surfaced as cards so nothing is an orphan route. */
function hubLinks(exam: QBExamType): HubLink[] {
  return [
    {
      key: 'questions',
      label: 'Questions',
      desc: 'Browse, filter and tag this exam\'s questions',
      href: `/teacher/question-bank/questions?exam_relevance=${examRelevanceFor(exam)}`,
      icon: <QuizOutlinedIcon />,
      color: '#6366F1',
    },
    {
      key: 'tags',
      label: 'Tags and themes',
      desc: 'The taxonomy, and what is tagged with it',
      href: '/teacher/question-bank/tags',
      icon: <SellOutlinedIcon />,
      color: '#F59E0B',
    },
    {
      // Recall is a sidebar feature in its own right. This card used to point at
      // /teacher/questions, a separate system with its own tables that never
      // received a single submission and titled itself "Question Bank" too.
      key: 'recall',
      label: 'Student exam recall',
      desc: 'Questions students remembered after an exam',
      href: '/teacher/exam-recall',
      icon: <RateReviewOutlinedIcon />,
      color: '#10B981',
    },
    {
      key: 'tagging',
      label: 'Tagging assistant',
      desc: 'Bulk-tag questions with AI help',
      href: '/teacher/question-bank/tagging-assistant',
      icon: <AutoAwesomeOutlinedIcon />,
      color: '#8B5CF6',
    },
  ];
}

const SECTION_HEADING_SX = { letterSpacing: 1, fontWeight: 700, display: 'block', mb: 1 } as const;

export default function TeacherQBTools({ exam }: { exam: QBExamType }) {
  const router = useRouter();

  return (
    <Box component="section" aria-labelledby="qb-tools-heading" sx={{ mt: 4 }}>
      <Typography id="qb-tools-heading" variant="overline" component="h2" color="text.secondary" sx={SECTION_HEADING_SX}>
        Tools
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: { xs: 1, sm: 1.5 },
          mb: 1.5,
        }}
      >
        {hubLinks(exam).map((link) => (
          <Card
            key={link.key}
            variant="outlined"
            sx={{
              borderRadius: 2,
              transition: 'border-color 150ms, box-shadow 150ms',
              '&:hover': { borderColor: link.color, boxShadow: 2 },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            <CardActionArea
              onClick={() => router.push(link.href)}
              aria-label={`${link.label}. ${link.desc}`}
              sx={{ p: 1.5, height: '100%', minHeight: 96, alignItems: 'flex-start' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: `${link.color}1A`,
                    color: link.color,
                    '& svg': { fontSize: 20 },
                  }}
                >
                  {link.icon}
                </Box>
                <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {link.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {link.desc}
              </Typography>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      {/* Tests moved out of the Question Bank into their own section */}
      <Card
        variant="outlined"
        sx={{ borderRadius: 2, mb: 1.5, transition: 'border-color 150ms', '&:hover': { borderColor: 'primary.main' } }}
      >
        <CardActionArea
          onClick={() => router.push('/teacher/tests')}
          aria-label="Open the Tests section"
          sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1, minHeight: 48 }}
        >
          <FactCheckOutlinedIcon color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
            Looking for tests? Build and manage them in the Tests section.
          </Typography>
          <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
        </CardActionArea>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
          gap: 1,
        }}
      >
        {MORE_TOOLS.map((tool) => (
          <Card key={tool.href} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardActionArea
              onClick={() => router.push(tool.href)}
              aria-label={`${tool.label}. ${tool.desc}`}
              sx={{ px: 1.5, py: 1.25, minHeight: 56, display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                  {tool.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {tool.desc}
                </Typography>
              </Box>
              <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
