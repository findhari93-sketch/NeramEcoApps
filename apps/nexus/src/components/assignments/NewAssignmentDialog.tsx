'use client';

/**
 * Create OR edit a class assignment, type-aware.
 *
 * - Create: pick Drawing or Document, fill the form, create a draft (gets an id),
 *   then add materials (document) or just publish (drawing).
 * - Edit (assignmentId set): one combined form pre-filled from the assignment; the
 *   type is locked; Save changes PATCHes via the `update` action. Document materials
 *   (upload / pick / paste-link) are managed inline against the existing id.
 *
 * DRAWING assignments route through the Drawing Review channel; a DOCUMENT
 * assignment attaches the question paper (upload / pick from Study Materials /
 * paste a OneDrive link). The field set is the shared AssignmentFormFields (also
 * used by the AI import preview). Mobile bottom-sheet, 48px targets.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Typography, TextField, Drawer, IconButton, Stack,
  Chip, LinearProgress, Divider, useMediaQuery, useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { ASSIGNMENT_ATTACHMENTS_FOLDER_ID } from '@/lib/assignment-constants';
import { istTodayStr } from '@/lib/assignment-clock';
import type { AssignmentFormat } from '@/lib/assignment-format';
import StudyFilePicker, { type PickedFile } from './StudyFilePicker';
import AssignmentFormFields, { type AssignmentDraft, type AssignmentType, blankDraft } from './AssignmentFormFields';

interface AttachmentRow {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface AssignmentDetail {
  id: string;
  title: string;
  assignment_type: AssignmentType;
  instructions: string | null;
  submission_format: AssignmentFormat;
  max_marks: number;
  class_date: string;
  due_at: string | null;
  catchup_window_days: number;
  content_image_url: string | null;
  reference_images?: string[] | null;
  recording_url: string | null;
  attachments: AttachmentRow[];
}

export default function NewAssignmentDialog({
  open,
  onClose,
  classroomId,
  authFetch,
  getToken,
  onCreated,
  assignmentId,
}: {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  onCreated: () => void;
  /** When set, the dialog edits this assignment instead of creating one. */
  assignmentId?: string | null;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!assignmentId;

  const [draft, setDraft] = useState<AssignmentDraft>(() => blankDraft(istTodayStr()));
  const patch = useCallback((p: Partial<AssignmentDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const type = draft.type;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [created, setCreated] = useState<AssignmentDetail | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const prefill = useCallback((a: AssignmentDetail) => {
    setDraft({
      type: a.assignment_type,
      title: a.title,
      instructions: a.instructions || '',
      classDate: a.class_date,
      dueDate: a.due_at ? a.due_at.slice(0, 10) : '',
      format: a.submission_format,
      maxMarks: String(a.max_marks ?? 10),
      category: '3d_composition',
      refImageUrls: a.reference_images?.length ? a.reference_images : a.content_image_url ? [a.content_image_url] : [],
      recordingUrl: a.recording_url || '',
      catchupDays: String(a.catchup_window_days ?? 7),
    });
    setCreated(a);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Reset first.
    setDraft(blankDraft(istTodayStr()));
    setShowAdvanced(false);
    setCreated(null);
    setLinkUrl('');
    setError('');
    // Edit mode: load the assignment and prefill.
    if (assignmentId) {
      authFetch(`/api/assignments/${assignmentId}`)
        .then((res) => prefill(res.assignment as AssignmentDetail))
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the assignment.'));
    }
  }, [open, assignmentId, authFetch, prefill]);

  const reloadDetail = async (id: string) => {
    const res = await authFetch(`/api/assignments/${id}`);
    setCreated(res.assignment as AssignmentDetail);
  };

  // Injected uploader for the shared ImageUploadField (drawing reference image).
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

  // Injected resolver for a pasted OneDrive/SharePoint image link.
  const linkReference = useCallback(
    async (url: string): Promise<{ url: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const res = await fetch('/api/drawing/link-reference', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not import that link');
      return { url: data.url as string };
    },
    [getToken],
  );

  // Edit mode syncs the reference images immediately so they can't be forgotten.
  const onReferenceChange = (urls: string[]) => {
    patch({ refImageUrls: urls });
    if (isEdit && assignmentId) {
      authFetch(`/api/assignments/${assignmentId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'update', reference_image_urls: urls }),
      }).catch((e) => setError(e instanceof Error ? e.message : 'Could not save the images.'));
    }
  };

  const createDraft = async () => {
    if (!draft.title.trim()) {
      setError('Give the assignment a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await authFetch('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          classroom_id: classroomId,
          assignment_type: draft.type,
          title: draft.title.trim(),
          instructions: draft.instructions.trim() || null,
          class_date: draft.classDate || undefined,
          due_date: draft.dueDate || undefined,
          catchup_window_days: Number(draft.catchupDays) || 7,
          recording_url: draft.recordingUrl.trim() || null,
          ...(draft.type === 'drawing'
            ? { drawing_category: draft.category, reference_image_urls: draft.refImageUrls }
            : { submission_format: draft.format, max_marks: Number(draft.maxMarks) || 10 }),
        }),
      });
      await reloadDetail(res.assignment.id);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the assignment.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!assignmentId) return;
    if (!draft.title.trim()) {
      setError('Give the assignment a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authFetch(`/api/assignments/${assignmentId}`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'update',
          title: draft.title.trim(),
          instructions: draft.instructions.trim() || null,
          class_date: draft.classDate || undefined,
          due_at: draft.dueDate ? `${draft.dueDate}T23:59:59+05:30` : null,
          catchup_window_days: Number(draft.catchupDays) || 7,
          recording_url: draft.recordingUrl.trim() || null,
          ...(draft.type === 'drawing'
            ? { reference_image_urls: draft.refImageUrls }
            : { submission_format: draft.format, max_marks: Number(draft.maxMarks) || 10 }),
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!created) return;
    setUploading(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const form = new FormData();
      form.append('file', file);
      form.append('folder_id', ASSIGNMENT_ATTACHMENTS_FOLDER_ID);
      const upRes = await fetch('/api/study-materials/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(upData.error || 'Upload failed');
      await authFetch(`/api/assignments/${created.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'add_attachment', study_file_id: upData.file.id }),
      });
      await reloadDetail(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const pickFile = async (file: PickedFile) => {
    if (!created) return;
    setPickerOpen(false);
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${created.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'add_attachment', study_file_id: file.id }),
      });
      await reloadDetail(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach the file.');
    } finally {
      setBusy(false);
    }
  };

  const linkDocument = async () => {
    if (!created || !linkUrl.trim()) return;
    setBusy(true);
    setError('');
    try {
      await authFetch('/api/assignments/link-document', {
        method: 'POST',
        body: JSON.stringify({ assignment_id: created.id, url: linkUrl.trim() }),
      });
      setLinkUrl('');
      await reloadDetail(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link the document.');
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!created) return;
    await authFetch(`/api/assignments/${created.id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'remove_attachment', attachment_id: attachmentId }),
    });
    await reloadDetail(created.id);
  };

  const publish = async () => {
    if (!created) return;
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${created.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'publish' }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  // The document "materials" section (upload / pick / link), shown in edit and in
  // the create phase-2. Requires `created` (an existing assignment id).
  const materialsSection = created && type === 'document' && (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
        Question paper &amp; references
      </Typography>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadAttachment(f);
          e.target.value = '';
        }}
      />
      <Stack spacing={1}>
        {(created.attachments || []).map((a) => (
          <Stack key={a.id} direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
            <PictureAsPdfOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
              {a.file?.title || a.file?.file_name || 'File'}
            </Typography>
            <IconButton size="small" onClick={() => removeAttachment(a.id)} sx={{ minWidth: 36, minHeight: 36 }}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      {uploading && <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />}
      <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
        <Button variant="outlined" size="small" startIcon={<UploadFileOutlinedIcon sx={{ fontSize: 18 }} />} onClick={() => fileRef.current?.click()} disabled={uploading} sx={{ minHeight: 40 }}>
          Upload
        </Button>
        <Button variant="outlined" size="small" startIcon={<DescriptionOutlinedIcon sx={{ fontSize: 18 }} />} onClick={() => setPickerOpen(true)} disabled={busy} sx={{ minHeight: 40 }}>
          Pick from library
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="flex-start">
        <TextField
          size="small"
          fullWidth
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Paste a OneDrive/SharePoint link"
          InputProps={{ startAdornment: <LinkIcon sx={{ fontSize: 18, mr: 0.5, color: 'text.disabled' }} /> }}
        />
        <Button variant="outlined" size="small" onClick={linkDocument} disabled={busy || !linkUrl.trim()} sx={{ minHeight: 40, whiteSpace: 'nowrap' }}>
          Link
        </Button>
      </Stack>
    </Box>
  );

  const fieldsBlock = (
    <AssignmentFormFields
      value={draft}
      onChange={patch}
      uploadReference={uploadReference}
      linkReference={linkReference}
      onReferenceChange={onReferenceChange}
      lockType={isEdit}
      showCategory={!isEdit}
      autoFocusTitle={!isEdit}
      showAdvanced={showAdvanced}
      onToggleAdvanced={() => setShowAdvanced((s) => !s)}
    />
  );

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          maxHeight: '94vh',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          ...(isDesktop ? { maxWidth: 580, mx: 'auto', mb: 0 } : {}),
        },
      }}
    >
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>
            {isEdit
              ? 'Edit assignment'
              : created
                ? type === 'drawing'
                  ? 'Publish drawing task'
                  : 'Add the paper and publish'
                : 'New assignment'}
          </Typography>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {isEdit ? (
          /* ---------- EDIT: one combined form ---------- */
          <Stack spacing={2}>
            {fieldsBlock}
            {materialsSection}
            {error && <Typography color="error" variant="body2">{error}</Typography>}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={onClose} sx={{ flex: 1, minHeight: 48 }}>Cancel</Button>
              <Button variant="contained" disabled={busy} onClick={saveEdit} sx={{ flex: 1, minHeight: 48 }}>
                {busy ? 'Saving...' : 'Save changes'}
              </Button>
            </Stack>
          </Stack>
        ) : !created ? (
          /* ---------- CREATE: phase 1 (form) ---------- */
          <Stack spacing={2}>
            {fieldsBlock}
            {error && <Typography color="error" variant="body2">{error}</Typography>}
            <Button variant="contained" disabled={busy} onClick={createDraft} sx={{ minHeight: 48 }}>
              {busy ? 'Creating...' : type === 'drawing' ? 'Create drawing task' : 'Create and add the paper'}
            </Button>
          </Stack>
        ) : (
          /* ---------- CREATE: phase 2 (materials + publish) ---------- */
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{created.title}</Typography>
              <Chip
                size="small"
                icon={type === 'drawing' ? <BrushOutlinedIcon sx={{ fontSize: 15 }} /> : <DescriptionOutlinedIcon sx={{ fontSize: 15 }} />}
                label={type === 'drawing' ? 'Drawing' : 'Document'}
                sx={{ mt: 0.5, height: 22 }}
              />
            </Box>

            {type === 'document' && (
              <>
                <Divider />
                {materialsSection}
              </>
            )}

            {type === 'drawing' && (
              <Typography variant="body2" color="text.secondary">
                Students submit a photo of their drawing. You will evaluate each one in the drawing review screen (mark regions, sketch over it, rate and give feedback).
              </Typography>
            )}

            {error && <Typography color="error" variant="body2">{error}</Typography>}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={onClose} sx={{ flex: 1, minHeight: 48 }}>Save as draft</Button>
              <Button variant="contained" disabled={busy} onClick={publish} sx={{ flex: 1, minHeight: 48 }}>
                {busy ? 'Publishing...' : 'Publish to students'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>

      <StudyFilePicker open={pickerOpen} onClose={() => setPickerOpen(false)} authFetch={authFetch} onPick={pickFile} />
    </Drawer>
  );
}
