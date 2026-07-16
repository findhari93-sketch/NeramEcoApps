'use client';

/**
 * StudyTestAuthorDialog — teacher/admin creates or edits the test attached to a study file. Two
 * input modes: paste AI-generated JSON (with a copy-paste prompt template), or add questions
 * manually. Both feed the same preview list; the teacher sets a passing score and confirms.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button, Alert,
  CircularProgress, Divider, ToggleButton, ToggleButtonGroup, MenuItem, IconButton, Chip, Stack,
  Collapse, useMediaQuery, Select, FormControl, InputLabel, Checkbox, Paper, Skeleton,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { parseStudyTestJson, STUDY_TEST_AI_PROMPT, STUDY_TEST_JSON_EXAMPLE } from '@/lib/study-test-parse';
import TagPicker from '@/components/question-bank/TagPicker';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusStudyTestQuestionInput, NexusQBQuestionListItem, QBDifficulty } from '@neram/database';

const DIFFICULTIES: QBDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const BANK_PAGE_SIZE = 20;

/**
 * Convert a bank question into the study test's 4-option shape, carrying its bank id so the
 * save-time mirror LINKS it instead of duplicating. Returns null for questions that can't be
 * represented as a 4-option MCQ (image-only, <2 options, unresolvable correct answer).
 */
