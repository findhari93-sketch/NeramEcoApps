'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Typography, IconButton, CircularProgress, alpha, useTheme } from '@neram/ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import type { ImageState } from '@/lib/bulk-upload-schema';

interface ImageUploadZoneProps {
  /** Current image state */
  image?: ImageState;
  /** Called when image changes (new upload, delete, replace) */
  onChange: (image: ImageState | undefined) => void;
  /** Label shown in the drop zone */
  label?: string;
  /** Height of the zone */
  height?: number | string;
  /** Auth token getter for upload API */
  getToken: () => Promise<string | null>;
  /** Listen for paste events on the whole document */
  enableGlobalPaste?: boolean;
}

/**
 * Convert a base64 data URL to a blob URL for safe rendering.
 * Browsers fail on large data URLs in <img src> (ERR_INVALID_URL).
 */
function base64ToBlobUrl(dataUrl: string): string | null {
  try {
    const [header, data] = dataUrl.split(',');
    if (!data) return null;
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    // Clean whitespace/newlines that AI tools sometimes include in base64
    const cleaned = data.replace(/\s/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export default function ImageUploadZone({
  image,
  onChange,
  label = 'Drop image, paste, or click to upload',
  height = 120,
  getToken,
  enableGlobalPaste = false,
}: ImageUploadZoneProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const blobUrlRef = useRef<string | null>(null);

  // Convert base64 data URLs to blob URLs for safe rendering
  const displayUrl = useMemo(() => {
    if (!image?.url) return null;
    if (!image.url.startsWith('data:')) return image.url;
    // Convert base64 to blob URL (revoke old one first)
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blobUrl = base64ToBlobUrl(image.url);
    blobUrlRef.current = blobUrl;
    return blobUrl;
  }, [image?.url]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setError('');
    setUploading(true);

    // Show local preview immediately
    const previewUrl = URL.createObjectURL(file);
    onChange({ url: previewUrl, file, uploaded: false });

    try {
      const token = await getToken();
      if (!token) {
        setError('Auth failed');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/question-bank/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Upload failed');
        onChange(undefined);
        return;
      }

      // Replace blob URL with remote URL
      URL.revokeObjectURL(previewUrl);
      onChange({ url: json.url, uploaded: true, storagePath: json.path });
    } catch {
      setError('Upload failed');
      onChange(undefined);
    } finally {
      setUploading(false);
    }
  }, [getToken, onChange]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    uploadFile(file);
  }, [uploadFile]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) uploadFile(file);
        return;
      }
    }
  }, [uploadFile]);

  // Global paste listener (for review panel — paste anywhere to add image)
  useEffect(() => {
    if (!enableGlobalPaste) return;
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [enableGlobalPaste, handlePaste]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleRemove = useCallback(() => {
    if (image?.url && !image.uploaded) {
      URL.revokeObjectURL(image.url);
    }
    onChange(undefined);
    setError('');
  }, [image, onChange]);

  // If we have an image, show preview with replace/delete buttons
  if (image) {
    return (
      <Box
        sx={{
          position: 'relative',
          height,
          borderRadius: 2,
          overflow: 'hidden',
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(theme.palette.primary.main, 0.02),
        }}
      >
        <Box
          component="img"
          src={displayUrl || image.url}
          alt="Question image"
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: uploading ? 0.4 : 1,
          }}
        />
        {uploading && (
          <CircularProgress
            size={24}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              mt: -1.5,
              ml: -1.5,
            }}
          />
        )}
        {!uploading && (
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              display: 'flex',
              gap: 0.5,
            }}
          >
            <IconButton
              size="small"
              onClick={() => fileInputRef.current?.click()}
              sx={{
                bgcolor: 'rgba(255,255,255,0.85)',
                '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
              }}
              title="Replace image"
            >
              <RefreshIcon sx={{ fontSize: '1rem' }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleRemove}
              sx={{
                bgcolor: 'rgba(255,255,255,0.85)',
                '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
              }}
              title="Remove image"
            >
              <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
            </IconButton>
          </Box>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onPaste={(e) => handlePaste(e.nativeEvent)}
        tabIndex={0}
        sx={{
          height,
          borderRadius: 2,
          border: `2px dashed ${dragOver ? theme.palette.primary.main : theme.palette.divider}`,
          bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          cursor: 'pointer',
          transition: 'all 150ms',
          '&:hover': {
            borderColor: theme.palette.primary.main,
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          },
        }}
      >
        {uploading ? (
          <CircularProgress size={24} />
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, color: 'text.secondary' }}>
              <AddPhotoAlternateOutlinedIcon sx={{ fontSize: '1.25rem' }} />
              <ContentPasteIcon sx={{ fontSize: '1rem', opacity: 0.6 }} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', px: 1 }}>
              {label}
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
        accept="image/*"
        hidden
        onChange={(e) => handleFileSelect(e.target.files)}
      />
    </Box>
  );
}
