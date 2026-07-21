'use client';

// Custom sets are theme tags worn as named collections: "History of Architecture",
// "Islamic Architecture", a weekend-revision shortlist. Creating a set creates a
// theme tag; opening a set deep-links the Questions list filtered to that tag.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardActionArea,
  Chip,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  IconButton,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CollectionsBookmarkOutlinedIcon from '@mui/icons-material/CollectionsBookmarkOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBTagWithCount } from '@neram/database';

export default function CustomSetsPage() {
  const router = useRouter();
  const { getToken, isTeacher } = useNexusAuthContext();

  const [sets, setSets] = useState<NexusQBTagWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/tags?withCounts=1&group=theme', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to load sets');
      const json = await res.json();
      setSets(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sets');
      setSets([]);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function createSet() {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/tags', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_type: 'theme', label: newLabel.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to create set');
      setCreateOpen(false);
      setNewLabel('');
      setToast('Set created. Add questions to it from the Questions list.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create set');
    } finally {
      setBusy(false);
    }
  }

  if (!isTeacher) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Only teachers can manage custom sets.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <IconButton onClick={() => router.push('/teacher/question-bank')} aria-label="Back to Question Bank">
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Custom sets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Named question collections built from tags
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlinedIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: 'none', flexShrink: 0, minHeight: 40 }}
        >
          New set
        </Button>
      </Box>

      <Box sx={{ mt: 2 }}>
        {sets === null ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rectangular" height={88} sx={{ borderRadius: 2 }} />
            ))}
          </Box>
        ) : sets.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <CollectionsBookmarkOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              No custom sets yet. Create one, then tag questions into it from the Questions list.
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlinedIcon />}
              onClick={() => setCreateOpen(true)}
              sx={{ textTransform: 'none' }}
            >
              New set
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            {sets.map((s) => (
              <Card
                key={s.id}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  transition: 'border-color 150ms, box-shadow 150ms',
                  '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
                }}
              >
                <CardActionArea
                  onClick={() => router.push(`/teacher/question-bank/questions?tag_ids=${s.id}`)}
                  aria-label={`Open set ${s.label}`}
                  sx={{ p: 2, minHeight: 88, display: 'flex', alignItems: 'center', gap: 1.5 }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: (s.color || '#0EA5E9') + '1A',
                      color: s.color || '#0EA5E9',
                      flexShrink: 0,
                    }}
                  >
                    <CollectionsBookmarkOutlinedIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
                      {s.label}
                    </Typography>
                    <Chip
                      size="small"
                      label={`${s.question_count} question${s.question_count === 1 ? '' : 's'}`}
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem', mt: 0.5 }}
                    />
                  </Box>
                  <ChevronRightOutlinedIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
                </CardActionArea>
              </Card>
            ))}
          </Box>
        )}
      </Box>

      <Dialog open={createOpen} onClose={() => !busy && setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>New custom set</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A set is a named tag. After creating it, select questions in the Questions list and use Add tags to fill it.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Set name"
            placeholder="e.g. History of Architecture"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} disabled={busy} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={createSet}
            disabled={busy || !newLabel.trim()}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={4000} onClose={() => setError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
