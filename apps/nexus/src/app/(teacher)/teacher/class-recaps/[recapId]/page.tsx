'use client';

/**
 * Teacher: turn a recorded class into a gated recap. Generate checkpoint
 * quizzes from the class transcript (or an uploaded .vtt), review and edit them,
 * then publish so late joiners can watch-and-pass to catch up.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Chip,
  Skeleton,
  Snackbar,
  Alert,
  Divider,
  alpha,
} from '@neram/ui';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PublishIcon from '@mui/icons-material/Publish';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface EditQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string;
}
interface EditSection {
  title: string;
  description: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  min_questions_to_pass: number | null;
  questions: EditQuestion[];
}

const emptyQuestion = (): EditQuestion => ({
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'a',
  explanation: '',
});

export default function TeacherClassRecapEditor() {
  const params = useParams();
  const router = useRouter();
  const recapId = params?.recapId as string;
  const { loading: authLoading, getTeacherToken } = useNexusAuthContext();

  const [recap, setRecap] = useState<{ id: string; title: string; status: string; recording_url: string | null } | null>(null);
  const [sections, setSections] = useState<EditSection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const teacherFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getTeacherToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Request failed');
      return payload;
    },
    [getTeacherToken],
  );

  const toEdit = (secs: any[]): EditSection[] =>
    (secs || []).map((s) => ({
      title: s.title || '',
      description: s.description || '',
      start_timestamp_seconds: s.start_timestamp_seconds ?? 0,
      end_timestamp_seconds: s.end_timestamp_seconds ?? 0,
      min_questions_to_pass: s.min_questions_to_pass ?? null,
      questions: (s.questions || []).map((q: any) => ({
        question_text: q.question_text || '',
        option_a: q.option_a || '',
        option_b: q.option_b || '',
        option_c: q.option_c || '',
        option_d: q.option_d || '',
        correct_option: (['a', 'b', 'c', 'd'].includes(q.correct_option) ? q.correct_option : 'a') as EditQuestion['correct_option'],
        explanation: q.explanation || '',
      })),
    }));

  const load = useCallback(async () => {
    try {
      const res = await teacherFetch(`/api/class-recaps/${recapId}`);
      const r = res.recap;
      setRecap({ id: r.id, title: r.title, status: r.status, recording_url: r.recording_url });
      setSections(toEdit(r.sections));
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
    }
  }, [teacherFetch, recapId]);

  useEffect(() => {
    if (!authLoading && recapId) load();
  }, [authLoading, recapId, load]);

  const generate = useCallback(
    async (vttContent?: string) => {
      setBusy('generate');
      setSnack({ msg: 'Generating checkpoints from the class transcript...', sev: 'info' });
      try {
        const res = await teacherFetch(`/api/class-recaps/${recapId}/generate`, {
          method: 'POST',
          body: JSON.stringify(vttContent ? { vtt_content: vttContent } : {}),
        });
        if (res.error === 'no_transcript') {
          setSnack({ msg: res.message || 'No transcript available. Upload a .vtt file.', sev: 'error' });
          return;
        }
        setSections(toEdit(res.generated?.sections));
        setSnack({ msg: 'Draft checkpoints generated. Review, edit, then save.', sev: 'success' });
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Generation failed', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch, recapId],
  );

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      await generate(text);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = useCallback(async () => {
    setBusy('save');
    try {
      await teacherFetch(`/api/class-recaps/${recapId}/sections`, {
        method: 'PUT',
        body: JSON.stringify({ sections }),
      });
      setSnack({ msg: 'Checkpoints saved.', sev: 'success' });
      await load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Save failed', sev: 'error' });
    } finally {
      setBusy(null);
    }
  }, [teacherFetch, recapId, sections, load]);

  const setStatus = useCallback(
    async (action: 'publish' | 'unpublish') => {
      setBusy(action);
      try {
        const res = await teacherFetch(`/api/class-recaps/${recapId}`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        });
        setRecap((prev) => (prev ? { ...prev, status: res.recap.status } : prev));
        setSnack({ msg: action === 'publish' ? 'Published to students.' : 'Unpublished.', sev: 'success' });
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Failed', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch, recapId],
  );

  // ── section/question editing helpers ──
  const patchSection = (i: number, patch: Partial<EditSection>) =>
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const patchQuestion = (si: number, qi: number, patch: Partial<EditQuestion>) =>
    setSections((prev) =>
      prev.map((s, idx) =>
        idx === si ? { ...s, questions: s.questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)) } : s,
      ),
    );
  const addSection = () =>
    setSections((prev) => [
      ...prev,
      { title: `Checkpoint ${prev.length + 1}`, description: '', start_timestamp_seconds: 0, end_timestamp_seconds: 60, min_questions_to_pass: null, questions: [emptyQuestion()] },
    ]);
  const removeSection = (i: number) => setSections((prev) => prev.filter((_, idx) => idx !== i));
  const addQuestion = (si: number) => patchSection(si, { questions: [...sections[si].questions, emptyQuestion()] });
  const removeQuestion = (si: number, qi: number) =>
    patchSection(si, { questions: sections[si].questions.filter((_, j) => j !== qi) });

  if (!recap) {
    return (
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rounded" height={240} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  const published = recap.status === 'published';

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', pb: 6 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mb: 1, color: 'text.secondary', minHeight: 44 }}>
        Back
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
          {recap.title}
        </Typography>
        <Chip
          size="small"
          label={published ? 'Published' : 'Draft'}
          sx={{
            fontWeight: 700,
            bgcolor: published ? 'rgba(46,125,50,0.12)' : alpha('#1A2027', 0.08),
            color: published ? '#1B5E20' : 'text.secondary',
          }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Generate checkpoint quizzes from the class transcript, review them, then publish for late joiners.
      </Typography>

      {/* Actions */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2.5 }}>
        <Button
          variant="contained"
          startIcon={<AutoAwesomeIcon />}
          disabled={!!busy}
          onClick={() => generate()}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          {busy === 'generate' ? 'Generating...' : 'Generate from transcript'}
        </Button>
        <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={!!busy} onClick={() => fileRef.current?.click()} sx={{ minHeight: 44, textTransform: 'none' }}>
          Upload .vtt
        </Button>
        <input ref={fileRef} type="file" accept=".vtt,text/vtt" hidden onChange={onUpload} />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<SaveOutlinedIcon />} disabled={!!busy || sections.length === 0} onClick={save} sx={{ minHeight: 44, textTransform: 'none' }}>
          Save
        </Button>
        {published ? (
          <Button variant="text" disabled={!!busy} onClick={() => setStatus('unpublish')} sx={{ minHeight: 44, textTransform: 'none' }}>
            Unpublish
          </Button>
        ) : (
          <Button variant="contained" color="success" startIcon={<PublishIcon />} disabled={!!busy || sections.length === 0} onClick={() => setStatus('publish')} sx={{ minHeight: 44, textTransform: 'none' }}>
            Publish
          </Button>
        )}
      </Stack>

      {sections.length === 0 && (
        <Box sx={{ p: 3, borderRadius: 2, border: '1px dashed', borderColor: 'divider', textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">
            No checkpoints yet. Click <strong>Generate from transcript</strong>, or upload the class .vtt to build them automatically.
          </Typography>
        </Box>
      )}

      <Stack spacing={2.5}>
        {sections.map((s, si) => (
          <Box key={si} sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Chip label={`Checkpoint ${si + 1}`} size="small" sx={{ fontWeight: 700 }} />
              <Box sx={{ flex: 1 }} />
              <IconButton size="small" onClick={() => removeSection(si)} aria-label="Remove checkpoint">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
            <TextField
              fullWidth
              size="small"
              label="Checkpoint title"
              value={s.title}
              onChange={(e) => patchSection(si, { title: e.target.value })}
              sx={{ mb: 1.5 }}
            />
            <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
              <TextField
                size="small"
                type="number"
                label="Start (sec)"
                value={s.start_timestamp_seconds}
                onChange={(e) => patchSection(si, { start_timestamp_seconds: Number(e.target.value) })}
              />
              <TextField
                size="small"
                type="number"
                label="End (sec)"
                value={s.end_timestamp_seconds}
                onChange={(e) => patchSection(si, { end_timestamp_seconds: Number(e.target.value) })}
              />
              <TextField
                size="small"
                type="number"
                label="Min correct to pass"
                placeholder="all"
                value={s.min_questions_to_pass ?? ''}
                onChange={(e) =>
                  patchSection(si, { min_questions_to_pass: e.target.value === '' ? null : Number(e.target.value) })
                }
                helperText="Blank = all"
              />
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <Stack spacing={2}>
              {s.questions.map((q, qi) => (
                <Box key={qi} sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha('#1A2027', 0.02), border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      Question {qi + 1}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={() => removeQuestion(si, qi)} aria-label="Remove question">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <TextField fullWidth size="small" label="Question" value={q.question_text} onChange={(e) => patchQuestion(si, qi, { question_text: e.target.value })} sx={{ mb: 1 }} multiline />
                  <Stack spacing={1}>
                    {(['a', 'b', 'c', 'd'] as const).map((opt) => (
                      <TextField
                        key={opt}
                        fullWidth
                        size="small"
                        label={`Option ${opt.toUpperCase()}`}
                        value={q[`option_${opt}` as keyof EditQuestion] as string}
                        onChange={(e) => patchQuestion(si, qi, { [`option_${opt}`]: e.target.value } as Partial<EditQuestion>)}
                      />
                    ))}
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      select
                      size="small"
                      label="Correct"
                      value={q.correct_option}
                      onChange={(e) => patchQuestion(si, qi, { correct_option: e.target.value as EditQuestion['correct_option'] })}
                      sx={{ minWidth: 120 }}
                    >
                      {(['a', 'b', 'c', 'd'] as const).map((o) => (
                        <MenuItem key={o} value={o}>
                          Option {o.toUpperCase()}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField fullWidth size="small" label="Explanation (optional)" value={q.explanation} onChange={(e) => patchQuestion(si, qi, { explanation: e.target.value })} />
                  </Stack>
                </Box>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={() => addQuestion(si)} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
                Add question
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

      {sections.length > 0 && (
        <Button startIcon={<AddIcon />} onClick={addSection} sx={{ mt: 2, textTransform: 'none' }}>
          Add checkpoint
        </Button>
      )}

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
