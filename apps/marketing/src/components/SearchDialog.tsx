'use client';

import { useEffect, useRef } from 'react';
import {
  Dialog,
  Box,
  Typography,
  TextField,
  IconButton,
  useMediaQuery,
  useTheme,
  InputAdornment,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useSiteSearch } from './search/useSiteSearch';
import SearchResultsList, { optionId } from './search/SearchResultsList';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

const LIST_ID = 'search-dialog-results';
const kbdStyle = { padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' };

/** Full-screen search on phones, a centred dialog on tablets. */
export default function SearchDialog({ open, onClose }: SearchDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSiteSearch(onClose);
  const { query, setQuery, flatResults, selectedIndex, handleKeyDown, reset } = search;

  useEffect(() => {
    if (!open) return;
    reset();
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [open, reset]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
      aria-label="Search"
      PaperProps={{
        sx: {
          ...(isMobile ? { m: 0, borderRadius: 0 } : { mt: '10vh', borderRadius: 3, maxHeight: '72vh' }),
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
        },
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder="Search colleges, courses, tools..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          inputProps={{
            role: 'combobox',
            'aria-label': 'Search the site',
            'aria-expanded': flatResults.length > 0,
            'aria-controls': LIST_ID,
            'aria-autocomplete': 'list',
            'aria-activedescendant': flatResults.length ? optionId(LIST_ID, selectedIndex) : undefined,
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isMobile ? (
                  <IconButton onClick={onClose} sx={{ ml: -1, width: 44, height: 44, color: 'text.secondary' }} aria-label="Go back">
                    <ArrowBackIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                ) : (
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                )}
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton onClick={() => setQuery('')} aria-label="Clear search" sx={{ width: 40, height: 40 }}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ) : null,
            sx: { borderRadius: 2, fontSize: '1rem', '& input': { py: 1.5, fontSize: '1rem' } },
          }}
        />
        {!isMobile && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Press <kbd style={kbdStyle}>Esc</kbd> to close, <kbd style={kbdStyle}>{'↑'}{'↓'}</kbd> to navigate,{' '}
            <kbd style={kbdStyle}>Enter</kbd> to select
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 2 }}>
        <SearchResultsList search={search} listId={LIST_ID} touch={isMobile} />
      </Box>
    </Dialog>
  );
}
