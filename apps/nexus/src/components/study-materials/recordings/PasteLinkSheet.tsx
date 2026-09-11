'use client';

/**
 * Paste the link to a recording that already lives in SharePoint.
 *
 * Nothing is attached from here. The link is checked first and the teacher sees
 * the real file in ConfirmVideoSheet before it is used, which is what stops a
 * list form link going in as "DispForm.aspx".
 */

import { useEffect, useState } from 'react';
import { Button, TextField } from '@neram/ui';
import ResponsiveSheet from './ResponsiveSheet';

export interface PasteLinkSheetProps {
  open: boolean;
  label: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (url: string) => void;
}

export default function PasteLinkSheet({ open, label, busy, error, onClose, onSubmit }: PasteLinkSheetProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  const submit = () => {
    const url = value.trim();
    if (url && !busy) onSubmit(url);
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      disableClose={busy}
      title={`Paste the ${label} recording link`}
      description="In SharePoint, open the video, choose Copy link, and paste it here."
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submit}
            disabled={busy || !value.trim()}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {busy ? 'Checking the link...' : 'Check link'}
          </Button>
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        label="SharePoint link"
        placeholder="https://...sharepoint.com/..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        error={!!error}
        helperText={error || 'Links to a personal OneDrive are not accepted.'}
        inputProps={{ inputMode: 'url', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
        sx={{ mt: 1, '& .MuiInputBase-root': { minHeight: 48 } }}
      />
    </ResponsiveSheet>
  );
}
