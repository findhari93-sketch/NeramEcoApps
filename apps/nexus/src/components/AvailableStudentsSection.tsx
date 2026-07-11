'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  Alert,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import GraphAvatar from '@/components/GraphAvatar';

interface DirectoryStudent {
  ms_oid: string;
  name: string;
  email: string;
  inDatabase: boolean;
}

interface Props {
  classroomId: string;
  getToken: () => Promise<string | null>;
  /** Called after one or more students are enrolled, so the parent refreshes its roster. */
  onEnrolled: () => void;
}

/**
 * "Not yet in class" — browsable list of organisation students from the Microsoft
 * directory who aren't enrolled in this classroom yet. New @neramclasses.com
 * accounts appear here automatically; a teacher adds them with one click, which
 * enrolls them (and adds them to the classroom Team). Collapsed by default so it
 * doesn't crowd the enrolled roster.
 */
export default function AvailableStudentsSection({ classroomId, getToken, onEnrolled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<DirectoryStudent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const fetchAvailable = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/classrooms/${classroomId}/available-students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 502) {
        setUnavailable(true);
        setStudents([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load available students');
      const data = await res.json();
      setStudents(data.students || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load available students');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [classroomId, getToken]);

  // Lazy-load the directory the first time the section is expanded.
  useEffect(() => {
    if (expanded && !loaded && !loading) fetchAvailable();
  }, [expanded, loaded, loading, fetchAvailable]);

  const toggleSelect = (msOid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(msOid)) next.delete(msOid);
      else next.add(msOid);
      return next;
    });
  };

  const filtered = students.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const enroll = async (toAdd: DirectoryStudent[]) => {
    if (toAdd.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      await Promise.all(
        toAdd.map((s) =>
          fetch(`/api/classrooms/${classroomId}/enrollments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'student',
              ms_oid: s.ms_oid,
              name: s.name,
              email: s.email,
              user_type: 'student',
            }),
          })
        )
      );

      // Drop the added ones locally, clear selection, tell the parent to refresh.
      const addedOids = new Set(toAdd.map((s) => s.ms_oid));
      setStudents((prev) => prev.filter((s) => !addedOids.has(s.ms_oid)));
      setSelected(new Set());
      onEnrolled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add students');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          cursor: 'pointer',
          minHeight: 48,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <PersonAddAltOutlinedIcon fontSize="small" color="action" />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
          Not yet in class
          {loaded && !unavailable && (
            <Chip
              label={students.length}
              size="small"
              color={students.length > 0 ? 'primary' : 'default'}
              sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Typography>
        {expanded && (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); fetchAvailable(); }}
            disabled={loading}
            aria-label="Refresh directory"
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </Box>

      {expanded && (
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Organisation students who aren&apos;t in this classroom yet. Add them to grant Nexus access.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {unavailable ? (
            <Alert severity="info" sx={{ mb: 1 }}>
              The organisation directory is temporarily unavailable. Use the &quot;Add Student&quot;
              button to search and add a student by name or email.
            </Alert>
          ) : loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : students.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Everyone in the directory is already in this class.
            </Typography>
          ) : (
            <>
              <TextField
                fullWidth
                size="small"
                placeholder="Filter by name or email..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{ mb: 1.5 }}
                inputProps={{ style: { minHeight: 24 } }}
              />

              {selected.size > 0 && (
                <Button
                  fullWidth
                  variant="contained"
                  size="small"
                  startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <PersonAddAltOutlinedIcon />}
                  disabled={adding}
                  onClick={() => enroll(students.filter((s) => selected.has(s.ms_oid)))}
                  sx={{ mb: 1.5, minHeight: 44 }}
                >
                  Add {selected.size} to class
                </Button>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 360, overflow: 'auto' }}>
                {filtered.map((s) => (
                  <Box
                    key={s.ms_oid}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1,
                      borderRadius: 2,
                      minHeight: 48,
                      bgcolor: selected.has(s.ms_oid) ? 'action.selected' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Checkbox
                      checked={selected.has(s.ms_oid)}
                      size="small"
                      onChange={() => toggleSelect(s.ms_oid)}
                      sx={{ p: 0.5 }}
                    />
                    <GraphAvatar msOid={s.ms_oid} name={s.name} size={36} clickable={false} tapToView={false} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {s.name}
                        </Typography>
                        {!s.inDatabase && (
                          <Chip label="New" size="small" color="info" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                        )}
                      </Box>
                      {s.email && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {s.email}
                        </Typography>
                      )}
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={adding}
                      onClick={() => enroll([s])}
                      sx={{ minHeight: 36, textTransform: 'none', flexShrink: 0 }}
                    >
                      Add
                    </Button>
                  </Box>
                ))}
                {filtered.length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    No matches for &quot;{query}&quot;.
                  </Typography>
                )}
              </Box>
            </>
          )}
        </Box>
      )}
    </Paper>
  );
}
