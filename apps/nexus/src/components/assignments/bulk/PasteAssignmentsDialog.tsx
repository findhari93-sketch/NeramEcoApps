'use client';

/**
 * PasteAssignmentsDialog — the frictionless "create by pasting AI JSON" flow.
 * A teacher generates assignment JSON in ChatGPT/Gemini (a "Copy prompt" button
 * gives them the exact prompt), pastes or drops it here, edits the parsed rows
 * in a review grid, then imports them as drafts. Mirrors the Question Bank
 * bulk-upload experience.
 */
import { useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button, Alert,
  IconButton, Divider, Stack, MenuItem, Chip, CircularProgress, useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  validateAssignmentJSON,
  ASSIGNMENT_AI_PROMPT_TEMPLATE,
  type ReviewAssignment,
} from '@/lib/assignment-bulk-schema';

interface PasteAssignmentsDialogProps {
  open: boolean;
  classroomId: string;
  planId?: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onCreated: (count: number) => void;
}

const FORMAT_LABEL: Record<string, string> = {
  pdf: 'PDF only',
  image: 'Photos only',
  pdf_or_image: 'PDF or photos',
};

/** Convert a data: URL to a File for upload. */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(data.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `${name}.${mime.split('/')[1] || 'png'}`, { type: mime });
}

export default function PasteAssignmentsDialog({
  open,
  classroomId,
  planId,
  getToken,
  onClose,
  onCreated,
}: PasteAssignmentsDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'paste' | 'review'>('paste');
  const [raw, setRaw] = useState('');
  const [rows, setRows] = useState<ReviewAssignment[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setStep('paste');
    setRaw('');
    setRows([]);
    setWarnings([]);
    setError('');
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const parse = (text: string) => {
    setError('');
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setError('That is not valid JSON. Paste the JSON the AI gave you, with no extra text.');
      return;
    }
    const result = validateAssignmentJSON(data);
    if (!result.assignments.length) {
      setError(result.errors.join(' ') || 'No assignments found.');
      return;
    }
    setRows(result.assignments);
    setWarnings(result.warnings);
    setStep('review');
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setRaw(text);
    parse(text);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(ASSIGNMENT_AI_PROMPT_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const update = (idx: number, patch: Partial<ReviewAssignment>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const remove = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const invalidCount = useMemo(() => rows.filter((r) => !r.title.trim()).length, [rows]);

  const importAll = async () => {
    if (!rows.length || invalidCount > 0) return;
    setBusy(true);
    setError('');
    try {
      const token = await getToken();
      // Upload any base64 content images first, swapping in the returned URL.
      const prepared = await Promise.all(
        rows.map(async (r, i) => {
          if (r.content_image_is_base64 && r.content_image_url?.startsWith('data:')) {
            try {
              const form = new FormData();
              form.append('file', dataUrlToFile(r.content_image_url, `assignment_${i}`));
              const up = await fetch('/api/question-bank/upload-image', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
              });
              const j = await up.json().catch(() => ({}));
              if (up.ok && j.url) {
                return { ...r, content_image_url: j.url, content_image_is_base64: false };
              }
            } catch {
              /* fall through: drop the image on the server */
            }
            return { ...r, content_image_url: null, content_image_is_base64: false };
          }
          return r;
        }),
      );

      const res = await fetch('/api/assignments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroom_id: classroomId, plan_id: planId ?? null, assignments: prepared }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      onCreated((data.created || []).length);
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not import the assignments.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <ContentPasteGoIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            Paste assignments from AI
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {step === 'paste' ? 'Paste the JSON from ChatGPT or Gemini' : `${rows.length} assignment(s) to review`}
          </Typography>
        </Box>
        <IconButton onClick={close} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {step === 'paste' ? (
          <Stack spacing={2}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  1. Copy the prompt into ChatGPT/Gemini and describe your assignment. 2. Paste the JSON it returns below.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
                  onClick={copyPrompt}
                  sx={{ minHeight: 40, textTransform: 'none', whiteSpace: 'nowrap' }}
                >
                  {copied ? 'Copied' : 'Copy prompt'}
                </Button>
              </Stack>
            </Box>

            <TextField
              label="Paste JSON here"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              fullWidth
              multiline
              minRows={8}
              placeholder='{ "assignments": [ { "title": "..." } ] }'
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="text" onClick={() => fileRef.current?.click()} sx={{ minHeight: 44, textTransform: 'none' }}>
                Or upload a .json file
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            {warnings.map((w, i) => (
              <Alert key={i} severity="warning">
                {w}
              </Alert>
            ))}
            {rows.map((r, i) => (
              <Box
                key={i}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: r.title.trim() ? 'divider' : 'error.light',
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <TextField
                    label="Title"
                    value={r.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    fullWidth
                    size="small"
                    error={!r.title.trim()}
                  />
                  <IconButton onClick={() => remove(i)} sx={{ width: 40, height: 40 }} aria-label="Remove">
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
                {r.instructions && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }} noWrap>
                    {r.instructions}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                  <TextField
                    select
                    label="Upload"
                    value={r.submission_format}
                    onChange={(e) => update(i, { submission_format: e.target.value as any })}
                    size="small"
                    sx={{ minWidth: 140 }}
                  >
                    {Object.entries(FORMAT_LABEL).map(([v, l]) => (
                      <MenuItem key={v} value={v}>
                        {l}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Marks"
                    value={String(r.max_marks)}
                    onChange={(e) => update(i, { max_marks: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                    size="small"
                    sx={{ width: 90 }}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                  <TextField
                    label="Class date"
                    type="date"
                    value={r.class_date}
                    onChange={(e) => update(i, { class_date: e.target.value })}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Due date"
                    type="date"
                    value={r.due_date || ''}
                    onChange={(e) => update(i, { due_date: e.target.value || null })}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                  {r.content_image_url && <Chip size="small" label="Image" />}
                  {r.content_video_url && <Chip size="small" label="Video" />}
                  {r.recording_url && <Chip size="small" label="Recording" />}
                  {r.links.length > 0 && <Chip size="small" label={`${r.links.length} link(s)`} />}
                  <Chip size="small" label={`Catch-up ${r.catchup_window_days}d`} variant="outlined" />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        {step === 'paste' ? (
          <>
            <Button onClick={close} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => parse(raw)} disabled={!raw.trim()} sx={{ textTransform: 'none', minWidth: 120 }}>
              Review
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep('paste')} disabled={busy} sx={{ textTransform: 'none' }}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={importAll}
              disabled={busy || !rows.length || invalidCount > 0}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', minWidth: 160 }}
            >
              {busy ? 'Importing...' : `Import ${rows.length} as drafts`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
