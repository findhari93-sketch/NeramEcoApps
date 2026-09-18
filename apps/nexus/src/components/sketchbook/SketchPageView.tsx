'use client';

import { useState, type ReactNode } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography,
} from '@neram/ui';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CommentSection from '@/components/drawings/CommentSection';
import PageHeader from '@/components/PageHeader';
import { drawingSourceLabel } from '@/lib/drawing-source';
import { REACTION_LABEL } from '@/lib/sketchbook-messages';
import type { GridSketch } from './SketchGrid';

interface SketchPageViewProps {
  sketch: GridSketch;
  mode: 'own' | 'teacher';
  backHref: string;
  getToken: () => Promise<string | null>;
  onDelete?: () => Promise<void>;
  /** Teacher-side actions (react, feature), rendered under the image. */
  actions?: ReactNode;
  /** The student's own released review, rendered above the actions. */
  review?: ReactNode;
  studentName?: string | null;
}

const fmtLong = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function SketchPageView({ sketch, mode, backHref, getToken, onDelete, actions, review, studentName }: SketchPageViewProps) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canDelete = mode === 'own' && !!onDelete && sketch.featured.length === 0;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title={studentName ? `${studentName}'s ${sketch.source_type === 'sketchbook' ? 'sketch' : 'drawing'}` : drawingSourceLabel(sketch.source_type)}
        subtitle={fmtLong(sketch.submitted_at)}
        backHref={backHref}
      />

      <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider', mb: 2 }}>
        <Box component="img" src={sketch.original_image_url} alt={sketch.self_note || 'Sketch'} sx={{ width: '100%', height: 'auto', display: 'block', maxHeight: '70vh', objectFit: 'contain', bgcolor: 'action.hover' }} />
      </Paper>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
        {sketch.source_type !== 'sketchbook' && (
          <Chip
            label={sketch.assignment?.title ? `${drawingSourceLabel(sketch.source_type)}: ${sketch.assignment.title}` : drawingSourceLabel(sketch.source_type)}
            variant="outlined"
            sx={{ height: 36, maxWidth: '100%' }}
          />
        )}
        {sketch.featured.map((f) => (
          <Chip key={f.classroom_id} icon={<StarOutlinedIcon />} color="warning" label={`Featured in ${f.classroom_name}`} sx={{ height: 36 }} />
        ))}
        {sketch.reaction && REACTION_LABEL[sketch.reaction as keyof typeof REACTION_LABEL] && (
          <Chip label={`${REACTION_LABEL[sketch.reaction as keyof typeof REACTION_LABEL]} from your teacher`} color="primary" variant="outlined" sx={{ height: 36 }} />
        )}
        {sketch.seenBy && <Chip label={`Seen by ${sketch.seenBy.name?.split(' ')[0] || 'your teacher'}`} variant="outlined" sx={{ height: 36 }} />}
      </Box>

      {sketch.self_note && <Typography variant="body1" sx={{ mb: 2 }}>{sketch.self_note}</Typography>}

      {review}

      {actions}

      <CommentSection submissionId={sketch.id} getToken={getToken} canComment />

      {canDelete && (
        <>
          <Button startIcon={<DeleteOutlineIcon />} color="error" variant="text" onClick={() => setConfirm(true)} sx={{ mt: 3, minHeight: 48 }}>
            Delete this sketch
          </Button>
          <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="delete-sketch-title">
            <DialogTitle id="delete-sketch-title">Delete this sketch?</DialogTitle>
            <DialogContent>
              <Box component="img" src={sketch.thumbnail_url || sketch.original_image_url} alt="" sx={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 1.5, display: 'block', mb: 1 }} />
              <Typography variant="body2">It leaves your sketchbook and your practice day is recounted. This cannot be undone.</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirm(false)} sx={{ minHeight: 48 }}>Keep it</Button>
              <Button color="error" variant="contained" disabled={deleting} sx={{ minHeight: 48 }}
                onClick={async () => { setDeleting(true); try { await onDelete!(); } finally { setDeleting(false); setConfirm(false); } }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      {mode === 'own' && sketch.featured.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          A featured sketch stays in your sketchbook. Ask your teacher if you want it un-featured.
        </Typography>
      )}
    </Box>
  );
}
