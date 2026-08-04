'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import FormatQuoteOutlinedIcon from '@mui/icons-material/FormatQuoteOutlined';

/**
 * Editing the questions of an existing test.
 *
 * Until now a test's questions were frozen the moment it was created: the
 * detail page rendered them as read-only accordions and the only mutation route
 * whitelisted the title, the description, the publish flag, the pass mark and
 * the kind. Fixing one wrong option meant building the paper again.
 *
 * The document being edited is the same JSON the wizard accepts and the same
 * JSON this dialog downloads, so a teacher can work here, or in their own
 * editor, or hand it to an AI and paste the result back, without three
 * different shapes to learn.
 *
 * On a phone each question opens as its own full-screen sheet. Editing four
 * options inside a collapsed row on a 375px screen is the kind of thing that
 * looks fine in a mockup and is unusable in a corridor between classes.
 */

const OPTION_IDS = ['a', 'b', 'c', 'd'] as const;

interface PayloadQuestion {
  id?: string;
  question: string;
  options: Record<string, string> | null;
  answer: string;
  explanation: string | null;
  source_quote?: string | null;
  difficulty: string;
  exam: string;
  tag_slugs: string[];
}

interface Payload {
  test: { title: string; suggested_folder: string };
  questions: PayloadQuestion[];
}

interface Props {
  open: boolean;
  testId: string;
  testTitle: string;
  onClose: () => void;
  onSaved: () => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
}

function blankQuestion(): PayloadQuestion {
  return {
    question: '',
    options: { a: '', b: '', c: '', d: '' },
    answer: 'a',
    explanation: null,
    difficulty: 'MEDIUM',
    exam: 'BOTH',
    tag_slugs: [],
  };
}

