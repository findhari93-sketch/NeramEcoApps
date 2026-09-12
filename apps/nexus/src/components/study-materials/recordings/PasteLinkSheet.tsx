'use client';

/**
 * Paste the link to a recording.
 *
 * Nothing is attached from here. The link is checked first and the teacher sees
 * the real file in ConfirmVideoSheet before it is used, which is what stops a
 * list form link going in as "DispForm.aspx".
 *
 * A link to a video in a personal OneDrive used to end at a refusal, which left a
 * teacher who has never used SharePoint with nowhere to go. The refusal now comes
 * with the fix beside it: Nexus copies the video into the Neram library and uses
 * the copy.
 */

import { useEffect, useState } from 'react';
import { Alert, Button, TextField } from '@neram/ui';
import ResponsiveSheet from './ResponsiveSheet';

export interface PasteLinkSheetProps {
  open: boolean;
  label: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (url: string) => void;
  /** The pasted link is a OneDrive video: why it cannot be used as it is. */
  copyOffer?: { message: string } | null;
  onCopy?: () => void;
  /** The link was changed, so an offer or an error about the old one no longer applies. */
  onEdit?: () => void;
}

export default function PasteLinkSheet({
  open,
  label,
  busy,
  error,
  onClose,
  onSubmit,
  copyOffer = null,
  onCopy,
  onEdit,
}: PasteLinkSheetProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  const submit = () => {
    const url = value.trim();
    if (url && !busy) onSubmit(url);
  };

  const offering = !!copyOffer && !!onCopy;

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      disableClose={busy}
      title={`Paste the ${label} recording link`}
      description="In SharePoint or OneDrive, open the video, choose Copy link, and paste it here."
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant={offering ? 'outlined' : 'contained'}
            onClick={submit}
            disabled={busy || !value.trim()}
            sx={{ textTransform: 'none', fontWeight: offering ? 600 : 700 }}
          >
            {busy ? 'Checking the link...' : 'Check link'}
          </Button>
          {offering && (
            <Button variant="contained" onClick={onCopy} disabled={busy} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Copy to Neram library and use it
            </Button>
          )}
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        label="SharePoint link"
        placeholder="https://...sharepoint.com/..."
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onEdit?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        error={!!error}
        helperText={error || 'A OneDrive video is copied into the Neram library first.'}
        inputProps={{ inputMode: 'url', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
        sx={{ mt: 1, '& .MuiInputBase-root': { minHeight: 48 } }}
      />
      {offering && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {copyOffer.message}
        </Alert>
      )}
    </ResponsiveSheet>
  );
}
