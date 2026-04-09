'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Chip,
} from '@neram/ui';
import type { QuestionPostDisplay, NataQuestionCategory } from '@neram/database';

const CATEGORY_OPTIONS: { value: NataQuestionCategory; label: string }[] = [
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'general_aptitude', label: 'General Aptitude' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'logical_reasoning', label: 'Logical Reasoning' },
  { value: 'aesthetic_sensitivity', label: 'Aesthetic Sensitivity' },
  { value: 'other', label: 'Other' },
];

const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface AdminEditQuestionDialogProps {
  open: boolean;
  onClose: () => void;
  question: QuestionPostDisplay;
  onSaved: (updated: QuestionPostDisplay) => void;
}

export default function AdminEditQuestionDialog({
  open,
  onClose,
  question,
  onSaved,
}: AdminEditQuestionDialogProps) {
  const [title, setTitle] = useState(question.title);
  const [body, setBody] = useState(question.body);
  const [category, setCategory] = useState<NataQuestionCategory>(question.category);
  const [examYear, setExamYear] = useState<string>(String(question.exam_year ?? ''));
  const [examMonth, setExamMonth] = useState<number | ''>(question.exam_month ?? '');
  const [examSession, setExamSession] = useState(question.exam_session ?? '');
  const [confidenceLevel, setConfidenceLevel] = useState<number>(question.confidence_level ?? 3);
  const [tags, setTags] = useState<string[]>(question.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    setError('');
    if (!title.trim() || title.trim().length < 5) {
      setError('Title must be at least 5 characters');
      return;
    }
    if (!body.trim() || body.trim().length < 20) {
      setError('Body must be at least 20 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          exam_year: examYear ? parseInt(examYear, 10) : null,
          exam_month: examMonth || null,
          exam_session: examSession.trim() || null,
          confidence_level: confidenceLevel,
          tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      const { data: updated } = await res.json();
      onSaved({
        ...question,
        title: updated.title,
        body: updated.body,
        category: updated.category,
        exam_year: updated.exam_year,
        exam_month: updated.exam_month,
        exam_session: updated.exam_session,
        confidence_level: updated.confidence_level,
        tags: updated.tags,
        updated_at: updated.updated_at,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save question';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Question (Admin)</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ mb: 2 }}
          helperText={`${title.length} chars (min 5)`}
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
          helperText={`${body.length} chars (min 20)`}
        />

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => setCategory(e.target.value as NataQuestionCategory)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Month</InputLabel>
            <Select
              value={examMonth}
              label="Month"
              onChange={(e) => setExamMonth(Number(e.target.value) as number | '')}
              displayEmpty
            >
              <MenuItem value="">None</MenuItem>
              {MONTH_OPTIONS.map((m, i) => (
                <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Year"
            type="number"
            value={examYear}
            onChange={(e) => setExamYear(e.target.value)}
            inputProps={{ min: 2010, max: 2040 }}
          />
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="Session / Slot"
            value={examSession}
            onChange={(e) => setExamSession(e.target.value)}
            placeholder="e.g. Session one slot 2"
          />

          <FormControl fullWidth>
            <InputLabel>Confidence (1-5)</InputLabel>
            <Select
              value={confidenceLevel}
              label="Confidence (1-5)"
              onChange={(e) => setConfidenceLevel(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <MenuItem key={n} value={n}>{n}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {/* Tags */}
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
            label="Add tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
            sx={{ flex: 1 }}
          />
          <Button variant="outlined" size="small" onClick={handleAddTag}>Add</Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
