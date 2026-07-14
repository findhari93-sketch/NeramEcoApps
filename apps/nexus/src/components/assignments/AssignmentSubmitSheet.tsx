'use client';

/**
 * Student submission sheet. Respects the assignment's format lock (a single PDF,
 * or photos, or one PDF when "Images or PDF"). Files upload straight to storage
 * via signed URLs (the bytes never pass through our server), then the submission
 * is recorded. Redo state shows the teacher's feedback up top.
 */
import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Drawer,
  Stack,
  Typography,
  IconButton,
  Button,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
} from '@neram/ui';
import { getSupabaseBrowserClient } from '@neram/database';
import CloseIcon from '@mui/icons-material/Close';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { ASSIGNMENT_SUBMISSIONS_BUCKET } from '@/lib/assignment-constants';

type Format = 'pdf' | 'image' | 'pdf_or_image';
const MAX_FILES = 12;

interface AssignmentSubmitSheetProps {
  open: boolean;
  onClose: () => void;
  assignmentId: string;
  format: Format;
  redoFeedback?: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onSubmitted: () => void;
}

export default function AssignmentSubmitSheet({
  open,
  onClose,
  assignmentId,
  format,
  redoFeedback,
  authFetch,
  onSubmitted,
}: AssignmentSubmitSheetProps) {
  const photoRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  // For "Images or PDF" the student picks a mode so we can enforce no-mixing.
  const [mode, setMode] = useState<'images' | 'pdf'>(format === 'pdf' ? 'pdf' : 'images');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const effectiveMode = format === 'pdf' ? 'pdf' : mode;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setError('');
    if (effectiveMode === 'pdf') {
      const pdf = incoming.find((f) => f.type === 'application/pdf');
      if (!pdf) {
        setError('Choose a PDF file.');
        return;
      }
      setFiles([pdf]);
    } else {
      const images = incoming.filter((f) => f.type.startsWith('image/'));
      const merged = [...files, ...images].slice(0, MAX_FILES);
      setFiles(merged);
    }
  };

  const removeFile = (idx: number) => setFiles((f) => f.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!files.length) {
      setError('Add your work first.');
      return;
    }
    setBusy(true);
    setError('');
    setProgress(5);
    try {
      // 1. Ask the server for signed upload URLs (validates the format lock).
      const { uploads } = await authFetch('/api/student/assignments', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_upload_urls',
          assignment_id: assignmentId,
          files: files.map((f) => ({ name: f.name, mime: f.type, size_bytes: f.size })),
        }),
      });

      // 2. PUT each file straight to storage with its signed token.
      const storage = getSupabaseBrowserClient().storage.from(ASSIGNMENT_SUBMISSIONS_BUCKET);
      for (let i = 0; i < uploads.length; i++) {
        const u = uploads[i];
        const { error: upErr } = await storage.uploadToSignedUrl(u.path, u.token, files[i], {
          contentType: files[i].type,
        });
        if (upErr) throw new Error(upErr.message || 'Upload failed');
        setProgress(10 + Math.round(((i + 1) / uploads.length) * 80));
      }

      // 3. Record the submission.
      await authFetch('/api/student/assignments', {
        method: 'POST',
        body: JSON.stringify({
          action: 'submit',
          assignment_id: assignmentId,
          files: uploads.map((u: any) => ({
            path: u.path,
            name: u.name,
            mime: u.mime,
            size_bytes: u.size_bytes,
          })),
        }),
      });
      setProgress(100);
      setFiles([]);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const previews = useMemo(
    () => files.map((f) => ({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })),
    [files],
  );

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { maxHeight: '92vh', borderTopLeftRadius: 20, borderTopRightRadius: 20 } }}
    >
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>Submit your work</Typography>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {redoFeedback && (
          <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: alpha('#EF6C00', 0.1), border: `1px solid ${alpha('#EF6C00', 0.3)}` }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#B54700' }}>
              Your teacher asked for a redo
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>
              {redoFeedback}
            </Typography>
          </Box>
        )}

        {format === 'pdf_or_image' && (
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => {
              if (v) {
                setMode(v);
                setFiles([]);
              }
            }}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="images" sx={{ minHeight: 44, textTransform: 'none' }}>
              Photos
            </ToggleButton>
            <ToggleButton value="pdf" sx={{ minHeight: 44, textTransform: 'none' }}>
              One PDF
            </ToggleButton>
          </ToggleButtonGroup>
        )}

        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={pdfRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* File chips / previews */}
        {files.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
            {previews.map((p, i) => (
              <Box key={i} sx={{ position: 'relative' }}>
                {p.url ? (
                  <Box
                    component="img"
                    src={p.url}
                    alt={p.file.name}
                    sx={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 84,
                      height: 84,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'action.hover',
                    }}
                  >
                    <PictureAsPdfOutlinedIcon sx={{ fontSize: 26, color: '#C62828' }} />
                    <Typography variant="caption" noWrap sx={{ maxWidth: 76, px: 0.5 }}>
                      PDF
                    </Typography>
                  </Box>
                )}
                <IconButton
                  size="small"
                  onClick={() => removeFile(i)}
                  sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', width: 26, height: 26 }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            ))}
          </Stack>
        )}

        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          {effectiveMode === 'images' ? (
            <Button
              variant="outlined"
              fullWidth
              startIcon={<PhotoCameraOutlinedIcon />}
              onClick={() => photoRef.current?.click()}
              disabled={busy}
              sx={{ minHeight: 48 }}
            >
              {files.length ? 'Add more photos' : 'Add photos'}
            </Button>
          ) : (
            <Button
              variant="outlined"
              fullWidth
              startIcon={<PictureAsPdfOutlinedIcon />}
              onClick={() => pdfRef.current?.click()}
              disabled={busy}
              sx={{ minHeight: 48 }}
            >
              {files.length ? 'Change PDF' : 'Choose PDF'}
            </Button>
          )}
        </Stack>

        {busy && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1.5, borderRadius: 1 }} />}
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 1.5 }}>
            {error}
          </Typography>
        )}

        <Button variant="contained" fullWidth disabled={busy || !files.length} onClick={submit} sx={{ minHeight: 48 }}>
          {busy ? 'Submitting...' : 'Submit'}
        </Button>
      </Box>
    </Drawer>
  );
}
