'use client';

/**
 * PasteAssignmentsDialog — the frictionless "create by pasting AI JSON" flow.
 * A teacher generates assignment JSON in ChatGPT/Gemini (a "Copy prompt" button
 * gives them the exact prompt), pastes or drops it here, then reviews each parsed
 * assignment in a "Preview" step that uses the SAME field set as the manual create
 * form (AssignmentFormFields), one expandable card per assignment. Editing the
 * brief, type, reference image, format, dates and marks all work exactly as in the
 * manual flow, then Import creates them as drafts.
 */
import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button, Alert,
  IconButton, Divider, Stack, Chip, CircularProgress, useMediaQuery,
  Accordion, AccordionSummary, AccordionDetails,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LinkIcon from '@mui/icons-material/Link';
import {
  validateAssignmentJSON,
  ASSIGNMENT_AI_PROMPT_TEMPLATE,
  type ReviewAssignment,
} from '@/lib/assignment-bulk-schema';
import AssignmentFormFields, { type AssignmentDraft } from '../AssignmentFormFields';

interface PasteAssignmentsDialogProps {
  open: boolean;
  classroomId: string;
  planId?: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onCreated: (count: number) => void;
}

/**
 * A preview draft is the shared AssignmentDraft plus the fields that live outside
 * the form (kept intact through import): the linked-document URL and the AI's
 * content image / video / recording source / extra links.
 */
interface PreviewDraft extends AssignmentDraft {
  linkUrl: string;
  contentImageUrl: string | null;
  contentImageIsBase64: boolean;
  contentVideoUrl: string | null;
  recordingSource: 'youtube' | 'sharepoint' | null;
  links: { label: string; url: string }[];
}

function toDraft(r: ReviewAssignment): PreviewDraft {
  return {
    type: r.assignment_type,
    title: r.title,
    instructions: r.instructions,
    classDate: r.class_date,
    dueDate: r.due_date || '',
    format: r.submission_format,
    maxMarks: String(r.max_marks),
    category: r.drawing_category || '3d_composition',
    refImageUrl: r.reference_image_url,
    recordingUrl: r.recording_url || '',
    catchupDays: String(r.catchup_window_days),
    linkUrl: r.link_url || '',
    contentImageUrl: r.content_image_url,
    contentImageIsBase64: r.content_image_is_base64,
    contentVideoUrl: r.content_video_url,
    recordingSource: r.recording_source,
    links: r.links,
  };
}

/** Map a preview draft back to the bulk-import row shape the API re-validates. */
function toBulkRow(d: PreviewDraft) {
  const isDrawing = d.type === 'drawing';
  return {
    title: d.title.trim(),
    instructions: d.instructions.trim(),
    assignment_type: d.type,
    drawing_category: isDrawing ? d.category : null,
    reference_image_url: isDrawing ? d.refImageUrl : null,
    link_url: isDrawing ? null : d.linkUrl.trim() || null,
    submission_format: d.format,
    max_marks: Number(d.maxMarks) || 10,
    class_date: d.classDate,
    due_date: d.dueDate || null,
    catchup_window_days: Number(d.catchupDays) || 7,
    content_image_url: d.contentImageUrl,
    content_image_is_base64: d.contentImageIsBase64,
    content_video_url: d.contentVideoUrl,
    recording_url: d.recordingUrl.trim() || null,
    recording_source: d.recordingSource,
    links: d.links,
  };
}

/** Convert a data: URL to a File for upload. */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(data.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `${name}.${mime.split('/')[1] || 'png'}`, { type: mime });
}

