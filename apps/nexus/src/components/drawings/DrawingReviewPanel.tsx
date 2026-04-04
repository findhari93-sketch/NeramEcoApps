'use client';

import { useState } from 'react';
import {
  Box, Typography, Button, TextField, Rating, Paper, Divider,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import SketchOverCanvas from './SketchOverCanvas';
import ResourceLinkSearch from './ResourceLinkSearch';
import CategoryBadge from './CategoryBadge';
import type { DrawingSubmissionWithDetails, TutorResource } from '@neram/database/types';

interface DrawingReviewPanelProps {
  submission: DrawingSubmissionWithDetails;
  getToken: () => Promise<string | null>;
  onReviewSaved: () => void;
}

export default function DrawingReviewPanel({
  submission, getToken, onReviewSaved,
}: DrawingReviewPanelProps) {
  const [sketchOpen, setSketchOpen] = useState(false);
  const [reviewedImageUrl, setReviewedImageUrl] = useState<string | null>(
    submission.reviewed_image_url
  );
  const [rating, setRating] = useState<number>(submission.tutor_rating || 0);
  const [feedback, setFeedback] = useState(submission.tutor_feedback || '');
  const [resources, setResources] = useState<TutorResource[]>(
    submission.tutor_resources || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSketchSave = async (blob: Blob) => {
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', blob, 'review.png');
      formData.append('bucket', 'drawing-reviewed');

      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setReviewedImageUrl(url);
      setSketchOpen(false);
    } catch {
      setError('Failed to save sketch');
    }
  };

  const handleSaveReview = async () => {
    if (rating < 1) {
      setError('Please provide a rating');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${submission.id}/review`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tutor_rating: rating,
          tutor_feedback: feedback || null,
          reviewed_image_url: reviewedImageUrl,
          tutor_resources: resources,
        }),
      });

      if (!res.ok) throw new Error('Failed to save review');
      onReviewSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {submission.student?.name || 'Student'}
        </Typography>
        {submission.question && <CategoryBadge category={submission.question.category} />}
      </Box>

      {submission.question && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'grey.50' }}>
          <Typography variant="body2">{submission.question.question_text}</Typography>
        </Paper>
      )}

      <Box
        component="img"
        src={reviewedImageUrl || submission.original_image_url}
        alt="Student drawing"
        sx={{ width: '100%', borderRadius: 1, bgcolor: 'grey.50', mb: 1.5 }}
      />

      <Button
        variant="outlined"
        startIcon={<BrushOutlinedIcon />}
        onClick={() => setSketchOpen(true)}
        fullWidth
        sx={{ mb: 2, minHeight: 48, textTransform: 'none' }}
      >
        {reviewedImageUrl ? 'Edit Sketch-Over' : 'Draw Over Image'}
      </Button>

      {submission.self_note && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="caption" fontWeight={600}>Student&apos;s Note</Typography>
          <Typography variant="body2">{submission.self_note}</Typography>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>Rating</Typography>
        <Rating
          value={rating}
          onChange={(_, v) => setRating(v || 0)}
          size="large"
        />
      </Box>

      <TextField
        label="Written Feedback"
        placeholder="Share constructive feedback about their drawing..."
        multiline
        rows={3}
        fullWidth
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        sx={{ mb: 2 }}
      />

      <ResourceLinkSearch
        resources={resources}
        onChange={setResources}
        getToken={getToken}
      />

      <Divider sx={{ my: 2 }} />

      {error && (
        <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>{error}</Typography>
      )}

      <Button
        variant="contained"
        fullWidth
        onClick={handleSaveReview}
        disabled={saving || rating < 1}
        sx={{ minHeight: 48, textTransform: 'none' }}
      >
        {saving ? 'Saving Review...' : 'Save Review'}
      </Button>

      {sketchOpen && (
        <SketchOverCanvas
          imageUrl={submission.original_image_url}
          onSave={handleSketchSave}
          onClose={() => setSketchOpen(false)}
        />
      )}
    </Box>
  );
}
