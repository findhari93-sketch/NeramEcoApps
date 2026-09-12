'use client';

/**
 * The overlays that sit above the drawing review screen: the overflow menu, the
 * delete confirmation, and the two snackbars (an error, and the "save and next"
 * receipt).
 *
 * These were previously written out twice, once in the mobile branch of the
 * review page and once in the desktop branch, character for character. They are
 * portalled to the body by MUI, so they never depended on where in the tree they
 * were rendered, which is what made the duplication pure overhead.
 */

import {
  Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Menu, MenuItem, Snackbar,
} from '@neram/ui';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

export interface ReviewDialogsProps {
  /** Anchor for the overflow menu; null closes it. */
  menuAnchor: HTMLElement | null;
  onCloseMenu: () => void;
  /** Deep link to the student's Teams chat, when we know their address. */
  teamsChatUrl: string | null;
  onRequestDelete: () => void;

  deleteOpen: boolean;
  deleting: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;

  /** Error text, shown bottom-centre. Empty string hides it. */
  error: string;
  onClearError: () => void;
  /** "Save and next" receipt, shown top-centre clear of the fixed bars. */
  notice: string;
  onClearNotice: () => void;
}

export default function ReviewDialogs({
  menuAnchor, onCloseMenu, teamsChatUrl, onRequestDelete,
  deleteOpen, deleting, onCancelDelete, onConfirmDelete,
  error, onClearError, notice, onClearNotice,
}: ReviewDialogsProps) {
  return (
    <>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={onCloseMenu}>
        {teamsChatUrl && (
          <MenuItem
            component="a"
            href={teamsChatUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onCloseMenu}
            sx={{ minHeight: 48 }}
          >
            <ChatOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
            Open Teams chat
          </MenuItem>
        )}
        <MenuItem onClick={onRequestDelete} sx={{ color: 'error.main', minHeight: 48 }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Submission
        </MenuItem>
      </Menu>

      <Dialog open={deleteOpen} onClose={() => !deleting && onCancelDelete()}>
        <DialogTitle>Delete Submission?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete the submission and all associated images. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancelDelete} disabled={deleting}>Cancel</Button>
          <Button onClick={onConfirmDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={onClearError}
        message={error}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      <Snackbar
        open={!!notice}
        autoHideDuration={5000}
        onClose={onClearNotice}
        message={notice}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </>
  );
}
