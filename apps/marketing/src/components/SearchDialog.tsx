'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  useMediaQuery,
  useTheme,
  InputAdornment,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useRouter } from 'next/navigation';
import { searchPages, getCategoryLabel, type SearchEntry } from '@/lib/search-index';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<SearchEntry['category'], string> = {
  page: '#1976d2',
  course: '#2e7d32',
  tool: '#ed6c02',
  nata: '#9c27b0',
  blog: '#0288d1',
  legal: '#757575',
};

export default function SearchDialog({ open, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const results = searchPages(query);
    setResults(results);
    setSelectedIndex(0);
  }, [query]);

  const navigateTo = useCallback(
    (path: string) => {
      onClose();
      router.push(path);
    },
    [onClose, router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        navigateTo(results[selectedIndex].path);
      }
    },
    [results, selectedIndex, navigateTo]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          ...(isMobile
            ? { m: 0, borderRadius: 0 }
            : {
                mt: '10vh',
                borderRadius: 3,
                maxHeight: '70vh',
              }),
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
        },
      }}
    >
      {/* Search Input */}
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder="Search pages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {query && (
                  <IconButton size="small" onClick={() => setQuery('')}>
                    <CloseIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                )}
                {isMobile && (
                  <IconButton size="small" onClick={onClose} sx={{ ml: 0.5 }}>
                    <CloseIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                )}
              </InputAdornment>
            ),
            sx: {
              borderRadius: 2,
              fontSize: '1rem',
              '& input': { py: 1.5 },
            },
          }}
          inputProps={{ style: { fontSize: '1rem' } }}
        />
        {!isMobile && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Press <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>Esc</kbd> to close
            {' '}&middot;{' '}
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>&uarr;&darr;</kbd> to navigate
            {' '}&middot;{' '}
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>Enter</kbd> to select
          </Typography>
        )}
      </Box>

      {/* Results */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 1,
          pb: 2,
        }}
      >
        {query.trim() === '' && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <SearchIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Search for courses, fees, NATA info, tools, and more
            </Typography>
          </Box>
        )}

        {query.trim() !== '' && results.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body2" color="text.secondary">
              No results found for &ldquo;{query}&rdquo;
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Try different keywords or contact us at +91 91761 37043
            </Typography>
          </Box>
        )}

        {results.map((result, index) => (
          <Box
            key={result.path}
            onClick={() => navigateTo(result.path)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 1.5,
              mx: 1,
              borderRadius: 2,
              cursor: 'pointer',
              bgcolor: index === selectedIndex ? 'action.hover' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
              transition: 'background-color 0.15s',
              minHeight: 48,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {result.title}
                </Typography>
                <Chip
                  label={getCategoryLabel(result.category)}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    bgcolor: `${CATEGORY_COLORS[result.category]}15`,
                    color: CATEGORY_COLORS[result.category],
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                />
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {result.description}
              </Typography>
            </Box>
            <ArrowForwardIcon
              sx={{
                fontSize: 16,
                color: 'text.disabled',
                flexShrink: 0,
                opacity: index === selectedIndex ? 1 : 0,
                transition: 'opacity 0.15s',
              }}
            />
          </Box>
        ))}
      </Box>
    </Dialog>
  );
}
