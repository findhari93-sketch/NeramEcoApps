'use client';

/**
 * "You left a test unfinished. What happened?"
 *
 * A bottom sheet on mobile, a dialog on desktop, following the app's standing
 * rule that a mobile choice is a sheet in the thumb zone rather than a modal in
 * the middle of the screen.
 *
 * WHY IT APPEARS HERE AND NOT WHERE THE TEST WAS ABANDONED. Abandoning happens
 * on page unload, through navigator.sendBeacon, where there is no UI, no promise
 * to await and no chance to ask a question. So the attempt is recorded first and
 * the question is put the next time the student opens Tests.
 *
 * WHY IT IS SKIPPABLE. The answer is worth having, not worth extracting. A modal
 * that cannot be dismissed would turn "I could not load question 12" into "I
 * stopped using Nexus", and the abandonment data we already have suggests these
 * are students who are struggling, not students who are avoiding us. "Not now"
 * is a first-class button, and taking it leaves the row exactly as it was.
 */

import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Radio,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { TEST_REASONS, testReasonRequiresNote, type TestReasonCode } from '@/lib/test-reasons';

export interface UnfinishedAttempt {
  attempt_id: string;
  test_id: string;
  title: string;
  stopped_at: string | null;
}

function whenPhrase(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function UnfinishedTestSheet({
  attempt,
  onDismiss,
  onSubmit,
}: {
  attempt: UnfinishedAttempt | null;
  onDismiss: () => void;
  onSubmit: (input: { attempt_id: string; reason_code: TestReasonCode; reason_note: string }) => Promise<void>;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [code, setCode] = useState<TestReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsNote = testReasonRequiresNote(code);
  const canSend = code !== null && (!needsNote || note.trim().length > 0) && !saving;

  function reset() {
    setCode(null);
    setNote('');
    setError(null);
    setSaving(false);
  }

  function dismiss() {
    reset();
    onDismiss();
  }

  async function send() {
    if (!attempt || !code) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ attempt_id: attempt.attempt_id, reason_code: code, reason_note: note.trim() });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Try again.');
      setSaving(false);
    }
  }

  const body = (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        You started <strong>{attempt?.title}</strong> {whenPhrase(attempt?.stopped_at ?? null)} and did not finish it.
        Telling your teacher why takes one tap, and it is the fastest way to get a broken test fixed.
      </Typography>

      <Box role="radiogroup" aria-label="What happened" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {TEST_REASONS.map((r) => {
          const selected = code === r.code;
          return (
            <Box
              key={r.code}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              onClick={() => setCode(r.code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCode(r.code);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1.5,
                cursor: 'pointer',
                // 48px, the Material 3 minimum. These are tapped on a phone by a
                // student who is already frustrated.
                minHeight: 48,
                border: 1,
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'action.selected' : 'transparent',
                transition: 'border-color 150ms, background-color 150ms',
              }}
            >
              <Radio checked={selected} size="small" tabIndex={-1} inputProps={{ 'aria-hidden': true }} />
              <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>
                {r.label}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {code && (
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          sx={{ mt: 2 }}
          label={needsNote ? 'What happened?' : 'Anything to add? (optional)'}
          placeholder={
            code === 'technical_problem'
              ? 'For example: question 12 never loaded, or the timer jumped to zero'
              : ''
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={needsNote}
          helperText={
            needsNote && note.trim().length === 0
              ? 'A sentence is enough. Without it your teacher cannot tell what broke.'
              : ' '
          }
          error={Boolean(error) && needsNote && note.trim().length === 0}
        />
      )}

      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
          {error}
        </Typography>
      )}
    </>
  );

  const actions = (
    <>
      {/* A first-class button, not a dismissive X. Nothing is lost by declining
          and the student should be able to see that. */}
      <Button onClick={dismiss} sx={{ textTransform: 'none', minHeight: 44 }}>
        Not now
      </Button>
      <Button variant="contained" onClick={send} disabled={!canSend} sx={{ textTransform: 'none', minHeight: 44 }}>
        {saving ? 'Sending' : 'Send to my teacher'}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={Boolean(attempt)}
        onClose={dismiss}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, px: 2, pt: 2, pb: 2 } }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          What happened?
        </Typography>
        {body}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>{actions}</Box>
      </Drawer>
    );
  }

  return (
    <Dialog open={Boolean(attempt)} onClose={dismiss} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>What happened?</DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>{actions}</DialogActions>
    </Dialog>
  );
}
