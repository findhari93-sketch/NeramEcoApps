'use client';

import { Box, Button, Dialog, DialogContent, Typography } from '@neram/ui';

/**
 * "Close this test?" before the wizard throws a draft away.
 *
 * A bottom sheet on a phone, where the buttons sit under the thumb, and a small
 * centred dialog from the sm breakpoint up. Keep editing is the first and the
 * default choice, because the costly mistake here is losing 150 questions.
 */
export default function WizardCloseConfirm({
  open,
  questionCount,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  questionCount: number;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const what =
    questionCount > 0
      ? `You have ${questionCount} question${questionCount === 1 ? ' that is' : 's that are'} not saved yet. Closing discards ${questionCount === 1 ? 'it' : 'them'}.`
      : 'You have pasted text that is not saved yet. Closing discards it.';

  return (
    <Dialog
      open={open}
      onClose={onKeep}
      aria-labelledby="wizard-close-title"
      aria-describedby="wizard-close-body"
      sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } }}
      PaperProps={{
        role: 'alertdialog',
        sx: {
          m: { xs: 0, sm: 2 },
          width: { xs: '100%', sm: 420 },
          maxWidth: { xs: '100%', sm: 420 },
          borderRadius: { xs: '16px 16px 0 0', sm: 2 },
          pb: { xs: 'env(safe-area-inset-bottom, 0px)', sm: 0 },
        },
      }}
    >
      <DialogContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Typography id="wizard-close-title" variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          Close this test?
        </Typography>
        <Typography id="wizard-close-body" variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {what}
        </Typography>
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <Button
            variant="outlined"
            onClick={onKeep}
            autoFocus
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Keep editing
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={onDiscard}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Discard and close
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
