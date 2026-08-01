'use client';

import { Box, Dialog, DialogActions, Button, DialogTitle, Typography, useMediaQuery, useTheme } from '@neram/ui';
import ClassAttendancePanel from './ClassAttendancePanel';
import type { AttendanceTabKey } from './types';

interface ClassAttendanceDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  classTitle: string;
  classroomId: string;
  teamsMeetingId: string | null;
  getToken: () => Promise<string | null>;
  initialTab?: AttendanceTabKey;
  onChanged?: () => void;
}

/**
 * The timetable's mount of the attendance panel.
 *
 * Nothing but a frame. All the behaviour is in ClassAttendancePanel, which the
 * catch-up page mounts in a drawer instead, so a teacher meets the same three
 * tabs and the same actions from either screen. A dialog that owned any of that
 * logic would make the two mounts capable of disagreeing, which is the failure
 * this whole surface was built to end.
 *
 * maxWidth md, not sm: thirty rows carrying a duration, a bar and two or three
 * flags need the room on a laptop. Below sm it is full screen, where it behaves
 * like a page anyway.
 */
export default function ClassAttendanceDialog({
  open,
  onClose,
  classId,
  classTitle,
  classroomId,
  teamsMeetingId,
  getToken,
  initialTab,
  onChanged,
}: ClassAttendanceDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
      // The panel owns its own scrolling, so the dialog must not also scroll or
      // the sticky action bar detaches from the foot of the list.
      PaperProps={{ sx: { height: fullScreen ? '100%' : '86vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Attendance
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {classTitle}
        </Typography>
      </DialogTitle>

      {/* Keyed on the class so switching classes rebuilds the panel's state
          rather than leaving one class's selection over another's roster. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {open && (
          <ClassAttendancePanel
            key={classId}
            classId={classId}
            classTitle={classTitle}
            classroomId={classroomId}
            teamsMeetingId={teamsMeetingId}
            getToken={getToken}
            initialTab={initialTab}
            onChanged={onChanged}
          />
        )}
      </Box>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ minHeight: 44, textTransform: 'none' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
