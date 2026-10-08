'use client';

/**
 * Where this drawing stands on the Inspiration shelf, in one line under Feature.
 *
 * This used to be a switch in the action bar, far from Feature, and it read as a
 * second way of doing the same thing. It is not: Feature is the celebration (a
 * class post, the student told, and the shelf), the shelf on its own is quiet.
 * So the shelf is now a status that Feature visibly changes, and choosing it by
 * hand is a "Change" away, for the rare drawing that should be on the shelf
 * without a post, or kept off it at 4 stars.
 *
 * Automatic by default: the drawing is on once it is rated 4 stars and above (or
 * 80% of the marks). A sketch is never scored, so for a sketch the rule never
 * fires and Automatic means off until it is featured; the words say so rather
 * than promising stars a sketch cannot have. A hand choice pins it; Automatic
 * hands it back to the rule.
 * It saves at once rather than with the review, because the Inspiration item
 * lives on its own row and nothing is sent to the student.
 */

import { useState } from 'react';
import {
  Alert, Box, Button, Drawer, FormControlLabel, Radio, RadioGroup, Typography,
} from '@neram/ui';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import type { SubmissionInspirationState } from '@neram/database/queries/nexus';
import { patchItem } from '@/components/inspiration/inspiration-api';

type Curation = SubmissionInspirationState['curation'];

interface InspirationStatusProps {
  state: SubmissionInspirationState;
  /** Featured in a class: the line says the shelf came with it. */
  featured?: boolean;
  /** False for a sketch, which carries no stars, so the 4-star rule never applies. */
  graded?: boolean;
  getToken: () => Promise<string | null>;
  onChange: (next: SubmissionInspirationState) => void;
}

/** The one line, from the item's state and whether it is featured. */
export function inspirationLine(state: SubmissionInspirationState, featured: boolean, graded = true): string {
  if (featured) {
    return state.visible
      ? 'Featured: posted to your class and on the Inspiration shelf'
      : 'Featured, but kept off the Inspiration shelf';
  }
  if (state.curation === 'shown') return 'On the Inspiration shelf (set by you)';
  if (state.curation === 'hidden') return 'Kept off the Inspiration shelf (set by you)';
  if (!graded) {
    return state.visible ? 'On the Inspiration shelf' : 'Not on the Inspiration shelf (a sketch goes on when you feature it)';
  }
  return state.visible
    ? 'On the Inspiration shelf (automatic at 4 stars)'
    : 'Not on the Inspiration shelf (goes on automatically at 4 stars)';
}

function choices(graded: boolean): Array<{ value: Curation; label: string; hint: string }> {
  return [
    { value: 'auto', label: 'Automatic', hint: graded ? 'On the shelf at 4 stars and above' : 'Off the shelf until you feature it' },
    { value: 'shown', label: 'Always show', hint: graded ? 'On the shelf whatever the rating' : 'On the shelf without a class post' },
    { value: 'hidden', label: 'Never show', hint: 'Kept off the shelf, even if featured' },
  ];
}

export default function InspirationStatus({ state, featured = false, graded = true, getToken, onChange }: InspirationStatusProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = async (curation: Curation) => {
    if (curation === state.curation) { setOpen(false); return; }
    setBusy(true);
    setError('');
    try {
      await patchItem(getToken, state.item_id, { curation });
      const visible = curation === 'shown' ? true : curation === 'hidden' ? false : state.auto_eligible;
      onChange({ ...state, curation, visible });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change Inspiration');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <Box aria-hidden sx={{ color: 'text.secondary', display: 'flex' }}>
          <CollectionsOutlinedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
          {inspirationLine(state, featured, graded)}
        </Typography>
        <Button
          size="small"
          variant="text"
          onClick={() => { setError(''); setOpen(true); }}
          aria-label="Change Inspiration shelf setting"
          sx={{ minHeight: 44, minWidth: 0, px: 1, textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
        >
          Change
        </Button>
      </Box>

      <Drawer
        anchor="bottom"
        open={open}
        onClose={busy ? undefined : () => setOpen(false)}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))', maxWidth: 560, mx: 'auto' } }}
      >
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 2 }} aria-hidden />
        <Typography variant="h6" component="h2" sx={{ mb: 0.5 }} id="inspiration-shelf-title">Inspiration shelf</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Every student can browse the shelf. Nothing is sent to the student. Feature also puts a drawing here.
        </Typography>
        <RadioGroup
          aria-labelledby="inspiration-shelf-title"
          value={state.curation}
          onChange={(e) => void choose(e.target.value as Curation)}
        >
          {choices(graded).map((c) => (
            <FormControlLabel
              key={c.value}
              value={c.value}
              disabled={busy}
              control={<Radio />}
              sx={{ minHeight: 56, mx: 0, alignItems: 'center' }}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={600}>{c.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{c.hint}</Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
        {error && <Alert severity="error" role="alert" sx={{ mt: 1 }}>{error}</Alert>}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button onClick={() => setOpen(false)} disabled={busy} sx={{ minHeight: 48 }}>Done</Button>
        </Box>
      </Drawer>
    </>
  );
}