export default function TestQuestionEditorDialog({
  open,
  testId,
  testTitle,
  onClose,
  onSaved,
  authFetch,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const fileInput = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}/import`);
      setPayload(json.data.payload as Payload);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the questions');
    } finally {
      setLoading(false);
    }
  }, [authFetch, testId]);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setNotice(null);
    load();
  }, [open, load]);

  const questions = payload?.questions || [];

  const mutate = (next: PayloadQuestion[]) => {
    setPayload((p) => (p ? { ...p, questions: next } : p));
    setDirty(true);
  };

  const updateAt = (index: number, patch: Partial<PayloadQuestion>) => {
    mutate(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  };

  function download() {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(testTitle || 'test').replace(/[^\w\s-]/g, '').trim() || 'test'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const rows = Array.isArray(parsed) ? parsed : parsed?.questions;
        if (!Array.isArray(rows) || rows.length === 0) {
          setError('That file has no questions array in it.');
          return;
        }
        setPayload({
          test: parsed?.test || payload?.test || { title: testTitle, suggested_folder: '' },
          questions: rows,
        });
        setDirty(true);
        setError(null);
        setNotice(`Loaded ${rows.length} questions from ${file.name}. Nothing is saved until you press Save.`);
      } catch {
        setError('That file is not valid JSON.');
      }
    };
    reader.readAsText(file);
  }

  async function save() {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}/import`, {
        method: 'PUT',
        body: JSON.stringify({ payload }),
      });
      const d = json.data || {};
      const parts = [`${d.question_count} questions saved`];
      if (d.forked > 0) {
        parts.push(
          `${d.forked} ${d.forked === 1 ? 'was' : 'were'} copied first, because ${
            d.forked === 1 ? 'it is' : 'they are'
          } used by other tests too`,
        );
      }
      if (d.removed > 0) parts.push(`${d.removed} removed from this test`);
      setNotice(`${parts.join('. ')}.`);
      setDirty(false);
      onSaved();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const current = editing != null ? questions[editing] : null;

  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
        <DialogTitle sx={{ pb: 1 }}>
          Edit questions
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {testTitle}
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ overflowX: 'hidden' }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={download}
              disabled={!payload}
              sx={{ minHeight: 44 }}
            >
              Download JSON
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => fileInput.current?.click()}
              sx={{ minHeight: 44 }}
            >
              Replace from file
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddOutlinedIcon />}
              onClick={() => {
                mutate([...questions, blankQuestion()]);
                setEditing(questions.length);
              }}
              sx={{ minHeight: 44 }}
            >
              Add a question
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,.txt,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = '';
              }}
            />
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {notice && (
            <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={1}>
              {questions.map((q, i) => (
                <Box
                  key={q.id || `new-${i}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    p: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                  }}
                >
                  <Chip size="small" label={i + 1} sx={{ height: 22, fontWeight: 700, mt: 0.5, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {q.question || <em>Empty question</em>}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }} useFlexGap>
                      <Chip size="small" variant="outlined" label={`Answer ${q.answer || '?'}`} sx={{ height: 20 }} />
                      <Chip size="small" variant="outlined" label={q.difficulty} sx={{ height: 20 }} />
                      {!q.id && <Chip size="small" color="primary" label="New" sx={{ height: 20 }} />}
                      {q.source_quote && (
                        <Tooltip title={q.source_quote}>
                          <Chip
                            size="small"
                            variant="outlined"
                            icon={<FormatQuoteOutlinedIcon />}
                            label="Quoted"
                            sx={{ height: 20 }}
                          />
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                  <Stack direction="row" sx={{ flexShrink: 0 }}>
                    <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => move(i, 1)}
                      disabled={i === questions.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setEditing(i)} aria-label="Edit question">
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => mutate(questions.filter((_, j) => j !== i))}
                      aria-label="Remove question"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 2 }}>
            Removing a question takes it out of this test only. It stays in the question bank, where other tests
            may still be using it. A question shared with another test is copied before it is edited, so your
            change reaches this paper and no other.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={saving} sx={{ minHeight: 48 }}>
            Close
          </Button>
          <Button
            onClick={save}
            disabled={saving || loading || !dirty || questions.length === 0}
            variant="contained"
            sx={{ minHeight: 48 }}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* One question at a time. Full screen on a phone, where four option
          fields inside a list row would be unusable. */}
      <Dialog
        open={editing != null}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={fullScreen}
      >
        <DialogTitle>Question {editing != null ? editing + 1 : ''}</DialogTitle>
        <DialogContent dividers>
          {current && (
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                label="Question"
                value={current.question}
                onChange={(e) => updateAt(editing!, { question: e.target.value })}
                fullWidth
                multiline
                minRows={2}
                size="small"
              />

              {current.options ? (
                <>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    Options
                  </Typography>
                  {OPTION_IDS.map((key) => (
                    <TextField
                      key={key}
                      label={`Option ${key.toUpperCase()}`}
                      value={current.options?.[key] ?? ''}
                      onChange={(e) =>
                        updateAt(editing!, { options: { ...(current.options || {}), [key]: e.target.value } })
                      }
                      fullWidth
                      size="small"
                    />
                  ))}
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Correct answer
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      size="small"
                      value={current.answer}
                      onChange={(_, v) => v && updateAt(editing!, { answer: v })}
                      sx={{ mt: 0.5, '& .MuiToggleButton-root': { minHeight: 48 } }}
                    >
                      {OPTION_IDS.map((key) => (
                        <ToggleButton key={key} value={key}>
                          {key.toUpperCase()}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                </>
              ) : (
                <TextField
                  label="Answer"
                  value={current.answer}
                  onChange={(e) => updateAt(editing!, { answer: e.target.value })}
                  fullWidth
                  size="small"
                  helperText="A numerical question. The value students must type."
                />
              )}

              <TextField
                label="Explanation"
                value={current.explanation ?? ''}
                onChange={(e) => updateAt(editing!, { explanation: e.target.value || null })}
                fullWidth
                multiline
                minRows={2}
                size="small"
                helperText="Shown after an attempt, which is the reason to sit a practice test at all."
              />

              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  Difficulty
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={current.difficulty}
                  onChange={(_, v) => v && updateAt(editing!, { difficulty: v })}
                  sx={{ mt: 0.5, '& .MuiToggleButton-root': { minHeight: 48 } }}
                >
                  <ToggleButton value="EASY">Easy</ToggleButton>
                  <ToggleButton value="MEDIUM">Medium</ToggleButton>
                  <ToggleButton value="HARD">Hard</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {current.source_quote && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Quoted from the chapter
                    </Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                      {current.source_quote}
                    </Typography>
                  </Box>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditing(null)} variant="contained" fullWidth sx={{ minHeight: 48 }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
