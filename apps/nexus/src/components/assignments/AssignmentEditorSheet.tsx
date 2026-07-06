'use client';

/**
 * Create or edit a class assignment. Opens as a bottom sheet on mobile and a
 * dialog on desktop. A new assignment is saved as a draft first (so we have an
 * id to hang attachments off), then the teacher can attach reference files
 * (upload or pull the topic's drill files) and publish.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Typography,
  TextField,
  Drawer,
  IconButton,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  LinearProgress,
  Divider,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import AutoAwesomeMotionOutlinedIcon from '@mui/icons-material/AutoAwesomeMotionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { ASSIGNMENT_ATTACHMENTS_FOLDER_ID } from '@/lib/assignment-constants';
import type { NexusClassAssignment } from '@neram/database';

type Format = 'pdf' | 'pdf_or_image';

interface AttachmentRow {
  id: string;
  study_file_id: string;
  source: 'upload' | 'topic_drill';
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface AssignmentDetail extends NexusClassAssignment {
  attachments: AttachmentRow[];
}

interface AssignmentEditorSheetProps {
  open: boolean;
  onClose: () => void;
  planId: string;
  date: string;
  topicId: string | null;
  hasTopicDrills?: boolean;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
}

export default function AssignmentEditorSheet({
  open,
  onClose,
  planId,
  date,
  topicId,
  hasTopicDrills,
  authFetch,
  getToken,
  onSaved,
}: AssignmentEditorSheetProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [format, setFormat] = useState<Format>('pdf_or_image');
  const [maxMarks, setMaxMarks] = useState('25');
  const [dueAt, setDueAt] = useState('');
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setInstructions('');
      setFormat('pdf_or_image');
      setMaxMarks('25');
      setDueAt('');
      setAssignment(null);
      setError('');
    }
  }, [open]);

  const reloadDetail = async (id: string) => {
    const res = await authFetch(`/api/assignments/${id}`);
    setAssignment(res.assignment as AssignmentDetail);
  };

  const saveDraft = async () => {
    if (!title.trim()) {
      setError('Give the assignment a title.');
      return;
    }
    const marks = Number(maxMarks);
    if (!Number.isFinite(marks) || marks <= 0) {
      setError('Max marks must be a number greater than 0.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await authFetch(`/api/teaching-plans/${planId}/class-day`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_assignment',
          date,
          title: title.trim(),
          instructions: instructions.trim() || null,
          submission_format: format,
          max_marks: marks,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          topic_id: topicId,
        }),
      });
      await reloadDetail(res.assignment.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the assignment.');
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!assignment) return;
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
      await authFetch(`/api/assignments/${assignment.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'add_attachment', study_file_id: upData.file.id }),
      });
      await reloadDetail(assignment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const attachDrills = async () => {
    if (!assignment) return;
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${assignment.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'attach_topic_drills' }),
      });
      await reloadDetail(assignment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach drills.');
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!assignment) return;
    await authFetch(`/api/assignments/${assignment.id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'remove_attachment', attachment_id: attachmentId }),
    });
    await reloadDetail(assignment.id);
  };

  const publish = async () => {
    if (!assignment) return;
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${assignment.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'publish' }),
      });
      onSaved();
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
          maxHeight: '92vh',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          ...(isDesktop ? { maxWidth: 560, mx: 'auto', mb: 0 } : {}),
        },
      }}
    >
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>
            {assignment ? 'Add materials and publish' : 'New assignment'}
          </Typography>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {!assignment ? (
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              autoFocus
              placeholder="e.g. JEE Paper 2: 25 math questions"
            />
            <TextField
              label="Instructions (optional)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="What should students do, and how should they submit it?"
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                What can students upload?
              </Typography>
              <ToggleButtonGroup
                value={format}
                exclusive
                onChange={(_, v) => v && setFormat(v)}
                fullWidth
                size="small"
              >
                <ToggleButton value="pdf_or_image" sx={{ minHeight: 48, textTransform: 'none', gap: 0.75 }}>
                  <ImageOutlinedIcon sx={{ fontSize: 18 }} /> Images or PDF
                </ToggleButton>
                <ToggleButton value="pdf" sx={{ minHeight: 48, textTransform: 'none', gap: 0.75 }}>
                  <PictureAsPdfOutlinedIcon sx={{ fontSize: 18 }} /> PDF only
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Max marks"
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value.replace(/[^0-9.]/g, ''))}
                inputProps={{ inputMode: 'decimal' }}
                sx={{ width: 120 }}
              />
              <TextField
                label="Due (optional)"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Stack>
            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}
            <Button variant="contained" disabled={busy} onClick={saveDraft} sx={{ minHeight: 48 }}>
              {busy ? 'Saving...' : 'Save draft and add materials'}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{assignment.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                {assignment.submission_format === 'pdf' ? 'PDF only' : 'Images or PDF'} · out of{' '}
                {assignment.max_marks}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Reference materials
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
                {(assignment.attachments || []).map((a) => (
                  <Stack
                    key={a.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}
                  >
                    <PictureAsPdfOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                      {a.file?.title || a.file?.file_name || 'File'}
                    </Typography>
                    {a.source === 'topic_drill' && (
                      <Chip label="drill" size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
                    )}
                    <IconButton size="small" onClick={() => removeAttachment(a.id)} sx={{ minWidth: 36, minHeight: 36 }}>
                      <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
              {uploading && <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />}
              <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadFileOutlinedIcon sx={{ fontSize: 18 }} />}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  sx={{ minHeight: 40 }}
                >
                  Upload file
                </Button>
                {hasTopicDrills && (
                  <Button
                    variant="text"
                    size="small"
                    startIcon={<AutoAwesomeMotionOutlinedIcon sx={{ fontSize: 18 }} />}
                    onClick={attachDrills}
                    disabled={busy}
                    sx={{ minHeight: 40 }}
                  >
                    Attach topic drills
                  </Button>
                )}
              </Stack>
            </Box>

            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}

            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={onClose} sx={{ flex: 1, minHeight: 48 }}>
                Save as draft
              </Button>
              <Button variant="contained" disabled={busy} onClick={publish} sx={{ flex: 1, minHeight: 48 }}>
                {busy ? 'Publishing...' : 'Publish to students'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
