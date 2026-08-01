'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@neram/ui';
import RecordingPlayerDialog from '../RecordingPlayerDialog';
import ShareClassDialog from '../ShareClassDialog';
import type { ClassCardData } from '../ClassCard';
import type { ClassPanelRole } from './class-state';

interface ClassPanelDialogsProps {
  cls: ClassCardData;
  role: ClassPanelRole;
  getToken: () => Promise<string | null>;
  hasRecording: boolean;
  confirmAction: 'cancel' | 'delete' | null;
  onCloseConfirm: () => void;
  onDelete?: (classId: string) => void;
  onDeletePermanent?: (classId: string) => void;
  recordingOpen: boolean;
  onCloseRecording: () => void;
  shareOpen: boolean;
  onCloseShare: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'warning') => void;
}

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
  recordingOpen,
  onCloseRecording,
  shareOpen,
  onCloseShare,
  onNotify,
}: ClassPanelDialogsProps) {
  return (
    <>
      <Dialog open={!!confirmAction} onClose={onCloseConfirm} maxWidth="xs" fullWidth>
        <DialogTitle>{confirmAction === 'cancel' ? 'Cancel this class?' : 'Delete permanently?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirmAction === 'cancel'
              ? `"${cls.title}" will be marked as cancelled. Students will be notified.${cls.teams_meeting_id ? ' The Teams meeting will also be cancelled.' : ''}`
              : `"${cls.title}" will be permanently removed. This cannot be undone.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseConfirm} sx={{ minHeight: 44 }}>
            Go Back
          </Button>
          <Button
            variant="contained"
            color="error"
            sx={{ minHeight: 44 }}
            onClick={() => {
              const action = confirmAction;
              onCloseConfirm();
              if (action === 'cancel') onDelete?.(cls.id);
              else onDeletePermanent?.(cls.id);
            }}
          >
            {confirmAction === 'cancel' ? 'Yes, Cancel Class' : 'Yes, Delete Forever'}
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