function bankToStudyInput(q: NexusQBQuestionListItem): NexusStudyTestQuestionInput | null {
  const raw = Array.isArray((q as any).options) ? (q as any).options : [];
  const opts = raw
    .map((o: any) => (typeof o === 'string' ? { id: null, text: o } : { id: o?.id ?? null, text: o?.text ?? '' }))
    .filter((o: any) => String(o.text).trim() !== '');
  const text = (q.question_text || '').trim();
  if (!text || opts.length < 2) return null;
  const take = opts.slice(0, 4);
  const letters = ['a', 'b', 'c', 'd'] as const;
  const answer = String((q as any).correct_answer ?? '').trim();
  let idx = take.findIndex((o: any) => o.id != null && String(o.id) === answer);
  if (idx === -1) {
    const li = letters.indexOf(answer.toLowerCase() as any);
    if (li >= 0 && li < take.length) idx = li;
  }
  if (idx === -1 || idx > 3) return null;
  return {
    question_text: text,
    option_a: String(take[0].text).trim(),
    option_b: String(take[1].text).trim(),
    option_c: take[2] ? String(take[2].text).trim() : null,
    option_d: take[3] ? String(take[3].text).trim() : null,
    correct_option: letters[idx],
    explanation: (q as any).explanation_brief ?? null,
    qb_question_id: q.id,
  };
}

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
  const { getToken } = useNexusAuthContext();

  const [tab, setTab] = useState<'json' | 'manual' | 'bank'>('json');
  const [title, setTitle] = useState('');
  const [passingPct, setPassingPct] = useState(70);
  const [questions, setQuestions] = useState<NexusStudyTestQuestionInput[]>([]);
  const [hasExisting, setHasExisting] = useState(false);

  const [jsonText, setJsonText] = useState('');
  const [jsonWarnings, setJsonWarnings] = useState<string[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [manual, setManual] = useState(emptyManual);

  // Pick-from-bank mode state
  const [bankSearch, setBankSearch] = useState('');
  const [bankDebounced, setBankDebounced] = useState('');
  const [bankExam, setBankExam] = useState<'' | 'JEE' | 'NATA' | 'BOTH'>('');
  const [bankDifficulty, setBankDifficulty] = useState<QBDifficulty[]>([]);
  const [bankTagIds, setBankTagIds] = useState<string[]>([]);
  const [bankResults, setBankResults] = useState<NexusQBQuestionListItem[]>([]);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankPage, setBankPage] = useState(1);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankLoadingMore, setBankLoadingMore] = useState(false);
  const [bankSelected, setBankSelected] = useState<Map<string, NexusQBQuestionListItem>>(new Map());

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
    setBankSearch('');
    setBankDebounced('');
    setBankExam('');
    setBankDifficulty([]);
    setBankTagIds([]);
    setBankSelected(new Map());

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
              qb_question_id: q.qb_question_id ?? null,
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

  // ── Pick from bank ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setBankDebounced(bankSearch), 350);
    return () => clearTimeout(t);
  }, [bankSearch]);

  const fetchBank = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setBankLoadingMore(true);
      else setBankLoading(true);
      try {
        const p = new URLSearchParams();
        p.set('page', String(pageNum));
        p.set('page_size', String(BANK_PAGE_SIZE));
        p.set('question_status', 'active');
        if (bankExam) p.set('exam_relevance', bankExam);
        if (bankDifficulty.length) p.set('difficulty', bankDifficulty.join(','));
        if (bankTagIds.length) p.set('tag_ids', bankTagIds.join(','));
        if (bankDebounced.trim()) p.set('search', bankDebounced.trim());
        const res = await authFetch(`/api/question-bank/questions?${p.toString()}`);
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).error || 'Failed to load bank');
        const json = await res.json();
        const list: NexusQBQuestionListItem[] = json.data?.questions || [];
        setBankTotal(json.data?.total || 0);
        setBankResults((prev) => (append ? [...prev, ...list] : list));
      } catch (e: any) {
        setError(e?.message || 'Failed to load the question bank');
      } finally {
        setBankLoading(false);
        setBankLoadingMore(false);
      }
    },
    [authFetch, bankExam, bankDifficulty, bankTagIds, bankDebounced],
  );

  useEffect(() => {
    if (!open || tab !== 'bank') return;
    setBankPage(1);
    fetchBank(1, false);
  }, [open, tab, fetchBank]);

  const toggleBank = (q: NexusQBQuestionListItem) =>
    setBankSelected((prev) => {
      const next = new Map(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.set(q.id, q);
      return next;
    });

  const loadMoreBank = () => {
    const n = bankPage + 1;
    setBankPage(n);
    fetchBank(n, true);
  };

  const addSelectedFromBank = () => {
    setError('');
    const existing = new Set(questions.map((q) => q.qb_question_id).filter(Boolean));
    const toAdd: NexusStudyTestQuestionInput[] = [];
    let skipped = 0;
    for (const q of bankSelected.values()) {
      if (existing.has(q.id)) continue; // already in this test
      const mapped = bankToStudyInput(q);
      if (mapped) toAdd.push(mapped);
      else skipped += 1;
    }
    if (toAdd.length) setQuestions((qs) => [...qs, ...toAdd]);
    setBankSelected(new Map());
    if (skipped > 0) {
      setError(
        `${skipped} question${skipped === 1 ? '' : 's'} couldn't be added (needs a text stem and 2-4 options with a clear correct answer).`,
      );
    }
  };

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
              <ToggleButton value="bank">Pick from bank</ToggleButton>
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

            {tab === 'bank' && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Reuse questions already in the bank. Picked questions are linked, not copied, so the same question can seed many chapters.
                </Typography>
                {/* Bank filters */}
                <Stack spacing={1} sx={{ mb: 1.5 }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search question text"
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    InputProps={{ startAdornment: <SearchOutlinedIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} /> }}
                  />
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel id="bank-exam">Exam</InputLabel>
                      <Select labelId="bank-exam" label="Exam" value={bankExam} onChange={(e) => setBankExam(e.target.value as any)}>
                        <MenuItem value="">All</MenuItem>
                        <MenuItem value="JEE">JEE</MenuItem>
                        <MenuItem value="NATA">NATA</MenuItem>
                        <MenuItem value="BOTH">Both</MenuItem>
                      </Select>
                    </FormControl>
                    <ToggleButtonGroup size="small" value={bankDifficulty} onChange={(_, v) => setBankDifficulty(v)} aria-label="difficulty">
                      {DIFFICULTIES.map((d) => (
                        <ToggleButton key={d} value={d} sx={{ textTransform: 'none', px: 1.25 }}>
                          {d[0] + d.slice(1).toLowerCase()}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                  <TagPicker value={bankTagIds} onChange={setBankTagIds} getToken={getToken} label="Filter by tags" />
                </Stack>

                {/* Bank results */}
                <Typography variant="caption" color="text.secondary">
                  {bankLoading ? 'Loading…' : `${bankTotal} question${bankTotal === 1 ? '' : 's'}`}
                </Typography>
                {bankLoading ? (
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} variant="rounded" height={60} sx={{ borderRadius: 1.5 }} />
                    ))}
                  </Stack>
                ) : bankResults.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No questions match these filters.
                  </Typography>
                ) : (
                  <Stack spacing={0.75} sx={{ mt: 1, maxHeight: 320, overflow: 'auto', pr: 0.5 }}>
                    {bankResults.map((q) => {
                      const isSel = bankSelected.has(q.id);
                      const already = questions.some((x) => x.qb_question_id === q.id);
                      return (
                        <Paper
                          key={q.id}
                          variant="outlined"
                          onClick={() => !already && toggleBank(q)}
                          sx={{
                            p: 1,
                            borderRadius: 1.5,
                            display: 'flex',
                            gap: 1,
                            alignItems: 'flex-start',
                            cursor: already ? 'default' : 'pointer',
                            opacity: already ? 0.55 : 1,
                            borderColor: isSel ? 'primary.main' : 'divider',
                            bgcolor: isSel ? 'action.selected' : 'background.paper',
                            transition: 'border-color 150ms, background-color 150ms',
                            '&:hover': already ? {} : { borderColor: 'primary.light' },
                          }}
                        >
                          <Checkbox checked={isSel || already} disabled={already} tabIndex={-1} size="small" sx={{ p: 0.5, mt: -0.25 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                              {q.question_text || '(image-based question)'}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                              <Chip size="small" label={q.difficulty} variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                              <Chip size="small" label={q.exam_relevance} variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                              {already && <Chip size="small" color="success" label="Added" sx={{ height: 18, fontSize: '0.65rem' }} />}
                            </Box>
                          </Box>
                        </Paper>
                      );
                    })}
                    {bankResults.length < bankTotal && (
                      <Button onClick={loadMoreBank} disabled={bankLoadingMore} sx={{ textTransform: 'none', alignSelf: 'center', mt: 0.5 }}>
                        {bankLoadingMore ? <CircularProgress size={16} /> : `Load more (${bankResults.length}/${bankTotal})`}
                      </Button>
                    )}
                  </Stack>
                )}

                <Button
                  variant="contained"
                  size="small"
                  startIcon={<InventoryOutlinedIcon />}
                  onClick={addSelectedFromBank}
                  disabled={bankSelected.size === 0}
                  sx={{ mt: 1.5, textTransform: 'none' }}
                >
                  Add {bankSelected.size > 0 ? bankSelected.size : ''} selected
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
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{i + 1}. {q.question_text}</Typography>
                      {q.qb_question_id && (
                        <Chip size="small" label="Bank" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
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
