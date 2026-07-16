'use client';

/**
 * Student view of a DRAWING-type assignment. Submitting routes through the
 * existing Drawing Review channel (DrawingSubmissionSheet -> /api/drawing/*),
 * and once the teacher has evaluated it this shows their overlay, corrected
 * reference, region notes, rating and feedback, with a redo when requested.
 */
import { useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Rating, ToggleButtonGroup, ToggleButton, alpha,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';

export interface DrawingSubmissionView {
  id: string;
  original_image_url: string;
  reviewed_image_url: string | null;
  corrected_image_url: string | null;
  tutor_rating: number | null;
  tutor_feedback: string | null;
  status: string; // submitted | under_review | redo | completed | reviewed
  ai_overlay_annotations: Array<{ area?: string; label?: string; severity?: string }> | null;
  submitted_at: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted, awaiting review', color: '#1565C0' },
  under_review: { label: 'Under review', color: '#1565C0' },
  redo: { label: 'Redo requested', color: '#B54700' },
  completed: { label: 'Reviewed', color: '#2E7D32' },
  reviewed: { label: 'Reviewed', color: '#2E7D32' },
};

export default function DrawingAssignmentPanel({
  assignmentId,
  submission,
  getToken,
  onChanged,
}: {
  assignmentId: string;
  submission: DrawingSubmissionView | null;
  getToken: () => Promise<string | null>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'mine' | 'overlay' | 'reference'>('mine');

  const canRedo = !submission || submission.status === 'redo';
  const isReviewed = submission?.status === 'completed' || submission?.status === 'reviewed';
  const meta = submission ? STATUS_META[submission.status] || STATUS_META.submitted : null;

  const shownImage = useMemo(() => {
    if (!submission) return null;
    if (view === 'overlay' && submission.reviewed_image_url) return submission.reviewed_image_url;
    if (view === 'reference' && submission.corrected_image_url) return submission.corrected_image_url;
    return submission.original_image_url;
  }, [submission, view]);

  const hasOverlay = !!submission?.reviewed_image_url;
  const hasReference = !!submission?.corrected_image_url;
  const annotations = (submission?.ai_overlay_annotations || []).filter((a) => a && (a.label || a.area));

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <BrushOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
          Your drawing
        </Typography>
        {meta && (
          <Chip
            size="small"
            label={meta.label}
            sx={{ fontWeight: 700, bgcolor: alpha(meta.color, 0.14), color: meta.color }}
          />
        )}
      </Stack>

      {submission ? (
        <Stack spacing={1.5}>
          {(hasOverlay || hasReference) && (
            <ToggleButtonGroup
              value={view}
              exclusive
              size="small"
              onChange={(_, v) => v && setView(v)}
              fullWidth
            >
              <ToggleButton value="mine" sx={{ textTransform: 'none', minHeight: 40 }}>
                My drawing
              </ToggleButton>
              {hasOverlay && (
                <ToggleButton value="overlay" sx={{ textTransform: 'none', minHeight: 40 }}>
                  Teacher marks
                </ToggleButton>
              )}
              {hasReference && (
                <ToggleButton value="reference" sx={{ textTransform: 'none', minHeight: 40 }}>
                  Reference
                </ToggleButton>
              )}
            </ToggleButtonGroup>
          )}

          {shownImage && (
            <Box
              component="img"
              src={shownImage}
              alt="Your drawing"
              sx={{ width: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}
            />
          )}

          {isReviewed && submission.tutor_rating != null && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Rating
              </Typography>
              <Rating value={submission.tutor_rating} max={5} readOnly size="small" />
            </Stack>
          )}

          {annotations.length > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                What to fix
              </Typography>
              <Stack component="ul" sx={{ pl: 2.2, m: 0, mt: 0.5 }} spacing={0.25}>
                {annotations.map((a, i) => (
                  <Typography key={i} component="li" variant="body2">
                    {a.label || a.area}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}

          {submission.tutor_feedback && (
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                Teacher feedback
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>
                {submission.tutor_feedback}
              </Typography>
            </Box>
          )}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.disabled">
          You have not submitted your drawing yet.
        </Typography>
      )}

      {canRedo && (
        <Button
          variant="contained"
          startIcon={<BrushOutlinedIcon />}
          onClick={() => setOpen(true)}
          sx={{ mt: 1.5, minHeight: 48, textTransform: 'none' }}
        >
          {submission?.status === 'redo' ? 'Redo your drawing' : 'Submit your drawing'}
        </Button>
      )}

      <DrawingSubmissionSheet
        open={open}
        onClose={() => setOpen(false)}
        assignmentId={assignmentId}
        sourceType="assignment"
        getToken={getToken}
        onSubmitted={onChanged}
      />
    </Box>
  );
}
