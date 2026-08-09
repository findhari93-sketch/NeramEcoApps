'use client';

import { useMemo } from 'react';
import { Box, Chip, Typography, useTheme, alpha } from '@neram/ui';
import { qbSectionLabel } from '@neram/database';

/**
 * Which section of the paper you are in, and how far through each one you are.
 *
 * A real exam paper is Mathematics, then Aptitude, then Drawing, and a
 * candidate manages their time across those blocks, not across 77 undifferentiated
 * questions. Without this the student has a counter that says "34 of 77" and no
 * way to know they have not started Drawing yet.
 *
 * Only rendered when a paper actually HAS more than one section, so an ordinary
 * chapter test is untouched.
 *
 * The draw lays sections out contiguously (pickSectionedDraw), so grouping here
 * is a single pass over the served order with no reordering. If a paper ever
 * did interleave, this would show the same section twice rather than lying
 * about it.
 */

export interface SectionRun {
  key: string;
  label: string;
  /** Index of the first question of this run in the served order. */
  start: number;
  count: number;
  answered: number;
}

export function buildSectionRuns(
  questions: Array<{ id: string; section?: string | null }>,
  answers: Record<string, string>,
  answerKeyFor: (q: { id: string }) => string,
): SectionRun[] {
  const runs: SectionRun[] = [];
  questions.forEach((q, i) => {
    const key = q.section ?? '__none__';
    const last = runs[runs.length - 1];
    const answered = Boolean(String(answers[answerKeyFor(q)] ?? '').trim());
    if (last && last.key === key) {
      last.count += 1;
      if (answered) last.answered += 1;
      return;
    }
    runs.push({
      key,
      label: q.section ? qbSectionLabel(q.section) : 'Questions',
      start: i,
      count: 1,
      answered: answered ? 1 : 0,
    });
  });
  return runs;
}

export default function SectionStrip({
  runs,
  currentIndex,
  onJump,
}: {
  runs: SectionRun[];
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  const theme = useTheme();

  const activeKey = useMemo(() => {
    const run = runs.find((r) => currentIndex >= r.start && currentIndex < r.start + r.count);
    return run?.key ?? null;
  }, [runs, currentIndex]);

  // One section is not a set of sections. Showing a single chip would be noise.
  if (runs.length < 2) return null;

  return (
    <Box
      role="tablist"
      aria-label="Sections of this paper"
      sx={{
        display: 'flex',
        gap: 1,
        px: { xs: 2, md: 4 },
        py: 0.75,
        overflowX: 'auto',
        flexShrink: 0,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
        // The strip scrolls; the page must not.
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {runs.map((run) => {
        const isActive = run.key === activeKey;
        const complete = run.answered === run.count;
        return (
          <Chip
            key={`${run.key}-${run.start}`}
            role="tab"
            aria-selected={isActive}
            // Never colour alone: the label carries the counts, so a student who
            // cannot distinguish the fill still reads "Drawing 0 of 2".
            aria-label={`${run.label}, ${run.answered} of ${run.count} answered${isActive ? ', current section' : ''}`}
            onClick={() => onJump(run.start)}
            label={
              <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                <Typography component="span" variant="caption" sx={{ fontWeight: 700 }}>
                  {run.label}
                </Typography>
                <Typography component="span" variant="caption" sx={{ opacity: 0.85 }}>
                  {run.answered}/{run.count}
                </Typography>
              </Box>
            }
            sx={{
              cursor: 'pointer',
              minHeight: 36,
              borderRadius: 2,
              flexShrink: 0,
              border: '1px solid',
              borderColor: isActive
                ? 'primary.main'
                : complete
                  ? alpha(theme.palette.success.main, 0.5)
                  : 'divider',
              bgcolor: isActive
                ? alpha(theme.palette.primary.main, 0.1)
                : complete
                  ? alpha(theme.palette.success.main, 0.08)
                  : 'transparent',
              color: isActive ? 'primary.main' : 'text.primary',
              // 48px of tappable height on a phone without making the chip look
              // oversized on a laptop.
              '& .MuiChip-label': { px: 1.25, py: { xs: 0.75, md: 0.25 } },
            }}
          />
        );
      })}
    </Box>
  );
}
