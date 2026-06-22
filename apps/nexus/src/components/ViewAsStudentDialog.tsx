'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  InputAdornment,
  Box,
  Typography,
  Avatar,
  Chip,
  CircularProgress,
  IconButton,
  Alert,
  Snackbar,
  SearchIcon,
  CloseIcon,
} from '@neram/ui';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface CandidateStudent {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  ms_oid: string;
  classroomName?: string | null;
}

interface ViewAsStudentDialogProps {
  open: boolean;
  onClose: () => void;
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

/**
 * Searchable single-select student picker for "View as Student". Opened from the
 * profile menu so a teacher/admin can step into any student's account they're
 * authorized to view. Only lists students the caller may impersonate (the
 * /api/auth/impersonate/candidates endpoint mirrors the mint authorization), so
 * every pick succeeds.
 */
export default function ViewAsStudentDialog({ open, onClose }: ViewAsStudentDialogProps) {
  const { getToken, startImpersonation } = useNexusAuthContext();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CandidateStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCandidates = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) {
          setResults([]);
          setError('Your session has expired. Please sign in again.');
          return;
        }
        const res = await fetch(
          `/api/auth/impersonate/candidates?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not load students');
        }
        const data = await res.json();
        setResults(data.students || []);
      } catch (err) {
        setResults([]);
        setError(err instanceof Error ? err.message : 'Could not load students');
      } finally {
        setLoading(false);
      }
    },
    [getToken]
  );

  // Load the default list whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      fetchCandidates('');
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, fetchCandidates]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCandidates(value), 400);
  };

  const handleSelect = async (student: CandidateStudent) => {
    if (startingId) return;
    setStartingId(student.id);
    setError(null);
    try {
      await startImpersonation(student.id, {
        reason: 'Viewing student account from profile menu',
      });
      onClose();
      router.push('/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open student view');
      setStartingId(null);
    }
  };

  const handleClose = () => {
    if (startingId) return; // don't close mid-navigation
    setQuery('');
    setResults([]);
    setError(null);
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            m: { xs: 0, sm: 4 },
            width: { xs: '100%', sm: undefined },
            height: { xs: '100%', sm: 'auto' },
            maxHeight: { xs: '100%', sm: '85vh' },
            borderRadius: { xs: 0, sm: 3 },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            pr: 6,
            pb: 1.5,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'warning.light',
              color: 'warning.dark',
            }}
          >
            <VisibilityOutlinedIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              View as student
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Open a student's account to see exactly what they see.
            </Typography>
          </Box>
          <IconButton
            onClick={handleClose}
            aria-label="Close"
            sx={{ position: 'absolute', top: 12, right: 12 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
          <TextField
            fullWidth
            placeholder="Search students by name or email"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            size="small"
            autoFocus
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: '1.25rem' }} />
                </InputAdornment>
              ),
            }}
            inputProps={{ 'aria-label': 'Search students', style: { minHeight: 24 } }}
          />

          <Box
            sx={{
              flex: 1,
              minHeight: { xs: 'auto', sm: 320 },
              maxHeight: { sm: 420 },
              overflowY: 'auto',
              mx: -1,
            }}
          >
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={26} />
              </Box>
            )}

            {!loading && results.length === 0 && !error && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center', py: 5, px: 2 }}
              >
                {query
                  ? `No students match "${query}".`
                  : 'No students available to view yet.'}
              </Typography>
            )}

            {!loading &&
              results.map((student) => {
                const starting = startingId === student.id;
                return (
                  <Box
                    key={student.id}
                    component="button"
                    type="button"
                    onClick={() => handleSelect(student)}
                    disabled={!!startingId}
                    aria-label={`View as ${student.name}`}
                    sx={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      bgcolor: 'transparent',
                      cursor: startingId ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      mx: 1,
                      borderRadius: 2,
                      minHeight: 56,
                      transition: 'background-color 150ms ease',
                      '&:hover': { bgcolor: startingId ? 'transparent' : 'action.hover' },
                      '&:focus-visible': {
                        outline: (theme) => `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                      opacity: startingId && !starting ? 0.5 : 1,
                    }}
                  >
                    <Avatar
                      src={student.avatar_url || undefined}
                      sx={{ width: 40, height: 40, fontSize: '0.9rem', flexShrink: 0 }}
                    >
                      {getInitials(student.name)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {student.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                        {student.email && (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {student.email}
                          </Typography>
                        )}
                        {student.classroomName && (
                          <Chip
                            label={student.classroomName}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.62rem', flexShrink: 0 }}
                          />
                        )}
                      </Box>
                    </Box>
                    {starting ? (
                      <CircularProgress size={18} sx={{ flexShrink: 0 }} />
                    ) : (
                      <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
                    )}
                  </Box>
                );
              })}
          </Box>
        </DialogContent>
      </Dialog>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
