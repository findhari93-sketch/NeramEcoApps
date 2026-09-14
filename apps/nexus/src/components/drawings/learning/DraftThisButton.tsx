'use client';

/**
 * Where Gemini's draft stands, in one line above the scores.
 *
 * Drafts start on their own now (the student's submit, the queue sweep, or this
 * screen opening), so there is no button to press in the normal case. This line
 * only speaks when there is something to say: it is drafting, it could not, it
 * is switched off, or the budget is spent. With a draft on screen it offers
 * "Draft again" and nothing else.
 *
 * It used to be a disabled "Draft this" button over a sentence about brief
 * types, band wording and reference sheets, which told a teacher neither what
 * the button was for nor what to do about it.
 */

import { Box, Button, LinearProgress, Typography } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import type { AutoDraftState } from '@/hooks/useAutoDraft';

export default function DraftThisButton({ state }: { state: AutoDraftState }) {
  const { phase, message, draftAgain } = state;
  if (phase === 'idle') return null;

  if (phase === 'ready') {
    return (
      <Box data-testid="draft-this" sx={{ display: 'flex', justifyContent: 'flex-end', mt: -0.5, mb: 0.5 }}>
        <Button
          size="small"
          onClick={draftAgain}
          startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
        >
          Draft again
        </Button>
      </Box>
    );
  }

  return (
    // aria-live, not role="status": the overall score already owns that role and
    // tests (and screen readers) expect exactly one on the rail.
    <Box data-testid="draft-this" aria-live="polite" sx={{ mb: 1 }}>
      {phase === 'drafting' ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AutoAwesomeOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} aria-hidden />
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.dark' }}>
              Gemini is drafting scores and feedback
            </Typography>
          </Box>
          <LinearProgress aria-hidden sx={{ mt: 0.5, height: 3, borderRadius: 2 }} />
        </>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <AutoAwesomeOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} aria-hidden />
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
            {message}
          </Typography>
          {phase === 'failed' && (
            <Button size="small" onClick={draftAgain} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
              Try again
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
