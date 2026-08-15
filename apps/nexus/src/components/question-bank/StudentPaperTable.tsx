'use client';

/**
 * The scanning view for a student's past papers: one row per paper instead of
 * one card, so a whole exam's worth of years fits without the per-year grids
 * that used to strand a lone paper in a mostly-empty row.
 *
 * Mirrors the teacher's own `PaperTable` (same sticky-column technique, same
 * accessible-row pattern, same md-gated mobile fallback), but reads student
 * progress fields instead of authoring/publish state and drops the columns
 * that only apply to staff.
 */

import {
  Box,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import type { NexusQBPaperCard } from '@neram/database';
import StudentPaperCard, { getPaperSubline } from './StudentPaperCard';
import PaperFacePips from './PaperFacePips';

export interface StudentPaperTableProps {
  papers: NexusQBPaperCard[];
  onOpen: (paper: NexusQBPaperCard) => void;
}

/** The identity column, which stays put while the rest scrolls. */
const NAME_COL_WIDTH = 180;

const HEAD_SX = {
  fontWeight: 700,
  fontSize: '0.7rem',
  letterSpacing: 0.3,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
  py: 1,
  px: 1,
} as const;

const CELL_SX = { px: 1 } as const;

/** Same auto-fill grid the card view uses, for the mobile fallback below. */
const GRID = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'repeat(auto-fill, minmax(150px, 1fr))',
    sm: 'repeat(auto-fill, minmax(200px, 1fr))',
  },
  gap: 1.5,
} as const;

export default function StudentPaperTable({ papers, onOpen }: StudentPaperTableProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // A table does not shrink. Below md the phone gets the same card grid the
  // "grid" view already renders, exactly as the teacher's PaperTable falls
  // back to PaperCompactRow, so the stored view preference only matters once
  // there is room for a table.
  if (isMobile) {
    return (
      <Box sx={GRID}>
        {papers.map((paper) => (
          <StudentPaperCard key={paper.id} paper={paper} onOpen={onOpen} />
        ))}
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell
                sx={{
                  ...HEAD_SX,
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: 'background.paper',
                  minWidth: NAME_COL_WIDTH,
                }}
              >
                Paper
              </TableCell>
              <TableCell sx={{ ...HEAD_SX, minWidth: 160 }}>Progress</TableCell>
              <TableCell align="right" sx={HEAD_SX}>Qs</TableCell>
              <TableCell sx={HEAD_SX}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {papers.map((paper) => (
              <TableRow
                key={paper.id}
                hover
                role="button"
                tabIndex={0}
                aria-label={`Open ${paper.title}`}
                onClick={() => onOpen(paper)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(paper);
                  }
                }}
                sx={{
                  cursor: 'pointer',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                  },
                  '&:hover .qb-sticky-cell': { bgcolor: 'action.hover' },
                }}
              >
                <TableCell
                  className="qb-sticky-cell"
                  sx={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    bgcolor: 'background.paper',
                    minWidth: NAME_COL_WIDTH,
                  }}
                >
                  <Typography variant="body2" fontWeight={700}>
                    {paper.short_title}
                  </Typography>
                </TableCell>
                <TableCell sx={CELL_SX}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: paper.question_count > 0 ? 0.5 : 0 }}
                  >
                    {getPaperSubline(paper)}
                  </Typography>
                  {paper.question_count > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(paper.practice_pct, 100)}
                      aria-label={`Practice progress ${paper.practice_pct}%`}
                      sx={{
                        height: 5,
                        borderRadius: 3,
                        maxWidth: 140,
                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 3,
                          bgcolor:
                            paper.practice_pct >= 100
                              ? theme.palette.success.main
                              : theme.palette.primary.main,
                        },
                      }}
                    />
                  )}
                </TableCell>
                <TableCell align="right" sx={CELL_SX}>
                  {paper.question_count}
                </TableCell>
                <TableCell sx={CELL_SX}>
                  <PaperFacePips faces={paper.faces} variant="dot" context={paper.short_title} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
