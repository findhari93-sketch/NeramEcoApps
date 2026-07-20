'use client';

/**
 * ImageUploadList — the shared MULTI-image variant. Renders a thumbnail grid of
 * already-uploaded images (each with a remove button) plus, until `maxFiles` is
 * reached, the shared single ImageUploadField as the "add" tile. Inherits click +
 * drop + CLIPBOARD PASTE from ImageUploadField. Endpoint/auth-agnostic via the
 * injected `upload(file) => {url, path?}`.
 */
import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ImageUploadField } from './ImageUploadField';

export interface ImageUploadListProps {
  values: string[];
  onChange: (urls: string[]) => void;
  upload: (file: File) => Promise<{ url: string; path?: string }>;
  label?: string;
  helperText?: string;
  maxFiles?: number;
  maxSizeMB?: number;
  accept?: string;
  camera?: boolean;
  disabled?: boolean;
  error?: string;
}

export function ImageUploadList({
  values,
  onChange,
  upload,
  label,
  helperText,
  maxFiles = 6,
  maxSizeMB = 10,
  accept = 'image/*',
  camera = false,
  disabled = false,
  error,
}: ImageUploadListProps): JSX.Element {
  const canAdd = values.length < maxFiles;
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));
  const add = (url: string | null) => {
    if (url) onChange([...values, url]);
  };

  return (
    <Box>
      {label && (
        <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }} color={error ? 'error' : 'text.primary'}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {values.map((url, i) => (
          <Box
            key={`${url}-${i}`}
            sx={{ position: 'relative', width: 88, height: 88, borderRadius: 1.5, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}
          >
            <Box component="img" src={url} alt={`upload ${i + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {!disabled && (
              <IconButton
                size="small"
                onClick={() => remove(i)}
                aria-label="Remove"
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  bgcolor: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  width: 24,
                  height: 24,
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                }}
              >
                <CloseIcon sx={{ fontSize: 15 }} />
              </IconButton>
            )}
          </Box>
        ))}
        {canAdd && (
          <Box sx={{ width: 200, maxWidth: '100%' }}>
            <ImageUploadField
              value={null}
              onChange={add}
              upload={upload}
              helperText={helperText || 'Paste, drop, or choose'}
              height={88}
              maxSizeMB={maxSizeMB}
              accept={accept}
              camera={camera}
              disabled={disabled}
            />
          </Box>
        )}
      </Box>
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {values.length}/{maxFiles}
        </Typography>
      )}
    </Box>
  );
}

export default ImageUploadList;
