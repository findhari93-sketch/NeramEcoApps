'use client';

import { useState, useRef } from 'react';
import {
  Box, Button, Typography, TextField, Paper, IconButton,
  LinearProgress, Drawer,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import ClipboardPasteZone from './ClipboardPasteZone';

interface DrawingSubmissionSheetProps {
  open: boolean;
  onClose: () => void;
  questionId?: string;
  sourceType: 'question_bank' | 'free_practice';
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
}

export default function DrawingSubmissionSheet({
  open, onClose, questionId, sourceType, getToken, onSubmitted,
}: DrawingSubmissionSheetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selfNote, setSelfNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);

    try {
      const token = await getToken();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'drawing-uploads');
      setProgress(30);

      const uploadRes = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const { url } = await uploadRes.json();
      setProgress(60);

      const submitRes = await fetch('/api/drawing/submissions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question_id: questionId || null,
          source_type: sourceType,
          original_image_url: url,
          self_note: selfNote || null,
        }),
      });

      if (!submitRes.ok) throw new Error('Submission failed');
      setProgress(100);

      setFile(null);
      setPreview(null);
      setSelfNote('');
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}>
      <Paper sx={{ p: 2, maxHeight: '90vh', overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
            Submit Your Drawing
          </Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {!preview ? (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
              <Button
                variant="outlined"
                startIcon={<CameraAltOutlinedIcon />}
                onClick={() => { if (fileRef.current) { fileRef.current.capture = 'environment'; fileRef.current.click(); } }}
                sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
              >
                Camera
              </Button>
              <Button
                variant="outlined"
                startIcon={<PhotoLibraryOutlinedIcon />}
                onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute('capture'); fileRef.current.click(); } }}
                sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
              >
                Gallery
              </Button>
            </Box>
            <ClipboardPasteZone
              onFile={handleFile}
              isUploading={uploading}
              maxSizeMB={10}
            />
          </Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            <Box
              component="img"
              src={preview}
              alt="Preview"
              sx={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 1, bgcolor: 'grey.50' }}
            />
            <Button size="small" onClick={() => { setFile(null); setPreview(null); }} sx={{ mt: 0.5 }}>
              Change image
            </Button>
          </Box>
        )}

        <TextField
          label="Self-reflection note (optional)"
          placeholder="e.g., I struggled with the shadow direction..."
          multiline
          rows={2}
          fullWidth
          value={selfNote}
          onChange={(e) => setSelfNote(e.target.value)}
          sx={{ mb: 2 }}
        />

        {uploading && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1 }} />}
        {error && <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>{error}</Typography>}

        <Button
          variant="contained"
          fullWidth
          disabled={!file || uploading}
          onClick={handleSubmit}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {uploading ? 'Submitting...' : 'Submit Drawing'}
        </Button>
      </Paper>
    </Drawer>
  );
}
