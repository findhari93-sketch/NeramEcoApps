'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  ImageUploadField,
} from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { compressImage } from '@/utils/imageCompression';
import { imagesToPdf } from '@/utils/imagesToPdf';
import ResponsiveActionSheet from '@/components/upload/ResponsiveActionSheet';
import PhotoCapturePdf from '@/components/upload/PhotoCapturePdf';
import { useCanCapturePhoto } from '@/hooks/useCanCapturePhoto';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  max_file_size_mb: number;
  allowed_file_types: string[];
}

interface DocumentUploadSheetProps {
  open: boolean;
  template: Template | null;
  classroomId: string;
  examAttemptId?: string | null;
  onClose: () => void;
  onUploaded: () => void;
}

export default function DocumentUploadSheet({
  open,
  template,
  classroomId,
  examAttemptId,
  onClose,
  onUploaded,
}: DocumentUploadSheetProps) {
  const { getToken } = useNexusAuthContext();
  const canCapture = useCanCapturePhoto();
  // Two ways to provide the document: photograph it (combined into one PDF for
  // the student) or upload a file they already have.
  const [mode, setMode] = useState<'photos' | 'file'>('photos');
  const [photos, setPhotos] = useState<File[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const maxSizeMb = template?.max_file_size_mb || 10;

  // ImageUploadField is used only to PICK the file (paste / drop / choose /
  // camera); the closure just captures the File into state.
  const pickFile = useCallback(async (f: File): Promise<{ url: string }> => {
    setFile(f);
    setError('');
    return { url: '' };
  }, []);

  const canUpload = mode === 'photos' ? photos.length > 0 : Boolean(file);

  const handleUpload = useCallback(async () => {
    if (!template) return;
    setUploading(true);
    setError('');
    setProgress(4);

    try {
      // Build the file to upload from whichever input the student used.
      let finalFile: File;
      if (mode === 'photos') {
        if (!photos.length) {
          setError('Add at least one photo.');
          setUploading(false);
          return;
        }
        setProgress(10);
        finalFile = await imagesToPdf(photos, { fileName: `${template.category || 'document'}.pdf` });
      } else {
        if (!file) {
          setUploading(false);
          return;
        }
        // Compress standalone images; leave PDFs untouched.
        finalFile = file.type.startsWith('image/')
          ? await compressImage(file, 2200, 0.82, `${file.name.replace(/\.[^.]+$/, '')}.jpg`)
          : file;
      }

      if (finalFile.size > maxSizeMb * 1024 * 1024) {
        setError(`File too large (max ${maxSizeMb} MB)`);
        setUploading(false);
        setProgress(0);
        return;
      }

      const token = await getToken();
      if (!token) {
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', finalFile);
      formData.append('template_id', template.id);
      formData.append('classroom_id', classroomId);
      formData.append('title', template.name);
      formData.append('category', template.category);
      if (examAttemptId) {
        formData.append('exam_attempt_id', examAttemptId);
      }

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Upload failed');
        return;
      }

      setFile(null);
      setPhotos([]);
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [mode, photos, file, template, classroomId, examAttemptId, maxSizeMb, getToken, onUploaded, onClose]);

  const footer = (
    <>
      {uploading && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1.5, borderRadius: 1 }} />}
      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1.5 }}>
          {error}
        </Typography>
      )}
      <Button
        variant="contained"
        fullWidth
        onClick={handleUpload}
        disabled={uploading || !canUpload}
        sx={{ minHeight: 48, textTransform: 'none' }}
      >
        {uploading ? (mode === 'photos' ? 'Building PDF…' : 'Uploading…') : 'Upload'}
      </Button>
    </>
  );

  return (
    <ResponsiveActionSheet open={open} onClose={onClose} title="Upload document" footer={footer}>
      {template && (
        <>
          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
            {template.name}
          </Typography>
          {template.description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 2, '& a': { color: 'primary.main', textDecoration: 'underline' } }}
              dangerouslySetInnerHTML={{
                __html: template.description.replace(
                  /(https?:\/\/[^\s]+)/g,
                  '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
                ),
              }}
            />
          )}
        </>
      )}

      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, v) => {
          if (v) {
            setMode(v);
            setError('');
          }
        }}
        fullWidth
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="photos" sx={{ minHeight: 44, textTransform: 'none' }}>
          {canCapture ? 'Take photos' : 'Photos to PDF'}
        </ToggleButton>
        <ToggleButton value="file" sx={{ minHeight: 44, textTransform: 'none' }}>
          Upload a file
        </ToggleButton>
      </ToggleButtonGroup>

      {mode === 'photos' ? (
        <PhotoCapturePdf value={photos} onChange={setPhotos} maxFiles={20} maxSizeMB={maxSizeMb} disabled={uploading} />
      ) : !file ? (
        <ImageUploadField
          value={null}
          onChange={() => {
            /* handled by pickFile → file state */
          }}
          upload={pickFile}
          accept="image/*,.pdf"
          camera
          maxSizeMB={maxSizeMb}
          helperText="Choose file"
        />
      ) : (
        <Box
          sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}
        >
          <PictureAsPdfOutlinedIcon sx={{ fontSize: 30, color: '#C62828' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {file.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </Typography>
          </Box>
          <IconButton
            aria-label="Remove file"
            onClick={() => {
              setFile(null);
              setError('');
            }}
            disabled={uploading}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <DeleteOutlineIcon />
          </IconButton>
        </Box>
      )}
    </ResponsiveActionSheet>
  );
}
