'use client';

/**
 * A checkpoint's start or end, typed as the video player shows it ("15:24").
 *
 * Two buttons inside the field do the arithmetic the old "Start (sec)" box left
 * to the teacher: "Now" takes the time the video is at, and "Play" plays the
 * video from this time to check the boundary lands between sentences.
 *
 * A typed time is committed when the field is left or Enter is pressed, never on
 * every keystroke, so "15:" on the way to "15:24" is not rejected mid-typing.
 */

import { useEffect, useId, useState } from 'react';
import { IconButton, InputAdornment, TextField, Tooltip } from '@neram/ui';
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { formatTimecode, parseTimecode } from '@/lib/timecode';

export interface TimecodeFieldProps {
  label: string;
  seconds: number;
  onChange: (seconds: number) => void;
  /** Where the video is now. The "Now" button appears once there is one. */
  nowSeconds?: number | null;
  onPlayFrom?: (seconds: number) => void;
  disabled?: boolean;
  helperText?: string;
}

export default function TimecodeField({
  label,
  seconds,
  onChange,
  nowSeconds,
  onPlayFrom,
  disabled = false,
  helperText,
}: TimecodeFieldProps) {
  const id = useId();
  const [text, setText] = useState(formatTimecode(seconds));
  const [error, setError] = useState(false);

  // A change from outside (Now, a restore, a save) replaces what is shown.
  useEffect(() => {
    setText(formatTimecode(seconds));
    setError(false);
  }, [seconds]);

  const commit = () => {
    const parsed = parseTimecode(text);
    if (parsed === null) {
      setError(true);
      return;
    }
    setError(false);
    if (parsed !== seconds) onChange(parsed);
    else setText(formatTimecode(parsed));
  };

  const name = label.toLowerCase();
  const hasNow = typeof nowSeconds === 'number' && nowSeconds >= 0;

  return (
    <TextField
      id={id}
      label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (error) setError(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      disabled={disabled}
      error={error}
      helperText={error ? 'Use minutes and seconds, like 15:24' : helperText}
      fullWidth
      inputProps={{ autoComplete: 'off', spellCheck: false }}
      InputProps={{
        endAdornment: (hasNow || onPlayFrom) && (
          <InputAdornment position="end" sx={{ gap: 0.25, mr: -0.75 }}>
            {hasNow && (
              <Tooltip title={`Use ${formatTimecode(nowSeconds as number)}`}>
                <span>
                  <IconButton
                    aria-label={`Set ${name} to ${formatTimecode(nowSeconds as number)}, where the video is now`}
                    onClick={() => onChange(Math.round(nowSeconds as number))}
                    disabled={disabled}
                    sx={{ width: 44, height: 44 }}
                  >
                    <MyLocationRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {onPlayFrom && (
              <Tooltip title="Play from here">
                <span>
                  <IconButton
                    aria-label={`Play the video from ${formatTimecode(seconds)}`}
                    onClick={() => onPlayFrom(seconds)}
                    disabled={disabled}
                    sx={{ width: 44, height: 44 }}
                  >
                    <PlayArrowRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </InputAdornment>
        ),
      }}
      sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
    />
  );
}
