'use client';

/**
 * Staff edit of a student review: the words, the stars, the name and the facts.
 *
 * Full control, with two guard rails that keep it honest:
 *  - the student's own words stay on record (original_text) and are shown here,
 *    so staff always see what they are changing from;
 *  - changing the stars asks once, because hiding a review is usually what is
 *    meant, and quietly turning a 2 into a 5 under a student's name is not.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Rating,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeOutlined';
import UndoIcon from '@mui/icons-material/Undo';

export interface EditableReview {
  id: string;
  text: string;
  original_text: string | null;
  rating: number | null;
  display_name: string;
  college_admitted: string | null;
  rank: number | null;
  percentile: number | null;
}

export default function ReviewEditDialog({
  review,
  open,
  onClose,
  onSaved,
}: {
  review: EditableReview;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(review.text);
  const [rating, setRating] = useState<number | null>(review.rating);
  const [name, setName] = useState(review.display_name);
  const [college, setCollege] = useState(review.college_admitted || '');
  const [rank, setRank] = useState(review.rank ? String(review.rank) : '');
  const [percentile, setPercentile] = useState(review.percentile != null ? String(review.percentile) : '');
  const [confirmRating, setConfirmRating] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');

  useEffect(() => {
    if (!open) return;
    setText(review.text);
    setRating(review.rating);
    setName(review.display_name);
    setCollege(review.college_admitted || '');
    setRank(review.rank ? String(review.rank) : '');
    setPercentile(review.percentile != null ? String(review.percentile) : '');
    setConfirmRating(false);
    setError('');
    setManualPrompt('');
  }, [open, review]);

  const ratingChanged = rating !== review.rating;

  const tidy = async () => {
    setTidying(true);
    setError('');
    setManualPrompt('');
    try {
      const res = await fetch(`/api/testimonials/${review.id}/ai-tidy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.manualPrompt) {
        setManualPrompt(body.manualPrompt);
        setError('AI is switched to manual. Copy the prompt below into a chat app if you want a suggestion.');
        return;
      }
      if (!res.ok) throw new Error(body.error || 'AI tidy failed.');
      setText(body.suggestion);
    } catch (e: any) {
      setError(e.message || 'AI tidy failed.');
    } finally {
      setTidying(false);
    }
  };

  const save = async () => {
    if (ratingChanged && !confirmRating) {
      setConfirmRating(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/testimonials/${review.id}/review-edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          ...(ratingChanged && rating ? { rating } : {}),
          displayName: name,
          collegeAdmitted: college.trim() || null,
          rank: rank.trim() || null,
          percentile: percentile.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save.');
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="review-edit-title">
      <DialogTitle id="review-edit-title">Edit review</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: review.original_text ? '1fr 1fr' : '1fr' }, gap: 2 }}>
          <Box>
            <TextField
              label="Shown on the website"
              value={text}
              onChange={(e) => setText(e.target.value)}
              multiline
              minRows={8}
              fullWidth
              helperText={`${text.trim().length} of 1,500 characters`}
              inputProps={{ maxLength: 1500 }}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                startIcon={tidying ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
                onClick={tidy}
                disabled={tidying || saving}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                {tidying ? 'Tidying...' : 'AI tidy'}
              </Button>
              {review.original_text && text !== review.original_text && (
                <Button startIcon={<UndoIcon />} onClick={() => setText(review.original_text!)} sx={{ textTransform: 'none', minHeight: 44 }}>
                  Use the student's words
                </Button>
              )}
            </Stack>
          </Box>
          {review.original_text && (
            <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
              <Typography variant="overline" color="text.secondary">
                What the student sent
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
                {review.original_text}
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 2.5 }}>
          <TextField label="Name shown" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 60 }} />
          <TextField label="College" value={college} onChange={(e) => setCollege(e.target.value)} inputProps={{ maxLength: 120 }} />
          <TextField label="AIR" value={rank} onChange={(e) => setRank(e.target.value.replace(/\D/g, ''))} inputProps={{ inputMode: 'numeric' }} />
          <TextField label="Percentile" value={percentile} onChange={(e) => setPercentile(e.target.value.replace(/[^\d.]/g, ''))} inputProps={{ inputMode: 'decimal' }} />
        </Box>

        <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Stars
          </Typography>
          <Rating value={rating} onChange={(_, v) => { setRating(v); setConfirmRating(false); }} />
          {ratingChanged && (
            <Typography variant="body2" color="warning.dark">
              The student gave {review.rating ?? 'no'} star{review.rating === 1 ? '' : 's'}.
            </Typography>
          )}
        </Box>

        {confirmRating && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This changes the student's own rating. If you just do not want it on the site, close this and use Not public
            instead. Press Save again to change the stars anyway.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
        {manualPrompt && (
          <TextField value={manualPrompt} multiline minRows={4} fullWidth sx={{ mt: 1 }} InputProps={{ readOnly: true }} label="Prompt" />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Edits change neramclasses.com only. The student's own words stay on record, and their Google review is always
          in their own words.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={saving || text.trim().length < 20} sx={{ textTransform: 'none', boxShadow: 'none' }}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
