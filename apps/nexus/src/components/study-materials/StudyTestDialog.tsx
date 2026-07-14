'use client';

/**
 * StudyTestDialog — the student takes the test attached to a study file. Passing (score >= the
 * teacher's passing %) marks the chapter Completed. Retakes are allowed until passed (best kept).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button, Alert,
  CircularProgress, Divider, Radio, RadioGroup, FormControlLabel, IconButton, Chip, useMediaQuery,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import type { NexusStudyTestForStudent, NexusStudyTestAttemptResult } from '@neram/database/types';

interface StudyTestDialogProps {
  open: boolean;
  file: { id: string; title: string } | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  /** Called after a passing attempt so the caller can refresh the file's status. */
  onCompleted?: () => void;
}

export default function StudyTestDialog({ open, file, getToken, onClose, onCompleted }: StudyTestDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');

  const [loading, setLoading] = useState(false);
  const [test, setTest] = useState<NexusStudyTestForStudent | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<NexusStudyTestAttemptResult | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    setAnswers({});
    try {
      const t = await getToken();
      const res = await fetch(`/api/study-materials/files/${file.id}/test`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json();
      setTest(body?.test || null);
    } catch {
      setError('Could not load the test.');
    } finally {
      setLoading(false);
    }
  }, [file, getToken]);

  useEffect(() => {
    if (open && file) load();
  }, [open, file, load]);

  const allAnswered = !!test && test.questions.every((q) => answers[q.id]);

  const submit = async () => {
    if (!file || !test || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const t = await getToken();
      const res = await fetch(`/api/study-materials/files/${file.id}/test/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ answers }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to submit');
      setResult(body.result as NexusStudyTestAttemptResult);
      if (body.result?.passed) onCompleted?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to submit the test');
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers({});
  };

  const questionById = (id: string) => test?.questions.find((q) => q.id === id);

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} maxWidth="sm" fullWidth fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <QuizOutlinedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>Chapter test</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{file?.title}</Typography>
        </Box>
        <IconButton onClick={() => !submitting && onClose()} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {loading ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : !test || test.questions.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Test coming soon. Your teacher has not added a test for this chapter yet.
            </Typography>
          </Box>
        ) : result ? (
          // ── Result ──
          <Box>
            <Box sx={{ textAlign: 'center', py: 2 }}>
              {result.passed ? (
                <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
              ) : (
                <CancelOutlinedIcon sx={{ fontSize: 64, color: 'warning.main' }} />
              )}
              <Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>
                {result.passed ? 'Chapter completed!' : 'Not quite yet'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You scored {Math.round(result.score_pct)}% ({result.correct_count}/{result.total_count}).{' '}
                {result.passed ? 'Great work.' : `You need ${result.passing_pct}% to complete this chapter.`}
              </Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>Review</Typography>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {result.review.map((r, i) => {
                const q = questionById(r.question_id);
                const correctText = q?.options.find((o) => o.key === r.correct_option)?.text;
                return (
                  <Box key={r.question_id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', gap: 0.75 }}>
                      {r.is_correct
                        ? <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main', mt: '2px' }} />
                        : <CancelOutlinedIcon sx={{ fontSize: 18, color: 'error.main', mt: '2px' }} />}
                      <Typography variant="body2" fontWeight={600}>{i + 1}. {q?.question_text}</Typography>
                    </Box>
                    {!r.is_correct && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'success.main' }}>
                        Correct answer: {r.correct_option.toUpperCase()}. {correctText}
                      </Typography>
                    )}
                    {r.explanation && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontStyle: 'italic' }}>
                        {r.explanation}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ) : (
          // ── Questions ──
          <Box>
            <Chip size="small" label={`${test.questions.length} questions · pass ${test.passing_pct}%`} sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {test.questions.map((q, i) => (
                <Box key={q.id}>
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>{i + 1}. {q.question_text}</Typography>
                  <RadioGroup value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}>
                    {q.options.map((o) => (
                      <FormControlLabel
                        key={o.key}
                        value={o.key}
                        control={<Radio size="small" />}
                        label={<Typography variant="body2">{o.text}</Typography>}
                        sx={{ mb: 0.25 }}
                      />
                    ))}
                  </RadioGroup>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        {result ? (
          <>
            {!result.passed && (
              <Button variant="outlined" onClick={retry} sx={{ textTransform: 'none' }}>Try again</Button>
            )}
            <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', minWidth: 120 }}>Done</Button>
          </>
        ) : test && test.questions.length > 0 ? (
          <>
            <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>Cancel</Button>
            <Button
              variant="contained"
              onClick={submit}
              disabled={submitting || !allAnswered}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', minWidth: 140 }}
            >
              {submitting ? 'Submitting...' : allAnswered ? 'Submit test' : 'Answer all first'}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none' }}>Close</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
