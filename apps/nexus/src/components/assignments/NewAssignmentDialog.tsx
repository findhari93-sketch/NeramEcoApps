'use client';

/**
 * Create a class assignment, type-aware. A DRAWING assignment (photos-only) is
 * routed through the Drawing Review channel for smart evaluation; a DOCUMENT
 * assignment (solve a paper) lets the teacher attach the question file by
 * uploading, picking from Study Materials, or pasting a OneDrive/SharePoint link.
 *
 * Two phases: fill the form -> create a draft (gets an id), then add materials
 * (document) or just publish (drawing). Mobile bottom-sheet, 48px targets.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Typography, TextField, Drawer, IconButton, Stack, ToggleButtonGroup,
  ToggleButton, Chip, LinearProgress, Divider, MenuItem, Collapse, useMediaQuery, useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { ASSIGNMENT_ATTACHMENTS_FOLDER_ID } from '@/lib/assignment-constants';
import { istTodayStr } from '@/lib/assignment-clock';
import StudyFilePicker, { type PickedFile } from './StudyFilePicker';

type AType = 'drawing' | 'document';
type Format = 'pdf' | 'image' | 'pdf_or_image';

interface AttachmentRow {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface CreatedAssignment {
  id: string;
  title: string;
  attachments: AttachmentRow[];
}

const DRAWING_CATEGORIES: { value: string; label: string }[] = [
  { value: '3d_composition', label: '3D composition' },
  { value: '2d_composition', label: '2D composition' },
  { value: 'kit_sculpture', label: 'Kit / sculpture' },
];

export default function NewAssignmentDialog({
  open,
  onClose,
  classroomId,
  authFetch,
  getToken,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  onCreated: () => void;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const fileRef = useRef<HTMLInputElement>(null);
  const refImgRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<AType>('drawing');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [classDate, setClassDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [format, setFormat] = useState<Format>('pdf_or_image');
  const [maxMarks, setMaxMarks] = useState('10');
  const [category, setCategory] = useState('3d_composition');
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [catchupDays, setCatchupDays] = useState('7');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [created, setCreated] = useState<CreatedAssignment | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setType('drawing');
      setTitle('');
      setInstructions('');
      setClassDate(istTodayStr());
      setDueDate('');
      setFormat('pdf_or_image');
      setMaxMarks('10');
      setCategory('3d_composition');
      setRefImageUrl(null);
      setRecordingUrl('');
      setCatchupDays('7');
      setShowAdvanced(false);
      setCreated(null);
      setLinkUrl('');
      setError('');
    }
  }, [open]);

  const reloadDetail = async (id: string) => {
    const res = await authFetch(`/api/assignments/${id}`);
    setCreated(res.assignment as CreatedAssignment);
  };

  const uploadReferenceImage = async (file: File) => {
    setUploading(true);
    setError('');
    try {
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
      setRefImageUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the reference image.');
    } finally {
      setUploading(false);
    }
  };

  const createDraft = async () => {
    if (!title.trim()) {
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
          assignment_type: type,
          title: title.trim(),
          instructions: instructions.trim() || null,
          class_date: classDate || undefined,
          due_date: dueDate || undefined,
          catchup_window_days: Number(catchupDays) || 7,
          recording_url: recordingUrl.trim() || null,
          ...(type === 'drawing'
            ? { drawing_category: category, reference_image_url: refImageUrl }
            : { submission_format: format, max_marks: Number(maxMarks) || 10 }),
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
            {created ? (type === 'drawing' ? 'Publish drawing task' : 'Add the paper and publish') : 'New assignment'}
          </Typography>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {!created ? (
          <Stack spacing={2}>
            {/* Type selector */}
            <ToggleButtonGroup value={type} exclusive onChange={(_, v) => v && setType(v)} fullWidth size="small">
              <ToggleButton value="drawing" sx={{ minHeight: 52, textTransform: 'none', gap: 0.75, flexDirection: 'column', py: 1 }}>
                <BrushOutlinedIcon sx={{ fontSize: 20 }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Drawing</Typography>
                  <Typography variant="caption" color="text.secondary">Sketch, smart review</Typography>
                </Box>
              </ToggleButton>
              <ToggleButton value="document" sx={{ minHeight: 52, textTransform: 'none', gap: 0.75, flexDirection: 'column', py: 1 }}>
                <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Document</Typography>
                  <Typography variant="caption" color="text.secondary">Solve a paper</Typography>
                </Box>
              </ToggleButton>
            </ToggleButtonGroup>

            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              autoFocus
              placeholder={type === 'drawing' ? 'e.g. Recreate the India Gate in pencil' : 'e.g. JEE 2024 Maths paper'}
            />
            <TextField
              label={type === 'drawing' ? 'Brief (what to draw)' : 'Instructions (optional)'}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder={type === 'drawing' ? 'Recreate the basic 3D form, focus on proportion and clean lines.' : 'Solve every question and upload your solved paper.'}
            />

            {type === 'drawing' ? (
              <Stack spacing={2}>
                <TextField select label="Drawing type" value={category} onChange={(e) => setCategory(e.target.value)} fullWidth>
                  {DRAWING_CATEGORIES.map((c) => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </TextField>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Reference / expected output (optional)</Typography>
                  <input
                    ref={refImgRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReferenceImage(f); e.target.value = ''; }}
                  />
                  {refImageUrl ? (
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box component="img" src={refImageUrl} alt="reference" sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 2, border: '1px solid', borderColor: 'divider' }} />
                      <Button size="small" onClick={() => setRefImageUrl(null)}>Remove</Button>
                    </Stack>
                  ) : (
                    <Button variant="outlined" size="small" startIcon={<UploadFileOutlinedIcon sx={{ fontSize: 18 }} />} onClick={() => refImgRef.current?.click()} disabled={uploading} sx={{ minHeight: 44 }}>
                      {uploading ? 'Uploading...' : 'Add reference image'}
                    </Button>
                  )}
                </Box>
              </Stack>
            ) : (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>What can students upload?</Typography>
                <ToggleButtonGroup value={format} exclusive onChange={(_, v) => v && setFormat(v)} fullWidth size="small">
                  <ToggleButton value="pdf_or_image" sx={{ minHeight: 48, textTransform: 'none' }}>PDF or photos</ToggleButton>
                  <ToggleButton value="pdf" sx={{ minHeight: 48, textTransform: 'none' }}>PDF only</ToggleButton>
                  <ToggleButton value="image" sx={{ minHeight: 48, textTransform: 'none' }}>Photos only</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            <Stack direction="row" spacing={2}>
              <TextField label="Class date" type="date" value={classDate} onChange={(e) => setClassDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
              <TextField label="Due (optional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
            </Stack>

            <Button
              onClick={() => setShowAdvanced((s) => !s)}
              endIcon={<ExpandMoreIcon sx={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
              sx={{ alignSelf: 'flex-start', minHeight: 40, textTransform: 'none', color: 'text.secondary' }}
            >
              More options
            </Button>
            <Collapse in={showAdvanced}>
              <Stack spacing={2}>
                {type === 'document' && (
                  <TextField
                    label="Max marks"
                    value={maxMarks}
                    onChange={(e) => setMaxMarks(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputProps={{ inputMode: 'decimal' }}
                    sx={{ width: 140 }}
                  />
                )}
                <TextField
                  label="Catch-up window (days for late joiners)"
                  value={catchupDays}
                  onChange={(e) => setCatchupDays(e.target.value.replace(/[^0-9]/g, ''))}
                  inputProps={{ inputMode: 'numeric' }}
                  fullWidth
                />
                <TextField
                  label="Class recording link (optional)"
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                  fullWidth
                  placeholder="YouTube or SharePoint URL, for late joiners"
                />
              </Stack>
            </Collapse>

            {error && <Typography color="error" variant="body2">{error}</Typography>}
            <Button variant="contained" disabled={busy} onClick={createDraft} sx={{ minHeight: 48 }}>
              {busy ? 'Creating...' : type === 'drawing' ? 'Create drawing task' : 'Create and add the paper'}
            </Button>
          </Stack>
        ) : (
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
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Question paper &amp; references</Typography>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ''; }}
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
