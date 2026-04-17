'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Divider,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HistoryIcon from '@mui/icons-material/History';
import { useRouter } from 'next/navigation';
import {
  searchPages,
  getCategoryLabel,
  getCategoryColor,
  CATEGORY_CONFIG,
  QUICK_LINKS,
  type SearchEntry,
  type GroupedResults,
  type SearchCategory,
} from '@/lib/search-index';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

// ─── Recent searches helpers ──────────────────────────────────────

const RECENT_KEY = 'neram_recent_searches';
const SESSION_KEY = 'neram_search_session';
const MAX_RECENT = 5;

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  try {
    const trimmed = query.trim();
    if (!trimmed) return;
    const existing = getRecentSearches().filter((q) => q !== trimmed);
    const updated = [trimmed, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}

// ─── Analytics ───────────────────────────────────────────────────

function trackSearchEvent(
  eventType: 'search' | 'click' | 'no_results',
  data: Record<string, unknown>
): void {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const payload = JSON.stringify({
      event: eventType,
      sessionId: getSessionId(),
      ts: Date.now(),
      ...data,
    });
    navigator.sendBeacon('/api/analytics/search', payload);
  } catch {
    // never throw
  }
}

// ─── Component ───────────────────────────────────────────────────

export default function SearchDialog({ open, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [groupedResults, setGroupedResults] = useState<GroupedResults[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flat list of all visible results for keyboard navigation
  const flatResults = useMemo<SearchEntry[]>(() => {
    return groupedResults.flatMap((group) => group.results);
  }, [groupedResults]);

  // Load recent searches on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setGroupedResults([]);
      setSelectedIndex(0);
      setRecentSearches(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Search on query change
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setGroupedResults([]);
      setSelectedIndex(0);
      return;
    }
    const results = searchPages(trimmed);
    setGroupedResults(results);
    setSelectedIndex(0);

    // Debounced analytics
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const total = results.reduce((sum, g) => sum + g.results.length, 0);
      if (total === 0) {
        trackSearchEvent('no_results', { query: trimmed });
      } else {
        trackSearchEvent('search', { query: trimmed, resultCount: total });
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigateTo = useCallback(
    (path: string, entry?: SearchEntry) => {
      if (query.trim()) {
        saveRecentSearch(query.trim());
      }
      if (entry) {
        trackSearchEvent('click', {
          query: query.trim(),
          path,
          category: entry.category,
          title: entry.title,
        });
      }
      onClose();
      router.push(path);
    },
    [onClose, router, query]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!flatResults.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
        e.preventDefault();
        navigateTo(flatResults[selectedIndex].path, flatResults[selectedIndex]);
      }
    },
    [flatResults, selectedIndex, navigateTo]
  );

  // Helper: keyboard selection flat index for a given grouped position
  let flatIndex = 0;

  const handleOverflowClick = (category: SearchCategory) => {
    const path = category === 'college'
      ? `/colleges?q=${encodeURIComponent(query)}`
      : `/${category}`;
    onClose();
    router.push(path);
  };

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
                maxHeight: '72vh',
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
          placeholder="Search colleges, courses, tools..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isMobile ? (
                  <IconButton
                    size="small"
                    onClick={onClose}
                    sx={{ mr: -0.5, color: 'text.secondary' }}
                    aria-label="Go back"
                  >
                    <ArrowBackIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                ) : (
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                )}
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setQuery('')} aria-label="Clear search">
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ) : null,
            sx: {
              borderRadius: 2,
              fontSize: '1rem',
              '& input': { py: 1.5, fontSize: '1rem' },
            },
          }}
        />
        {!isMobile && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Press{' '}
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>Esc</kbd>
            {' '}to close,{' '}
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>{'\u2191'}{'\u2193'}</kbd>
            {' '}to navigate,{' '}
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>Enter</kbd>
            {' '}to select
          </Typography>
        )}
      </Box>

      {/* Scrollable Results Area */}
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 2 }}>

        {/* Empty state: recent searches + quick links */}
        {query.trim() === '' && (
          <Box>
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.disabled', fontSize: '0.65rem' }}
                  >
                    Recent Searches
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 500, fontSize: '0.75rem' }}
                    onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                  >
                    Clear
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {recentSearches.map((q) => (
                    <Chip
                      key={q}
                      label={q}
                      size="small"
                      icon={<HistoryIcon sx={{ fontSize: '14px !important' }} />}
                      onClick={() => setQuery(q)}
                      sx={{
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        bgcolor: 'action.hover',
                        '&:hover': { bgcolor: 'action.selected' },
                      }}
                    />
                  ))}
                </Box>
                <Divider sx={{ mt: 1.5 }} />
              </Box>
            )}

            {/* Quick links */}
            <Box sx={{ px: 2, pt: 1.5 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.disabled', fontSize: '0.65rem', display: 'block', mb: 1 }}
              >
                Quick Links
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                  gap: 1,
                }}
              >
                {QUICK_LINKS.map((entry) => {
                  const color = getCategoryColor(entry.category);
                  return (
                    <Box
                      key={entry.path}
                      onClick={() => navigateTo(entry.path, entry)}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: 'divider',
                        transition: 'all 0.15s',
                        '&:hover': {
                          bgcolor: `${color}0a`,
                          borderColor: `${color}50`,
                          transform: 'translateY(-1px)',
                          boxShadow: 1,
                        },
                      }}
                    >
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ fontSize: '0.82rem', mb: 0.25, color: color }}
                      >
                        {entry.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', fontSize: '0.7rem', lineHeight: 1.3 }}
                      >
                        {entry.description.length > 50
                          ? entry.description.slice(0, 50) + '...'
                          : entry.description}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        )}

        {/* No results */}
        {query.trim() !== '' && groupedResults.length === 0 && (
          <Box sx={{ px: 3, py: 5, textAlign: 'center' }}>
            <SearchIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }} />
            <Typography variant="body2" color="text.secondary" gutterBottom>
              No results found for &ldquo;{query}&rdquo;
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Try different keywords or reach us at +91 91761 37043
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
              {['NATA 2026', 'Fees', 'Colleges', 'Apply Now', 'Free Tools'].map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  size="small"
                  onClick={() => setQuery(suggestion)}
                  sx={{
                    cursor: 'pointer',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    bgcolor: 'action.hover',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Grouped results */}
        {groupedResults.map((group) => {
          const config = CATEGORY_CONFIG[group.category];
          const overflow = group.totalCount - group.results.length;
          const groupStartIndex = flatIndex;
          flatIndex += group.results.length;

          return (
            <Box key={group.category} sx={{ mt: 0.5 }}>
              {/* Category header */}
              <Box
                sx={{
                  px: 2,
                  py: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: config.color,
                    fontSize: '0.65rem',
                  }}
                >
                  {config.label}
                </Typography>
                {overflow > 0 && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: config.color,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                    onClick={() => handleOverflowClick(group.category)}
                  >
                    +{overflow} more
                  </Typography>
                )}
              </Box>

              {/* Results in this category */}
              {group.results.map((result, i) => {
                const itemFlatIndex = groupStartIndex + i;
                const isSelected = itemFlatIndex === selectedIndex;
                return (
                  <Box
                    key={result.path}
                    onClick={() => navigateTo(result.path, result)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1,
                      mx: 1,
                      borderRadius: 2,
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'action.hover' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                      transition: 'background-color 0.15s',
                      minHeight: isMobile ? 64 : 48,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.875rem',
                          mb: 0.25,
                        }}
                      >
                        {result.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.4,
                        }}
                      >
                        {result.description}
                      </Typography>
                    </Box>
                    <ArrowForwardIcon
                      sx={{
                        fontSize: 15,
                        color: config.color,
                        flexShrink: 0,
                        opacity: isSelected ? 1 : 0,
                        transition: 'opacity 0.15s',
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Dialog>
  );
}
