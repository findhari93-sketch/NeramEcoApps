'use client';

/**
 * The question doctor: send the questions nobody got right to an AI, bring the
 * answer back, apply what you agree with.
 *
 * Why copy and paste rather than an in-app AI call. The teacher already pays for
 * ChatGPT, the reasoning here is worth reading in full rather than compressing
 * into a verdict chip, and it keeps the feature off the shared Gemini budget
 * that every other AI feature in Nexus draws on. It is the same shape as the
 * question-bank tagging assistant, deliberately, so a teacher who has used one
 * already knows this one.
 *
 * Three steps, with a stepper, because a process that leaves the app and comes
 * back is exactly where somebody loses their place.
 *
 * Nothing is written that the teacher did not tick. The AI proposes; the review
 * step is where a person decides, field by field, with the old value struck
 * through above the new one.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  buildQuestionReviewPrompt,
  diffReviewRow,
  reviewChunks,
  validateQuestionReviewJSON,
  type QuestionReviewRow,
  type ReviewExportQuestion,
  type ReviewFieldChange,
  type ReviewStat,
  type ReviewVerdict,
} from '@/lib/question-review-schema';

export interface DoctorStatRow {
  question_id: string;
  answered: number;
  correct: number;
  correct_pct: number | null;
  top_wrong_option: { key: string; text: string | null; count: number } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  testId: string;
  /** The questions the teacher selected, by qb question id. */
  questionIds: string[];
  /** Performance for those questions, straight off the analysis rows. */
  stats: DoctorStatRow[];
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  /** Fired after a successful apply, so the panel can reload and offer a re-grade. */
  onApplied: (result: { applied: number; answerKeyChanged: number; staleAttempts: number }) => void;
}

const VERDICT_META: Record<
  ReviewVerdict,
  { label: string; color: 'error' | 'warning' | 'info' | 'default' }
> = {
  wrong_key: { label: 'Wrong answer key', color: 'error' },
  ambiguous: { label: 'Ambiguous', color: 'warning' },
  hard_but_fair: { label: 'Hard but fair', color: 'info' },
  fine: { label: 'Nothing wrong', color: 'default' },
};

const FIELD_LABELS: Record<ReviewFieldChange['field'], string> = {
  question_text: 'Question',
  options: 'Options',
  correct_answer: 'Correct answer',
  explanation_brief: 'Explanation',
};

const STEPS = ['Copy the prompt', 'Paste the reply', 'Review and apply'];

