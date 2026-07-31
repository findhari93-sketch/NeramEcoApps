'use client';

/**
 * Papers students built for themselves, grouped by student.
 *
 * Read only. What a student chooses to drill is a genuine signal (and a
 * "Fix my mistakes" paper is a different signal from a chosen topic), but a
 * student's own workspace is not the teacher's to reorganise.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Divider,
  TextField,
  Collapse,
  IconButton,
  InputAdornment,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';

interface StudentTest {
  id: string;
  title: string;
  folder_name: string | null;
  from_mistakes: boolean;
  question_count: number;
  attempts: number;
  best_percentage: number | null;
  created_at: string;
}

interface Group {
  student_id: string;
  student_name: string;
  tests: StudentTest[];
}

export default function StudentTestsView({
  getToken,
  onOpenTest,
}: {
  getToken: () => Promise<string | null>;
  onOpenTest: (testId: string) => void;
}) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setGroups(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const params = debounced ? `?search=${encodeURIComponent(debounced)}` : '';
      const res = await fetch(`/api/question-bank/tests/student-tests${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not load student tests');
      }
      const json = await res.json();
      setGroups(json.data?.groups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load student tests');
      setGroups([]);
    }
  }, [getToken, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        label="Search student tests"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlinedIcon sx={{ fontSize: 18 }} />
            </InputAdornment>
          ),
        }}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {groups === null ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
          ))}
        </Box>
      ) : groups.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
          <PersonOutlineOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {debounced
              ? 'No student test matches that search.'
              : 'No student has built their own test yet. They appear here as soon as they do.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {groups.map((g) => {
            const isOpen = open.has(g.student_id);
            return (
              <Paper key={g.student_id} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.student_id)) next.delete(g.student_id);
                      else next.add(g.student_id);
                      return next;
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpen((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.student_id)) next.delete(g.student_id);
                        else next.add(g.student_id);
                        return next;
                      });
                    }
                  }}
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    minHeight: 56,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
                    {g.student_name}
                  </Typography>
                  <Chip size="small" label={`${g.tests.length} test${g.tests.length !== 1 ? 's' : ''}`} sx={{ height: 22 }} />
                  <IconButton size="small" aria-label={isOpen ? 'Collapse' : 'Expand'} sx={{ p: 0.5 }}>
                    <ExpandMoreOutlinedIcon
                      sx={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                    />
                  </IconButton>
                </Box>

                <Collapse in={isOpen} unmountOnExit>
                  <Divider />
                  {g.tests.map((t, i) => (
                    <Box key={t.id}>
                      {i > 0 && <Divider />}
                      <Box
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenTest(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpenTest(t.id);
                          }
                        }}
                        sx={{ p: 1.5, pl: 2.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {t.from_mistakes && <AutoFixHighOutlinedIcon sx={{ fontSize: 16, color: 'warning.main' }} />}
                          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }} noWrap>
                            {t.title}
                          </Typography>
                          {t.best_percentage != null && (
                            <Chip
                              size="small"
                              label={`${Math.round(t.best_percentage)}%`}
                              color={t.best_percentage >= 70 ? 'success' : 'default'}
                              sx={{ height: 22, fontWeight: 700 }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {t.question_count} question{t.question_count !== 1 ? 's' : ''} · {t.attempts} attempt
                          {t.attempts !== 1 ? 's' : ''}
                          {t.folder_name ? ` · ${t.folder_name}` : ''}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Collapse>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
