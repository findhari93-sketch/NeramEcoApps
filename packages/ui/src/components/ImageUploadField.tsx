'use client';

/**
 * ImageUploadField — the ONE shared image-upload widget for the whole monorepo.
 *
 * Always supports: click-to-choose, drag-and-drop, CLIPBOARD PASTE (a visible
 * Paste button plus Ctrl/⌘+V), optional camera capture, a preview with
 * Replace/Remove, and size/type checks.
 *
 * The Paste BUTTON matters more than it looks. Ctrl/⌘+V alone is invisible, and
 * the only element that can receive it is the dropzone, which a mouse user
 * cannot reach because clicking it opens the file dialog. On a phone, where
 * most of our users are, there is no Ctrl/⌘+V at all. The shortcut stays; the
 * button is what makes pasting something a person can actually find.
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
  Stack,
} from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import { useCanCapturePhoto } from '../hooks';
// Direct, not through the barrel: the barrel re-exports this file too.
import { ImageViewerDialog } from './ImageViewerDialog';

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
  /**
   * Make the filled preview open full screen when clicked.
   *
   * Off by default because most callers show a thumbnail of something the user
   * just picked and already knows. Turn it on wherever the picture is the thing
   * being checked, such as a solution image a teacher is verifying against a
   * worked answer, where a 72px square is not enough to read.
   */
  previewable?: boolean;
  /**
   * Drop the "Image added" line and fold Replace and Remove into icons.
   *
   * For grids of small slots. The default row lays out a 72px thumbnail, a
   * label, a text button and a 40px icon button side by side and none of them
   * shrink, which is roughly 260px of unshrinkable content in a track that may
   * only be 150px wide.
   */
  dense?: boolean;
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
  previewable = false,
  dense = false,
  disabled = false,
  error,
  required = false,
}: ImageUploadFieldProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Reading the clipboard is its own wait: most browsers raise a permission
  // prompt before a single byte arrives, and iOS shows a "Paste" popup.
  const [readingClipboard, setReadingClipboard] = useState(false);
  /**
   * Whether this browser can read the clipboard on demand.
   *
   * Set in an effect rather than inline so the server render and the first
   * client render agree (there is no `navigator` during SSR). Firefox has no
   * `navigator.clipboard.read` at all, and a button that can only ever fail is
   * worse than no button, so it is hidden there and Ctrl/⌘+V carries on working.
   */
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  useEffect(() => {
    setCanReadClipboard(
      typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function',
    );
  }, []);

  // Only surface the Camera button where it can actually open a camera (touch
  // devices). On desktop `capture` is ignored and it would just re-open the file
  // dialog, so we hide it there. Hook is called unconditionally per rules-of-hooks.
  const canCapturePhoto = useCanCapturePhoto();
  const showCamera = camera && canCapturePhoto;

  const acceptsPdf = /pdf/i.test(accept);
  // A PDF has nothing to lightbox, so the affordance only appears for images.
  const canPreview = previewable && !!value && isImageUrl(value);
  /**
   * What to call this image out loud.
   *
   * `label` is a visible heading and most callers leave it off, describing the
   * field through helperText instead, so fall through to that before settling
   * for the generic word.
   */
  const imageName = label || helperText || 'image';

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

  /**
   * The visible Paste button.
   *
   * Deliberately does NOT fall back to opening the file picker when the
   * clipboard is empty or blocked. This tile already opens the picker when you
   * click it, so a Paste tap that produces a file dialog reads as a bug rather
   * than a fallback. Say what went wrong and leave the other two paths alone.
   */
  const handleClipboardPaste = useCallback(async () => {
    if (disabled || uploading || readingClipboard) return;
    setReadingClipboard(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type.split('/')[1]?.split('+')[0] || 'png';
        setLocalError(null);
        await processFile(new File([blob], `pasted-image.${ext}`, { type }));
        return;
      }
      setLocalError('Nothing to paste. Copy an image first.');
    } catch {
      // Denied permission, an insecure origin, or a clipboard we may not read.
      setLocalError('Clipboard access was blocked. Drop the image here, or choose a file.');
    } finally {
      setReadingClipboard(false);
    }
  }, [disabled, uploading, readingClipboard, processFile]);

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
              {/* Paste and Camera share one row, so the tile grows by one
                  button height rather than two. They wrap instead of
                  overflowing: this same field is the 200px add-tile inside
                  ImageUploadList. stopPropagation on both, or the click bubbles
                  to the Paper and opens the file dialog underneath. */}
              {(canReadClipboard || showCamera) && (
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ mt: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}
                >
                  {canReadClipboard && (
                    <Button
                      size="small"
                      startIcon={<ContentPasteIcon sx={{ fontSize: 18 }} />}
                      disabled={disabled || readingClipboard}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleClipboardPaste();
                      }}
                      sx={{ minHeight: 48, textTransform: 'none' }}
                    >
                      {readingClipboard ? 'Pasting…' : 'Paste'}
                    </Button>
                  )}
                  {showCamera && (
                    <Button
                      size="small"
                      startIcon={<PhotoCameraOutlinedIcon sx={{ fontSize: 18 }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        openPicker(true);
                      }}
                      sx={{ minHeight: 48, textTransform: 'none' }}
                    >
                      Camera
                    </Button>
                  )}
                </Stack>
              )}
            </>
          )}
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          // Without a tabIndex this Paper can never hold focus, so its onPaste
          // was dead code and "paste to replace" silently did nothing.
          tabIndex={0}
          onPaste={handlePaste}
          sx={{
            position: 'relative',
            outline: 'none',
            '&:focus-visible': { borderColor: 'primary.main' },
            minWidth: 0,
            p: 1,
            display: 'flex',
            alignItems: 'center',
            gap: dense ? 0.5 : 1.5,
            borderRadius: 2,
          }}
        >
          {isImageUrl(value) ? (
            <Box
              component={canPreview ? 'button' : 'div'}
              type={canPreview ? 'button' : undefined}
              onClick={canPreview ? () => setViewerOpen(true) : undefined}
              aria-label={canPreview ? `View ${imageName} full size` : undefined}
              sx={{
                p: 0,
                flexShrink: 0,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                lineHeight: 0,
                background: 'none',
                cursor: canPreview ? 'pointer' : 'default',
                '&:hover': canPreview ? { borderColor: 'primary.main' } : undefined,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box
                component="img"
                src={value}
                alt={`${imageName} preview`}
                sx={{
                  width: dense ? 48 : 72,
                  height: dense ? 48 : 72,
                  objectFit: 'cover',
                  borderRadius: 1.5,
                  display: 'block',
                }}
              />
            </Box>
          ) : (
            <PictureAsPdfIcon sx={{ fontSize: 44, color: 'error.main', flexShrink: 0 }} />
          )}

          {dense ? (
            <Box sx={{ display: 'flex', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
              {canPreview && (
                <IconButton
                  onClick={() => setViewerOpen(true)}
                  aria-label="View full size"
                  size="small"
                  sx={{ minWidth: 36, minHeight: 36 }}
                >
                  <ZoomOutMapIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton
                onClick={() => openPicker(false)}
                disabled={disabled || uploading}
                aria-label={uploading ? 'Uploading' : 'Replace'}
                size="small"
                sx={{ minWidth: 36, minHeight: 36 }}
              >
                <AutorenewIcon fontSize="small" />
              </IconButton>
              <IconButton
                onClick={() => onChange(null)}
                disabled={disabled || uploading}
                color="error"
                aria-label="Remove"
                size="small"
                sx={{ minWidth: 36, minHeight: 36 }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
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
                sx={{ minWidth: 40, minHeight: 40, flexShrink: 0 }}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </>
          )}
        </Paper>
      )}

      {canPreview && (
        <ImageViewerDialog
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          src={value || ''}
          name={label}
          alt={`${imageName} full size`}
        />
      )}

      {(error || localError) && (
        <Alert severity="error" role="alert" sx={{ mt: 1, py: 0.25 }}>
          {error || localError}
        </Alert>
      )}
    </Box>
  );
}

export default ImageUploadField;
