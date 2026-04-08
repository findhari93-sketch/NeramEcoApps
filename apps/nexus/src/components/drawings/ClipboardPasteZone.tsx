'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

interface ClipboardPasteZoneProps {
  /** Called with the pasted image File. Pass a stable reference (useCallback) to avoid re-registering the paste listener on every render. */
  onFile: (file: File) => Promise<void> | void;
  isUploading: boolean;
  disabled?: boolean;
  maxSizeMB?: number;
}

export default function ClipboardPasteZone({
  onFile,
  isUploading,
  disabled = false,
  maxSizeMB = 10,
}: ClipboardPasteZoneProps) {
  const [error, setError] = useState('');

  useEffect(() => {
    if (disabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`Image must be under ${maxSizeMB}MB`);
        return;
      }

      setError('');
      onFile(file);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [disabled, maxSizeMB, onFile]);

  if (disabled) return null;

  return (
    <Box
      sx={{
        border: '1.5px dashed',
        borderColor: error ? 'error.main' : 'divider',
        borderRadius: 1,
        py: 1.5,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        color: error ? 'error.main' : 'text.secondary',
        bgcolor: error ? 'error.50' : 'transparent',
      }}
    >
      {isUploading ? (
        <>
          <CircularProgress size={16} />
          <Typography variant="caption">Uploading...</Typography>
        </>
      ) : (
        <>
          <ContentPasteIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption">
            {error || 'Paste image here (Ctrl+V)'}
          </Typography>
        </>
      )}
    </Box>
  );
}
