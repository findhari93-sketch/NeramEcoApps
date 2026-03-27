'use client';

import { useState } from 'react';
import { Stack, Button, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import { replacePlaceholders, hasUnfilledPlaceholders } from '@/lib/whatsapp-templates/placeholders';
import { buildWhatsAppLink, copyToClipboard } from '@/lib/whatsapp-templates/whatsapp';

interface Props {
  body: string;
  values: Record<string, string>;
  onCopy: (message: string) => void;
  onEdit: () => void;
  onArchive: () => void;
}

export default function ActionRow({ body, values, onCopy, onEdit, onArchive }: Props) {
  const [showWarning, setShowWarning] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const renderedMessage = replacePlaceholders(body, values);
  const hasUnfilled = hasUnfilledPlaceholders(body, values);

  const handleCopy = async () => {
    if (hasUnfilled) setShowWarning(true);
    const success = await copyToClipboard(renderedMessage);
    if (success) onCopy('Copied to clipboard!');
  };

  const handleSend = () => {
    if (hasUnfilled) setShowWarning(true);
    const link = buildWhatsAppLink(renderedMessage);
    window.open(link, '_blank');
  };

  return (
    <>
      {showWarning && hasUnfilled && (
        <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setShowWarning(false)}>
          Some fields are not filled in. The message will contain placeholder text.
        </Alert>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ '& .MuiButton-root': { minHeight: 44 } }}
      >
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopy}
          sx={{ flex: { sm: 1 } }}
        >
          Copy
        </Button>
        <Button
          variant="contained"
          startIcon={<WhatsAppIcon />}
          onClick={handleSend}
          sx={{
            flex: { sm: 1 },
            backgroundColor: '#25D366',
            '&:hover': { backgroundColor: '#1DA851' },
          }}
        >
          Send via WhatsApp
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<EditIcon />}
          onClick={onEdit}
          aria-label="Edit template"
        >
          Edit
        </Button>
        <Button
          variant="outlined"
          size="small"
          color="error"
          startIcon={<ArchiveIcon />}
          onClick={() => setConfirmArchive(true)}
          aria-label="Archive template"
        >
          Archive
        </Button>
      </Stack>

      <Dialog open={confirmArchive} onClose={() => setConfirmArchive(false)}>
        <DialogTitle>Archive Template?</DialogTitle>
        <DialogContent>
          <Typography>This template will be hidden from the list. It can be restored later.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmArchive(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmArchive(false);
              onArchive();
            }}
          >
            Archive
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
