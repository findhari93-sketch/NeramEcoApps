'use client';

/**
 * Pick the videos students should watch before a class.
 *
 * One search over two shelves: recordings of past Nexus classes (any classroom)
 * and the Library. Tapping a row toggles it; Done hands the whole selection
 * back. Nothing is saved here, so Cancel really cancels.
 *
 * Dialog on desktop, bottom drawer on mobile, like AddResourceFromClassDialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Drawer,
  InputAdornment,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { RADIUS } from '../timetable-theme';
import PrewatchVideoRow from './PrewatchVideoRow';
import { PREWATCH_MAX } from '@/lib/prewatch';
import { tokenize, type PrewatchCandidate } from '@/lib/prewatch-suggest';
import { fetchPrewatchCandidates, type PrewatchContext } from './prewatch-client';

type Shelf = 'recordings' | 'library';

interface PrewatchPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** What is picked now; the dialog edits a copy. */
  value: PrewatchCandidate[];
  onDone: (next: PrewatchCandidate[]) => void;
  context: PrewatchContext;
  getToken: () => Promise<string | null>;
}

export default function PrewatchPickerDialog({ open, onClose, value, onDone, context, getToken }: PrewatchPickerDialogProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [draft, setDraft] = useState<PrewatchCandidate[]>(value);
  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<Shelf>('recordings');
  const [lists, setLists] = useState<{ recordings: PrewatchCandidate[]; library: PrewatchCandidate[] }>({
    recordings: [],
    library: [],
  });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const contextRef = useRef(context);
  contextRef.current = context;
  // Held in a ref: callers often pass a fresh getToken each render, and as an
  // effect dependency that restarted (and aborted) the search forever.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Start each visit from what is picked now, searching for the class title.
  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setQuery(context.q || '');
    setShelf('recordings');
    // Only on open: re-seeding while the dialog is up would throw away taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const data = await fetchPrewatchCandidates({ ...contextRef.current, q: query }, () => getTokenRef.current(), controller.signal);
        setLists({ recordings: data.recordings, library: data.library });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [open, query]);

  const pickedKeys = useMemo(() => new Set(draft.map((d) => d.key)), [draft]);
  const full = draft.length >= PREWATCH_MAX;
  const shown = shelf === 'recordings' ? lists.recordings : lists.library;

  const toggle = (c: PrewatchCandidate) => {
    setDraft((prev) => {
      if (prev.some((p) => p.key === c.key)) return prev.filter((p) => p.key !== c.key);
      if (prev.length >= PREWATCH_MAX) return prev;
      return [...prev, c];
    });
  };

  // A dead end gets a next step: the shortest word in the search usually finds
  // more ("streets" -> "street" is already handled, "human figures" -> "human").
  const hint = (() => {
    const words = tokenize(query);
    if (words.length > 1) return `Try one word, like "${words[0]}".`;
    if (shelf === 'recordings') return 'Try the Library, or a shorter word.';
    return 'Try Past classes, or a shorter word.';
  })();

  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: { xs: '88vh', sm: 640 } }}>
      <Box sx={{ p: 2.5, pb: 1.5 }}>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>
          Videos to watch before class
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1.75 }}>
          Pick up to {PREWATCH_MAX}. Students watch them inside Nexus, and you can see who did.
        </Typography>

        <TextField
          fullWidth
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search past classes and the Library"
          inputProps={{ 'aria-label': 'Search past classes and the Library', enterKeyHint: 'search' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5, '& .MuiInputBase-root': { minHeight: 48, borderRadius: RADIUS.control, fontSize: 16 } }}
        />

        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={shelf}
          onChange={(_, v: Shelf | null) => v && setShelf(v)}
          aria-label="Where to look"
        >
          <ToggleButton value="recordings" sx={{ textTransform: 'none', minHeight: 44, fontWeight: 600 }}>
            Past classes
          </ToggleButton>
          <ToggleButton value="library" sx={{ textTransform: 'none', minHeight: 44, fontWeight: 600 }}>
            Library
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ px: 2.5, pb: 1, overflowY: 'auto', flex: 1, minHeight: 200 }} aria-busy={loading}>
        {loading && !shown.length ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={72} />
            ))}
          </Box>
        ) : failed ? (
          <EmptyNote>Could not load videos. Check your connection and search again.</EmptyNote>
        ) : shown.length ? (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {shown.map((c) => {
              const picked = pickedKeys.has(c.key);
              const blocked = !picked && full;
              return (
                <Box component="li" key={c.key}>
                  <PrewatchVideoRow
                    dense
                    selected={picked}
                    video={c}
                    trailing={
                      <Button
                        onClick={() => toggle(c)}
                        disabled={blocked}
                        aria-pressed={picked}
                        aria-label={`${picked ? 'Remove' : 'Add'} ${c.title}`}
                        variant={picked ? 'contained' : 'outlined'}
                        size="small"
                        sx={{ textTransform: 'none', minHeight: 44, minWidth: { xs: 44, sm: 96 }, px: { xs: 1, sm: 1.5 }, gap: 0.5, borderRadius: RADIUS.control }}
                      >
                        {picked ? <CheckCircleIcon fontSize="small" aria-hidden /> : <AddCircleOutlineIcon fontSize="small" aria-hidden />}
                        {/* Icon only on a phone, where the title needs the width. */}
                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                          {picked ? 'Added' : 'Add'}
                        </Box>
                      </Button>
                    }
                  />
                </Box>
              );
            })}
          </Box>
        ) : (
          <EmptyNote>
            {query.trim() ? `Nothing matches "${query.trim()}". ${hint}` : 'Type a topic to search.'}
          </EmptyNote>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
          pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', sm: 1.5 },
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} aria-live="polite">
          {draft.length} of {PREWATCH_MAX} picked{full ? '. Remove one to add another.' : ''}
        </Typography>
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            onDone(draft);
            onClose();
          }}
          sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control, fontWeight: 700 }}
        >
          Done
        </Button>
      </Box>
    </Box>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-label="Videos to watch before class">
        {body}
      </Dialog>
    );
  }
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      // A temporary Drawer sits at zIndex.drawer, under the Add Class dialog it
      // is opened from; lift it above any dialog.
      sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 }, 'aria-label': 'Videos to watch before class' } as any}
    >
      {body}
    </Drawer>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Box sx={{ border: `1px dashed ${theme.palette.divider}`, borderRadius: RADIUS.control, p: 2, textAlign: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </Box>
  );
}
