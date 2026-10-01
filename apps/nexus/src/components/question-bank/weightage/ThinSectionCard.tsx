'use client';

import Link from 'next/link';
import { Alert, Box, Button, Paper, Typography, alpha, useTheme } from '@neram/ui';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import {
  SECTION_LABELS,
  describeYears,
  type ChapterStat,
  type SectionWeightage,
} from '@/lib/qb-weightage';

interface Props {
  section: SectionWeightage;
  colorFor: (unit: string | null) => string;
  practiceAllHref: string;
  onOpen: (c: ChapterStat) => void;
}

/**
 * A section with too short a history to chart (drawing, today).
 *
 * A weightage chart over one or two years would invent a pattern, so this shows
 * what kinds of task have come up and says plainly how little history there is.
 * It turns into the full view by itself once the bank holds enough years.
 */
export default function ThinSectionCard({ section, colorFor, practiceAllHref, onOpen }: Props) {
  const theme = useTheme();
  const label = SECTION_LABELS[section.section];
  const total = section.chapters.reduce((a, c) => a + c.total, 0);
  const years = section.countedYears.length;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5 }}>
      <Typography variant="subtitle1" component="h2" fontWeight={700}>
        {label} tasks in past papers
      </Typography>
      <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
        {`The bank has ${label.toLowerCase()} questions from ${years === 1 ? 'one year' : `${years} years`} (${describeYears(section)}), too few to show a pattern. Practise every type.`}
      </Alert>

      {section.chapters.length > 0 && (
        <Box
          aria-hidden
          sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: '2px' }}
        >
          {section.chapters.map((c) => (
            <Box key={c.slug} sx={{ flex: c.total, bgcolor: colorFor(c.unit) }} />
          ))}
        </Box>
      )}

      {section.chapters.map((c) => (
        <Box
          key={c.slug}
          component="button"
          type="button"
          onClick={() => onOpen(c)}
          sx={{
            all: 'unset',
            boxSizing: 'border-box',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            minHeight: 56,
            px: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
            '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
          }}
        >
          <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: colorFor(c.unit), flex: 'none' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600}>
              {c.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {c.total} {c.total === 1 ? 'question' : 'questions'}
              {total > 0 ? `, ${Math.round((c.total / total) * 100)}% of tagged ${label.toLowerCase()}` : ''}
            </Typography>
          </Box>
          <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        </Box>
      ))}

      {section.chapters.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          These questions are not sorted into types yet.
        </Typography>
      )}

      <Button
        component={Link}
        href={practiceAllHref}
        variant="outlined"
        sx={{ minHeight: 48, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
      >
        Practise all {section.totalQuestions} {label.toLowerCase()} questions
      </Button>
    </Paper>
  );
}
