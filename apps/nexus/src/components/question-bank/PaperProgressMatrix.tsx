'use client';

/**
 * Students down, papers across.
 *
 * The one screen that answers "who has actually done the past papers". Each cell
 * is the same three pips a student sees on their own card, so a teacher pointing
 * at a row and the student looking at their Question Bank are reading the same
 * picture rather than two dialects of it.
 *
 * MOBILE
 *
 * A matrix does not shrink. Rather than squeezing it, the phone gets one
 * expandable card per student listing only the papers they have touched, which
 * is the question a teacher asks on a phone anyway ("how is this one doing").
 * The grid returns at 900px, where a sticky name column and horizontal scroll on
 * the paper columns is the honest layout. This is the one place the app's
 * no-horizontal-scroll rule gives way, and it does so inside its own container:
 * the page body still never scrolls sideways.
 */

import { useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  Paper,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
  UserAvatar,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { NexusQBPaperMatrix, NexusQBPaperMatrixCell } from '@neram/database';
import PaperFacePips from './PaperFacePips';

/** Wide enough for three 24px pips plus their gaps, and no wider. */
const CELL_W = 104;
const NAME_W = 180;

export interface PaperProgressMatrixProps {
  matrix: NexusQBPaperMatrix;
}

export default function PaperProgressMatrix({ matrix }: PaperProgressMatrixProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (matrix.papers.length === 0 || matrix.rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
        <Typography variant="body2" color="text.secondary">
          {matrix.papers.length === 0
            ? 'No papers published to students yet. Publish one from its Student access tab.'
            : 'No students enrolled in this classroom yet.'}
        </Typography>
      </Paper>
    );
  }

  if (isMobile) return <MobileList matrix={matrix} />;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ minWidth: NAME_W + matrix.papers.length * CELL_W }}>
          {/* Header */}
          <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider' }}>
            <HeaderCell sticky width={NAME_W}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                STUDENT
              </Typography>
            </HeaderCell>
            {matrix.papers.map((p) => (
              <HeaderCell key={p.id} width={CELL_W}>
                <Typography variant="caption" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  {p.short_title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                  {p.exam_type === 'NATA' ? 'NATA' : 'JEE P2'}
                </Typography>
              </HeaderCell>
            ))}
          </Box>

          {matrix.rows.map((row) => (
            <Box
              key={row.student_id}
              sx={{
                display: 'flex',
                borderBottom: 1,
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
                '&:last-of-type': { borderBottom: 0 },
              }}
            >
              <HeaderCell sticky width={NAME_W}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <UserAvatar name={row.student_name} src={row.avatar_url} size={28} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {row.student_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.papers_completed} done
                    </Typography>
                  </Box>
                </Box>
              </HeaderCell>

              {matrix.papers.map((p) => {
                const cell = row.cells[p.id];
                return (
                  <Box
                    key={p.id}
                    sx={{
                      width: CELL_W,
                      flexShrink: 0,
                      p: 1,
                      display: 'grid',
                      placeItems: 'center',
                      borderLeft: 1,
                      borderColor: 'divider',
                    }}
                  >
                    {cell ? (
                      <CellBody cell={cell} context={`${row.student_name}, ${p.short_title}`} />
                    ) : (
                      // An em-dash-free "nothing here". A blank cell reads as a
                      // rendering fault; this reads as an answer.
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        ·
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}

function CellBody({ cell, context }: { cell: NexusQBPaperMatrixCell; context: string }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', gap: 0.25 }}>
      <PaperFacePips faces={cell} variant="dot" context={context} />
      {cell.best_test_pct != null && (
        <Typography variant="caption" sx={{ fontSize: '0.62rem', fontWeight: 700 }}>
          {Math.round(cell.best_test_pct)}%
        </Typography>
      )}
    </Box>
  );
}

function HeaderCell({
  children,
  width,
  sticky,
}: {
  children: React.ReactNode;
  width: number;
  sticky?: boolean;
}) {
  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        ...(sticky
          ? {
              position: 'sticky',
              left: 0,
              zIndex: 1,
              // Opaque, or the scrolled columns show through the name.
              bgcolor: 'background.paper',
              borderRight: 1,
              borderColor: 'divider',
            }
          : {}),
      }}
    >
      {children}
    </Box>
  );
}

/** One card per student, papers they have touched listed inside. */
function MobileList({ matrix }: { matrix: NexusQBPaperMatrix }) {
  const theme = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = new Map(matrix.papers.map((p) => [p.id, p]));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {matrix.rows.map((row) => {
        const touched = Object.keys(row.cells);
        const open = openId === row.student_id;
        return (
          <Paper key={row.student_id} variant="outlined" sx={{ borderRadius: 3 }}>
            <Box
              onClick={() => setOpenId(open ? null : row.student_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenId(open ? null : row.student_id);
                }
              }}
              tabIndex={0}
              role="button"
              aria-expanded={open}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                minHeight: 56,
                cursor: 'pointer',
              }}
            >
              <UserAvatar name={row.student_name} src={row.avatar_url} size={36} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={700} noWrap>
                  {row.student_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {touched.length} of {matrix.papers.length} started · {row.papers_completed} done
                </Typography>
              </Box>
              <Chip
                size="small"
                label={`${row.papers_completed}`}
                sx={{
                  height: 24,
                  fontWeight: 700,
                  bgcolor: alpha(
                    row.papers_completed > 0
                      ? theme.palette.success.main
                      : theme.palette.text.primary,
                    0.1,
                  ),
                }}
              />
              <ExpandMoreIcon
                sx={{
                  color: 'text.disabled',
                  transform: open ? 'rotate(180deg)' : 'none',
                  transition: 'transform 180ms',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              />
            </Box>

            <Collapse in={open} unmountOnExit>
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                {touched.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    Has not opened a paper yet.
                  </Typography>
                ) : (
                  touched.map((paperId) => {
                    const paper = byId.get(paperId);
                    const cell = row.cells[paperId];
                    if (!paper || !cell) return null;
                    return (
                      <Box
                        key={paperId}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          py: 0.75,
                          borderTop: 1,
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }} noWrap>
                          {paper.title}
                        </Typography>
                        <PaperFacePips faces={cell} variant="dot" context={paper.short_title} />
                        {cell.best_test_pct != null && (
                          <Typography variant="caption" fontWeight={700} sx={{ width: 36, textAlign: 'right' }}>
                            {Math.round(cell.best_test_pct)}%
                          </Typography>
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Collapse>
          </Paper>
        );
      })}
    </Box>
  );
}
