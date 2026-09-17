'use client';

/**
 * Show in Inspiration, for the student's own drawing.
 *
 * Automatic by default: the drawing is in once it is rated 4 stars and above
 * (or 80% of the marks). Switching it on or off by hand pins that choice, and
 * "Use automatic" hands it back to the rule. It saves at once rather than with
 * the review, because the Inspiration item lives on its own row.
 */

import { useState } from 'react';
import { Box, Button, IconButton, Switch, Typography } from '@neram/ui';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import type { SubmissionInspirationState } from '@neram/database/queries/nexus';
import { patchItem } from '@/components/inspiration/inspiration-api';

interface InspirationSwitchProps {
  state: SubmissionInspirationState;
  getToken: () => Promise<string | null>;
  onChange: (next: SubmissionInspirationState) => void;
}

export default function InspirationSwitch({ state, getToken, onChange }: InspirationSwitchProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = async (curation: SubmissionInspirationState['curation']) => {
    setBusy(true);
    setError('');
    try {
      await patchItem(getToken, state.item_id, { curation });
      const visible = curation === 'shown' ? true : curation === 'hidden' ? false : state.auto_eligible;
      onChange({ ...state, curation, visible });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change Inspiration');
    } finally {
      setBusy(false);
    }
  };

  const manual = state.curation !== 'auto';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: { xs: 'inline', md: 'none' }, fontWeight: 600 }}>
        Inspiration
      </Typography>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'inline' }, fontWeight: 600 }}>
        Show in Inspiration
      </Typography>
      <Switch
        checked={state.visible}
        disabled={busy}
        onChange={(e) => void set(e.target.checked ? 'shown' : 'hidden')}
        size="small"
        inputProps={{ 'aria-label': 'Show in Inspiration' }}
      />
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'inline' } }}>
        {manual ? 'Set by you.' : 'Automatic at 4 stars and above.'}
      </Typography>
      {manual && (
        <>
          <IconButton
            size="small"
            disabled={busy}
            onClick={() => void set('auto')}
            aria-label="Use the automatic Inspiration rule"
            sx={{ width: 44, height: 44, display: { xs: 'inline-flex', md: 'none' } }}
          >
            <AutorenewIcon fontSize="small" />
          </IconButton>
          <Button
            size="small"
            variant="text"
            disabled={busy}
            onClick={() => void set('auto')}
            sx={{ minHeight: 44, textTransform: 'none', display: { xs: 'none', md: 'inline-flex' } }}
          >
            Use automatic
          </Button>
        </>
      )}
      {error && (
        <Typography role="alert" variant="caption" color="error" sx={{ width: '100%', textAlign: 'right' }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
