'use client';

import { useRef, useState, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Button,
  LinearProgress,
  CircularProgress,
  alpha,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

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
  onClose: () => void;
  onUploaded: () => void;
}

export default function DocumentUploadSheet({
  open,
  template,
  classroomId,
  onClose,
  onUploaded,
}: DocumentUploadSheetProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const maxSizeMb = template?.max_file_size_mb || 10;
  const accept = template?.allowed_file_types?.join(',') || 'image/jpeg,image/png,application/pdf';

  const handleUpload = useCallback(async () => {
    if (!file || !template) return;
    setUploading(true);
    setError('');
    setProgress(0);

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File too large (max ${maxSizeMb} MB)`);
      setUploading(false);
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('template_id', template.id);
      formData.append('classroom_id', classroomId);
      formData.append('title', template.name);
      formData.append('category', template.category);

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
        const json = await res.json();
        setError(json.error || 'Upload failed');
        return;
      }

      setFile(null);
      onUploaded();
      onClose();
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [file, template, classroomId, maxSizeMb, getToken, onUploaded, onClose]);

  const content = (
    <Box sx={{ p: isMobile ? 2 : 0 }}>
      {template && (
        <>
          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
            {template.name}
          </Typography>
          {template.description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {template.description}
            </Typography>
          )}
        </>
      )}

      {!file ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box
            onClick={() => fileInputRef.current?.click()}
            sx={{
              borderRadius: 2,
              border: `2px dashed ${theme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              py: 4,
              px: 2,
              '&:hover': { borderColor: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, 0.02) },
            }}
          >
            <UploadFileOutlinedIcon sx={{ fontSize: '1.5rem', color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
              Choose File
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Max {maxSizeMb} MB
            </Typography>
          </Box>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<CameraAltOutlinedIcon />}
            onClick={() => cameraInputRef.current?.click()}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Take Photo
          </Button>
        </Box>
      ) : (
        <Box>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              border: `1px solid ${theme.palette.divider}`,
              mb: 1.5,
            }}
          >
            <Typography variant="body2" fontWeight={500} noWrap>
              {file.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </Typography>
          </Box>

          {uploading && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1, borderRadius: 1 }} />}

          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
              {error}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => { setFile(null); setError(''); }}
              disabled={uploading}
              sx={{ textTransform: 'none', flex: 1 }}
            >
              Change
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleUpload}
              disabled={uploading}
              sx={{ textTransform: 'none', flex: 1 }}
            >
              {uploading ? <CircularProgress size={18} /> : 'Upload'}
            </Button>
          </Box>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}>
        <Box sx={{ width: 40, height: 4, bgcolor: 'grey.300', borderRadius: 2, mx: 'auto', mt: 1 }} />
        {content}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Upload Document</DialogTitle>
      <DialogContent>{content}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
