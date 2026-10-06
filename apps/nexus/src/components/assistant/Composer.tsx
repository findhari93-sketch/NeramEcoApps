'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, TextField, Typography, useMediaQuery } from '@neram/ui';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import type { Attachment, GetToken } from './client';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_CHARS = 2000;

export default function Composer({ onSend, busy, wantsAttachment, upload, getToken, allowAttachment = true, focusKey = 0, focusPrompt }: {
  onSend: (text: string, attachment: Attachment | null) => Promise<void>;
  busy: boolean;
  wantsAttachment: boolean;
  /** Injected so tests need no network. Defaults to uploadImage in the sheet. */
  upload: (getToken: GetToken, file: File) => Promise<Attachment>;
  getToken?: GetToken;
  /** False while the sketchbook is off: a photo has nowhere to go, so there is no attach button (Ruling 25). */
  allowAttachment?: boolean;
  /** Each bump focuses the message box and swaps its placeholder for `focusPrompt`. */
  focusKey?: number;
  focusPrompt?: string;
}) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [prompted, setPrompted] = useState(false);
  useEffect(() => {
    if (!focusKey) return;
    setPrompted(true);
    boxRef.current?.focus();
  }, [focusKey]);

  /** Empty the picker, so choosing the same file again (after a refusal or a remove) still fires change. */
  const resetPicker = () => {
    if (fileRef.current) fileRef.current.value = '';
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Only photos can be attached here.');
      resetPicker();
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That photo is too big. Choose one smaller than 12 MB.');
      resetPicker();
      return;
    }
    setUploading(true);
    try {
      setAttachment(await upload(getToken || (async () => null), file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      resetPicker();
    }
  };

  const submit = async () => {
    if (busy || uploading) return;
    const t = text.trim();
    const sending = attachment;
    if (!t && !sending) return;
    // Clear first: the message shows in the list at once, and anything typed
    // while the reply is on its way is not wiped when it lands.
    setText('');
    setAttachment(null);
    setError(null);
    await onSend(t, sending);
  };

  return (
    <Box sx={{ borderTop: (th) => `1px solid ${th.palette.divider}`, px: 1.5, pt: 0.75, pb: 'calc(8px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }}>
      {attachment && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box component="img" src={attachment.thumbnail_url || attachment.original_image_url} alt="Attached sketch" sx={{ width: 56, height: 56, borderRadius: 1.5, objectFit: 'cover' }} />
          <Typography variant="body2" sx={{ flex: 1 }}>Photo attached</Typography>
          <IconButton aria-label="Remove photo" onClick={() => setAttachment(null)} sx={{ width: 48, height: 48 }}><CloseIcon /></IconButton>
        </Box>
      )}
      {error && <Typography role="alert" variant="body2" color="error" sx={{ mb: 1 }}>{error}</Typography>}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
        {/* No `capture`: phones then offer both the camera and the gallery, and a
            student often already has a photo of the sketch. */}
        {allowAttachment && (
          <>
            <input ref={fileRef} data-testid="assistant-file-input" type="file" accept="image/*" onChange={(e) => void pick(e.target.files?.[0])} style={{ display: 'none' }} />
            <IconButton
              aria-label="Attach a photo"
              color={wantsAttachment ? 'primary' : 'default'}
              onClick={() => fileRef.current?.click()}
              disabled={busy || uploading}
              data-size="48"
              sx={{ width: 48, height: 48, minHeight: 48, flexShrink: 0 }}
            >
              {/* The one spinner in the panel, on a short wait; under reduced motion a still hourglass. */}
              {uploading
                ? (reduce ? <HourglassTopRoundedIcon aria-label="Uploading photo" /> : <CircularProgress size={22} aria-label="Uploading photo" />)
                : <CameraAltOutlinedIcon />}
            </IconButton>
          </>
        )}
        <TextField
          inputRef={boxRef}
          multiline
          maxRows={4}
          fullWidth
          size="small"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => {
            // isComposing: Tamil, Hindi and other IME input confirm a word with Enter.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={wantsAttachment ? 'Attach a photo, or type' : prompted && focusPrompt ? focusPrompt : 'Ask or tell me what to do'}
          inputProps={{ 'aria-label': 'Message Neram Assistant', style: { fontSize: 16, lineHeight: 1.5 } }}
          // 48px like the buttons beside it (size small alone is about 41px).
          sx={{ minWidth: 0, '& .MuiInputBase-root': { minHeight: 48 } }}
        />
        <IconButton
          aria-label="Send"
          color="primary"
          onClick={() => void submit()}
          disabled={busy || uploading || (!text.trim() && !attachment)}
          data-size="48"
          sx={{ width: 48, height: 48, minHeight: 48, flexShrink: 0 }}
        >
          <SendRoundedIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
