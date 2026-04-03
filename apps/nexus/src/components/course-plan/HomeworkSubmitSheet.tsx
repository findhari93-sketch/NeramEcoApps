'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Drawer,
  IconButton,
  TextField,
  CircularProgress,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

interface HomeworkData {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  max_points?: number | null;
}

interface HomeworkSubmitSheetProps {
  open: boolean;
  onClose: () => void;
  homework: HomeworkData | null;
  onSubmitted: () => void;
  getToken: () => Promise<string | null>;
}

export default function HomeworkSubmitSheet({
  open,
  onClose,
  homework,
  onSubmitted,
  getToken,
}: HomeworkSubmitSheetProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [textResponse, setTextResponse] = useState('');
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => {
      const combined = [...prev, ...selected];
      return combined.slice(0, 5); // Max 5 files
    });
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!homework) return;
    setUploading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const formData = new FormData();
      if (textResponse.trim()) {
        formData.append('text_response', textResponse.trim());
      }
      for (const file of files) {
        formData.append('files', file);
      }

      const res = await fetch(`/api/course-plans/homework/${homework.id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit');
      }

      setSuccess(true);
      setTimeout(() => {
        onSubmitted();
        handleReset();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit homework');
    } finally {
      setUploading(false);
    }
  }, [homework, files, textResponse, getToken, onSubmitted, onClose]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setTextResponse('');
    setSuccess(false);
    setError(null);
    setUploading(false);
  }, []);

  const handleClose = useCallback(() => {
    if (!uploading) {
      handleReset();
      onClose();
    }
  }, [uploading, handleReset, onClose]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 400,
          maxHeight: isMobile ? '90vh' : '100vh',
          borderTopLeftRadius: isMobile ? 16 : 0,
          borderTopRightRadius: isMobile ? 16 : 0,
        },
      }}
    >
      {/* Drag handle for mobile */}
      {isMobile && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
        </Box>
      )}

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Submit Homework
          </Typography>
          <IconButton onClick={handleClose} disabled={uploading} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Success State */}
        {success ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              Submitted!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your homework has been submitted successfully.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Homework info */}
            {homework && (
              <Box
                sx={{
                  p: 1.5,
                  mb: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.05),
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {homework.title}
                </Typography>
                {homework.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {homework.description}
                  </Typography>
                )}
              </Box>
            )}

            {/* File upload area */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <Button
                variant="outlined"
                fullWidth
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= 5 || uploading}
                startIcon={<PhotoCameraOutlinedIcon />}
                sx={{
                  minHeight: 56,
                  borderRadius: 2,
                  borderStyle: 'dashed',
                  textTransform: 'none',
                  fontWeight: 600,
                  mb: 1.5,
                }}
              >
                {files.length >= 5 ? 'Maximum 5 files' : 'Take Photo / Upload'}
              </Button>

              {/* File previews */}
              {files.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  {files.map((file, i) => (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.background.default, 0.5),
                        border: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      {file.type.startsWith('image/') ? (
                        <Box
                          component="img"
                          src={URL.createObjectURL(file)}
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1,
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1,
                            bgcolor: alpha(theme.palette.error.main, 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <InsertDriveFileOutlinedIcon sx={{ fontSize: '1.2rem', color: 'error.main' }} />
                        </Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }} noWrap>
                          {file.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                          {formatFileSize(file.size)}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={() => removeFile(i)} disabled={uploading}>
                        <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Text response */}
              <TextField
                label="Text Response (optional)"
                multiline
                rows={3}
                fullWidth
                value={textResponse}
                onChange={(e) => setTextResponse(e.target.value)}
                disabled={uploading}
                sx={{
                  mb: 2,
                  '& .MuiInputBase-root': { borderRadius: 2 },
                }}
              />

              {/* Error message */}
              {error && (
                <Typography variant="caption" color="error" sx={{ mb: 1, display: 'block' }}>
                  {error}
                </Typography>
              )}
            </Box>

            {/* Submit button */}
            <Button
              variant="contained"
              fullWidth
              onClick={handleSubmit}
              disabled={uploading || (files.length === 0 && !textResponse.trim())}
              sx={{
                minHeight: 48,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                boxShadow: 'none',
                '&:hover': { boxShadow: 'none' },
              }}
            >
              {uploading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} color="inherit" />
                  Submitting...
                </Box>
              ) : (
                <>
                  <CloudUploadOutlinedIcon sx={{ mr: 1 }} />
                  Submit Homework
                </>
              )}
            </Button>
          </>
        )}
      </Box>
    </Drawer>
  );
}
