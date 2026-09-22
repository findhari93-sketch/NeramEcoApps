'use client';

import { IconButton, TextField } from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloseIcon from '@mui/icons-material/Close';

interface PracticeSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

/**
 * Always visible. It used to live inside the filter drawer, behind an Apply
 * button, so most students never found it.
 */
export default function PracticeSearchField({ value, onChange, placeholder }: PracticeSearchFieldProps) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      size="small"
      fullWidth
      inputProps={{ 'aria-label': 'Search questions', enterKeyHint: 'search' }}
      InputProps={{
        startAdornment: <SearchOutlinedIcon sx={{ color: 'text.secondary', mr: 1 }} fontSize="small" aria-hidden="true" />,
        endAdornment: value ? (
          <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        ) : null,
      }}
      sx={{
        // 16px keeps iOS from zooming the viewport on focus, and 48px is the
        // Material 3 minimum for a primary touch target. The padding makes the
        // input itself 48px: a minHeight on the root alone left the field that
        // takes the tap at 40.
        '& .MuiInputBase-input': { fontSize: 16, py: '12.5px' },
        '& .MuiInputBase-root': { minHeight: 48, borderRadius: 2, bgcolor: 'background.paper' },
      }}
    />
  );
}
