'use client';

/**
 * Controlled photo-staging panel. The student takes photos (camera), picks from
 * the gallery, or pastes, then reorders and removes them, this component only
 * owns the ordered File[] and hands it back via onChange. The parent decides
 * what to do on submit (combine into one PDF with imagesToPdf, or upload as-is).
 *
 * Built so every submission surface (assignments, documents, exam-recall,
 * remembered-questions) can drop it in and get the same capture UX. No upload,
 * no PDF, no endpoint knowledge lives here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Stack, Typography } from '@neram/ui';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useCanCapturePhoto } from '@/hooks/useCanCapturePhoto';

interface PhotoCapturePdfProps {
  value: File[];
  onChange: (files: File[]) => void;
  /** Max photos to stage. Default 20. Pass 1 for single-image surfaces. */
  maxFiles?: number;
  /** Per-photo size cap (before compression), in MB. Default 15. */
  maxSizeMB?: number;
  disabled?: boolean;
}

export default function PhotoCapturePdf({
  value,
  onChange,
  maxFiles = 20,
  maxSizeMB = 15,
  disabled = false,
}: PhotoCapturePdfProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState('');
  const single = maxFiles === 1;
  // "Take photo" only makes sense where the camera can actually be opened
  // (phones/tablets). On laptops it would just re-open the file dialog.
  const canCapture = useCanCapturePhoto();

  // Build (and revoke) object URLs for previews as the staged list changes.
  useEffect(() => {
    const next = value.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [value]);

  const addImages = useCallback(
    (incoming: File[]) => {
      const images = incoming.filter((f) => f.type.startsWith('image/'));
      if (!images.length) {
        setError('Please choose image files.');
        return;
      }
      if (images.some((f) => f.size > maxSizeMB * 1024 * 1024)) {
        setError(`Each photo must be under ${maxSizeMB} MB.`);
        return;
      }
      setError('');
      onChange([...value, ...images].slice(0, maxFiles));
    },
    [value, onChange, maxFiles, maxSizeMB],
  );

  // Paste an image straight from the clipboard.
  useEffect(() => {
    if (disabled || value.length >= maxFiles) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (files.length) addImages(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled, value.length, maxFiles, addImages]);

  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const atMax = value.length >= maxFiles;

  return (
    <Box>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={!single}
        hidden
        onChange={(e) => {
          addImages(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={!single}
        hidden
        onChange={(e) => {
          addImages(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <Stack direction="row" spacing={1.5} sx={{ mb: value.length ? 1.5 : 0.5 }}>
        {canCapture && (
          <Button
            variant="outlined"
            fullWidth
            startIcon={<PhotoCameraOutlinedIcon />}
            onClick={() => cameraRef.current?.click()}
            disabled={disabled || atMax}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Take photo
          </Button>
        )}
        <Button
          variant="outlined"
          fullWidth
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          onClick={() => galleryRef.current?.click()}
          disabled={disabled || atMax}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {single ? 'Choose image' : canCapture ? 'Add images' : 'Choose images'}
        </Button>
      </Stack>

      {!value.length && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {single
            ? canCapture
              ? 'Take a photo or choose an image. You can also paste (Ctrl/Cmd+V).'
              : 'Choose an image, or paste it (Ctrl/Cmd+V).'
            : canCapture
              ? 'Snap each page, we combine them into one PDF and shrink it automatically. Paste works too (Ctrl/Cmd+V).'
              : 'Add each page, we combine them into one PDF and shrink it automatically. Paste works too (Ctrl/Cmd+V).'}
        </Typography>
      )}

      {value.length > 0 && (
        <>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {value.map((file, i) => (
              <Box key={`${file.name}-${i}`} sx={{ position: 'relative' }}>
                <Box
                  component="img"
                  src={urls[i]}
                  alt={single ? file.name : `Page ${i + 1}`}
                  sx={{
                    width: 88,
                    height: 88,
                    objectFit: 'cover',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'block',
                  }}
                />
                {!single && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      minWidth: 20,
                      height: 20,
                      px: 0.5,
                      borderRadius: 1,
                      bgcolor: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {i + 1}
                  </Box>
                )}
                <IconButton
                  size="small"
                  aria-label={`Remove ${single ? 'image' : `page ${i + 1}`}`}
                  onClick={() => removeAt(i)}
                  disabled={disabled}
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    width: 26,
                    height: 26,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                </IconButton>

                {!single && value.length > 1 && (
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    sx={{
                      position: 'absolute',
                      bottom: 4,
                      left: 4,
                      right: 4,
                    }}
                  >
                    <IconButton
                      size="small"
                      aria-label={`Move page ${i + 1} earlier`}
                      onClick={() => move(i, -1)}
                      disabled={disabled || i === 0}
                      sx={{ bgcolor: 'rgba(255,255,255,0.9)', width: 22, height: 22, '&:hover': { bgcolor: '#fff' } }}
                    >
                      <ChevronLeftIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Move page ${i + 1} later`}
                      onClick={() => move(i, 1)}
                      disabled={disabled || i === value.length - 1}
                      sx={{ bgcolor: 'rgba(255,255,255,0.9)', width: 22, height: 22, '&:hover': { bgcolor: '#fff' } }}
                    >
                      <ChevronRightIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>
          {!single && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {value.length} {value.length === 1 ? 'page' : 'pages'}
              {atMax ? ` (max ${maxFiles})` : ''} · use the arrows to reorder
            </Typography>
          )}
        </>
      )}

      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
