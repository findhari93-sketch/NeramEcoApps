'use client';

import { useState, type Ref } from 'react';
import { Box, IconButton, InputAdornment, TextField, Tooltip } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import { classifySolutionVideo, INVALID_VIDEO_MESSAGE, solutionVideoThumb } from '@/lib/solution-video';
import { countVideoLinks } from '@/lib/video-link-matcher';

export interface SolutionVideoFieldProps {
  /** The field's accessible name, e.g. "Video for question 31". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Visible label above the field (the question editor); the paper rows keep it for screen readers only. */
  showLabel?: boolean;
  /** What Save will do: nothing to say, a pending change, or removing the video. */
  status?: 'unsaved' | 'removing' | null;
  /** The server's refusal from the last Save, shown under the field. */
  errorText?: string | null;
  /** Enter pressed: the paper moves focus to the next question's field. */
  onEnter?: () => void;
  /** A paste holding two or more links, handed to the matcher instead of this one field. */
  onBulkPaste?: (text: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * One solution-video link, checked as it is typed.
 *
 * Shared by the paper's Videos mode and the question editor, so a link reads
 * the same way (valid, invalid, what Save will do) wherever it is set. The
 * thumbnail and the Open button are how a teacher confirms it is the right
 * video without leaving the page to search for it.
 *
 * "Not a video" waits until the teacher leaves the field (validate on blur),
 * so typing a link out by hand is not shouted at on the first keystroke.
 */
export default function SolutionVideoField({
  label,
  value,
  onChange,
  showLabel = false,
  status = null,
  errorText = null,
  onEnter,
  onBulkPaste,
  inputRef,
  disabled = false,
}: SolutionVideoFieldProps) {
  const [focused, setFocused] = useState(false);
  const link = classifySolutionVideo(value);
  const valid = link.kind === 'youtube' || link.kind === 'sharepoint';
  const thumb = solutionVideoThumb(value);
  const subject = `the ${lowerFirst(label)}`;

  const showInvalid = link.kind === 'invalid' && !focused;
  const helper = errorText
    ? errorText
    : showInvalid
      ? INVALID_VIDEO_MESSAGE
      : status === 'removing'
        ? 'Unsaved: the video will be removed'
        : status === 'unsaved'
          ? 'Unsaved'
          : undefined;
  const isError = Boolean(errorText) || showInvalid;

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
      {/* A fixed 16:9 slot either way, so rows line up with or without a preview. */}
      <Box
        sx={{
          flexShrink: 0,
          width: 64,
          height: 36,
          mt: showLabel ? 1.25 : 0.5,
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb ? (
          <Box
            component="img"
            src={thumb}
            alt={`Preview of ${subject}`}
            loading="lazy"
            width={64}
            height={36}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <VideoLibraryOutlinedIcon aria-hidden sx={{ fontSize: 18, color: 'text.disabled' }} />
        )}
      </Box>

      <TextField
        fullWidth
        size="small"
        value={value}
        disabled={disabled}
        label={showLabel ? label : undefined}
        placeholder="Paste a YouTube link"
        error={isError}
        helperText={helper}
        inputRef={inputRef}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        onPaste={(e) => {
          if (!onBulkPaste) return;
          const text = e.clipboardData?.getData('text') ?? '';
          if (countVideoLinks(text) >= 2) {
            e.preventDefault();
            onBulkPaste(text);
          }
        }}
        inputProps={{
          'aria-label': showLabel ? undefined : label,
          inputMode: 'url',
          autoComplete: 'off',
          spellCheck: false,
        }}
        FormHelperTextProps={{
          sx: {
            mx: 0,
            fontWeight: status && !isError ? 600 : undefined,
            // text.primary, not warning.dark: one theme's warning.dark is 3.8:1 on white.
            color: !isError && status === 'removing' ? 'text.primary' : !isError && status ? 'primary.main' : undefined,
          },
        }}
        InputProps={{
          sx: {
            minHeight: 44,
            pr: 0.25,
            // 16px on a phone so iOS does not zoom into the field on focus.
            '& input': { fontSize: { xs: 16, sm: 14 } },
          },
          endAdornment:
            value.length > 0 ? (
              <InputAdornment position="end" sx={{ gap: 0.25, ml: 0 }}>
                {valid && (
                  <>
                    <CheckCircleIcon aria-hidden sx={{ fontSize: 18, color: 'success.main', mr: 0.25 }} />
                    <Tooltip title="Open to check it is the right video" arrow>
                      <IconButton
                        component="a"
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${subject} in a new tab`}
                        sx={{ width: 44, height: 44 }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <IconButton
                  aria-label={`Clear ${subject.replace(/^the video/, 'the video link')}`}
                  onClick={() => onChange('')}
                  disabled={disabled}
                  sx={{ width: 44, height: 44 }}
                >
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
        }}
      />
    </Box>
  );
}
