'use client';

/**
 * The picture for the next question, pasted in one step from a snip.
 *
 * Why it is its own component and not the shared upload field: in a Teams
 * meeting, Win + Shift + S leaves keyboard focus in Teams, not in the pad's
 * frame, and Teams never lets the frame read the clipboard by itself. So:
 *
 *   * one paste listener on the pad's whole document, mounted with the Ask bar
 *     in every state of the class, so Ctrl + V works wherever the teacher last
 *     clicked in the pad, including while a question is open or closed;
 *   * a target that takes focus when clicked (it never opens the file picker;
 *     the folder button does that), and says "Click here, then press Ctrl + V"
 *     whenever the pad does not have focus;
 *   * a paste that arrives while another action is running waits for it, never
 *     dropped;
 *   * no "Paste" button: TeamsJS clipboard.read returns nothing in the meeting
 *     panel (2026-10-04), so a button there only ever showed an error;
 *   * pasting text into a text field still pastes the text.
 */

import { useCallback, useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type DragEvent } from 'react';
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography, alpha, useTheme } from '@neram/ui';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentPasteRounded from '@mui/icons-material/ContentPasteRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';

const MAX_BYTES = 10 * 1024 * 1024;

/** The first image on the clipboard (or in a drop): files first, then items, as browsers differ. */
export function pictureFrom(data: DataTransfer | null | undefined): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith('image/')) return file;
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** Whether a paste is aimed at a text field (an input, a textarea, editable text), which keeps its text. */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.dataset.pastePicture === 'target') return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

/** Whether the pad's frame has keyboard focus, so Ctrl + V reaches it. */
function useFrameFocus(): boolean {
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const update = () => setFocused(document.hasFocus());
    update();
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);
  return focused;
}

export default function PastePicture({
  value,
  onChange,
  upload,
  busy,
  questionTitle,
  onPasted,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Shrinks and stores the picture for this class; rejects with a message the teacher can act on. */
  upload: (file: File) => Promise<{ url: string }>;
  /** Another action is running. A paste now waits for it. */
  busy: boolean;
  /** "Q.33": the question the picture is for, in what the target says. */
  questionTitle: string;
  /** After a pasted picture is in, so the console can offer it to the open question instead. */
  onPasted?: (url: string) => void;
}) {
  const theme = useTheme();
  const focused = useFrameFocus();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetFocused, setTargetFocused] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<HTMLDivElement>(null);
  /** A picture pasted while another action ran, waiting its turn. */
  const waiting = useRef<File | null>(null);

  const take = useCallback(
    async (file: File, pasted: boolean) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('That is not a picture. Snip the question again.');
        return;
      }
      if (file.size > MAX_BYTES) {
        setError('That picture is over 10 MB. Snip a smaller part of the page.');
        return;
      }
      setUploading(true);
      try {
        const { url } = await upload(file);
        onChange(url);
        if (pasted) onPasted?.(url);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : 'The picture could not be added. Please try again.');
      } finally {
        setUploading(false);
      }
    },
    [onChange, onPasted, upload],
  );

  // Held back while an action runs, then taken as soon as it finishes.
  useEffect(() => {
    if (busy || uploading || !waiting.current) return;
    const file = waiting.current;
    waiting.current = null;
    void take(file, true);
  }, [busy, uploading, take]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = pictureFrom(event.clipboardData);
      if (!file) return; // Text: the field it is aimed at keeps it.
      if (isTextField(event.target) && event.clipboardData?.getData('text/plain')) return;
      event.preventDefault();
      if (busy || uploading) {
        waiting.current = file;
        return;
      }
      void take(file, true);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [busy, uploading, take]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = pictureFrom(event.dataTransfer);
    if (file) void take(file, false);
  };

  // React's own paste on the target, for a browser that does not bubble it to the document listener first.
  const onTargetPaste = (event: ReactClipboardEvent) => {
    if (pictureFrom(event.clipboardData)) event.preventDefault();
  };

  const ready = focused && !uploading;
  const prompt = uploading
    ? 'Adding the picture'
    : !focused
      ? 'Click here, then press Ctrl + V'
      : targetFocused
        ? `Press Ctrl + V to paste the picture for ${questionTitle}`
        : 'Paste a snip with Ctrl + V';

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="stretch">
        <Box
          ref={target}
          tabIndex={0}
          role="button"
          data-paste-picture="target"
          aria-label={value ? `Picture for ${questionTitle}. Paste another to replace it.` : `Picture for ${questionTitle}. ${prompt}.`}
          onClick={() => target.current?.focus()}
          onFocus={() => setTargetFocused(true)}
          onBlur={() => setTargetFocused(false)}
          onPaste={onTargetPaste}
          onDragOver={(event: DragEvent) => event.preventDefault()}
          onDrop={onDrop}
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            py: 0.5,
            borderRadius: 2,
            border: '1.5px dashed',
            borderColor: targetFocused ? 'primary.main' : !focused ? 'warning.main' : 'divider',
            bgcolor: targetFocused ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
            cursor: 'text',
            outline: 'none',
            transition: 'border-color 150ms, background-color 150ms',
            '&:focus-visible': { boxShadow: `0 0 0 2px ${theme.palette.primary.main}` },
          }}
        >
          {value ? (
            <Box
              component="img"
              src={value}
              alt={`Picture for ${questionTitle}`}
              sx={{ height: 40, maxWidth: 96, objectFit: 'contain', borderRadius: 1, bgcolor: 'background.paper', flexShrink: 0 }}
            />
          ) : uploading ? (
            <CircularProgress size={20} aria-hidden />
          ) : (
            <ContentPasteRounded fontSize="small" sx={{ color: ready ? 'action.active' : theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark' }} aria-hidden />
          )}
          <Typography
            variant="body2"
            sx={{
              minWidth: 0,
              lineHeight: 1.3,
              // The darker orange on a light panel, the lighter one on a dark panel: readable on both.
              color: !focused && !value ? (theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark') : 'text.secondary',
            }}
          >
            {value ? (uploading ? 'Adding the picture' : 'Picture added. Paste again to replace it.') : prompt}
          </Typography>
        </Box>
        {value ? (
          <Tooltip title="Remove the picture">
            <IconButton aria-label="Remove the picture" onClick={() => onChange(null)} disabled={uploading} sx={{ width: 48, height: 48 }}>
              <CloseRounded />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Choose a picture file">
            <IconButton aria-label="Choose a picture file" onClick={() => fileInput.current?.click()} disabled={uploading} sx={{ width: 48, height: 48 }}>
              <FolderOpenRounded />
            </IconButton>
          </Tooltip>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void take(file, false);
          }}
        />
      </Stack>
      {error && (
        <Typography variant="caption" color="error" role="alert">
          {error}
        </Typography>
      )}
    </Stack>
  );
}
