'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  LinearProgress,
  Paper,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

export interface DocumentUploadProps {
  label: string;
  accept?: string;
  maxSize?: number; // in MB
  onUpload: (file: File) => Promise<string>; // Returns URL
  value?: string; // Current file URL
  onChange?: (url: string | null) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

export function DocumentUpload({
  label,
  accept = 'image/*,.pdf',
  maxSize = 5, // 5MB default
  onUpload,
  value,
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
}: DocumentUploadProps): JSX.Element {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <ImageIcon sx={{ fontSize: 40, color: 'primary.main' }} />;
    }
    if (fileType === 'application/pdf') {
      return <PictureAsPdfIcon sx={{ fontSize: 40, color: 'error.main' }} />;
    }
    return <InsertDriveFileIcon sx={{ fontSize: 40, color: 'text.secondary' }} />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Reset state
      setUploadError(null);

      // Validate file size
      if (file.size > maxSize * 1024 * 1024) {
        setUploadError(`File size must be less than ${maxSize}MB`);
        return;
      }

      // Start upload
      setIsUploading(true);
      setUploadProgress(0);
      setFileName(file.name);

      try {
        // Simulate progress (since we don't have actual progress events)
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90));
        }, 200);

        const url = await onUpload(file);

        clearInterval(progressInterval);
        setUploadProgress(100);

        onChange?.(url);

        // Reset progress after a short delay
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      } catch (err) {
        setUploadError('Failed to upload file. Please try again.');
        setIsUploading(false);
        setUploadProgress(0);
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [maxSize, onUpload, onChange]
  );

  const handleRemove = useCallback(() => {
    onChange?.(null);
    setFileName(null);
  }, [onChange]);

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  return (
    <Box>
      <Typography
        variant="subtitle2"
        sx={{ mb: 1, fontWeight: 500 }}
        color={error ? 'error' : 'text.primary'}
      >
        {label}
        {required && <span style={{ color: 'red' }}> *</span>}
      </Typography>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {!value ? (
        <Paper
          variant="outlined"
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          sx={{
            p: 3,
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderStyle: 'dashed',
            borderColor: error ? 'error.main' : 'divider',
            bgcolor: disabled ? 'action.disabledBackground' : 'background.paper',
            transition: 'all 0.2s',
            '&:hover': disabled
              ? {}
              : {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
          }}
        >
          <CloudUploadIcon
            sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }}
          />
          <Typography variant="body1" gutterBottom>
            Drag and drop or click to upload
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Supported formats: {accept.replace(/\./g, '').toUpperCase()} (Max {maxSize}MB)
          </Typography>

          {isUploading && (
            <Box sx={{ mt: 2, px: 4 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption" sx={{ mt: 0.5 }}>
                Uploading {fileName}... {uploadProgress}%
              </Typography>
            </Box>
          )}
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderColor: 'success.main',
            bgcolor: 'success.lighter',
          }}
        >
          {value.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
            <Box
              component="img"
              src={value}
              alt="Uploaded document"
              sx={{
                width: 60,
                height: 60,
                objectFit: 'cover',
                borderRadius: 1,
              }}
            />
          ) : (
            <PictureAsPdfIcon sx={{ fontSize: 40, color: 'error.main' }} />
          )}

          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
              <Typography variant="body2" fontWeight={500}>
                {fileName || 'Document uploaded'}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Click the delete button to upload a different file
            </Typography>
          </Box>

          <IconButton
            onClick={handleRemove}
            disabled={disabled}
            color="error"
            size="small"
          >
            <DeleteIcon />
          </IconButton>
        </Paper>
      )}

      {(error || uploadError) && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error || uploadError}
        </Alert>
      )}

      {helperText && !error && !uploadError && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}

export default DocumentUpload;
