'use client';

import { useState } from 'react';
import {
  Box, Typography, TextField, Button, Stack, Card, CardContent,
  MenuItem, Alert, CircularProgress, Slider,
} from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { NataQuestionCategory } from '@neram/database';
import ImageUpload from '@/components/question-bank/ImageUpload';

const CATEGORIES: { value: NataQuestionCategory; label: string }[] = [
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'general_aptitude', label: 'General Aptitude' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'logical_reasoning', label: 'Logical Reasoning' },
  { value: 'aesthetic_sensitivity', label: 'Aesthetic Sensitivity' },
  { value: 'other', label: 'Other' },
];

const CURRENT_YEAR = new Date().getFullYear();
const EXAM_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const CONFIDENCE_MARKS = [
  { value: 1, label: 'I may be wrong' },
  { value: 2, label: 'Not very sure' },
  { value: 3, label: 'Somewhat confident' },
  { value: 4, label: 'Fairly confident' },
  { value: 5, label: 'Very sure' },
];

export default function NewQuestionPage() {
  const { user } = useFirebaseAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NataQuestionCategory>('mathematics');
  const [examYear, setExamYear] = useState<number>(CURRENT_YEAR);
  const [examSession, setExamSession] = useState('');
  const [confidenceLevel, setConfidenceLevel] = useState(3);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const getAuthToken = async (): Promise<string | null> => {
    try {
      const auth = getFirebaseAuth();
      return await auth.currentUser?.getIdToken() || null;
    } catch {
      return null;
    }
  };

  if (!user) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, maxWidth: 500, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          Sign in required
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          You need to be signed in to post a question.
        </Typography>
        <Button component={Link} href="/login" variant="contained">
          Sign In
        </Button>
      </Box>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!body.trim()) {
      setError('Question details are required');
      return;
    }
    if (body.trim().length < 20) {
      setError('Please provide more details (at least 20 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('Authentication failed. Please sign in again.');
        return;
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          examYear: examYear || undefined,
          examSession: examSession.trim() || undefined,
          confidenceLevel,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to submit question');
        return;
      }

      router.push('/tools/nata/question-bank?posted=true');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentConfidenceLabel = CONFIDENCE_MARKS.find(m => m.value === confidenceLevel)?.label || '';

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto' }}>
      {/* Back link */}
      <Button component={Link} href="/tools/nata/question-bank" size="small" sx={{ mb: 2 }}>
        &larr; Back to Question Bank
      </Button>

      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        Post a Question
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Share a question you remember from your NATA exam to help other students prepare.
      </Typography>

      {/* Moderation notice */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Your question will be reviewed by moderators before it&apos;s published. This usually takes less than 24 hours.
      </Alert>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {/* Title */}
              <TextField
                label="Question Title"
                placeholder="e.g., NATA 2026 Session 1 - Geometry question about..."
                fullWidth
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                inputProps={{ maxLength: 200 }}
                helperText={`${title.length}/200`}
              />

              {/* Body */}
              <TextField
                label="Question Details"
                placeholder="Describe the question as you remember it. Include any specific details, options, or diagrams mentioned..."
                fullWidth
                required
                multiline
                minRows={5}
                maxRows={15}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                inputProps={{ maxLength: 5000 }}
                helperText={`${body.length}/5000`}
              />

              {/* Category & Year row */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  label="Category"
                  fullWidth
                  value={category}
                  onChange={(e) => setCategory(e.target.value as NataQuestionCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <MenuItem key={c.value} value={c.value}>
                      {c.label}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Exam Year"
                  fullWidth
                  value={examYear}
                  onChange={(e) => setExamYear(Number(e.target.value))}
                >
                  {EXAM_YEARS.map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              {/* Session */}
              <TextField
                label="Exam Session / Slot (optional)"
                placeholder="e.g., Session 1, Slot 2, Morning, etc."
                fullWidth
                value={examSession}
                onChange={(e) => setExamSession(e.target.value)}
                inputProps={{ maxLength: 50 }}
              />

              {/* Confidence Level */}
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                  How confident are you about this question?
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                  It&apos;s okay if you don&apos;t remember exactly — mark your confidence level so others know.
                </Typography>
                <Box sx={{ px: 1 }}>
                  <Slider
                    value={confidenceLevel}
                    onChange={(_, value) => setConfidenceLevel(value as number)}
                    min={1}
                    max={5}
                    step={1}
                    marks={CONFIDENCE_MARKS.map(m => ({ value: m.value, label: '' }))}
                    valueLabelDisplay="off"
                    sx={{ mb: 0.5 }}
                  />
                  <Typography
                    variant="body2"
                    color={
                      confidenceLevel <= 2 ? 'warning.main' :
                      confidenceLevel >= 4 ? 'success.main' : 'text.secondary'
                    }
                    fontWeight={600}
                    textAlign="center"
                  >
                    {currentConfidenceLabel}
                  </Typography>
                </Box>
              </Box>

              {/* Image Upload */}
              <ImageUpload
                images={imageUrls}
                onChange={setImageUrls}
                getAuthToken={getAuthToken}
              />

              {/* Error */}
              {error && <Alert severity="error">{error}</Alert>}

              {/* Submit */}
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button
                  component={Link}
                  href="/tools/nata/question-bank"
                  variant="outlined"
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={submitting}
                  sx={{ minWidth: 140, minHeight: 44 }}
                >
                  {submitting ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    'Submit for Review'
                  )}
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
