'use client';

import { Box, Button, Chip, IconButton, Tooltip } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { PaperStats } from './derivePaperStats';
import type { PaperActionHandlers, PaperWithBreakdown } from './paperTypes';

/** Primary card action: full width on a phone, natural width on desktop. */
const PRIMARY_ACTION_SX = {
  textTransform: 'none',
  flex: { xs: '1 1 100%', sm: '0 0 auto' },
  minHeight: { xs: 44, sm: 32 },
  fontSize: { xs: '0.8125rem', sm: '0.75rem' },
} as const;

/** Secondary actions: packed by label width, stretched to fill the row. */
const ACTION_SX = {
  textTransform: 'none',
  flex: { xs: '1 1 auto', sm: '0 0 auto' },
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  minHeight: { xs: 44, sm: 32 },
  fontSize: { xs: '0.8125rem', sm: '0.75rem' },
} as const;

export interface PaperStatusChipProps {
  visible: boolean;
  /** The tile has no room for "Live for students", only "Live". */
  short?: boolean;
}

export function PaperStatusChip({ visible, short = false }: PaperStatusChipProps) {
  return (
    <Chip
      icon={visible ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
      label={visible ? (short ? 'Live' : 'Live for students') : 'Not published'}
      size="small"
      color={visible ? 'success' : 'default'}
      variant={visible ? 'filled' : 'outlined'}
      sx={{ height: 22, fontSize: '0.7rem', '& .MuiChip-icon': { fontSize: 14 } }}
    />
  );
}

/**
 * Why Publish is greyed out.
 *
 * A disabled button with no reason beside it is the whole problem this screen
 * had, so every view that can show a disabled Publish has to show this too.
 */
export function PaperBlockedReason({
  paper,
  stats,
  compact = false,
}: {
  paper: PaperWithBreakdown;
  stats: PaperStats;
  compact?: boolean;
}) {
  if (paper.is_student_visible || stats.readyForStudents) return null;
  const text = compact
    ? 'Nothing for students yet'
    : 'Nothing for students yet. Activate a question or link the original PDF.';
  return (
    <Box
      component="span"
      sx={{
        display: 'block',
        color: 'warning.main',
        fontSize: { xs: '0.8125rem', sm: '0.75rem' },
        lineHeight: 1.5,
      }}
    >
      {text}
    </Box>
  );
}

export interface PaperActionsProps {
  paper: PaperWithBreakdown;
  stats: PaperStats;
  actions: PaperActionHandlers;
  /** `icons` is the table's action cell, where labelled buttons do not fit. */
  variant?: 'buttons' | 'icons';
}

/**
 * Publish, Activate, Deactivate and Delete, in one place for all three views.
 *
 * The wrapper stops click propagation for the whole group. Each handler also
 * calls `stopPropagation` itself, which is belt and braces on purpose: the row
 * around this navigates, and a paper that gets deleted AND opened is a bad
 * couple of seconds.
 */
export default function PaperActions({
  paper,
  stats,
  actions,
  variant = 'buttons',
}: PaperActionsProps) {
  const { actionLoading } = actions;
  const publishing = actionLoading === `${paper.id}-publish`;
  const activating = actionLoading === `${paper.id}-activate`;
  const deactivating = actionLoading === `${paper.id}-deactivate`;
  const deleting = actionLoading === `${paper.id}-delete`;
  const canPublish = stats.readyForStudents;

  if (variant === 'icons') {
    return (
      <Box
        sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip
          arrow
          title={
            paper.is_student_visible
              ? 'Unpublish'
              : canPublish
                ? 'Publish to students'
                : 'Nothing for students yet. Activate a question or link the original PDF.'
          }
        >
          {/* A disabled button fires no events, so the tooltip needs a live
              element to sit on, or the one case that most needs explaining is
              the one case with no explanation. */}
          <span>
            <IconButton
              size="small"
              color={paper.is_student_visible ? 'default' : 'success'}
              aria-label={paper.is_student_visible ? 'Unpublish' : 'Publish to students'}
              disabled={publishing || (!paper.is_student_visible && !canPublish)}
              onClick={(e) => actions.onSetVisibility(paper.id, !paper.is_student_visible, e)}
              sx={{ width: 36, height: 36 }}
            >
              {paper.is_student_visible
                ? <VisibilityOffOutlinedIcon fontSize="small" />
                : <VisibilityOutlinedIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>

        {stats.activatable > 0 && (
          <Tooltip title={`Activate ${stats.activatable}`} arrow>
            <span>
              <IconButton
                size="small"
                color="success"
                aria-label={`Activate ${stats.activatable} questions`}
                disabled={activating}
                onClick={(e) => actions.onActivate(paper.id, e)}
                sx={{ width: 36, height: 36 }}
              >
                <CheckCircleOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {stats.activeCount > 0 && (
          <Tooltip title={`Deactivate ${stats.activeCount}`} arrow>
            <span>
              <IconButton
                size="small"
                color="warning"
                aria-label={`Deactivate ${stats.activeCount} questions`}
                disabled={deactivating}
                onClick={(e) => actions.onDeactivate(paper.id, e)}
                sx={{ width: 36, height: 36 }}
              >
                <RemoveCircleOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Tooltip title="Delete paper" arrow>
          <span>
            <IconButton
              size="small"
              color="error"
              aria-label={`Delete ${stats.paperLabel}`}
              disabled={deleting}
              onClick={(e) => actions.onRequestDelete(paper.id, stats.paperLabel, e)}
              sx={{ width: 36, height: 36 }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* First, because it is the only action here that changes what a student
          sees. Activate and Deactivate move questions in and out of the bank,
          which is a different question. */}
      {paper.is_student_visible ? (
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<VisibilityOffOutlinedIcon />}
          onClick={(e) => actions.onSetVisibility(paper.id, false, e)}
          disabled={publishing}
          sx={PRIMARY_ACTION_SX}
        >
          {publishing ? 'Working...' : 'Unpublish'}
        </Button>
      ) : (
        <Button
          size="small"
          variant="contained"
          color="success"
          disableElevation
          startIcon={<VisibilityOutlinedIcon />}
          onClick={(e) => actions.onSetVisibility(paper.id, true, e)}
          disabled={publishing || !canPublish}
          sx={PRIMARY_ACTION_SX}
        >
          {publishing ? 'Publishing...' : 'Publish to students'}
        </Button>
      )}
      {stats.activatable > 0 && (
        <Button
          size="small"
          variant="outlined"
          color="success"
          startIcon={<CheckCircleOutlineIcon />}
          onClick={(e) => actions.onActivate(paper.id, e)}
          disabled={activating}
          sx={ACTION_SX}
        >
          {activating ? 'Activating...' : `Activate ${stats.activatable}`}
        </Button>
      )}
      {stats.activeCount > 0 && (
        <Button
          size="small"
          variant="outlined"
          color="warning"
          // Not an eye. Deactivating pulls questions out of the bank; hiding the
          // paper from students is Unpublish.
          startIcon={<RemoveCircleOutlineIcon />}
          onClick={(e) => actions.onDeactivate(paper.id, e)}
          disabled={deactivating}
          sx={ACTION_SX}
        >
          {deactivating ? 'Deactivating...' : `Deactivate ${stats.activeCount}`}
        </Button>
      )}
      <Button
        size="small"
        variant="outlined"
        color="error"
        startIcon={<DeleteOutlineIcon />}
        onClick={(e) => actions.onRequestDelete(paper.id, stats.paperLabel, e)}
        disabled={deleting}
        sx={ACTION_SX}
      >
        Delete
      </Button>
    </Box>
  );
}
