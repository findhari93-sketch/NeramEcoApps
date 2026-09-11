'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Drawer, IconButton, Tab, Tabs, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import AvailableStudentsSection from '@/components/AvailableStudentsSection';
import { UnsharedPasswordDialog } from './AccountShareCard';

export type AddStudentTab = 'create' | 'existing';

export interface AddStudentSheetProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  getToken: () => Promise<string | null>;
  onEnrolled: () => void;
  /**
   * The account creator. Until it is supplied, the Create tab explains the manual
   * route rather than offering a form that cannot work. A function receives a way
   * to jump to the Existing tab, for the creator's "use an existing account" link.
   */
  createAccount?: React.ReactNode | ((helpers: { showExisting: () => void }) => React.ReactNode);
  /**
   * Only the creator, no tabs. For a student already on the roster, where adding
   * some other directory account to the class is not what anyone came to do.
   */
  createOnly?: boolean;
  title?: string;
  /** A password is on screen that nobody has copied, so closing asks first. */
  guardClose?: boolean;
}

/**
 * One place to add a student, opened from the Students screen.
 *
 * "Not yet in class" used to sit under the whole roster, so reaching it meant
 * scrolling past every enrolled student. Adding someone is a task, so it opens as
 * a sheet and leaves the roster for finding people.
 */
export default function AddStudentSheet({
  open,
  onClose,
  classroomId,
  getToken,
  onEnrolled,
  createAccount,
  createOnly = false,
  title = 'Add student',
  guardClose = false,
}: AddStudentSheetProps) {
  const canCreate = !!createAccount;
  const [tab, setTab] = useState<AddStudentTab>(canCreate ? 'create' : 'existing');
  const [confirmClose, setConfirmClose] = useState(false);

  // Every opening starts on the most useful tab, not wherever it was left.
  useEffect(() => {
    if (open) setTab(canCreate ? 'create' : 'existing');
  }, [open, canCreate]);

  const requestClose = () => {
    if (guardClose) setConfirmClose(true);
    else onClose();
  };

  const creator =
    typeof createAccount === 'function' ? createAccount({ showExisting: () => setTab('existing') }) : createAccount;

  const manualRoute = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 520 }}>
      <Typography variant="body1" sx={{ fontWeight: 700 }}>
        Create the account in Microsoft first
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Make the student&apos;s @neramclasses.com account in the Microsoft 365 admin center and give it the student
        license. It then appears under Existing Microsoft account, ready to add.
      </Typography>
      <Button
        variant="outlined"
        onClick={() => setTab('existing')}
        sx={{ alignSelf: 'flex-start', minHeight: 48, fontWeight: 700 }}
      >
        Go to Existing Microsoft account
      </Button>
    </Box>
  );

  const showCreate = createOnly || tab === 'create';

  return (
    <>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={requestClose}
        PaperProps={{
          role: 'dialog',
          'aria-labelledby': 'add-student-title',
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            height: '92dvh',
            width: '100%',
            maxWidth: 760,
            mx: 'auto',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1 }}>
          <Typography id="add-student-title" sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>
            {title}
          </Typography>
          <IconButton onClick={requestClose} aria-label="Close" sx={{ width: 48, height: 48 }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {!createOnly && (
          <Tabs
            value={tab}
            onChange={(_event, value: AddStudentTab) => setTab(value)}
            variant="fullWidth"
            sx={{ px: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
          >
            <Tab value="create" label="Create account" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }} />
            <Tab
              value="existing"
              // The full name wrapped onto three lines at 375px. Shorter on a phone,
              // and the accessible name stays complete everywhere.
              aria-label="Existing Microsoft account"
              label={
                <>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Existing Microsoft account
                  </Box>
                  <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                    Existing account
                  </Box>
                </>
              }
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            />
          </Tabs>
        )}

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {showCreate ? (
            creator ?? manualRoute
          ) : (
            <AvailableStudentsSection classroomId={classroomId} getToken={getToken} onEnrolled={onEnrolled} embedded />
          )}
        </Box>
      </Drawer>

      <UnsharedPasswordDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
}
