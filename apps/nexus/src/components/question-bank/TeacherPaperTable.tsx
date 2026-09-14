'use client';

/**
 * The scanning view for a teacher's exam page: one row per paper.
 *
 * A copy of `StudentPaperTable` in structure (sticky first column, a whole row
 * that is one keyboard-reachable button, a card grid below `md`) with teacher
 * columns: the next job, how much is keyed and solved, and whether students can
 * see it. The old teacher list was a stack of year headings each over one card,
 * which put twenty-seven papers across a 5000px page.
 */

import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import TeacherPaperCard, {
  StudentAccessChip,
  WorkProgressBar,
  WorkStageChip,
  workProgressLine,
} from './TeacherPaperCard';
import { NEXT_STEP_LABELS, sittingLabel, type WorkRow } from './papers/paperWorkStage';

export interface TeacherPaperTableProps {
  rows: WorkRow[];
  onOpen: (row: WorkRow) => void;
}

/** The identity column, which stays put while the rest scrolls. */
const NAME_COL_WIDTH = 170;

const HEAD_SX = {
  fontWeight: 700,
  fontSize: '0.7rem',
  letterSpacing: 0.3,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
  py: 1,
  px: 1,
} as const;

const CELL_SX = { px: 1, py: 1.25 } as const;

/** One card per row on a phone, filling out from `sm`. */
export const TEACHER_PAPER_GRID = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr',
    sm: 'repeat(auto-fill, minmax(240px, 1fr))',
    md: 'repeat(auto-fill, minmax(260px, 1fr))',
  },
  gap: 1.5,
} as const;

export default function TeacherPaperTable({ rows, onOpen }: TeacherPaperTableProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // A table does not shrink. Below md the phone gets the same cards the grid
  // view renders, so the stored view preference only matters once there is room.
  if (isMobile) {
    return (
      <Box sx={TEACHER_PAPER_GRID}>
        {rows.map((row) => (
          <TeacherPaperCard key={row.paper.id} row={row} onOpen={onOpen} />
        ))}
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 760 }}>
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
              <TableCell sx={HEAD_SX}>Next step</TableCell>
              <TableCell sx={{ ...HEAD_SX, minWidth: 220 }}>Progress</TableCell>
              <TableCell align="right" sx={HEAD_SX}>Qs</TableCell>
              <TableCell sx={HEAD_SX}>Students</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const { paper, stage } = row;
              const sitting = sittingLabel(paper);
              const progress = workProgressLine(row);
              return (
                <TableRow
                  key={paper.id}
                  hover
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${paper.year}${sitting ? ` ${sitting}` : ''}. Next step: ${NEXT_STEP_LABELS[stage]}`}
                  onClick={() => onOpen(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(row);
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
                      ...CELL_SX,
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      bgcolor: 'background.paper',
                      minWidth: NAME_COL_WIDTH,
                    }}
                  >
                    <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                      {paper.year}
                    </Typography>
                    {sitting && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {sitting}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={CELL_SX}>
                    <WorkStageChip stage={stage} />
                  </TableCell>
                  <TableCell sx={CELL_SX}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mb: row.stats.total > 0 ? 0.5 : 0 }}
                    >
                      {progress}
                    </Typography>
                    <WorkProgressBar row={row} maxWidth={180} />
                  </TableCell>
                  <TableCell align="right" sx={CELL_SX}>
                    {row.stats.total}
                  </TableCell>
                  <TableCell sx={CELL_SX}>
                    <StudentAccessChip live={paper.is_student_visible} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
