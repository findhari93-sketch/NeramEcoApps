'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  IconButton,
  Skeleton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloseIcon from '@mui/icons-material/Close';
import type { InspirationCard } from '@/lib/inspiration-present';
import FigureViewer from './FigureViewer';

/**
 * "See how others drew this."
 *
 * The founder's reasoning, which shapes every decision here: in the exam a
 * student gets a question they have never seen and has to start from nothing,
 * so drawing blind is the skill being built. But a student who has never seen
 * what a good answer looks like may not pick up the pencil at all. So the door
 * is open, it sits behind their own upload by default, and whichever way they
 * came through it is written on the drawing they make afterwards.
 *
 * Nothing is fetched until the button is pressed. A drawing question opened is
 * not a drawing question compared, and most students open far more than they
 * look through. The count arrives with the same call, so the locked state can
 * say "four people have drawn this" without showing anyone's drawing.
 *
 * Who may see whose work is decided in SQL (nexus_qb_peer_attempts over
 * nexus_inspiration_base) and what may be said about it in presentRow. Neither
 * is re-derived here.
 */

interface PeerPayload {
  locked: boolean;
  total: number;
  items: InspirationCard[];
}

interface Props {
  questionId: string;
  /** Which option of an "any one of N" drawing. Peers of 81B drew 81B. */
  partKey?: string | null;
  /** From the server's drawing state. The server decides again on every call. */
  unlocked: boolean;
  /** Record that the student chose to look before drawing, then reload. */
  onReveal: () => void;
  getToken: () => Promise<string | null>;
}

const SKELETONS = 4;

function peopleWord(n: number): string {
  return n === 1 ? '1 student has drawn this' : `${n} students have drawn this`;
}

export default function PeerAttempts({ questionId, partKey, unlocked, onReveal, getToken }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PeerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<InspirationCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${questionId}/peer-attempts?part=${encodeURIComponent(partKey ?? '')}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error('Could not load other students work');
      const json = await res.json();
      setData(json.data as PeerPayload);
    } catch (err) {
      console.error('[QB peer attempts]', err);
      setError('Could not load other students work just now.');
    } finally {
      setLoading(false);
    }
  }, [questionId, partKey, getToken]);

  // Refetches when the student unlocks it, which is what turns the locked panel
  // into the drawings without them pressing anything a second time.
  useEffect(() => {
    if (open) void load();
  }, [open, unlocked, load]);

  const close = () => {
    setOpen(false);
    setZoom(null);
  };

  return (
    <>
      <Button
        variant="outlined"
        fullWidth
        startIcon={unlocked ? <GroupsOutlinedIcon /> : <LockOutlinedIcon />}
        onClick={() => setOpen(true)}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
      >
        See how others drew this
      </Button>

      <Dialog
        open={open}
        onClose={close}
        fullScreen={fullScreen}
        maxWidth="md"
        fullWidth
        PaperProps={{ 'aria-label': 'How other students drew this' } as object}
      >
        <DialogTitle sx={{ pr: 7 }}>
          How others drew this
          <IconButton
            onClick={close}
            aria-label="Close"
            sx={{ position: 'absolute', right: 8, top: 8, width: 44, height: 44 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {error && <Alert severity="error">{error}</Alert>}

          {loading && !data && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
                gap: 1.5,
              }}
            >
              {Array.from({ length: SKELETONS }).map((_, i) => (
                <Skeleton key={i} variant="rounded" sx={{ aspectRatio: '1', height: 'auto', borderRadius: 1.5 }} />
              ))}
            </Box>
          )}

          {!loading && data && data.total === 0 && (
            <EmptyState
              title="Nobody has drawn this one yet"
              description="Draw it and put it up. Yours will be the first one here for the rest of the class."
              icon={<GroupsOutlinedIcon />}
            />
          )}

          {!loading && data && data.total > 0 && data.locked && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <LockOutlinedIcon sx={{ color: 'text.disabled', mb: 1 }} />
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                {peopleWord(data.total)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, mx: 'auto', mb: 2 }}>
                Upload your own attempt and these open up on their own. You can also look now: your
                teacher will see that you looked first, and that is fine. In the exam the question
                will be one you have never seen, so it is worth trying one on your own first.
              </Typography>
              <Button
                variant="contained"
                onClick={onReveal}
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
              >
                Show me anyway
              </Button>
            </Box>
          )}

          {!loading && data && !data.locked && data.items.length > 0 && (
            <Box
              component="ul"
              sx={{
                listStyle: 'none',
                p: 0,
                m: 0,
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
                gap: 1.5,
              }}
            >
              {data.items.map((card) => (
                <Box component="li" key={card.id} sx={{ minWidth: 0 }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setZoom(card)}
                    aria-label={`${card.alt}, look closer`}
                    sx={{
                      display: 'block',
                      width: '100%',
                      p: 0,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      overflow: 'hidden',
                      // The drawings are photographs of paper, so white behind
                      // them rather than the card colour.
                      bgcolor: 'common.white',
                      cursor: 'zoom-in',
                      '&:focus-visible': {
                        outline: '3px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <Box
                      component="img"
                      src={card.thumbnailUrl ?? card.imageUrl}
                      alt={card.alt}
                      loading="lazy"
                      sx={{ display: 'block', width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {card.credit}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {zoom && (
        <FigureViewer
          open
          onClose={() => setZoom(null)}
          src={zoom.imageUrl}
          label={zoom.alt}
          caption={zoom.credit}
        />
      )}
    </>
  );
}
