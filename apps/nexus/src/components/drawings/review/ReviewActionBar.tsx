'use client';

/**
 * The bar that closes a drawing review, in its two states.
 *
 * Owed work (assignments, tests): Save draft, Redo, Complete. Practice: Next and
 * Send review, marking optional. Both carry the Show in Inspiration switch when
 * the drawing has an item.
 * Locked: a finished or superseded round, with an explicit way back into grading
 * so the teacher is never left on a screen with nothing to press.
 *
 * Both states share one shell so the locked bar sits exactly where the grading
 * bar does. On a phone that shell is fixed above the bottom nav; from 900px up it
 * is inline at the foot of the feedback column. That used to be a JavaScript
 * branch feeding two copies of the tree, and is now breakpoints on one.
 */

import type { ReactNode } from 'react';
import { completeLabel } from '@/lib/drawing-ai-draft';
import { Box, Button, IconButton, Typography } from '@neram/ui';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

/** Height of the bottom nav the phone bar has to clear. */
const BOTTOM_NAV_HEIGHT = 64;

const barShellSx = {
  display: 'flex',
  alignItems: 'center',
  gap: { xs: 0.5, md: 0.75 },
  px: 1,
  py: 0.75,
  borderTop: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  position: { xs: 'fixed', md: 'static' },
  bottom: { xs: BOTTOM_NAV_HEIGHT, md: 'auto' },
  left: { xs: 0, md: 'auto' },
  right: { xs: 0, md: 'auto' },
  zIndex: { xs: 10, md: 'auto' },
  boxShadow: { xs: '0 -2px 8px rgba(0,0,0,0.1)', md: 'none' },
  flexShrink: { md: 0 },
} as const;

/** Icons inside buttons are decorative on a phone, where space is the constraint. */
const hideStartIconOnPhone = {
  '& .MuiButton-startIcon': { display: { xs: 'none', md: 'inherit' } },
} as const;

export interface ReviewActionBarProps {
  isEditMode: boolean;
  /** A finished round, or one superseded by a newer attempt. */
  isSuperseded: boolean;
  attemptIndex: number;
  attemptTotal: number;
  /** Human label for the current status, e.g. "Redo requested". */
  statusLabel: string;
  /** True once this round already carries a review action. */
  alreadyReviewed: boolean;

  onEvaluate: () => void;
  onOpenLatest: (() => void) | null;

  onSaveDraft: () => void;
  draftSaving: boolean;
  draftSaved: boolean;

  onRedo: () => void;
  onComplete: () => void;
  /** An AI draft is on this sheet, so completing it is approving it. */
  hasAiDraft?: boolean;
  saving: boolean;
  /** Which action is in flight, so only that button shows its spinner text. */
  pendingAction: 'redo' | 'complete';

  /** A note is being recorded or saved; the bar waits for it. */
  voiceBusy: boolean;

  /** Owed work must be marked; practice only may be. */
  mode: 'owed' | 'practice';
  /** A sketch and a test drawing have no redo round. */
  canRedo: boolean;
  /** Practice: move on without saving. Null hides Next. */
  onNext: (() => void) | null;
  /** The Show in Inspiration switch, when this drawing has an Inspiration item. */
  inspirationSlot?: ReactNode;
}

