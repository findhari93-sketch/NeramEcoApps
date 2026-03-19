'use client';

import { useRef, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Button,
  LinearProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AudioFileOutlinedIcon from '@mui/icons-material/AudioFileOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

interface FileUploadZoneProps {
  /** MIME types to accept (e.g., "application/pdf" or "audio/*") */
  accept: string;
  /** API endpoint for uploading */
  uploadUrl: string;
  /** Max file size in MB */
  maxSizeMB: number;
  /** Auth token getter */
  getToken: () => Promise<string | null>;
  /** Current file URL (if already uploaded) */
  currentFileUrl?: string | null;
  /** Current file info label (e.g., "chapter-2.pdf · 6 pages") */
  currentFileLabel?: string;
  /** Called after successful upload */
  onUpload: (data: Record<string, unknown>) => void;
  /** Called after successful delete */
  onRemove: () => void;
  /** Label for the drop zone */
  label?: string;
  /** HTTP method for delete (defaults to DELETE on uploadUrl) */
  deleteUrl?: string;
  /** Extra form data fields to send */
  extraFormData?: Record<string, string>;
  /** Override the subtitle shown below the label (defaults to filename from URL) */
  currentFileSubtitle?: string;
}

export default function FileUploadZone({
  accept,
  uploadUrl,
  maxSizeMB,
  getToken,
  currentFileUrl,
  currentFileLabel,
  onUpload,
  onRemove,
  label = 'Drop file or click to upload',
  deleteUrl,
  extraFormData,
  currentFileSubtitle,
}: FileUploadZoneProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const isPdf = accept.includes('pdf');
  const isAudio = accept.includes('audio');

  const FileIcon = isPdf
    ? PictureAsPdfOutlinedIcon
    : isAudio
      ? AudioFileOutlinedIcon
      : InsertDriveFileOutlinedIcon;

  const uploadFile = useCallback(
    async (file: File) => {
      setError('');
      setUploading(true);
      setProgress(0);

      // Validate size
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File too large (max ${maxSizeMB} MB)`);
        setUploading(false);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          setError('Authentication failed');
          setUploading(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', file);

        // For PDFs, try to get page count client-side
        if (isPdf) {
          try {
            const pdfjs = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
            const arrayBuffer = await file.arrayBuffer();
            const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            formData.append('page_count', String(doc.numPages));
            doc.destroy();
          } catch {
            // Page count extraction failed — server will handle without it
          }
        }

        // For audio, try to get duration
        if (isAudio) {
          try {
            const duration = await getAudioDuration(file);
            formData.append('duration_seconds', String(Math.round(duration)));
          } catch {
            // Duration extraction failed — OK
          }
        }

        // Add extra form data
        if (extraFormData) {
          for (const [key, value] of Object.entries(extraFormData)) {
            formData.append(key, value);
          }
        }

        // Simulate progress (XHR for real progress would be more complex)
        const progressInterval = setInterval(() => {
          setProgress((prev) => Math.min(prev + 10, 90));
        }, 200);

        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        clearInterval(progressInterval);
        setProgress(100);

        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Upload failed');
          return;
        }

        onUpload(json);
      } catch {
        setError('Upload failed');
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [getToken, uploadUrl, maxSizeMB, isPdf, isAudio, onUpload, extraFormData]
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(deleteUrl || uploadUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || 'Delete failed');
        return;
      }

      onRemove();
    } catch {
      setError('Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [getToken, deleteUrl, uploadUrl, onRemove]);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      uploadFile(files[0]);
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  // If file exists, show uploaded state
  if (currentFileUrl) {
    return (
      <Box
        sx={{
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(theme.palette.success.main, 0.03),
          p: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FileIcon
            sx={{
              fontSize: '2rem',
              color: isPdf ? 'error.main' : isAudio ? 'info.main' : 'text.secondary',
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {currentFileLabel || 'File uploaded'}
            </Typography>
            {(currentFileSubtitle || currentFileUrl) && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {currentFileSubtitle || currentFileUrl.split('?')[0].split('/').pop() || 'Uploaded file'}
              </Typography>
            )}
          </Box>
          <IconButton
            size="small"
            onClick={() => fileInputRef.current?.click()}
            title="Replace file"
            disabled={uploading}
          >
            <RefreshIcon sx={{ fontSize: '1.1rem' }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleDelete}
            title="Remove file"
            disabled={deleting}
            color="error"
          >
            {deleting ? (
              <CircularProgress size={16} />
            ) : (
              <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
            )}
          </IconButton>
        </Box>

        {isAudio && currentFileUrl && (
          <Box sx={{ mt: 1 }}>
            <audio controls src={currentFileUrl} style={{ width: '100%', height: 36 }} />
          </Box>
        )}

        {error && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
            {error}
          </Typography>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </Box>
    );
  }

  // Empty state — drop zone
  return (
    <Box>
      <Box
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        sx={{
          borderRadius: 2,
          border: `2px dashed ${dragOver ? theme.palette.primary.main : theme.palette.divider}`,
          bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          cursor: uploading ? 'default' : 'pointer',
          transition: 'all 150ms',
          py: 3,
          px: 2,
          '&:hover': uploading
            ? {}
            : {
                borderColor: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.02),
              },
        }}
      >
        {uploading ? (
          <Box sx={{ width: '100%', maxWidth: 200, textAlign: 'center' }}>
            <CircularProgress size={24} sx={{ mb: 1 }} />
            <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Uploading...
            </Typography>
          </Box>
        ) : (
          <>
            <UploadFileOutlinedIcon sx={{ fontSize: '1.5rem', color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              {label}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Max {maxSizeMB} MB
            </Typography>
          </>
        )}
      </Box>
      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          {error}
        </Typography>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => handleFileSelect(e.target.files)}
      />
    </Box>
  );
}

/** Get audio duration from a File object */
function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio'));
    };
  });
}
