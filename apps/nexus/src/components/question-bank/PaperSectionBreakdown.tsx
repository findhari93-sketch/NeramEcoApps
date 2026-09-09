'use client';

/**
 * How far through each part of a paper this student has got.
 *
 * The paper detail screen used to be a title, one progress ring and a row of
 * three short cards: about 350px of content on a laptop, so the page read as
 * unfinished. This is the part that was missing. "6% of 47" tells a student
 * nothing they can act on; "Aptitude 1 of 30" tells them where to go next, and
 * each row is the link that takes them there.
 *
 * Rows come from qbPaperSectionRuns, the same function the staff summary strip
 * and the exam scheduler use, so a paper is described one way everywhere. A
 * paper whose sections interleave produces several runs for the same section
 * rather than one tidy lie, and that is deliberately shown as it is.
 */

import { Box, LinearProgress, Paper, Typography, alpha, useTheme } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Link from 'next/link';
import type { NexusQBPaperSectionProgress } from '@neram/database';

interface PaperSectionBreakdownProps {
  sections: NexusQBPaperSectionProgress[];
  /** Builds the practice link for one section. */
  hrefForSection: (section: string | null) => string;
}

export default function PaperSectionBreakdown({
  sections,
  hrefForSection,
}: PaperSectionBreakdownProps) {
  const theme = useTheme();

  // Nobody has classified this paper's questions yet. That is "no breakdown to
  // show", not "no progress", so the section says nothing rather than claiming
  // a student has done none of it.
  if (sections.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="paper-breakdown-heading" sx={{ mt: 4 }}>
      <Typography
        id="paper-breakdown-heading"
        variant="subtitle2"
        sx={{ fontWeight: 700, mb: 1.5, color: 'text.secondary' }}
      >
        Where you stand
      </Typography>

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {sections.map((run, i) => {
          const pct = run.count > 0 ? Math.round((run.attempted / run.count) * 100) : 0;
          const complete = run.count > 0 && run.attempted >= run.count;
          const color = complete ? theme.palette.success.main : theme.palette.primary.main;
          const range =
            run.first_question != null && run.last_question != null
              ? `Q${run.first_question}–Q${run.last_question}`
              : null;

          return (
            <Box
              key={`${run.section ?? 'unclassified'}-${i}`}
              component={Link}
              href={hrefForSection(run.section)}
              aria-label={`${run.label}, ${run.attempted} of ${run.count} attempted`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 1.5, md: 2 },
                // 48px is the Material 3 floor, and these are the primary way
                // into a section on a phone.
                minHeight: 56,
                px: { xs: 1.5, md: 2 },
                py: 1.25,
                textDecoration: 'none',
                color: 'inherit',
                borderTop: i === 0 ? 'none' : '1px solid',
                borderColor: 'divider',
                transition: theme.transitions.create('background-color', { duration: 180 }),
                '&:hover': { bgcolor: alpha(color, 0.04) },
                '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: -2 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              {/* minWidth: 0 lets the label truncate instead of forcing the row
                  wider than the screen. */}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {run.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {range ? `${range} · ${run.count} questions` : `${run.count} questions`}
                </Typography>
              </Box>

              {/* Fixed-width so the bars line up down the column and the counts
                  never shift as the numbers change. */}
              <Box sx={{ width: { xs: 64, sm: 120, md: 160 }, flexShrink: 0 }}>
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  aria-hidden="true"
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: alpha(color, 0.12),
                    '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
                  }}
                />
              </Box>

              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: complete ? 'success.main' : 'text.secondary',
                  flexShrink: 0,
                  // Tabular figures stop the column jittering as digits change.
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 46,
                  textAlign: 'right',
                }}
              >
                {run.attempted}/{run.count}
              </Typography>

              <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0, fontSize: 20 }} />
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}
