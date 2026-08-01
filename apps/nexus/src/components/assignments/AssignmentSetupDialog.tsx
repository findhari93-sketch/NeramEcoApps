'use client';

/**
 * One door for putting work in front of a class: write a new assignment, or
 * attach one that already exists.
 *
 * Before this, the two lived in separate components opened from separate
 * buttons, and only the timetable offered both. They already cooperated (the
 * link dialog hands back to the create dialog through onCreateInstead), but a
 * teacher had to know which button they wanted before they could see either
 * option, and the Assignments space only ever offered one of them.
 *
 * Both branches are the same components as before, unchanged: this owns the
 * choice between them and nothing else. That is deliberate. Merging their
 * internals would have meant one very large component; merging their entry
 * point is what actually stops them drifting.
 *
 * Linking needs somewhere to link TO, so the choice only appears when the
 * dialog was opened from a class. Opened from the Assignments space, where
 * there is no class in context, it goes straight to Create.
 */
import { useEffect, useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@neram/ui';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import type { ClassCardData } from '@/components/timetable/ClassCard';
import LinkAssignmentDialog from '@/components/timetable/LinkAssignmentDialog';
import NewAssignmentDialog from './NewAssignmentDialog';

type Mode = 'create' | 'link';

interface AssignmentSetupDialogProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  onSaved: (assignmentId?: string) => void;
  /** Set to edit rather than create. Editing has no link branch. */
  assignmentId?: string | null;
  /** The class this was opened from. Without one there is nothing to link to. */
  cls?: ClassCardData | null;
  scheduledClassId?: string | null;
  classContextLabel?: string;
  classStartLabel?: string;
  defaultTiming?: 'prework' | 'homework';
  /** Opens on the link branch, for the "Link existing" menu item. */
  initialMode?: Mode;
  onNotify?: (message: string, severity?: 'success' | 'error') => void;
}

export default function AssignmentSetupDialog({
  open,
  onClose,
  classroomId,
  authFetch,
  getToken,
  onSaved,
  assignmentId,
  cls,
  scheduledClassId,
  classContextLabel,
  classStartLabel,
  defaultTiming,
  initialMode = 'create',
  onNotify,
}: AssignmentSetupDialogProps) {
  const isEdit = !!assignmentId;
  const canLink = !isEdit && !!cls;
  const [mode, setMode] = useState<Mode>(canLink ? initialMode : 'create');

  useEffect(() => {
    if (open) setMode(canLink ? initialMode : 'create');
  }, [open, canLink, initialMode]);

  if (!open) return null;

  if (mode === 'link' && cls) {
    return (
      <LinkAssignmentDialog
        open={open}
        cls={cls}
        getToken={getToken}
        onClose={onClose}
        onLinked={() => {
          onSaved();
          onClose();
        }}
        // Stays inside this dialog rather than closing and reopening another
        // one, which is the whole point of having a single door.
        onCreateInstead={() => setMode('create')}
        onNotify={onNotify ?? (() => {})}
      />
    );
  }

  return (
    <NewAssignmentDialog
      open={open}
      onClose={onClose}
      classroomId={classroomId}
      authFetch={authFetch}
      getToken={getToken}
      onCreated={onSaved}
      assignmentId={assignmentId}
      scheduledClassId={scheduledClassId}
      classContextLabel={classContextLabel}
      classStartLabel={classStartLabel}
      defaultTiming={defaultTiming}
      headerExtra={
        canLink ? (
          <Box sx={{ mb: 2 }}>
            <ToggleButtonGroup
              value="create"
              exclusive
              onChange={(_, v) => v === 'link' && setMode('link')}
              fullWidth
              size="small"
            >
              <ToggleButton value="create" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, gap: 0.75 }}>
                <AddCircleOutlineIcon sx={{ fontSize: 18 }} />
                Write a new one
              </ToggleButton>
              <ToggleButton value="link" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, gap: 0.75 }}>
                <LinkIcon sx={{ fontSize: 18 }} />
                Use an existing one
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        ) : null
      }
    />
  );
}