const STEPS = ['Paste', 'Preview', 'Import'];

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
  const [step, setStep] = useState<'paste' | 'preview'>('paste');
  const [raw, setRaw] = useState('');
  const [drafts, setDrafts] = useState<PreviewDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<number | false>(0);
  const [advanced, setAdvanced] = useState<Record<number, boolean>>({});

  const reset = () => {
    setStep('paste');
    setRaw('');
    setDrafts([]);
    setWarnings([]);
    setError('');
    setBusy(false);
    setExpanded(0);
    setAdvanced({});
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  // Injected uploader for the drawing reference image (same endpoint as the
  // manual dialog: /api/drawing/upload, bucket drawing-references).
  const uploadReference = useCallback(
    async (file: File): Promise<{ url: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const form = new FormData();
      form.append('file', file);
      form.append('bucket', 'drawing-references');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return { url: data.url as string };
    },
    [getToken],
  );

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
    setDrafts(result.assignments.map(toDraft));
    setWarnings(result.warnings);
    setExpanded(0);
    setAdvanced({});
    setStep('preview');
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

  const update = (idx: number, patch: Partial<PreviewDraft>) =>
    setDrafts((ds) => ds.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const remove = (idx: number) => {
    setDrafts((ds) => ds.filter((_, i) => i !== idx));
    setExpanded((e) => (e === false ? false : e === idx ? false : e > idx ? e - 1 : e));
  };

  const invalidCount = useMemo(() => drafts.filter((d) => !d.title.trim()).length, [drafts]);

  const importAll = async () => {
    if (!drafts.length) return;
    if (invalidCount > 0) {
      const firstBad = drafts.findIndex((d) => !d.title.trim());
      setExpanded(firstBad);
      setError('Every assignment needs a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const token = await getToken();
      const bulkRows = drafts.map(toBulkRow);
      // Upload any base64 content images first, swapping in the returned URL.
      const prepared = await Promise.all(
        bulkRows.map(async (r, i) => {
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

  const currentStep = step === 'paste' ? 0 : 1;

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <ContentPasteGoIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            Create with AI
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {step === 'paste'
              ? 'Paste the JSON from ChatGPT or Gemini'
              : `${drafts.length} assignment${drafts.length === 1 ? '' : 's'} to preview`}
          </Typography>
        </Box>
        <IconButton onClick={close} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {/* Step indicator */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
          {STEPS.map((label, i) => (
            <Fragment key={label}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    bgcolor: i <= currentStep ? 'primary.main' : 'action.selected',
                    color: i <= currentStep ? 'primary.contrastText' : 'text.secondary',
                  }}
                >
                  {i + 1}
                </Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: i === currentStep ? 700 : 500, color: i <= currentStep ? 'text.primary' : 'text.secondary' }}
                >
                  {label}
                </Typography>
              </Stack>
              {i < STEPS.length - 1 && <Box sx={{ width: 18, height: 2, borderRadius: 1, bgcolor: 'divider' }} />}
            </Fragment>
          ))}
        </Stack>

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
                  1. Copy the prompt into ChatGPT/Gemini and describe your assignment in your own words. 2. Paste the JSON it returns below, you will format it into a proper assignment in the next step.
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
            {drafts.map((d, i) => {
              const invalid = !d.title.trim();
              return (
                <Accordion
                  key={i}
                  expanded={expanded === i}
                  onChange={(_, isExp) => setExpanded(isExp ? i : false)}
                  disableGutters
                  TransitionProps={{ unmountOnExit: true }}
                  sx={{
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: invalid ? 'error.light' : 'divider',
                    boxShadow: 'none',
                    '&:before': { display: 'none' },
                    overflow: 'hidden',
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 56, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1, my: 1 } }}>
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        flex: '0 0 auto',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        bgcolor: 'action.selected',
                        color: 'text.secondary',
                      }}
                    >
                      {i + 1}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                      {d.title.trim() || 'Untitled assignment'}
                    </Typography>
                    <Chip
                      size="small"
                      icon={d.type === 'drawing' ? <BrushOutlinedIcon sx={{ fontSize: 13 }} /> : <DescriptionOutlinedIcon sx={{ fontSize: 13 }} />}
                      label={d.type === 'drawing' ? 'Drawing' : 'Document'}
                      color={d.type === 'drawing' ? 'secondary' : 'default'}
                      variant={d.type === 'drawing' ? 'filled' : 'outlined'}
                      sx={{ height: 22 }}
                    />
                    <IconButton
                      component="div"
                      role="button"
                      aria-label="Remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(i);
                      }}
                      sx={{ width: 36, height: 36 }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <AssignmentFormFields
                      value={d}
                      onChange={(patch) => update(i, patch)}
                      uploadReference={uploadReference}
                      showCategory
                      showAdvanced={!!advanced[i]}
                      onToggleAdvanced={() => setAdvanced((a) => ({ ...a, [i]: !a[i] }))}
                    />
                    {d.type === 'document' && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                          Question paper link (optional)
                        </Typography>
                        <TextField
                          size="small"
                          fullWidth
                          value={d.linkUrl}
                          onChange={(e) => update(i, { linkUrl: e.target.value })}
                          placeholder="Paste a OneDrive/SharePoint link"
                          InputProps={{ startAdornment: <LinkIcon sx={{ fontSize: 18, mr: 0.5, color: 'text.disabled' }} /> }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          To upload a file instead, import first, then open the assignment and use Edit.
                        </Typography>
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
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
              Preview
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
              disabled={busy || !drafts.length}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', minWidth: 160 }}
            >
              {busy ? 'Importing...' : `Import ${drafts.length} as draft${drafts.length === 1 ? '' : 's'}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
