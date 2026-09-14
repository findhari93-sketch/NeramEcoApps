'use client';

/**
 * One paper on a teacher's exam page, as a card (the grid view, and every phone).
 *
 * Built on the student card's shape on purpose: the founder's note was that the
 * student list reads better than the teacher's, and the two screens describe the
 * same papers. What differs is the question each answers. A student asks "how
 * far am I"; a teacher asks "what is left to do", so the headline chip here is
 * the next job, and the bar is how much of the paper is keyed and solved.
 *
 * The whole card is one target, for the same reason as the student card: small
 * controls inside a card on a 375px screen fail the touch rules and make the
 * common action (open the paper) the hardest to hit.
 */

import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Skeleton,
  Typography,
  alpha,
  useTheme,
  type Theme,
} from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import {
  NEXT_STEP_LABELS,
  sittingLabel,
  type WorkRow,
  type WorkStage,
} from './papers/paperWorkStage';

type PaletteKey = 'error' | 'warning' | 'info' | 'primary' | 'success';

/** Icon and colour per stage. The label always sits beside it: colour is never the only signal. */
export const WORK_STAGE_LOOK: Record<WorkStage, { palette: PaletteKey; icon: React.ReactElement }> = {
  needsQuestions: { palette: 'error', icon: <UploadFileOutlinedIcon /> },
  needsAnswers: { palette: 'warning', icon: <KeyOutlinedIcon /> },
  needsSolutions: { palette: 'info', icon: <LightbulbOutlinedIcon /> },
  readyToPublish: { palette: 'primary', icon: <PublishOutlinedIcon /> },
  done: { palette: 'success', icon: <CheckCircleOutlineIcon /> },
};

/**
 * The `.dark` shade for text. The theme's `.main` warning on a tinted chip is
 * about 3.5:1, under the 4.5:1 body text needs.
 */
export function stageTextColor(theme: Theme, stage: WorkStage): string {
  return theme.palette[WORK_STAGE_LOOK[stage].palette].dark;
}

export function WorkStageChip({ stage }: { stage: WorkStage }) {
  const theme = useTheme();
  const { palette, icon } = WORK_STAGE_LOOK[stage];
  return (
    <Chip
      icon={icon}
      label={NEXT_STEP_LABELS[stage]}
      size="small"
      sx={{
        height: 24,
        fontSize: '0.75rem',
        fontWeight: 600,
        bgcolor: alpha(theme.palette[palette].main, 0.12),
        color: stageTextColor(theme, stage),
        '& .MuiChip-icon': { fontSize: 15, color: 'inherit' },
      }}
    />
  );
}

export function StudentAccessChip({ live }: { live: boolean }) {
  return (
    <Chip
      icon={live ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
      label={live ? 'Live' : 'Not published'}
      size="small"
      variant="outlined"
      sx={{
        height: 24,
        fontSize: '0.75rem',
        color: live ? 'success.dark' : 'text.secondary',
        borderColor: live ? 'success.main' : 'divider',
        '& .MuiChip-icon': { fontSize: 15, color: 'inherit' },
      }}
    />
  );
}

/** "74 of 77 answers · 70 of 75 solutions". Shared with the table so both say it the same way. */
export function workProgressLine(row: WorkRow): string {
  const { total, keyed } = row.stats;
  if (total === 0) return row.stats.hasPdf ? 'PDF linked, no questions yet' : 'No questions yet';
  const parts = [`${Math.min(keyed, total)} of ${total} answers`];
  if (row.solvable > 0) parts.push(`${row.solved} of ${row.solvable} solutions`);
  return parts.join(' · ');
}

export function WorkProgressBar({ row, maxWidth }: { row: WorkRow; maxWidth?: number }) {
  const theme = useTheme();
  const pct = Math.round(row.readiness * 100);
  if (row.stats.total === 0) return null;
  return (
    <LinearProgress
      variant="determinate"
      value={pct}
      aria-label={`Answers and solutions ${pct}% done`}
      sx={{
        height: 6,
        borderRadius: 3,
        maxWidth,
        bgcolor: alpha(theme.palette.primary.main, 0.12),
        '& .MuiLinearProgress-bar': {
          borderRadius: 3,
          bgcolor: pct >= 100 ? theme.palette.success.main : theme.palette.primary.main,
        },
      }}
    />
  );
}

export interface TeacherPaperCardProps {
  row: WorkRow;
  onOpen: (row: WorkRow) => void;
}

export default function TeacherPaperCard({ row, onOpen }: TeacherPaperCardProps) {
  const theme = useTheme();
  const { paper, stage } = row;
  const sitting = sittingLabel(paper);
  const progress = workProgressLine(row);
  const open = () => onOpen(row);

  return (
    <Paper
      variant="outlined"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${paper.year}${sitting ? ` ${sitting}` : ''}. Next step: ${NEXT_STEP_LABELS[stage]}. ${progress}`}
      sx={{
        p: 1.75,
        borderRadius: 3,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minHeight: 132,
        bgcolor: 'background.paper',
        transition: theme.transitions.create(['border-color', 'box-shadow'], { duration: 180 }),
        '&:hover': {
          borderColor: theme.palette.primary.main,
          boxShadow: `0 2px 10px ${alpha(theme.palette.primary.main, 0.16)}`,
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
          <Typography variant="subtitle2" component="span" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {paper.year}
          </Typography>
          {sitting && (
            <Typography variant="caption" component="span" color="text.secondary" sx={{ fontWeight: 600 }}>
              {sitting}
            </Typography>
          )}
        </Box>
        <ChevronRightIcon sx={{ fontSize: 20, color: 'text.disabled', flexShrink: 0 }} />
      </Box>

      <Box>
        <WorkStageChip stage={stage} />
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {progress}
        </Typography>
        <WorkProgressBar row={row} />
      </Box>

      <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <StudentAccessChip live={paper.is_student_visible} />
        {row.stats.hasPdf && (
          <Typography variant="caption" color="text.secondary">
            PDF linked
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

/** Shadows the card's own layout so the grid does not reflow when data lands. */
export function TeacherPaperCardSkeleton() {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 3, minHeight: 132 }}>
      <Skeleton variant="text" width="40%" height={22} />
      <Skeleton variant="rounded" width={120} height={24} sx={{ borderRadius: 3, my: 1 }} />
      <Skeleton variant="text" width="70%" height={16} />
      <Skeleton variant="rounded" height={6} sx={{ borderRadius: 3, mt: 0.5, mb: 1.5 }} />
      <Skeleton variant="rounded" width={90} height={24} sx={{ borderRadius: 3 }} />
    </Paper>
  );
}
