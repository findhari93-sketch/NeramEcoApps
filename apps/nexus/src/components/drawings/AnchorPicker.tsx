'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Typography,
} from '@neram/ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import StudentAvatar from '@/components/students/StudentAvatar';

export interface AnchorRow {
  id: string;
  band: number;
  submission_id: string | null;
  image_url: string;
  comment: string | null;
}

interface Candidate {
  id: string;
  original_image_url: string;
  tutor_rating: number | null;
  reviewed_at: string | null;
  student?: { id: string; name: string | null } | null;
}

interface AnchorPickerProps {
  briefTypeKey: string;
  briefTypeTitle: string;
  anchors: AnchorRow[];
  getToken: () => Promise<string | null>;
  onChanged: () => void;
}

const BANDS = [1, 2, 3, 4, 5];

/**
 * Short labels borrowed from RATING_LABELS, which is the vocabulary already on
 * the review screen. Using different words here would quietly invent a second
 * scale.
 */
const BAND_LABELS: Record<number, string> = {
  1: 'Needs Work',
  2: 'Below Average',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

/**
 * The five graded sheets a brief type is scored against.
 *
 * Every later evaluation of this brief type is expressed as a position between
 * these five, so this screen is the instrument itself rather than a setting.
 * It is built to make the gaps obvious: a missing band blocks evaluation
 * entirely, and band 1 in particular has no candidates anywhere in the graded
 * history, so an empty list there is expected and says so rather than looking
 * like a failed load.
 */
export default function AnchorPicker({
  briefTypeKey,
  briefTypeTitle,
  anchors,
  getToken,
  onChanged,
}: AnchorPickerProps) {
  const [pickingBand, setPickingBand] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const byBand = new Map(anchors.map((a) => [a.band, a]));

  const loadCandidates = useCallback(
    async (band: number) => {
      setLoading(true);
      setError('');
      setCandidates([]);
      try {
        const token = await getToken();
        if (!token) throw new Error('Your session expired. Please refresh and try again.');
        const res = await fetch(
          `/api/drawing/anchors/candidates?brief_type=${encodeURIComponent(briefTypeKey)}&band=${band}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Could not load sheets');
        setCandidates(json.candidates || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load sheets');
      } finally {
        setLoading(false);
      }
    },
    [briefTypeKey, getToken],
  );

  useEffect(() => {
    if (pickingBand !== null) void loadCandidates(pickingBand);
  }, [pickingBand, loadCandidates]);

  const chooseSheet = async (submissionId: string) => {
    if (pickingBand === null) return;
    setSaving(submissionId);
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Please refresh and try again.');
      const res = await fetch('/api/drawing/anchors', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief_type_key: briefTypeKey,
          band: pickingBand,
          submission_id: submissionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not save the anchor');
      setPickingBand(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the anchor');
    } finally {
      setSaving(null);
    }
  };

  const removeAnchor = async (anchorId: string) => {
    setSaving(anchorId);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Please refresh and try again.');
      const res = await fetch(`/api/drawing/anchors?id=${encodeURIComponent(anchorId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not remove the anchor');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the anchor');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          // One column on a phone so each sheet is big enough to judge, which
          // is the entire task here. Five across only once there is room.
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
          gap: 1.5,
        }}
      >
        {BANDS.map((band) => {
          const anchor = byBand.get(band);
          return (
            <Box
              key={band}
              sx={{
                border: '1px solid',
                borderColor: anchor ? 'divider' : 'warning.light',
                borderRadius: 2,
                overflow: 'hidden',
                // Derived from the palette rather than a 'warning.50' key:
                // this theme defines only main/light/dark, so that key resolves
                // to nothing and the empty slot would lose its tint.
                bgcolor: anchor
                  ? 'background.paper'
                  : (t) => alpha(t.palette.warning.main, 0.08),
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Band {band}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {BAND_LABELS[band]}
                  </Typography>
                </Box>
                {anchor && (
                  <IconButton
                    size="small"
                    aria-label={`Remove the band ${band} reference sheet`}
                    onClick={() => removeAnchor(anchor.id)}
                    disabled={saving === anchor.id}
                    sx={{ width: 40, height: 40 }}
                  >
                    {saving === anchor.id ? (
                      <CircularProgress size={16} />
                    ) : (
                      <DeleteOutlineIcon fontSize="small" />
                    )}
                  </IconButton>
                )}
              </Box>

              {anchor ? (
                <Box
                  component="img"
                  src={anchor.image_url}
                  alt={`Band ${band} reference sheet for ${briefTypeTitle}`}
                  sx={{
                    width: '100%',
                    height: 160,
                    objectFit: 'contain',
                    bgcolor: 'grey.100',
                    display: 'block',
                  }}
                />
              ) : (
                <Button
                  onClick={() => setPickingBand(band)}
                  startIcon={<AddPhotoAlternateOutlinedIcon />}
                  sx={{
                    height: 160,
                    flexDirection: 'column',
                    gap: 0.5,
                    borderRadius: 0,
                    color: 'text.secondary',
                    textTransform: 'none',
                  }}
                >
                  <Typography variant="body2">Choose a band {band} sheet</Typography>
                </Button>
              )}

              {anchor && (
                <Button
                  size="small"
                  onClick={() => setPickingBand(band)}
                  sx={{ minHeight: 48, borderRadius: 0, textTransform: 'none' }}
                >
                  Replace
                </Button>
              )}
            </Box>
          );
        })}
      </Box>

      {error && !pickingBand && (
        <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
          {error}
        </Typography>
      )}

      <Dialog
        open={pickingBand !== null}
        onClose={() => setPickingBand(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box>
            <Typography variant="h6" component="span">
              Band {pickingBand} reference
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {briefTypeTitle}. Sheets you previously rated {pickingBand}.
            </Typography>
          </Box>
          <IconButton
            onClick={() => setPickingBand(null)}
            aria-label="Close"
            sx={{ width: 48, height: 48 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {loading && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} variant="rectangular" height={150} sx={{ borderRadius: 1 }} />
              ))}
            </Box>
          )}

          {!loading && error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}

          {!loading && !error && candidates.length === 0 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body1" fontWeight={600} gutterBottom>
                No sheet has been rated {pickingBand} for this brief.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460, mx: 'auto' }}>
                {pickingBand === 1
                  ? 'Nothing in the graded history was ever rated 1, so this band needs a sheet picked deliberately from the pending queue.'
                  : 'Grade a sheet at this level first, then come back and it will appear here.'}
              </Typography>
            </Box>
          )}

          {!loading && candidates.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {candidates.map((c) => (
                <Box
                  key={c.id}
                  onClick={() => chooseSheet(c.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Use ${c.student?.name || 'this sheet'} as the band ${pickingBand} reference`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void chooseSheet(c.id);
                    }
                  }}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  <Box
                    component="img"
                    src={c.original_image_url}
                    alt={`Sheet by ${c.student?.name || 'a student'}`}
                    loading="lazy"
                    sx={{ width: '100%', height: 150, objectFit: 'contain', bgcolor: 'grey.100', display: 'block' }}
                  />
                  <Box sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {/* A face beside the name, not just the name: picking an
                        anchor means recognising whose sheet it is, and the ring
                        carries the cohort the grade was given in. */}
                    <StudentAvatar
                      userId={c.student?.id}
                      name={c.student?.name}
                      size={22}
                      showGlyph={false}
                    />
                    <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
                      {c.student?.name || 'Unknown'}
                    </Typography>
                    <Chip size="small" label={c.tutor_rating ?? '?'} sx={{ height: 20, fontSize: '0.7rem' }} />
                  </Box>
                  {saving === c.id && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'rgba(255,255,255,0.7)',
                      }}
                    >
                      <CircularProgress size={22} />
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
