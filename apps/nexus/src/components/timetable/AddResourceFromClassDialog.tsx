'use client';

/**
 * Reuse something you shared before.
 *
 * The same explainer video is right for the same topic every year, so retyping
 * it every time is the wrong answer. This lists what this teacher has attached
 * to other classes, newest first, and copies the chosen one onto this class.
 *
 * Scoped to the signed-in teacher's own material on purpose: it is a shortcut
 * through their own history, not a browsable library of everyone's.
 *
 * Dialog on desktop, bottom drawer on mobile, matching LinkAssignmentDialog.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  Drawer,
  InputAdornment,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import { RADIUS } from './timetable-theme';
import ResourceCard from './ResourceCard';
import type { ClassResource } from '@/lib/class-resources';

/** A candidate carries the class it came from, so the teacher can place it. */
interface Candidate extends ClassResource {
  cls?: { id: string; title: string; scheduled_date: string } | null;
}

interface AddResourceFromClassDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  getToken: () => Promise<string | null>;
  onAdded: (resource: ClassResource) => void;
  onNotify?: (message: string, severity?: 'success' | 'error') => void;
}

export default function AddResourceFromClassDialog({
  open,
  onClose,
  classId,
  getToken,
  onAdded,
  onNotify,
}: AddResourceFromClassDialogProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/timetable/${classId}/resources?library=1&q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.candidates || []);
      }
    } catch {
      /* the empty state covers this */
    } finally {
      setLoading(false);
    }
  }, [open, classId, getToken, query]);

  // Debounced, so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const copy = async (candidate: Candidate) => {
    setBusyId(candidate.id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ copy_from: candidate.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onAdded(data.resource);
        onClose();
      } else {
        onNotify?.(data.error || 'Could not add that', 'error');
      }
    } catch {
      onNotify?.('Could not add that', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const body = (
    <Box sx={{ p: 2.5, maxHeight: { xs: '80vh', sm: 560 }, overflow: 'auto' }}>
      <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 0.5 }}>
        Add from another class
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.75 }}>
        Material you have shared before. Picking one copies it onto this class.
      </Typography>

      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title"
        inputProps={{ 'aria-label': 'Search your past reference material' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1.75, '& .MuiInputBase-root': { minHeight: 48, borderRadius: RADIUS.control } }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={20} />
        </Box>
      ) : items.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((candidate) => (
            <Box key={candidate.id}>
              <ResourceCard resource={candidate} onOpen={() => copy(candidate)} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, pl: 0.5 }}>
                <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }} noWrap>
                  {candidate.cls?.title ? `Used in ${candidate.cls.title}` : 'From an earlier class'}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busyId !== null}
                  onClick={() => copy(candidate)}
                  sx={{ textTransform: 'none', minHeight: 40, borderRadius: RADIUS.control }}
                >
                  {busyId === candidate.id ? 'Adding' : 'Add'}
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.control,
            p: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {query
              ? 'Nothing of yours matches that.'
              : 'Once you add material to a class, it shows up here for the next one.'}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          onClick={onClose}
          sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
        >
          Close
        </Button>
      </Box>
    </Box>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        {body}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
    >
      {body}
    </Drawer>
  );
}
