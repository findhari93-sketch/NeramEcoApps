'use client';

/**
 * "Still happening": the student says the fix did not work. Reopens the ticket
 * with their words, plus a fresh device and console snapshot (and a picture,
 * if they add one) so staff see the problem as it is now, not as it was.
 */

import { useState } from 'react';
import { Alert, Box, Button, ImageUploadList, TextField, Typography } from '@neram/ui';
import { collectReportDeviceInfo } from '@/lib/device-collector';
import { getRecentErrors } from '@/lib/error-buffer';
import {
  screenshotPathToUrl,
  screenshotUrlToPath,
  supportFetch,
  uploadSupportImage,
} from '@/lib/support-client';
import ResponsiveSheet from './ResponsiveSheet';

export interface StillHappeningSheetProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  /** After a successful reopen. 409 (changed meanwhile) also lands here, to reload. */
  onDone: (result: { reopened: boolean; message: string }) => void;
}

const MIN_REASON = 3;

export default function StillHappeningSheet({ open, onClose, ticketId, onDone }: StillHappeningSheetProps) {
  const [reason, setReason] = useState('');
  const [shots, setShots] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason('');
    setShots([]);
    setError(null);
  };

  const close = () => {
    if (sending) return;
    reset();
    onClose();
  };

  const canSend = reason.trim().length >= MIN_REASON && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const consoleLogs = getRecentErrors();
    const res = await supportFetch<{ ok: boolean; status: string }>(
      `/api/support-tickets/${encodeURIComponent(ticketId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'reopen',
          reason: reason.trim(),
          snapshot: {
            page_url: window.location.pathname,
            device_info: collectReportDeviceInfo(),
            console_logs: consoleLogs.length > 0 ? consoleLogs : undefined,
            screenshot_urls: shots,
          },
        }),
      },
    );
    setSending(false);
    if (res.ok) {
      reset();
      onDone({ reopened: true, message: 'Thanks. We have reopened it and will look again.' });
      return;
    }
    if (res.status === 409) {
      reset();
      onDone({ reopened: false, message: res.message || 'This request changed. Showing the latest.' });
      return;
    }
    setError(res.message || 'Could not send it. Please try again.');
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={close}
      title="Still happening?"
      busy={sending}
      actions={
        <>
          <Button onClick={close} disabled={sending} sx={{ minHeight: 48, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={send}
            disabled={!canSend}
            sx={{ minHeight: 48, textTransform: 'none', px: 2.5 }}
          >
            {sending ? 'Sending' : 'Reopen request'}
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Sorry it is not sorted yet. Tell us what you still see, and we will pick it up again.
        </Typography>
        <TextField
          label="What is still happening?"
          placeholder="e.g. The video still stops at 2 minutes"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          required
          multiline
          minRows={3}
          inputProps={{ maxLength: 2000 }}
        />
        <ImageUploadList
          label="Screenshot (optional)"
          values={shots.map(screenshotPathToUrl)}
          onChange={(urls) => setShots(urls.map(screenshotUrlToPath))}
          upload={uploadSupportImage}
          maxFiles={2}
          accept="image/jpeg,image/png,image/webp"
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Your device details and any recent errors are attached again, so we see it as it is now.
        </Typography>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </Box>
    </ResponsiveSheet>
  );
}
