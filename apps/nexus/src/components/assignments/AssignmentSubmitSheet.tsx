'use client';

/**
 * Student submission sheet. Respects the assignment's format lock (a single PDF,
 * or photos, or one PDF when "Images or PDF"). Files upload straight to storage
 * via signed URLs (the bytes never pass through our server), then the submission
 * is recorded. Redo state shows the teacher's feedback up top.
 *
 * Two students-first touches:
 * - Presentation adapts: bottom sheet on phones, right-hand drawer on desktop
 *   (ResponsiveActionSheet).
 * - When a PDF is the deliverable, students can take photos of their work and we
 *   build the single PDF for them (imagesToPdf) so they never need a converter
 *   app. Choosing an existing PDF stays available. Photos are always compressed.
 */
import { useRef, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  IconButton,
  alpha,
} from '@neram/ui';
import { getSupabaseBrowserClient } from '@neram/database';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { ASSIGNMENT_SUBMISSIONS_BUCKET } from '@/lib/assignment-constants';
import { compressImage } from '@/utils/imageCompression';
import { imagesToPdf } from '@/utils/imagesToPdf';
import ResponsiveActionSheet from '@/components/upload/ResponsiveActionSheet';
import PhotoCapturePdf from '@/components/upload/PhotoCapturePdf';

type Format = 'pdf' | 'image' | 'pdf_or_image';
const MAX_IMAGES = 12;
const MAX_PDF_PAGES = 20;

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
  const existingPdfRef = useRef<HTMLInputElement>(null);
  // For "Images or PDF" the student picks a mode so we can enforce no-mixing.
  const [mode, setMode] = useState<'images' | 'pdf'>(format === 'pdf' ? 'pdf' : 'images');
  const [photos, setPhotos] = useState<File[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const effectiveMode = format === 'pdf' ? 'pdf' : mode;

  const resetInputs = () => {
    setPhotos([]);
    setPdfFile(null);
    setError('');
  };

  const canSubmit = effectiveMode === 'pdf' ? Boolean(pdfFile) || photos.length > 0 : photos.length > 0;

  const submit = async () => {
    if (!canSubmit) {
      setError('Add your work first.');
      return;
    }
    setBusy(true);
    setError('');
    setProgress(4);
    try {
      // Build the file(s) to upload from the staged input.
      let uploadFiles: File[];
      if (effectiveMode === 'pdf') {
        if (pdfFile) {
          uploadFiles = [pdfFile];
        } else {
          setProgress(8);
          uploadFiles = [await imagesToPdf(photos, { fileName: 'submission.pdf' })];
        }
      } else {
        // Images: compress each photo before uploading it separately.
        setProgress(8);
        uploadFiles = await Promise.all(
          photos.map((f, i) => compressImage(f, 2000, 0.8, `image-${i + 1}.jpg`)),
        );
      }
      setProgress(15);

      // 1. Ask the server for signed upload URLs (validates the format lock).
      const { uploads } = await authFetch('/api/student/assignments', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_upload_urls',
          assignment_id: assignmentId,
          files: uploadFiles.map((f) => ({ name: f.name, mime: f.type, size_bytes: f.size })),
        }),
      });

      // 2. PUT each file straight to storage with its signed token.
      const storage = getSupabaseBrowserClient().storage.from(ASSIGNMENT_SUBMISSIONS_BUCKET);
      for (let i = 0; i < uploads.length; i++) {
        const u = uploads[i];
        const { error: upErr } = await storage.uploadToSignedUrl(u.path, u.token, uploadFiles[i], {
          contentType: uploadFiles[i].type,
        });
        if (upErr) throw new Error(upErr.message || 'Upload failed');
        setProgress(20 + Math.round(((i + 1) / uploads.length) * 70));
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
      resetInputs();
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const footer = (
    <>
      {busy && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1.5, borderRadius: 1 }} />}
      {error && (
        <Typography color="error" variant="body2" sx={{ mb: 1.5 }}>
          {error}
        </Typography>
      )}
      <Button variant="contained" fullWidth disabled={busy || !canSubmit} onClick={submit} sx={{ minHeight: 48 }}>
        {busy ? (effectiveMode === 'pdf' && !pdfFile ? 'Building PDF…' : 'Submitting…') : 'Submit'}
      </Button>
    </>
  );

  return (
    <ResponsiveActionSheet open={open} onClose={onClose} title="Submit your work" footer={footer}>
      {redoFeedback && (
        <Box
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            bgcolor: alpha('#EF6C00', 0.1),
            border: `1px solid ${alpha('#EF6C00', 0.3)}`,
          }}
        >
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
              resetInputs();
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

      {/* Hidden picker for students who already have a PDF. */}
      <input
        ref={existingPdfRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setPhotos([]);
            setPdfFile(f);
            setError('');
          }
          e.target.value = '';
        }}
      />

      {effectiveMode === 'images' ? (
        <PhotoCapturePdf value={photos} onChange={setPhotos} maxFiles={MAX_IMAGES} disabled={busy} />
      ) : pdfFile ? (
        // An existing PDF was chosen.
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
        >
          <PictureAsPdfOutlinedIcon sx={{ fontSize: 30, color: '#C62828' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {pdfFile.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
            </Typography>
          </Box>
          <IconButton aria-label="Remove PDF" onClick={() => setPdfFile(null)} disabled={busy} sx={{ minWidth: 44, minHeight: 44 }}>
            <DeleteOutlineIcon />
          </IconButton>
        </Stack>
      ) : (
        // Build a PDF from photos (primary), or fall back to choosing a PDF.
        <>
          <PhotoCapturePdf value={photos} onChange={setPhotos} maxFiles={MAX_PDF_PAGES} disabled={busy} />
          {photos.length === 0 && (
            <>
              <Divider sx={{ my: 2, color: 'text.disabled', fontSize: '0.8rem' }}>or</Divider>
              <Button
                variant="text"
                fullWidth
                startIcon={<PictureAsPdfOutlinedIcon />}
                onClick={() => existingPdfRef.current?.click()}
                disabled={busy}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                Already have a PDF? Choose file
              </Button>
            </>
          )}
        </>
      )}
    </ResponsiveActionSheet>
  );
}
