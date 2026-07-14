'use client';

/**
 * StudyTestAuthorDialog — teacher/admin creates or edits the test attached to a study file. Two
 * input modes: paste AI-generated JSON (with a copy-paste prompt template), or add questions
 * manually. Both feed the same preview list; the teacher sets a passing score and confirms.
 */

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button, Alert,
  CircularProgress, Divider, ToggleButton, ToggleButtonGroup, MenuItem, IconButton, Chip, Stack,
  Collapse, useMediaQuery,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import { parseStudyTestJson, STUDY_TEST_AI_PROMPT, STUDY_TEST_JSON_EXAMPLE } from '@/lib/study-test-parse';
import type { NexusStudyTestQuestionInput } from '@neram/database/types';

interface StudyTestAuthorDialogProps {
  open: boolean;
  file: { id: string; title: string } | null;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved?: () => void;
}

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;
const emptyManual = { q: '', a: '', b: '', c: '', d: '', correct: 'a' as 'a' | 'b' | 'c' | 'd', expl: '' };

export default function StudyTestAuthorDialog({ open, file, authFetch, onClose, onSaved }: StudyTestAuthorDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');

  const [tab, setTab] = useState<'json' | 'manual'>('json');
  const [title, setTitle] = useState('');
  const [passingPct, setPassingPct] = useState(70);
  const [questions, setQuestions] = useState<NexusStudyTestQuestionInput[]>([]);
  const [hasExisting, setHasExisting] = useState(false);

  const [jsonText, setJsonText] = useState('');
  const [jsonWarnings, setJsonWarnings] = useState<string[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [manual, setManual] = useState(emptyManual);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Prefill from the existing test (edit mode).
  useEffect(() => {
    if (!open || !file) return;
    setTab('json');
    setTitle('');
    setPassingPct(70);
    setQuestions([]);
    setJsonText('');
    setJsonWarnings([]);
    setShowPrompt(false);
    setManual(emptyManual);
    setError('');
    setHasExisting(false);

    setLoading(true);
    authFetch(`/api/study-materials/files/${file.id}/test`)
      .then((r) => (r.ok ? r.json() : { test: null }))
      .then((b) => {
        if (b?.test?.test) {
          setHasExisting(true);
          setTitle(b.test.test.title || '');
          setPassingPct(b.test.test.passing_pct ?? 70);
          setQuestions(
            (b.test.questions || []).map((q: any) => ({
              question_text: q.question_text,
              option_a: q.option_a,
              option_b: q.option_b,
              option_c: q.option_c,
              option_d: q.option_d,
              correct_option: q.correct_option,
              explanation: q.explanation,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, file, authFetch]);

  const parseJson = () => {
    setError('');
    try {
      const parsed = parseStudyTestJson(jsonText);
      setQuestions(parsed.questions);
      setJsonWarnings(parsed.warnings);
      if (parsed.title && !title) setTitle(parsed.title);
      if (parsed.passingPct) setPassingPct(parsed.passingPct);
      if (parsed.questions.length === 0) setError('No valid questions were found in that JSON.');
    } catch (e: any) {
      setError(e?.message || 'Could not parse JSON');
    }
  };

  const addManual = () => {
    const opt = (v: string) => (v.trim() ? v.trim() : null);
    if (!manual.q.trim() || !opt(manual.a) || !opt(manual.b)) {
      setError('A question needs a stem and at least options A and B.');
      return;
    }
    if (manual.correct === 'c' && !opt(manual.c)) return setError('Option C is empty but marked correct.');
    if (manual.correct === 'd' && !opt(manual.d)) return setError('Option D is empty but marked correct.');
    setError('');
    setQuestions((qs) => [
      ...qs,
      {
        question_text: manual.q.trim(),
        option_a: manual.a.trim(),
        option_b: manual.b.trim(),
        option_c: opt(manual.c),
        option_d: opt(manual.d),
        correct_option: manual.correct,
        explanation: opt(manual.expl),
      },
    ]);
    setManual(emptyManual);
  };

  const removeQuestion = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(STUDY_TEST_AI_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    if (!file || questions.length === 0 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await authFetch(`/api/study-materials/files/${file.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || null, passingPct, questions }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'Failed to save test');
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save test');
    } finally {
      setSubmitting(false);
    }
  };

  const removeTest = async () => {
    if (!file || submitting) return;
    if (!window.confirm('Remove this test? Students will no longer be able to complete this chapter.')) return;
    setSubmitting(true);
    try {
      await authFetch(`/api/study-materials/files/${file.id}/test`, { method: 'DELETE' });
      onSaved?.();
      onClose();
    } catch {
      setError('Failed to remove test');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} maxWidth="md" fullWidth fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2, height: fullScreen ? '100%' : '90vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <QuizOutlinedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>{hasExisting ? 'Edit test' : 'Attach test'}</Typography>
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
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <ToggleButtonGroup value={tab} exclusive size="small" onChange={(_, v) => v && setTab(v)}
              sx={{ mb: 2, '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 40, px: 2 } }}>
              <ToggleButton value="json">Upload JSON</ToggleButton>
              <ToggleButton value="manual">Add manually</ToggleButton>
            </ToggleButtonGroup>

            {tab === 'json' && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyPrompt} sx={{ textTransform: 'none' }}>
                    {copied ? 'Copied!' : 'Copy AI prompt'}
                  </Button>
                  <Button size="small" onClick={() => setShowPrompt((s) => !s)} sx={{ textTransform: 'none' }}>
                    {showPrompt ? 'Hide' : 'Show'} example
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Give the prompt (and the PDF) to ChatGPT or Claude, then paste the JSON it returns below.
                </Typography>
                <Collapse in={showPrompt}>
                  <Box component="pre" sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.7rem', overflow: 'auto', maxHeight: 200 }}>
                    {STUDY_TEST_JSON_EXAMPLE}
                  </Box>
                </Collapse>
                <TextField
                  multiline minRows={5} maxRows={12} fullWidth size="small" placeholder="Paste test JSON here..."
                  value={jsonText} onChange={(e) => setJsonText(e.target.value)} sx={{ mt: 1 }}
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
                />
                <Button variant="contained" size="small" onClick={parseJson} disabled={!jsonText.trim()} sx={{ mt: 1, textTransform: 'none' }}>
                  Parse &amp; preview
                </Button>
                {jsonWarnings.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    {jsonWarnings.map((w, i) => <div key={i}>{w}</div>)}
                  </Alert>
                )}
              </Box>
            )}

            {tab === 'manual' && (
              <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <TextField label="Question" fullWidth size="small" multiline value={manual.q}
                  onChange={(e) => setManual({ ...manual, q: e.target.value })} sx={{ mb: 1 }} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
                  <TextField label="Option A" fullWidth size="small" value={manual.a} onChange={(e) => setManual({ ...manual, a: e.target.value })} />
                  <TextField label="Option B" fullWidth size="small" value={manual.b} onChange={(e) => setManual({ ...manual, b: e.target.value })} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
                  <TextField label="Option C (optional)" fullWidth size="small" value={manual.c} onChange={(e) => setManual({ ...manual, c: e.target.value })} />
                  <TextField label="Option D (optional)" fullWidth size="small" value={manual.d} onChange={(e) => setManual({ ...manual, d: e.target.value })} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField select label="Correct answer" size="small" value={manual.correct}
                    onChange={(e) => setManual({ ...manual, correct: e.target.value as any })} sx={{ minWidth: 140 }}>
                    {OPTION_KEYS.map((k) => <MenuItem key={k} value={k}>Option {k.toUpperCase()}</MenuItem>)}
                  </TextField>
                  <TextField label="Explanation (optional)" fullWidth size="small" value={manual.expl} onChange={(e) => setManual({ ...manual, expl: e.target.value })} />
                </Stack>
                <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addManual} sx={{ mt: 1, textTransform: 'none' }}>
                  Add question
                </Button>
              </Box>
            )}

            {/* Preview */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Preview ({questions.length} question{questions.length === 1 ? '' : 's'})
              </Typography>
              <TextField
                type="number" size="small" label="Pass %" value={passingPct}
                onChange={(e) => setPassingPct(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                sx={{ width: 110 }} inputProps={{ min: 1, max: 100 }}
              />
            </Box>
            {questions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No questions yet. Paste JSON or add questions manually.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {questions.map((q, i) => (
                  <Box key={i} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{i + 1}. {q.question_text}</Typography>
                      <IconButton size="small" onClick={() => removeQuestion(i)} aria-label="Remove question">
                        <DeleteOutlineIcon fontSize="small" color="error" />
                      </IconButton>
                    </Box>
                    <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                      {OPTION_KEYS.map((k) => {
                        const val = (q as any)[`option_${k}`];
                        if (val == null || val === '') return null;
                        const correct = q.correct_option === k;
                        return (
                          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {correct
                              ? <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                              : <Box sx={{ width: 16 }} />}
                            <Typography variant="caption" sx={{ color: correct ? 'success.main' : 'text.secondary', fontWeight: correct ? 700 : 400 }}>
                              {k.toUpperCase()}. {val}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Stack>
                    {q.explanation && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                        {q.explanation}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            )}

            <TextField label="Test title (optional)" fullWidth size="small" value={title}
              onChange={(e) => setTitle(e.target.value)} sx={{ mt: 2 }} />
          </>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1, justifyContent: 'space-between' }}>
        <Box>
          {hasExisting && (
            <Button color="error" onClick={removeTest} disabled={submitting} sx={{ textTransform: 'none' }}>
              Remove test
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={submitting || questions.length === 0}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <QuizOutlinedIcon />}
            sx={{ textTransform: 'none', minWidth: 170 }}>
            {submitting ? 'Saving...' : `${hasExisting ? 'Update' : 'Attach'} test · ${questions.length} Q`}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
