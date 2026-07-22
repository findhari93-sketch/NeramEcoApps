'use client';

/**
 * ImageUploadField — the ONE shared image-upload widget for the whole monorepo.
 *
 * Always supports: click-to-choose, drag-and-drop, CLIPBOARD PASTE (Ctrl/⌘+V),
 * optional camera capture, a preview with Replace/Remove, and size/type checks.
 * It is endpoint/auth-agnostic: the caller injects `upload(file) => {url, path?}`
 * (which does the fetch + auth for its own API route / bucket). Pass
 * `accept='image/*,.pdf'` to also accept a PDF (shown with a PDF icon).
 *
 * Supersedes the paste-less DocumentUpload. See the "shared image upload" rule.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  Paper,
  Alert,
  Button,
} from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useCanCapturePhoto } from '../hooks';

export interface ImageUploadFieldProps {
  /** Current image (or file) URL, or null when empty. */
  value: string | null;
  /** Called with the uploaded URL, or null when the user removes it. */
  onChange: (url: string | null) => void;
  /** Injected uploader: does the actual fetch + auth for the caller's endpoint. */
  upload: (file: File) => Promise<{ url: string; path?: string }>;
  label?: string;
  helperText?: string;
  /** Dropzone / preview height in px. */
  height?: number;
  maxSizeMB?: number;
  /** MIME/extension accept string. Default 'image/*'. Add ',.pdf' for docs. */
  accept?: string;
  /** Offer a Camera button on touch devices (phones/tablets); hidden on desktop where `capture` is ignored. */
  camera?: boolean;
  /** Also listen for paste on the whole document (single-field dialogs only). */
  enableGlobalPaste?: boolean;
  disabled?: boolean;
  error?: string;
  required?: boolean;
}

const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url) || url.startsWith('data:image');

export function ImageUploadField({
  value,
  onChange,
  upload,
  label,
  helperText = 'Paste (Ctrl/⌘+V), drop, or choose',
  height = 160,
  maxSizeMB = 10,
  accept = 'image/*',
  camera = false,
  enableGlobalPaste = false,
  disabled = false,
  error,
  required = false,
}: ImageUploadFieldProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Only surface the Camera button where it can actually open a camera (touch
  // devices). On desktop `capture` is ignored and it would just re-open the file
  // dialog, so we hide it there. Hook is called unconditionally per rules-of-hooks.
  const canCapturePhoto = useCanCapturePhoto();
  const showCamera = camera && canCapturePhoto;

  const acceptsPdf = /pdf/i.test(accept);

  const validate = useCallback(
    (file: File): string | null => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !(acceptsPdf && isPdf)) {
        return acceptsPdf ? 'Choose an image or a PDF.' : 'Choose an image file.';
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        return `File must be under ${maxSizeMB} MB.`;
      }
      return null;
    },
    [acceptsPdf, maxSizeMB],
  );

  const processFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || disabled || uploading) return;
      const problem = validate(file);
      if (problem) {
        setLocalError(problem);
        return;
      }
      setLocalError(null);
      setUploading(true);
      try {
        const { url } = await upload(file);
        onChange(url);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Upload failed. Try again.');
      } finally {
        setUploading(false);
      }
    },
    [disabled, uploading, validate, upload, onChange],
  );

  // Clipboard paste — element-level (below) and optional document-level.
  useEffect(() => {
    if (!enableGlobalPaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void processFile(file);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enableGlobalPaste, disabled, processFile]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void processFile(file);
    }
  };

  const openPicker = (withCamera = false) => {
    if (disabled || uploading || !inputRef.current) return;
    if (withCamera) inputRef.current.setAttribute('capture', 'environment');
    else inputRef.current.removeAttribute('capture');
    inputRef.current.click();
  };

  return (
    <Box>
      {label && (
        <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }} color={error ? 'error' : 'text.primary'}>
          {label}
          {required && <span style={{ color: '#d32f2f' }}> *</span>}
        </Typography>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          void processFile(f);
          e.target.value = '';
        }}
      />

      {!value ? (
        <Paper
          variant="outlined"
          tabIndex={0}
          onClick={() => openPicker(false)}
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void processFile(e.dataTransfer.files?.[0]);
          }}
          sx={{
            minHeight: height,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
            p: 2,
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderStyle: 'dashed',
            borderWidth: 1.5,
            borderRadius: 2,
            borderColor: error || localError ? 'error.main' : 'divider',
            bgcolor: disabled ? 'action.disabledBackground' : 'background.paper',
            outline: 'none',
            transition: 'all 0.15s',
            '&:hover': disabled ? {} : { borderColor: 'primary.main', bgcolor: 'action.hover' },
            '&:focus-visible': { borderColor: 'primary.main' },
          }}
        >
          {uploading ? (
            <Box sx={{ width: '80%' }}>
              <LinearProgress sx={{ borderRadius: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                Uploading…
              </Typography>
            </Box>
          ) : (
            <>
              <CloudUploadOutlinedIcon sx={{ fontSize: 32, color: 'text.secondary' }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {helperText}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {acceptsPdf ? 'Image or PDF' : 'Image'} · up to {maxSizeMB} MB
              </Typography>
              {showCamera && (
                <Button
                  size="small"
                  startIcon={<PhotoCameraOutlinedIcon sx={{ fontSize: 18 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPicker(true);
                  }}
                  sx={{ mt: 0.5, minHeight: 40, textTransform: 'none' }}
                >
                  Camera
                </Button>
              )}
            </>
          )}
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          onPaste={handlePaste}
          sx={{
            position: 'relative',
            p: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderRadius: 2,
          }}
        >
          {isImageUrl(value) ? (
            <Box
              component="img"
              src={value}
              alt="upload"
              sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}
            />
          ) : (
            <PictureAsPdfIcon sx={{ fontSize: 44, color: 'error.main' }} />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {isImageUrl(value) ? 'Image added' : 'File added'}
            </Typography>
            <Button
              size="small"
              startIcon={<AutorenewIcon sx={{ fontSize: 16 }} />}
              onClick={() => openPicker(false)}
              disabled={disabled || uploading}
              sx={{ mt: 0.25, minHeight: 36, textTransform: 'none' }}
            >
              {uploading ? 'Uploading…' : 'Replace'}
            </Button>
          </Box>
          <IconButton
            onClick={() => onChange(null)}
            disabled={disabled || uploading}
            color="error"
            aria-label="Remove"
            sx={{ minWidth: 40, minHeight: 40 }}
          >
            <DeleteOutlineIcon />
          </IconButton>
        </Paper>
      )}

      {(error || localError) && (
        <Alert severity="error" sx={{ mt: 1, py: 0.25 }}>
          {error || localError}
        </Alert>
      )}
    </Box>
  );
}

export default ImageUploadField;
