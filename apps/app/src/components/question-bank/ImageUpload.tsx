'use client';

import { useState, useRef } from 'react';
import {
  Box, Typography, Stack, IconButton, CircularProgress, Alert,
} from '@neram/ui';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGES = 4;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageUploadProps {
  images: string[];
  onChange: (urls: string[]) => void;
  getAuthToken: () => Promise<string | null>;
  maxImages?: number;
}

export default function ImageUpload({
  images,
  onChange,
  getAuthToken,
  maxImages = MAX_IMAGES,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError('');

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);

    // Validate files
    for (const file of filesToUpload) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Only JPEG, PNG, WebP, and GIF images are allowed');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" exceeds 5MB limit`);
        return;
      }
    }

    setUploading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Please sign in to upload images');
        return;
      }

      const newUrls: string[] = [];
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/questions/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Upload failed');
          break;
        }

        const data = await res.json();
        newUrls.push(data.url);
      }

      if (newUrls.length > 0) {
        onChange([...images, ...newUrls]);
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Reset input
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <Box>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
        Images (optional)
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Add diagrams or drawings. Max {maxImages} images, 5MB each. JPEG, PNG, WebP, or GIF.
      </Typography>

      {/* Image previews */}
      {images.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
          {images.map((url, i) => (
            <Box
              key={i}
              sx={{
                position: 'relative',
                width: 80,
                height: 80,
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Upload ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <IconButton
                size="small"
                onClick={() => removeImage(i)}
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  bgcolor: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  width: 20,
                  height: 20,
                  fontSize: '0.7rem',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
                }}
              >
                ✕
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}

      {/* Upload button */}
      {images.length < maxImages && (
        <Box>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <Box
            onClick={() => !uploading && fileRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
              textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              transition: 'border-color 0.2s',
              '&:hover': { borderColor: uploading ? 'divider' : 'primary.main' },
            }}
          >
            {uploading ? (
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">Uploading...</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Click to add images ({images.length}/{maxImages})
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}
