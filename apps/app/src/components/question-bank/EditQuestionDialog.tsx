'use client';

import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Typography, Alert, Box, Stack, Chip,
  Select, MenuItem, FormControl, InputLabel, CircularProgress,
  IconButton,
  useTheme, useMediaQuery,
  CloseIcon,
} from '@neram/ui';
import { getFirebaseAuth } from '@neram/auth';
import type { QuestionPostDisplay, NataQuestionCategory } from '@neram/database';

const CATEGORY_OPTIONS: { value: NataQuestionCategory; label: string }[] = [
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'general_aptitude', label: 'General Aptitude' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'logical_reasoning', label: 'Logical Reasoning' },
  { value: 'aesthetic_sensitivity', label: 'Aesthetic Sensitivity' },
  { value: 'other', label: 'Other' },
];

interface EditQuestionDialogProps {
  open: boolean;
  onClose: () => void;
  question: QuestionPostDisplay;
  onSubmitted: () => void;
}

export default function EditQuestionDialog({
  open,
  onClose,
  question,
  onSubmitted,
}: EditQuestionDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [title, setTitle] = useState(question.title);
  const [body, setBody] = useState(question.body);
  const [category, setCategory] = useState<NataQuestionCategory>(question.category);
  const [tags, setTags] = useState<string[]>(question.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => setTags(tags.filter((x) => x !== tag));

  const handleSubmit = async () => {
    setError('');

    if (!title.trim() || title.trim().length < 5) {
      setError('Title must be at least 5 characters');
      return;
    }
    if (!body.trim() || body.trim().length < 20) {
      setError('Body must be at least 20 characters');
      return;
    }

    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('Authentication required. Please sign in again.');
        return;
      }

      const res = await fetch(`/api/questions/${question.id}/edit-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          proposed_title: title.trim(),
          proposed_body: body.trim(),
          proposed_category: category,
          proposed_tags: tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit edit request');
      }

      setSuccess(true);
      setTimeout(() => {
        onSubmitted();
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit edit request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setError('');
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="span">Edit Question</Typography>
        {isMobile && (
          <IconButton edge="end" onClick={handleClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>
      <DialogContent>
        {success ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            Edit request submitted successfully! It will be reviewed by moderators.
          </Alert>
        ) : (
          <>
            <Alert severity="info" variant="outlined" sx={{ mt: 1, mb: 2 }}>
              Your edit will be reviewed by moderators before being applied.
            </Alert>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              autoFocus={!isMobile}
              fullWidth
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              sx={{ mb: 2 }}
              inputProps={{ minLength: 5 }}
              helperText={`${title.length} characters (min 5)`}
            />

            <TextField
              fullWidth
              multiline
              minRows={4}
              maxRows={12}
              label="Body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              sx={{ mb: 2 }}
              inputProps={{ minLength: 20 }}
              helperText={`${body.length} characters (min 20)`}
            />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={category}
                label="Category"
                onChange={(e) => setCategory(e.target.value as NataQuestionCategory)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Tags */}
            <Box sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => handleRemoveTag(tag)}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Add tag (optional)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                  sx={{ flex: 1 }}
                />
                <Button variant="outlined" size="small" onClick={handleAddTag} disabled={!tagInput.trim()}>
                  Add
                </Button>
              </Stack>
            </Box>
          </>
        )}
      </DialogContent>
      {!success && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} /> : undefined}
          >
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
