'use client';

import { Alert, Button } from '@neram/ui';

/**
 * "N students have no study stage set."
 *
 * This banner is load-bearing, not decoration. On the day this ships, 19 of the
 * 28 students in the live classroom have no stage, so the default "Exam this
 * year" segment renders about five rows. Without an explanation sitting directly
 * under the filter, a manager's first reading is that most of the class has
 * vanished, and they stop trusting the screen before they have used it once.
 *
 * The action is deliberately a single tap to the fixed state rather than a link
 * to documentation: switch to the unset segment, turn on select mode, and
 * pre-select everyone, so the very next tap is "Set stage".
 */
export default function UnsetStagePrompt({
  count,
  canClassify,
  onFix,
}: {
  count: number;
  canClassify: boolean;
  onFix: () => void;
}) {
  if (count <= 0) return null;

  const noun = count === 1 ? 'student has' : 'students have';

  return (
    <Alert
      severity="warning"
      variant="outlined"
      sx={{ borderRadius: 2, alignItems: 'center', '& .MuiAlert-message': { py: 0.5 } }}
      action={
        canClassify ? (
          <Button
            size="small"
            variant="contained"
            color="warning"
            onClick={onFix}
            sx={{ minHeight: 36, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            Set stages
          </Button>
        ) : undefined
      }
    >
      {count} {noun} no study stage set. Priority and reminders cannot be targeted until they do.
      {!canClassify && ' Ask a manager to set them.'}
    </Alert>
  );
}
