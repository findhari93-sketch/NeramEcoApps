'use client';

import { useState, useRef } from 'react';
import {
  Box,
  IconButton,
  Typography,
  CircularProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseIcon from '@mui/icons-material/Close';

interface ScreenshotUploaderProps {
  screenshots: string[];
  onScreenshotsChange: (paths: string[]) => void;
  getToken: () => Promise<string | null>;
  maxCount?: number;
  disabled?: boolean;
}

async function compressImage(file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export default function ScreenshotUploader({
  screenshots,
  onScreenshotsChange,
  getToken,
  maxCount = 3,
  disabled = false,
}: ScreenshotUploaderProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = maxCount - screenshots.length;
    if (remaining <= 0) return;

    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const newPaths: string[] = [];
      const newPreviews: Record<string, string> = {};

      for (const file of filesToUpload) {
        const compressed = await compressImage(file);
        const formData = new FormData();
        formData.append('file', compressed, 'screenshot.jpg');

        const res = await fetch('/api/foundation/issues/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const { path } = await res.json();
        newPaths.push(path);
        newPreviews[path] = URL.createObjectURL(compressed);
      }

      setPreviewUrls((prev) => ({ ...prev, ...newPreviews }));
      onScreenshotsChange([...screenshots, ...newPaths]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = (index: number) => {
    const path = screenshots[index];
    if (previewUrls[path]) {
      URL.revokeObjectURL(previewUrls[path]);
      setPreviewUrls((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    }
    const updated = screenshots.filter((_, i) => i !== index);
    onScreenshotsChange(updated);
  };

  const getDisplayUrl = (path: string) => {
    if (previewUrls[path]) return previewUrls[path];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/issue-screenshots/${path}`;
  };

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
        Screenshots ({screenshots.length}/{maxCount})
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {screenshots.map((path, index) => (
          <Box
            key={path}
            sx={{
              position: 'relative',
              width: 80,
              height: 80,
              borderRadius: 1.5,
              overflow: 'hidden',
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Box
              component="img"
              src={getDisplayUrl(path)}
              alt={`Screenshot ${index + 1}`}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {!disabled && (
              <IconButton
                size="small"
                onClick={() => handleRemove(index)}
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  bgcolor: alpha('#000', 0.6),
                  color: '#fff',
                  p: 0.25,
                  '&:hover': { bgcolor: alpha('#000', 0.8) },
                }}
              >
                <CloseIcon sx={{ fontSize: '0.85rem' }} />
              </IconButton>
            )}
          </Box>
        ))}

        {screenshots.length < maxCount && !disabled && (
          <Box
            component="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            sx={{
              width: 80,
              height: 80,
              borderRadius: 1.5,
              border: `2px dashed ${theme.palette.divider}`,
              bgcolor: alpha(theme.palette.action.hover, 0.04),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'border-color 200ms, background 200ms',
              '&:hover': {
                borderColor: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            {uploading ? (
              <CircularProgress size={20} />
            ) : (
              <>
                <AddPhotoAlternateOutlinedIcon sx={{ fontSize: '1.3rem', color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.25 }}>
                  Add
                </Typography>
              </>
            )}
          </Box>
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
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </Box>
  );
}
