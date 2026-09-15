'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Chip, IconButton, InputAdornment, TextField, alpha, useTheme } from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HistoryIcon from '@mui/icons-material/History';
import { addRecent, readRecent, safeLocalStorage } from '@/lib/inspiration-recent';

export interface InspirationSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * The hero of the page: one box that searches everything. It sticks to the top
 * while the grid scrolls, and offers the student's recent searches when empty.
 */
export default function InspirationSearchBar({ value, onChange }: InspirationSearchBarProps) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readRecent(safeLocalStorage()));
  }, []);

  // Remember a search once the student has paused on it, not every keystroke.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => setRecent(addRecent(safeLocalStorage(), q)), 1500);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    // Focus is tracked on the wrapper, not the input, so tabbing from the field onto a
    // recent-search chip (still inside this box) does not collapse the list mid-tab.
    <Box
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.default', py: 1 }}
    >
      <TextField
        inputRef={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search drawings, like 3D bag and hat"
        fullWidth
        size="small"
        inputProps={{ 'aria-label': 'Search Inspiration', enterKeyHint: 'search', maxLength: 100 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                aria-label="Clear search"
                onClick={() => {
                  onChange('');
                  inputRef.current?.focus();
                }}
                sx={{ width: 44, height: 44 }}
              >
                <ClearIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
        sx={{
          '& .MuiInputBase-input': { fontSize: 16 },
          '& .MuiOutlinedInput-root': {
            minHeight: 48,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            '& fieldset': { border: 'none' },
            '&.Mui-focused fieldset': { border: `2px solid ${theme.palette.primary.main}` },
          },
        }}
      />
      {focused && !value && recent.length > 0 && (
        <Box role="group" aria-label="Recent searches" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {recent.map((r) => (
            <Chip
              key={r}
              icon={<HistoryIcon />}
              label={r}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(r)}
              sx={{ height: 44 }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
