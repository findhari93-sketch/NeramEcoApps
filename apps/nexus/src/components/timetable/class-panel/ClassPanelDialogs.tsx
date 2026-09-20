'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@neram/ui';
import RecordingPlayerDialog from '../RecordingPlayerDialog';
import ShareClassDialog from '../ShareClassDialog';
import type { ClassCardData } from '../ClassCard';
import type { ClassPanelRole } from './class-state';
import type { ClassPanelConfirmAction } from './types';

interface ClassPanelDialogsProps {
  cls: ClassCardData;
  role: ClassPanelRole;
  getToken: () => Promise<string | null>;
  hasRecording: boolean;
  confirmAction: ClassPanelConfirmAction | null;
  onCloseConfirm: () => void;
  onDelete?: (classId: string) => void;
  onDeletePermanent?: (classId: string) => void;
  onNotTaught?: (classId: string, undo: boolean) => void;
  recordingOpen: boolean;
  onCloseRecording: () => void;
  shareOpen: boolean;
  onCloseShare: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'warning') => void;
}

/**
 * Title, button and colour per confirmation, in one place.
 *
 * Kept as a table rather than nested ternaries because there are four of these
 * now and the fourth is the one where getting the colour wrong matters: it is
 * the only reversible action in the set.
 */
const CONFIRM_COPY: Record<
  ClassPanelConfirmAction,
  { title: string; cta: string; danger: boolean }
> = {
  cancel: { title: 'Cancel this class?', cta: 'Yes, Cancel Class', danger: true },
  delete: { title: 'Delete permanently?', cta: 'Yes, Delete Forever', danger: true },
  not_taught: { title: 'No class was taught?', cta: 'Yes, it was not a class', danger: false },
  undo_not_taught: { title: 'Put this class back?', cta: 'Yes, it was a class', danger: false },
};

/**
 * Every dialog the panel owns, in one component.
 *
 * These used to live inside the desktop return only, so on a phone the confirm
 * dialog and the recording player were never mounted at all: tapping "Cancel
 * Class" set state and nothing appeared. The shell now renders this once as a
 * sibling of whichever container it chose, so there is no longer a branch that
 * could omit it.
 */
export default function ClassPanelDialogs({
  cls,
  role,
  getToken,
  hasRecording,
  confirmAction,
  onCloseConfirm,
  onDelete,
  onDeletePermanent,
  onNotTaught,
  recordingOpen,
  onCloseRecording,
  shareOpen,
  onCloseShare,
  onNotify,
}: ClassPanelDialogsProps) {
  return (
    <>
      <Dialog open={!!confirmAction} onClose={onCloseConfirm} maxWidth="xs" fullWidth>
        <DialogTitle>{CONFIRM_COPY[confirmAction || 'cancel'].title}</DialogTitle>
        <DialogContent>
          {confirmAction === 'not_taught' ? (
            /* Said as three plain facts rather than one sentence, because the
               thing a teacher is actually worried about here is whether they
               are about to lose the attendance register. Answer that first. */
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {`"${cls.title}" will stop asking anyone to catch up.`}
              </Typography>
              <Typography variant="body2" component="ul" sx={{ pl: 2.5, m: 0 }}>
                <li>The attendance register stays exactly as it is.</li>
                <li>Everyone who missed it stops owing a catch-up for that date.</li>
                <li>The class shows as cancelled on the timetable.</li>
                <li>You can undo this.</li>
              </Typography>
            </>
          ) : (
            <Typography variant="body2">
              {confirmAction === 'cancel'
                ? `"${cls.title}" will be marked as cancelled. Students will be notified.${cls.teams_meeting_id ? ' The Teams meeting will also be cancelled.' : ''}`
                : confirmAction === 'undo_not_taught'
                  ? `"${cls.title}" goes back on the timetable, and everyone who missed it owes the catch-up again. Anyone who has already finished it stays finished.`
                  : `"${cls.title}" will be permanently removed. This cannot be undone.`}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseConfirm} sx={{ minHeight: 44 }}>
            Go Back
          </Button>
          <Button
            variant="contained"
            // Only the two that destroy something are red. Marking a session as
            // not a class keeps every row it touches and reverses cleanly.
            color={CONFIRM_COPY[confirmAction || 'cancel'].danger ? 'error' : 'primary'}
            sx={{ minHeight: 44 }}
            onClick={() => {
              const action = confirmAction;
              onCloseConfirm();
              if (action === 'cancel') onDelete?.(cls.id);
              else if (action === 'not_taught') onNotTaught?.(cls.id, false);
              else if (action === 'undo_not_taught') onNotTaught?.(cls.id, true);
              else onDeletePermanent?.(cls.id);
            }}
          >
            {CONFIRM_COPY[confirmAction || 'cancel'].cta}
          </Button>
        </DialogActions>
      </Dialog>

      {/* In-app recording player. Only teachers are offered the raw Teams link:
          for a student it is the very link that refuses them. */}
      {hasRecording && (
        <RecordingPlayerDialog
          open={recordingOpen}
          onClose={onCloseRecording}
          classId={cls.id}
          title={cls.title}
          getToken={getToken}
          fallbackUrl={cls.recording_url}
          showFallbackLink={role === 'teacher'}
        />
      )}

      {/* One pasteable message carrying the recording, the work and the test.
          Mounted only for staff: the payload behind it is a staff-only route. */}
      {role === 'teacher' && (
        <ShareClassDialog
          open={shareOpen}
          onClose={onCloseShare}
          classId={cls.id}
          getToken={getToken}
          onNotify={(message, severity = 'success') => onNotify(message, severity)}
        />
      )}
    </>
  );
}
