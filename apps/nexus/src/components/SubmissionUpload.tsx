'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  IconButton,
} from '@neram/ui';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';

interface SubmissionUploadProps {
  exerciseId: string;
  onSubmitted: (submissionUrl: string) => void;
  getToken: () => Promise<string | null>;
  disabled?: boolean;
  label?: string;
}

export default function SubmissionUpload({
  exerciseId,
  onSubmitted,
  getToken,
  disabled = false,
  label = 'Submit Drawing',
}: SubmissionUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate file type
    if (!selected.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (selected.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB');
      return;
    }

    setError(null);
    setFile(selected);

    // Create preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selected);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      setProgress(30);

      // Upload to Supabase storage via API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('exercise_id', exerciseId);

      const res = await fetch('/api/drawings/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      setProgress(70);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Upload failed');
      }

      const data = await res.json();
      setProgress(100);

      // Now create the submission record
      const subRes = await fetch('/api/drawings/submissions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exercise_id: exerciseId,
          submission_url: data.url,
        }),
      });

      if (!subRes.ok) {
        throw new Error('Failed to save submission');
      }

      onSubmitted(data.url);
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <Box>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Preview */}
      {preview ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Box sx={{ position: 'relative' }}>
            <Box
              component="img"
              src={preview}
              alt="Preview"
              sx={{
                width: '100%',
                maxHeight: 250,
                objectFit: 'contain',
                borderRadius: 1,
                bgcolor: 'grey.50',
              }}
            />
            <IconButton
              onClick={handleClear}
              size="small"
              sx={{
                position: 'absolute',
                top: 4,
                right: 4,
                bgcolor: 'background.paper',
                boxShadow: 1,
                '&:hover': { bgcolor: 'error.light', color: 'white' },
              }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {uploading && (
            <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, borderRadius: 2 }} />
          )}

          <Button
            variant="contained"
            fullWidth
            onClick={handleUpload}
            disabled={uploading || disabled}
            startIcon={uploading ? undefined : <CheckCircleOutlinedIcon />}
            sx={{ mt: 1.5, textTransform: 'none', minHeight: 48 }}
          >
            {uploading ? 'Uploading...' : label}
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            startIcon={<CameraAltOutlinedIcon />}
            sx={{ textTransform: 'none', minHeight: 48, flexDirection: 'column', gap: 0.5, py: 1.5 }}
          >
            Camera
          </Button>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            startIcon={<UploadFileOutlinedIcon />}
            sx={{ textTransform: 'none', minHeight: 48, flexDirection: 'column', gap: 0.5, py: 1.5 }}
          >
            Gallery
          </Button>
        </Box>
      )}

      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