/** Options as the bank stores them, whatever shape the JSONB came back in. */
function normaliseOptions(raw: unknown): Array<{ id: string; text: string }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ id: string; text: string }> = [];
  for (const o of raw as Array<Record<string, unknown>>) {
    const id = typeof o?.id === 'string' ? o.id : '';
    if (!id) return null;
    out.push({ id, text: typeof o?.text === 'string' ? o.text : '' });
  }
  return out;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and a real gesture. The textarea
    // trick still works where it does not, and a teacher who cannot copy the
    // prompt cannot use the feature at all.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function QuestionDoctorDialog({
  open,
  onClose,
  testId,
  questionIds,
  stats,
  authFetch,
  onApplied,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ReviewExportQuestion[]>([]);
  const [pasted, setPasted] = useState('');
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  /** questionId -> which fields the teacher ticked. */
  const [ticked, setTicked] = useState<Record<string, Set<string>>>({});

  const statsMap = useMemo(() => {
    const m = new Map<string, ReviewStat>();
    for (const s of stats) {
      m.set(s.question_id, {
        answered: s.answered,
        correct: s.correct,
        correct_pct: s.correct_pct,
        top_wrong_option: s.top_wrong_option,
      });
    }
    return m;
  }, [stats]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}`);
      const wanted = new Set(questionIds);
      const picked: ReviewExportQuestion[] = (json.data?.questions || [])
        .filter((q: any) => wanted.has(q.question_id))
        .map((q: any) => ({
          id: q.question_id,
          question_text: q.question_text ?? null,
          options: normaliseOptions(q.options),
          correct_answer: q.correct_answer ?? null,
          explanation_brief: q.explanation_brief ?? null,
        }));
      setQuestions(picked);
      if (picked.length === 0) {
        setError('Could not load those questions. Close this and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load those questions');
    } finally {
      setLoading(false);
    }
  }, [authFetch, testId, questionIds]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPasted('');
    setTicked({});
    setCopiedChunk(null);
    load();
  }, [open, load]);

  const known = useMemo(() => {
    const m = new Map<string, ReviewExportQuestion>();
    for (const q of questions) m.set(q.id, q);
    return m;
  }, [questions]);

  const chunks = useMemo(() => reviewChunks(questions), [questions]);

  const validation = useMemo(() => {
    if (!pasted.trim()) return null;
    return validateQuestionReviewJSON(pasted, known);
  }, [pasted, known]);

  /** Each returned row paired with what it would actually change. */
  const reviewed = useMemo(() => {
    if (!validation) return [];
    return validation.rows
      .map((row: QuestionReviewRow) => {
        const current = known.get(row.question_id);
        return current ? { row, current, changes: diffReviewRow(row, current) } : null;
      })
      .filter((x): x is { row: QuestionReviewRow; current: ReviewExportQuestion; changes: ReviewFieldChange[] } =>
        Boolean(x),
      );
  }, [validation, known]);

  /**
   * Everything that changes something starts ticked, and a 'fine' verdict
   * starts unticked even if it suggested an edit. The common case is a teacher
   * agreeing with the diagnosis, so the default should be "apply what it found"
   * rather than making them tick twelve boxes to do the obvious thing.
   */
  useEffect(() => {
    if (reviewed.length === 0) return;
    setTicked((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, Set<string>> = {};
      for (const item of reviewed) {
        if (item.row.verdict === 'fine' || item.changes.length === 0) continue;
        next[item.row.question_id] = new Set(item.changes.map((c) => c.field));
      }
      return next;
    });
  }, [reviewed]);

  const tickedCount = useMemo(
    () => Object.values(ticked).reduce((n, set) => n + set.size, 0),
    [ticked],
  );

  function toggleField(questionId: string, field: string) {
    setTicked((prev) => {
      const next = { ...prev };
      const set = new Set(next[questionId] || []);
      if (set.has(field)) set.delete(field);
      else set.add(field);
      if (set.size === 0) delete next[questionId];
      else next[questionId] = set;
      return next;
    });
  }

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      const fixes = reviewed
        .filter((item) => (ticked[item.row.question_id]?.size || 0) > 0)
        .map((item) => {
          const set = ticked[item.row.question_id];
          const fields: Record<string, unknown> = {};
          for (const change of item.changes) {
            if (!set.has(change.field)) continue;
            // Read off the row, not off the rendered diff line: the diff shows
            // options as one readable string, and the stored value is a list.
            fields[change.field] = (item.row as unknown as Record<string, unknown>)[change.field];
          }
          return { question_id: item.row.question_id, fields, source: 'ai_review' as const };
        })
        .filter((f) => Object.keys(f.fields).length > 0);

      const json = await authFetch(`/api/question-bank/tests/${testId}/question-fixes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixes }),
      });

      onApplied({
        applied: (json.data?.applied || []).length,
        answerKeyChanged: (json.data?.answer_key_changed || []).length,
        staleAttempts: json.data?.stale_attempts || 0,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply those fixes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullScreen={fullScreen}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="span" sx={{ fontWeight: 700 }}>
            Check {questionIds.length} question{questionIds.length === 1 ? '' : 's'} with AI
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={saving} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 3 } }}>
        <Stepper activeStep={step} sx={{ mb: 2.5 }} alternativeLabel={fullScreen}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : step === 0 ? (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Copy the prompt below and paste it into ChatGPT, Gemini or Claude. It carries the
              question, its options, the stored answer and how your class actually answered, which is
              what lets the AI tell a wrong answer key apart from a hard question.
            </Typography>

            {chunks.map((chunk, i) => {
              const prompt = buildQuestionReviewPrompt(chunk, statsMap);
              return (
                <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 140 }}>
                      {chunks.length > 1 ? `Part ${i + 1} of ${chunks.length}` : 'The prompt'}
                      {' · '}
                      {chunk.length} question{chunk.length === 1 ? '' : 's'}
                    </Typography>
                    <Button
                      variant={copiedChunk === i ? 'outlined' : 'contained'}
                      startIcon={copiedChunk === i ? <CheckIcon /> : <ContentCopyIcon />}
                      onClick={async () => {
                        const ok = await copyText(prompt);
                        if (ok) setCopiedChunk(i);
                        else setError('Could not reach the clipboard. Select the text and copy it.');
                      }}
                      sx={{ textTransform: 'none', minHeight: 44 }}
                    >
                      {copiedChunk === i ? 'Copied' : 'Copy prompt'}
                    </Button>
                  </Box>
                  <TextField
                    value={prompt}
                    multiline
                    minRows={3}
                    maxRows={8}
                    fullWidth
                    size="small"
                    InputProps={{ readOnly: true, sx: { fontSize: 12, fontFamily: 'monospace' } }}
                    sx={{ mt: 1 }}
                  />
                </Paper>
              );
            })}

            <Button
              size="small"
              endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              href="https://chatgpt.com/"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Open ChatGPT in a new tab
            </Button>
          </Box>
        ) : step === 1 ? (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Paste the whole reply here. Markdown fences and a sentence of preamble are fine, they
              are stripped for you.
            </Typography>
            <TextField
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setTicked({});
              }}
              multiline
              minRows={8}
              fullWidth
              autoFocus
              placeholder='{"reviews":[ ... ]}'
              InputProps={{ sx: { fontSize: 13, fontFamily: 'monospace' } }}
            />

            {validation && validation.errors.length > 0 && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {validation.errors.length} row
                  {validation.errors.length === 1 ? ' was' : 's were'} skipped
                </Typography>
                {validation.errors.slice(0, 5).map((e, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                    {e}
                  </Typography>
                ))}
              </Alert>
            )}

            {validation && validation.warnings.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Worth a look
                </Typography>
                {validation.warnings.slice(0, 6).map((w, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                    {w}
                  </Typography>
                ))}
              </Alert>
            )}

            {validation && validation.rows.length > 0 && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Read {validation.rows.length} of {questions.length} question
                {questions.length === 1 ? '' : 's'}.
              </Alert>
            )}
          </Box>
        ) : (
          <Box>
            {reviewed.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                Nothing came back to review.
              </Typography>
            ) : (
              reviewed.map((item) => {
                const meta = VERDICT_META[item.row.verdict];
                const set = ticked[item.row.question_id];
                return (
                  <Accordion
                    key={item.row.question_id}
                    defaultExpanded={item.changes.length > 0 && item.row.verdict !== 'fine'}
                    disableGutters
                    sx={{ mb: 1, borderRadius: 2, '&:before': { display: 'none' } }}
                    variant="outlined"
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 56 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', pr: 1 }}>
                        <Chip size="small" label={meta.label} color={meta.color} sx={{ fontWeight: 700 }} />
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 120 }}>
                          {(item.current.question_text || 'Question').slice(0, 90)}
                        </Typography>
                        {item.changes.length > 0 && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${set?.size || 0} of ${item.changes.length} ticked`}
                          />
                        )}
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      {item.row.note && (
                        <Typography variant="body2" sx={{ mb: 1.5, fontStyle: 'italic' }}>
                          {item.row.note}
                        </Typography>
                      )}

                      {item.changes.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No change suggested.
                        </Typography>
                      ) : (
                        item.changes.map((change) => (
                          <Box key={change.field} sx={{ mb: 1.5 }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={Boolean(set?.has(change.field))}
                                  onChange={() => toggleField(item.row.question_id, change.field)}
                                  sx={{ p: 1 }}
                                />
                              }
                              label={
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {FIELD_LABELS[change.field]}
                                </Typography>
                              }
                              sx={{ minHeight: 44, ml: 0 }}
                            />
                            <Box sx={{ pl: 5 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  textDecoration: 'line-through',
                                  color: 'text.disabled',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {change.before || '(empty)'}
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ color: 'success.dark', fontWeight: 600, wordBreak: 'break-word' }}
                              >
                                {change.after || '(empty)'}
                              </Typography>
                            </Box>
                          </Box>
                        ))
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              })
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={saving} sx={{ minHeight: 48 }}>
            Back
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {step < 2 ? (
          <Button
            variant="contained"
            onClick={() => setStep((s) => s + 1)}
            disabled={loading || (step === 1 && (validation?.rows.length || 0) === 0)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            {step === 0 ? 'I have the reply' : `Review ${validation?.rows.length || 0}`}
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={apply}
            disabled={saving || tickedCount === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            {saving ? 'Applying' : `Apply ${tickedCount} change${tickedCount === 1 ? '' : 's'}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
