'use client';

import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import PaperProgressBar from '../PaperProgressBar';
import PaperCompactRow from './PaperCompactRow';
import PaperIdentity from './PaperIdentity';
import PaperActions, { PaperStatusChip } from './PaperActions';
import type { PaperRow } from './paperFilters';
import type { PaperActionHandlers } from './paperTypes';

export interface PaperTableProps {
  rows: PaperRow[];
  actions: PaperActionHandlers;
  formatDate: (dateStr: string) => string;
}

/**
 * Small enough that the whole table, Actions included, fits the ~900px content
 * column a 1280px window leaves once the sidebar and page padding are taken.
 *
 * An Actions cell you have to scroll sideways to reach is an Actions cell that
 * does not exist, which is why the headers below are abbreviated rather than
 * this number being raised to fit them.
 */
const TABLE_MIN_WIDTH = 760;
/** The identity column, which stays put while the rest scrolls. */
const NAME_COL_WIDTH = 190;

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

/**
 * The scanning view: one row per paper, one column per thing you compare.
 *
 * A matrix does not shrink, so this follows the ruling PaperProgressMatrix
 * already set for the same problem. The grid is gated at md and the phone gets
 * PaperCompactRow instead. Where the table does scroll sideways it does so
 * inside its own container, behind a sticky identity column: the page body
 * still never scrolls sideways.
 */
export default function PaperTable({ rows, actions, formatDate }: PaperTableProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map(({ paper, stats }) => (
          <PaperCompactRow key={paper.id} paper={paper} stats={stats} actions={actions} />
        ))}
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: TABLE_MIN_WIDTH }}>
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
              {/* Abbreviated, with the full wording on hover. The columns are
                  numbers; the headers only have to disambiguate them. */}
              <Tooltip title="Questions parsed" arrow>
                <TableCell align="right" sx={HEAD_SX}>Qs</TableCell>
              </Tooltip>
              <Tooltip title="Questions with an answer key" arrow>
                <TableCell align="right" sx={HEAD_SX}>Keyed</TableCell>
              </Tooltip>
              <Tooltip title="Questions active in the bank" arrow>
                <TableCell align="right" sx={HEAD_SX}>Active</TableCell>
              </Tooltip>
              <TableCell sx={{ ...HEAD_SX, minWidth: 96 }}>Ready</TableCell>
              <TableCell sx={HEAD_SX}>Status</TableCell>
              <TableCell sx={HEAD_SX}>Added</TableCell>
              <TableCell align="right" sx={HEAD_SX}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ paper, stats }) => {
              const deleting = actions.actionLoading === `${paper.id}-delete`;
              return (
                <TableRow
                  key={paper.id}
                  hover
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${stats.paperLabel}`}
                  onClick={() => actions.onOpen(paper.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      actions.onOpen(paper.id);
                    }
                  }}
                  sx={{
                    cursor: 'pointer',
                    opacity: deleting ? 0.5 : 1,
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: -2,
                    },
                    // The sticky cell needs its own background or the scrolling
                    // columns show through it, and it has to react to hover
                    // with the rest of the row or it looks detached.
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
                    <PaperIdentity paper={paper} stats={stats} />
                  </TableCell>
                  <TableCell align="right" sx={CELL_SX}>{stats.total}</TableCell>
                  <TableCell align="right" sx={CELL_SX}>{stats.keyed}</TableCell>
                  <TableCell align="right" sx={CELL_SX}>{stats.activeCount}</TableCell>
                  <TableCell sx={CELL_SX}>
                    {stats.total === 0 ? (
                      <Typography variant="caption" color="text.disabled">
                        No questions
                      </Typography>
                    ) : (
                      <Tooltip
                        title={`${Math.round(stats.readiness * 100)}% have an answer key`}
                        arrow
                      >
                        <Box sx={{ minWidth: 80 }}>
                          <PaperProgressBar
                            total={stats.total}
                            draft={stats.draft}
                            answerKeyed={stats.answerKeyedOnly}
                            complete={Math.max(0, stats.complete - stats.activeCount)}
                            active={stats.activeCount}
                          />
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell sx={CELL_SX}>
                    <PaperStatusChip visible={paper.is_student_visible} short />
                  </TableCell>
                  <TableCell sx={{ ...CELL_SX, whiteSpace: 'nowrap' }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(paper.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ ...CELL_SX, whiteSpace: 'nowrap' }}>
                    <PaperActions
                      paper={paper}
                      stats={stats}
                      actions={actions}
                      variant="icons"
                    />
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
