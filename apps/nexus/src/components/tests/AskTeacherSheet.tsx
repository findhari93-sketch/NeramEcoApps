'use client';

/**
 * "Ask my teacher", from the card rather than from the refusal.
 *
 * A student used to reach this only by pressing Start on a closed test and
 * reading the 403 that came back. That meant the way out of a shut door was
 * hidden behind the door. The card now offers it directly, so a closed test is
 * a thing you can do something about instead of a dead end.
 *
 * The success sentence is the one the take page already uses, deliberately: two
 * doors into the same request must not describe the outcome two ways.
 */

import { useState } from 'react';
import { Button, TextField, Typography } from '@neram/ui';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import type { StudentTest } from './StudentTestCard';

export default function AskTeacherSheet({
  test,
  onClose,
  getToken,
}: {
  /** The test being asked about. Null closes the sheet. */
  test: StudentTest | null;
  onClose: () => void;
  getToken: () => Promise<string | null>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setNote('');
    setAsked(false);
    setError(null);
    onClose();
  };

  const send = async () => {
    if (!test?.placement_id) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/tests/runs/${test.placement_id}/access/request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Your request did not go through. Try again in a moment.');
      }
      setAsked(true);
    } catch (err) {
      // Said plainly, and the sheet stays open so the note they typed survives.
      setError(err instanceof Error ? err.message : 'Your request did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveSheet
      open={Boolean(test)}
      onClose={close}
      disableClose={busy}
      title={asked ? 'Your teacher has your request' : 'Ask for another sitting'}
      description={
        asked
          ? undefined
          : test
            ? `${test.title}. Your teacher decides, and you will see this test open up here if they say yes.`
            : undefined
      }
      actions={
        asked ? (
          <Button variant="contained" onClick={close} sx={{ textTransform: 'none' }}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={send} disabled={busy} sx={{ textTransform: 'none' }}>
              {busy ? 'Sending' : 'Send request'}
            </Button>
          </>
        )
      }
    >
      {asked ? (
        <Typography variant="body2" color="text.secondary">
          Asked. Your teacher will see this on their class list.
        </Typography>
      ) : (
        <>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Tell your teacher why (optional)"
            value={note}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
            inputProps={{ maxLength: 500 }}
          />
          {error && (
            <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </>
      )}
    </ResponsiveSheet>
  );
}
