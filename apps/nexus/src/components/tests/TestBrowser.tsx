'use client';

/**
 * Browse and pick one test from the library: folder rail, search, selectable list.
 *
 * Extracted so the same browsing behaviour can be a dialog (TestPicker) or sit
 * inline inside another dialog (the class prep tab), without nesting one modal
 * inside another. Controlled: the parent owns the selection.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Chip,
  Skeleton,
  Alert,
  Divider,
  InputAdornment,
  Drawer,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import FolderTreeNav, { ALL_FOLDERS, UNFILED, type FolderNode } from './FolderTreeNav';

export interface PickableTest {
  id: string;
  title: string;
  question_count: number;
  attempt_count: number;
  is_published: boolean;
  test_kind: string;
  placements: Array<{ context_type: string; context_label: string | null }>;
}

interface TestBrowserProps {
  getToken: () => Promise<string | null>;
  value: PickableTest | null;
  onChange: (test: PickableTest | null) => void;
  /** Restrict to specific test kinds. */
  kinds?: string[];
  /** Reset key: change it to clear search and folder (e.g. when a dialog reopens). */
  resetToken?: unknown;
  onBuildNew?: () => void;
  /** How tall the scrolling list may get. Inline usage wants a shorter list. */
  maxListHeight?: number;
}

export default function TestBrowser({
  getToken,
  value,
  onChange,
  kinds,
  resetToken,
  onBuildNew,
  maxListHeight = 400,
}: TestBrowserProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [tree, setTree] = useState<FolderNode[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [folder, setFolder] = useState<string>(ALL_FOLDERS);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tests, setTests] = useState<PickableTest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [foldersOpen, setFoldersOpen] = useState(false);

  // kinds is usually an inline array literal, so a new identity every render.
  // Joining it gives the effects a stable dependency and stops a refetch loop.
  const kindsKey = (kinds || []).join(',');

  const authFetch = useCallback(
    async (url: string) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Request failed');
      }
      return res.json();
    },
    [getToken],
  );

  useEffect(() => {
    setFolder(ALL_FOLDERS);
    setSearch('');
    setDebouncedSearch('');
    setError(null);
  }, [resetToken]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch('/api/test-folders');
        if (cancelled) return;
        setTree(json.data?.tree || []);
        setUnfiledCount(json.data?.unfiled_count || 0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load folders');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, resetToken]);

  useEffect(() => {
    let cancelled = false;
    setTests(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        // Searching spans every folder, so the folder filter drops away.
        if (!debouncedSearch) {
          if (folder === UNFILED) params.set('folder', 'unfiled');
          else if (folder !== ALL_FOLDERS) params.set('folder', folder);
        }
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (kindsKey) params.set('kinds', kindsKey);
        params.set('page_size', '50');
        const json = await authFetch(`/api/question-bank/tests/library?${params.toString()}`);
        if (cancelled) return;
        setTests(json.data?.tests || []);
        setTotal(json.data?.total || 0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tests');
          setTests([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folder, debouncedSearch, kindsKey, authFetch]);

  const treeTotal = useMemo(() => {
    const walk = (nodes: FolderNode[]): number =>
      nodes.reduce((sum, n) => sum + n.test_count + walk(n.children), 0);
    return walk(tree) + unfiledCount;
  }, [tree, unfiledCount]);

  const folderPanel = (
    <FolderTreeNav
      tree={tree}
      unfiledCount={unfiledCount}
      selected={folder}
      totalCount={treeTotal}
      onSelect={(id) => {
        setFolder(id);
        setSearch('');
        setFoldersOpen(false);
      }}
      sx={{ p: 1 }}
    />
  );

  return (
    <Box sx={{ display: 'flex', minHeight: { xs: 'auto', md: 320 } }}>
      {!isMobile && (
        <Box
          sx={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            overflowY: 'auto',
            maxHeight: maxListHeight + 120,
          }}
        >
          {folderPanel}
        </Box>
      )}

      <Box sx={{ flex: 1, minWidth: 0, pl: { xs: 0, md: 2 } }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            label="Search tests"
            placeholder="Search by title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
          />
          {isMobile && (
            <Button
              variant="outlined"
              startIcon={<FolderOutlinedIcon />}
              onClick={() => setFoldersOpen(true)}
              sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
            >
              Folders
            </Button>
          )}
        </Box>

        {debouncedSearch && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Searching every folder.
          </Typography>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        {tests === null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
            ))}
          </Box>
        ) : tests.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {debouncedSearch ? `No test matches "${debouncedSearch}".` : 'No tests in this folder yet.'}
            </Typography>
            {onBuildNew && (
              <Button
                variant="outlined"
                startIcon={<AddOutlinedIcon />}
                onClick={onBuildNew}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                Build a new test
              </Button>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: maxListHeight, overflowY: 'auto' }}>
            {tests.map((t) => {
              const isPicked = value?.id === t.id;
              return (
                <Box
                  key={t.id}
                  onClick={() => onChange(isPicked ? null : t)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isPicked}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onChange(isPicked ? null : t);
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    minHeight: 64,
                    border: '1px solid',
                    borderColor: isPicked ? 'primary.main' : 'divider',
                    bgcolor: isPicked ? 'action.selected' : 'transparent',
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    transition: 'border-color 150ms ease, background-color 150ms ease',
                    '&:hover': { borderColor: 'primary.main' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                  }}
                >
                  <Box sx={{ color: isPicked ? 'primary.main' : 'text.disabled', display: 'flex' }}>
                    {isPicked ? <CheckCircleOutlinedIcon /> : <RadioButtonUncheckedOutlinedIcon />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                      {t.title}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        {t.question_count} question{t.question_count !== 1 ? 's' : ''}
                      </Typography>
                      {t.attempt_count > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          · {t.attempt_count} attempt{t.attempt_count !== 1 ? 's' : ''}
                        </Typography>
                      )}
                      {!t.is_published && (
                        <Chip
                          label="Draft"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                      {/* Where it is already in use, so a teacher does not
                          reuse a paper the class has just sat. */}
                      {t.placements.slice(0, 2).map((p, i) => (
                        <Chip
                          key={`${p.context_type}-${i}`}
                          label={p.context_label || p.context_type.replace(/_/g, ' ')}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      ))}
                    </Box>
                  </Box>
                </Box>
              );
            })}
            {total > tests.length && (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                Showing {tests.length} of {total}. Narrow it with search.
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <Drawer anchor="left" open={foldersOpen && isMobile} onClose={() => setFoldersOpen(false)}>
        <Box sx={{ width: 280, pt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              Folders
            </Typography>
            <IconButton
              onClick={() => setFoldersOpen(false)}
              aria-label="Close folders"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <CloseOutlinedIcon />
            </IconButton>
          </Box>
          <Divider />
          {folderPanel}
        </Box>
      </Drawer>
    </Box>
  );
}
