'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  EmptyState,
  Skeleton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import { readDrawingParts } from '@/lib/drawing-parts';
import StudentAvatar from '@/components/students/StudentAvatar';

/**
 * File drawings students already made under the bank question they answer.
 *
 * Students drew past paper questions long before the bank could record which
 * one, so "see how others drew this" finds nothing on questions several people
 * have actually drawn. Only a teacher who recognises the work can say which
 * question it was, so this is a teacher tool and never a guess.
 *
 * Multi-select and one action at the bottom, the same shape as the photo review
 * screen, because that is the only bulk-select-and-act screen in the app and a
 * teacher should not have to learn a second one.
 *
 * Nothing about the drawing changes except which question it answers. It stays
 * the student's sketch, with its own label and its own privacy.
 */

interface Candidate {
  id: string;
  original_image_url: string | null;
  thumbnail_url: string | null;
  source_type: string;
  submitted_at: string;
  student: { id: string; name: string | null; avatar_url: string | null } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  questionId: string;
  /** The question's raw drawing_parts, so an "any one of two" can be filed per option. */
  drawingParts?: unknown;
  questionLabel?: string;
  getToken: () => Promise<string | null>;
  onLinked?: () => void;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

export default function LinkPastDrawingsDialog({
  open,
  onClose,
  questionId,
  drawingParts,
  questionLabel,
  getToken,
  onLinked,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Only an "attempt any one of N" question is filed per option. Parts that are
  // all compulsory are one task with one drawing, so there is nothing to pick.
  const parts = useMemo(() => {
    const read = readDrawingParts(drawingParts);
    return read && read.mode === 'any_one' ? read : null;
  }, [drawingParts]);
  const [partKey, setPartKey] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const query = new URLSearchParams({ part: partKey });
      if (search.trim()) query.set('q', search.trim());
      const res = await fetch(
        `/api/question-bank/questions/${questionId}/link-drawings?${query.toString()}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error('Could not load drawings');
      const json = await res.json();
      setItems((json.data?.items || []) as Candidate[]);
    } catch (err) {
      console.error('[QB link drawings]', err);
      setError('Could not load drawings just now.');
    } finally {
      setLoading(false);
    }
  }, [questionId, partKey, search, getToken]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, load, search]);

  useEffect(() => {
    if (!open) {
      setChosen(new Set());
      setDone(null);
      setSearch('');
    }
  }, [open]);

  const toggle = (id: string) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const link = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/questions/${questionId}/link-drawings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ submission_ids: Array.from(chosen), part: partKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not link those drawings');
      const n = json.data?.linked ?? 0;
      setDone(n === 1 ? '1 drawing filed under this question.' : `${n} drawings filed under this question.`);
      setChosen(new Set());
      onLinked?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link those drawings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="md"
      fullWidth
      PaperProps={{ 'aria-label': 'Link past drawings to this question' } as object}
    >
      <DialogTitle>
        Link past drawings
        {questionLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {questionLabel}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Pick drawings students already made for this question. They stay in the student own
          sketchbook and keep their own label. All that changes is which question they answer, so
          they show up under it for everyone practising.
        </Typography>

        {parts && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
              WHICH OPTION DID THEY DRAW?
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {parts.items.map((part) => {
                const key = part.key || part.id;
                return (
                  <Chip
                    key={key}
                    label={`Option ${part.label}`}
                    onClick={() => setPartKey(key)}
                    color={partKey === key ? 'primary' : 'default'}
                    variant={partKey === key ? 'filled' : 'outlined'}
                    sx={{ height: 36 }}
                  />
                );
              })}
              <Chip
                label="Not sure"
                onClick={() => setPartKey('')}
                color={partKey === '' ? 'primary' : 'default'}
                variant={partKey === '' ? 'filled' : 'outlined'}
                sx={{ height: 36 }}
              />
            </Box>
          </Box>
        )}

        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student name"
          InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.disabled' }} /> }}
          sx={{ mb: 2, '& .MuiInputBase-root': { minHeight: 48 } }}
        />

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {done && <Alert severity="success" sx={{ mb: 2 }}>{done}</Alert>}

        {loading ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" sx={{ aspectRatio: '1', height: 'auto', borderRadius: 1.5 }} />
            ))}
          </Box>
        ) : items.length === 0 ? (
          <EmptyState
            title={search ? 'No drawings by that name' : 'Nothing left to file here'}
            description={
              search
                ? 'Try part of a first name.'
                : 'Every practice drawing is either filed under this question already or belongs to an assignment.'
            }
            icon={<CollectionsOutlinedIcon />}
          />
        ) : (
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              p: 0,
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
              gap: 1.5,
            }}
          >
            {items.map((item) => {
              const picked = chosen.has(item.id);
              const who = item.student?.name || 'A student';
              return (
                <Box component="li" key={item.id} sx={{ minWidth: 0 }}>
                  <Box
                    component="button"
                    type="button"
                    role="checkbox"
                    aria-checked={picked}
                    onClick={() => toggle(item.id)}
                    aria-label={`${who}, ${shortDate(item.submitted_at)}`}
                    sx={{
                      position: 'relative',
                      display: 'block',
                      width: '100%',
                      p: 0,
                      border: '2px solid',
                      borderColor: picked ? 'primary.main' : 'divider',
                      borderRadius: 1.5,
                      overflow: 'hidden',
                      bgcolor: 'common.white',
                      cursor: 'pointer',
                      '&:focus-visible': {
                        outline: '3px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <Box
                      component="img"
                      src={item.thumbnail_url || item.original_image_url || ''}
                      alt=""
                      loading="lazy"
                      sx={{ display: 'block', width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                    />
                    {picked && (
                      <CheckCircleIcon
                        aria-hidden
                        sx={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          color: 'primary.main',
                          bgcolor: 'common.white',
                          borderRadius: '50%',
                        }}
                      />
                    )}
                  </Box>
                  {/* A face, not just a name: a teacher deciding which sheets
                      belong to this question scans a grid, and the info ring
                      tells them who they are looking at faster than reading
                      does. */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, minWidth: 0 }}>
                    <StudentAvatar
                      userId={item.student?.id ?? null}
                      name={item.student?.name ?? null}
                      size={24}
                      src={item.student?.avatar_url ?? null}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {who}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {shortDate(item.submitted_at)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>
          Done
        </Button>
        <Button
          variant="contained"
          disabled={chosen.size === 0 || saving}
          onClick={link}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
        >
          {saving
            ? 'Filing...'
            : chosen.size === 1
              ? 'File 1 drawing here'
              : `File ${chosen.size} drawings here`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
