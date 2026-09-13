'use client';

/**
 * "Why the 2?" asked inline, under the criterion that disagrees.
 *
 * Inline, not a modal, on purpose. Scoring is a keyboard queue job: a dialog
 * would steal focus from the number keys on every disagreement and teach the
 * teacher to dismiss it unread. Here the question waits beside the score, one
 * tap answers it, and pressing on to the next criterion simply leaves it.
 *
 * One tap records a reason. Typing is for the sentence that describes the band
 * in the teacher's own words, which is the most valuable thing this collects.
 */

import { useState } from 'react';
import NextLink from 'next/link';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography, alpha, useTheme } from '@neram/ui';
import { REASONS, promptFor, type ReasonCode, type Reference } from '@/lib/drawing-teaching-moment';
import type { Band } from '@/lib/drawing-rubric';

export interface CorrectionResult {
  rule: { id: string; text: string } | null;
  matches: string[];
}

export interface NotedReason {
  label: string;
  rule: { id: string; text: string } | null;
  matches: string[];
}

interface Props {
  criterionTitle: string;
  finalBand: Band;
  reference: Reference;
  noted: NotedReason | null;
  onSubmit: (input: { reason_code: ReasonCode; reason_text: string | null; remember: boolean }) => Promise<CorrectionResult>;
  onSkip: () => void;
  onReopen: () => void;
  onShowMatches: (ids: string[]) => void;
}

export default function TeachingMomentCard({ criterionTitle, finalBand, reference, noted, onSubmit, onSkip, onReopen, onShowMatches }: Props) {
  const theme = useTheme();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState<ReasonCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (reason_code: ReasonCode, reason_text: string | null) => {
    setBusy(reason_code);
    setError(null);
    try {
      await onSubmit({ reason_code, reason_text, remember });
      setTyping(false);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that reason');
    } finally {
      setBusy(null);
    }
  };

  if (noted) {
    return (
      <Box data-testid="teaching-moment-noted" sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
          Reason noted: {noted.label}.{noted.rule ? ' Kept as a rule.' : ''}
        </Typography>
        {noted.rule && (
          <Typography
            component={NextLink}
            href="/teacher/drawing-reviews/profile"
            variant="caption"
            sx={{ color: 'primary.main', fontWeight: 600, minHeight: 32, display: 'inline-flex', alignItems: 'center' }}
          >
            Your rules
          </Typography>
        )}
        {noted.matches.length > 0 && (
          <Button size="small" variant="outlined" onClick={() => onShowMatches(noted.matches)} sx={{ minHeight: 36, textTransform: 'none' }}>
            Show me the {noted.matches.length}
          </Button>
        )}
        <Button size="small" onClick={onReopen} sx={{ minHeight: 36, textTransform: 'none', ml: 'auto' }}>
          Change
        </Button>
      </Box>
    );
  }

  return (
    <Box
      role="group"
      aria-label={`Why ${finalBand} for ${criterionTitle}`}
      data-testid="teaching-moment"
      sx={{
        mt: 0.75,
        p: 1,
        borderRadius: 1.5,
        borderLeft: '3px solid',
        borderLeftColor: 'primary.main',
        bgcolor: alpha(theme.palette.primary.main, 0.05),
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
            Why the {finalBand}?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {promptFor(finalBand, reference)} Your reason teaches the grading, and a typed one can become this band&apos;s description.
          </Typography>
        </Box>
        <Button size="small" onClick={onSkip} sx={{ minHeight: 36, minWidth: 0, textTransform: 'none', flexShrink: 0 }}>
          Skip
        </Button>
      </Stack>

      <FormControlLabel
        sx={{ mt: 0.25, ml: -0.75, '& .MuiFormControlLabel-label': { fontSize: 12 } }}
        control={<Checkbox size="small" checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
        label="Keep this as a rule for next time"
      />

      <Stack spacing={0.5} sx={{ mt: 0.25 }}>
        {REASONS.map((reason) => (
          <Button
            key={reason.code}
            variant="outlined"
            size="small"
            disabled={!!busy}
            onClick={() => submit(reason.code, null)}
            sx={{
              minHeight: 44,
              justifyContent: 'flex-start',
              textAlign: 'left',
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 500,
              bgcolor: 'background.paper',
              lineHeight: 1.3,
            }}
          >
            {busy === reason.code && <CircularProgress size={14} sx={{ mr: 1 }} />}
            {reason.label}
          </Button>
        ))}

        {typing ? (
          <Box>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={2}
              size="small"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 400))}
              placeholder={`What makes this a ${finalBand} for ${criterionTitle.toLowerCase()}?`}
              inputProps={{ 'aria-label': `Your reason for ${finalBand}`, style: { fontSize: 16 } }}
              sx={{ bgcolor: 'background.paper' }}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Button
                size="small"
                variant="contained"
                disabled={text.trim().length < 3 || !!busy}
                onClick={() => submit('other', text.trim())}
                sx={{ minHeight: 40, textTransform: 'none' }}
              >
                {busy === 'other' ? 'Saving' : 'Save reason'}
              </Button>
              <Button size="small" onClick={() => setTyping(false)} sx={{ minHeight: 40, textTransform: 'none' }}>
                Cancel
              </Button>
            </Stack>
          </Box>
        ) : (
          <Button
            size="small"
            onClick={() => setTyping(true)}
            disabled={!!busy}
            sx={{ minHeight: 44, justifyContent: 'flex-start', textTransform: 'none', fontSize: 13 }}
          >
            Type it
          </Button>
        )}
      </Stack>

      {error && (
        <Typography variant="caption" color="error" role="alert" sx={{ display: 'block', mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
