'use client';

/**
 * The search box for a list of people.
 *
 * It behaves the way search boxes everywhere else behave, because a teacher
 * brings those habits with them:
 * - an X appears once there is text, and one tap clears it and leaves the
 *   cursor in the box, ready for the next name;
 * - Escape clears too, but only when there is something to clear, so Escape
 *   still closes a dialog around an empty box;
 * - type="search" gives a phone keyboard its Search key, and autocorrect is off,
 *   because iOS "corrects" a half-typed name ("bav" became "bad") before it is
 *   ever searched;
 * - 16px text, so iOS does not zoom the page when the box takes focus;
 * - the number of results is read out once typing pauses, because a list that
 *   changes silently under the box does not exist for a screen reader.
 *
 * It sits in a search landmark, so a screen reader can jump straight to it, and
 * its accessible name is a real label rather than the placeholder, which is
 * gone the moment someone types.
 */

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Box, IconButton, InputAdornment, TextField } from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

/** Minimum touch target. apps/nexus/CLAUDE.md mandates 48. */
const TAP = 48;

/** How long typing has to pause before the result count is announced. */
export const ANNOUNCE_DELAY_MS = 400;

/** Hidden on screen, still read aloud. Pixel strings, because in sx a bare 1 means 100%. */
const SCREEN_READER_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export interface PeopleSearchFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** The accessible name, for example "Search students by name". */
  label: string;
  placeholder?: string;
  /** Results for the current text. When given, it is announced once typing pauses. */
  resultCount?: number;
  /** Singular and plural nouns for that announcement. */
  noun?: readonly [string, string];
  sx?: ComponentProps<typeof Box>['sx'];
}

/** "No students match", "1 student matches", "3 students match". */
export function describeResults(count: number, [one, many]: readonly [string, string]): string {
  if (count === 0) return `No ${many} match`;
  return count === 1 ? `1 ${one} matches` : `${count} ${many} match`;
}

export default function PeopleSearchField({
  value,
  onChange,
  label,
  placeholder,
  resultCount,
  noun = ['student', 'students'],
  sx,
}: PeopleSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const [one, many] = noun;
  const searching = value.trim().length > 0;

  // Restarts on every keystroke, so only the count typing settles on is read.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnnouncement(
        searching && resultCount !== undefined ? describeResults(resultCount, [one, many]) : '',
      );
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, searching, resultCount, one, many]);

  const clear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || value === '') return;
    // Handled here, so a dialog or drawer around the box does not close too.
    event.preventDefault();
    event.stopPropagation();
    onChange('');
  };

  // Enter has nothing to submit: the list already follows every keystroke. On
  // a phone it drops the keyboard instead, which is what uncovers the results.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
      inputRef.current?.blur();
    }
  };

  return (
    <Box component="form" role="search" noValidate onSubmit={handleSubmit} sx={sx}>
      <TextField
        fullWidth
        size="small"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        inputProps={{
          'aria-label': label,
          enterKeyHint: 'search',
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'none',
          spellCheck: false,
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                aria-label="Clear search"
                // Keeps focus in the box, so a phone keyboard does not drop and
                // bounce back up between the tap and the clear.
                onMouseDown={(event) => event.preventDefault()}
                onClick={clear}
                sx={{ width: TAP, height: TAP, color: 'text.secondary' }}
              >
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
        sx={{
          '& .MuiInputBase-root': { minHeight: TAP, bgcolor: 'background.paper' },
          '& .MuiInputBase-input': { fontSize: 16 },
          // One X only: browsers draw their own inside type="search".
          '& input::-webkit-search-cancel-button, & input::-webkit-search-decoration': {
            WebkitAppearance: 'none',
            display: 'none',
          },
        }}
      />
      <Box role="status" aria-live="polite" sx={SCREEN_READER_ONLY}>
        {announcement}
      </Box>
    </Box>
  );
}