export default function ReviewActionBar({
  isEditMode, isSuperseded, attemptIndex, attemptTotal, statusLabel, alreadyReviewed,
  onEvaluate, onOpenLatest,
  onSaveDraft, draftSaving, draftSaved,
  onRedo, onComplete, saving, pendingAction, hasAiDraft,
  voiceBusy, mode, canRedo, onNext, inspirationSlot,
}: ReviewActionBarProps) {
  if (!isEditMode) {
    return (
      <Box sx={barShellSx}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: 1, minWidth: 0, fontWeight: 600, lineHeight: 1.3 }}
        >
          {isSuperseded
            ? `Attempt ${attemptIndex} of ${attemptTotal}, a newer attempt exists`
            : `${statusLabel}, review is locked`}
        </Typography>
        {isSuperseded && onOpenLatest && (
          <Button
            variant="outlined"
            size="small"
            onClick={onOpenLatest}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 48, minWidth: 0, px: 1.5 }}
          >
            Latest
          </Button>
        )}
        {mode === 'practice' && onNext && (
          <Button
            variant="outlined"
            size="small"
            endIcon={<ArrowForwardIcon />}
            onClick={onNext}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 48, minWidth: 0, px: 1.5 }}
          >
            Next
          </Button>
        )}
        <Button
          variant="contained"
          size="small"
          startIcon={<EditOutlinedIcon />}
          onClick={onEvaluate}
          sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.78rem', minHeight: 48, px: 2 }}
        >
          Evaluate
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        ...barShellSx,
        // While a note is being recorded on a phone, the recorder's own Stop bar
        // takes this spot. Redo and Complete wait for the note regardless.
        display: voiceBusy ? { xs: 'none', md: 'flex' } : 'flex',
        // From 900px the gallery switch takes a thin row of its own above the
        // buttons: in a 360px rail four controls on one line cut Complete off.
        flexWrap: { md: 'wrap' },
        rowGap: { md: 0.25 },
        pt: { md: 0.25 },
      }}
    >
      {inspirationSlot && (
        <Box sx={{ order: { xs: 10, md: -1 }, width: { md: '100%' }, display: 'flex', justifyContent: 'flex-end', minHeight: { md: 32 } }}>
          {inspirationSlot}
        </Box>
      )}

      {mode === 'owed' && (
        <>
          {/* Draft: icon-only where the bar is tight, icon and text where it is not. */}
          <IconButton
            onClick={onSaveDraft}
            disabled={draftSaving || saving}
            color={draftSaved ? 'success' : 'default'}
            size="small"
            title={draftSaving ? 'Saving...' : draftSaved ? 'Draft saved!' : 'Save draft'}
            sx={{
              border: '1px solid',
              borderColor: draftSaved ? 'success.main' : 'divider',
              borderRadius: 1.5,
              width: 48,
              height: 48,
              display: { xs: 'inline-flex', md: 'none' },
            }}
          >
            {draftSaved ? <CheckCircleOutlineIcon fontSize="small" /> : <SaveOutlinedIcon fontSize="small" />}
          </IconButton>
          <Button
            variant="outlined"
            size="small"
            onClick={onSaveDraft}
            disabled={draftSaving || saving}
            startIcon={draftSaved ? <CheckCircleOutlineIcon /> : <SaveOutlinedIcon />}
            color={draftSaved ? 'success' : 'inherit'}
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
              minHeight: 48, minWidth: 0, whiteSpace: 'nowrap',
              display: { xs: 'none', md: 'inline-flex' },
            }}
          >
            {draftSaving ? 'Saving' : draftSaved ? 'Saved' : 'Save draft'}
          </Button>
        </>
      )}

      {canRedo && (
        <Button
          variant="outlined"
          color="warning"
          size="small"
          onClick={onRedo}
          disabled={saving || draftSaving || voiceBusy}
          startIcon={<ReplayIcon />}
          sx={{
            textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
            minHeight: 48, minWidth: 0, px: { xs: 1.5, md: 2 }, whiteSpace: 'nowrap',
            ...hideStartIconOnPhone,
          }}
        >
          {saving && pendingAction === 'redo' ? '...' : 'Redo'}
        </Button>
      )}

      {mode === 'practice' && onNext && (
        <Button
          variant="outlined"
          size="small"
          onClick={onNext}
          disabled={saving || draftSaving || voiceBusy}
          sx={{
            textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
            minHeight: 48, minWidth: 0, px: { xs: 1.5, md: 2 }, whiteSpace: 'nowrap',
          }}
        >
          Next
        </Button>
      )}

      <Button
        variant="contained"
        color="success"
        size="small"
        onClick={onComplete}
        disabled={saving || draftSaving || voiceBusy}
        startIcon={<CheckCircleOutlineIcon />}
        sx={{
          textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
          minHeight: 48, flex: 1, px: { xs: 1.5, md: 2 }, whiteSpace: 'nowrap',
          ...hideStartIconOnPhone,
        }}
      >
        {/* 'Save' only where it is honest: updating an already-finished review.
            A redo round is still open, and this button completes it. */}
        {saving && pendingAction === 'complete'
          ? '...'
          : mode === 'practice'
            ? (alreadyReviewed ? 'Update review' : 'Send review')
            : completeLabel({ hasDraft: !!hasAiDraft, alreadyReviewed })}
      </Button>

    </Box>
  );
}
