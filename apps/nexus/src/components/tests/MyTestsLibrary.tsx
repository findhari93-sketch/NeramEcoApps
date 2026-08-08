'use client';

/**
 * The papers a student built for themselves, with somewhere to put them.
 *
 * This section used to be a flat list that only ever grew. A student who built a
 * paper by mistake was stuck with it forever, and the ones who use the builder
 * most ended up with the least usable screen, which is the wrong way round.
 *
 * Three things fix that, and nothing more: a folder to file a paper in, a way to
 * move it, and a way to delete it. Deliberately NOT a second test library. The
 * teacher's TestLibraryView has paging, search, a folder sidebar and a rename
 * flow because a teacher browses hundreds of papers they did not write; a
 * student has a dozen they wrote themselves and wants them off the screen.
 *
 * The cards come from the caller's already-loaded overview payload rather than a
 * fetch of /api/question-bank/tests/library. Same rows, but the overview shape
 * carries attempts and best score, so filtering here costs no request and the
 * chips do not silently disappear when a folder is picked.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutline';
import StudentTestCard, { type StudentTest } from './StudentTestCard';
import { flattenTestFolders, type FlatTestFolder } from '@/lib/test-folder-path';

/** Matches the tree /api/test-folders returns. */
interface FolderNode {
  id: string;
  name: string;
  parent_id: string | null;
  test_count: number;
  children: FolderNode[];
}

const ALL = '__all__';
const UNFILED = '__unfiled__';

export interface MyTestsLibraryProps {
  tests: StudentTest[];
  onStart: (t: StudentTest) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  /** Refetch the page's overview. Called after anything that changes the list. */
  onChanged: () => void | Promise<void>;
  /** Raised to the page so success and failure share one Snackbar. */
  onNotify: (message: string, severity: 'success' | 'error') => void;
  onNew: () => void;
}

export default function MyTestsLibrary({
  tests,
  onStart,
  authFetch,
  onChanged,
  onNotify,
  onNew,
}: MyTestsLibraryProps) {
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [folder, setFolder] = useState<string>(ALL);
  const [busy, setBusy] = useState(false);

  const [menuFor, setMenuFor] = useState<StudentTest | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** The papers an action applies to: the ticked ones, or the one whose kebab was opened. */
  const targets = useMemo<StudentTest[]>(() => {
    if (selecting) return tests.filter((t) => selected.has(t.id));
    return menuFor ? [menuFor] : [];
  }, [selecting, selected, tests, menuFor]);

  const loadFolders = useCallback(async () => {
    try {
      // No scope parameter: the route resolves it from the caller, so a student
      // always gets their own private tree and can never ask for another.
      const json = await authFetch('/api/test-folders');
      setTree(json.data?.tree || []);
    } catch {
      // A folder rail that failed to load must not take My tests down with it.
      // Without a rail this degrades to exactly the flat list it replaced.
      setTree([]);
    }
  }, [authFetch]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const flatFolders: FlatTestFolder[] = useMemo(() => flattenTestFolders(tree), [tree]);

  /**
   * Counts come from the tests on screen, not from the tree's own test_count.
   *
   * The tree counts every paper the student owns; this list is what the page is
   * currently showing. Mixing the two produces a chip reading "Week 3 (4)" above
   * three cards, and the student is left to work out which number lied.
   */
  const countsByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tests) counts.set(t.folder_id || UNFILED, (counts.get(t.folder_id || UNFILED) || 0) + 1);
    return counts;
  }, [tests]);

  const visible = useMemo(() => {
    if (folder === ALL) return tests;
    if (folder === UNFILED) return tests.filter((t) => !t.folder_id);
    return tests.filter((t) => t.folder_id === folder);
  }, [tests, folder]);

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuFor(null);
  };

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    setNewFolderError(null);
    try {
      const json = await authFetch('/api/test-folders', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewFolderOpen(false);
      setNewFolderName('');
      await loadFolders();
      // Drop straight into the new folder. A student makes one in order to put
      // something in it, and landing back on All means finding it again first.
      if (json.data?.id) setFolder(json.data.id);
      onNotify(`Folder "${name}" created.`, 'success');
    } catch (err) {
      // Shown in the dialog rather than as a toast: the name is still on screen
      // and still wrong, so the message belongs next to the field being fixed.
      setNewFolderError(err instanceof Error ? err.message : 'Could not create that folder');
    } finally {
      setBusy(false);
    }
  }

  async function moveTo(folderId: string | null) {
    const ids = targets.map((t) => t.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await authFetch('/api/test-folders', {
        method: 'PATCH',
        body: JSON.stringify({ test_ids: ids, folder_id: folderId }),
      });
      const where = folderId ? flatFolders.find((f) => f.id === folderId)?.name || 'that folder' : 'Unfiled';
      setMoveOpen(false);
      closeMenu();
      exitSelection();
      await Promise.all([onChanged(), loadFolders()]);
      onNotify(`Moved ${ids.length} test${ids.length !== 1 ? 's' : ''} to ${where}.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not move that test', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTargets() {
    const ids = targets.map((t) => t.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await authFetch('/api/question-bank/tests/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ test_ids: ids }),
      });
      setConfirmDelete(false);
      closeMenu();
      exitSelection();
      await Promise.all([onChanged(), loadFolders()]);
      onNotify(`Deleted ${ids.length} test${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not delete that test', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (tests.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Build a test from the question bank to drill exactly what you want.
        </Typography>
      </Paper>
    );
  }

  const hasFolders = flatFolders.length > 0;

  return (
    <Box>
      {/* Folder rail. Horizontal scroll rather than a wrap, so a student with
          eight folders still sees one row of cards above the fold on a phone. */}
      {hasFolders && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            overflowX: 'auto',
            pb: 1,
            mb: 1,
            // The scrollbar is chrome on a phone and clutter on a desktop where
            // the rail rarely overflows at all.
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          <Chip
            label={`All (${tests.length})`}
            size="small"
            color={folder === ALL ? 'primary' : 'default'}
            variant={folder === ALL ? 'filled' : 'outlined'}
            onClick={() => setFolder(ALL)}
            sx={{ height: 32, flexShrink: 0, cursor: 'pointer' }}
          />
          {flatFolders.map((f) => (
            <Chip
              key={f.id}
              label={`${f.name} (${countsByFolder.get(f.id) || 0})`}
              size="small"
              color={folder === f.id ? 'primary' : 'default'}
              variant={folder === f.id ? 'filled' : 'outlined'}
              onClick={() => setFolder(f.id)}
              sx={{ height: 32, flexShrink: 0, cursor: 'pointer' }}
            />
          ))}
          {(countsByFolder.get(UNFILED) || 0) > 0 && (
            <Chip
              label={`Unfiled (${countsByFolder.get(UNFILED)})`}
              size="small"
              color={folder === UNFILED ? 'primary' : 'default'}
              variant={folder === UNFILED ? 'filled' : 'outlined'}
              onClick={() => setFolder(UNFILED)}
              sx={{ height: 32, flexShrink: 0, cursor: 'pointer' }}
            />
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        {selecting ? (
          <>
            <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
              {selected.size} selected
            </Typography>
            <Button
              size="small"
              onClick={() => setSelected(new Set(visible.map((t) => t.id)))}
              sx={{ textTransform: 'none', minHeight: 40 }}
            >
              Select all
            </Button>
            <Button size="small" onClick={exitSelection} sx={{ textTransform: 'none', minHeight: 40 }}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="small"
              startIcon={<CreateNewFolderOutlinedIcon />}
              onClick={() => {
                setNewFolderName('');
                setNewFolderError(null);
                setNewFolderOpen(true);
              }}
              sx={{ textTransform: 'none', minHeight: 40, flex: 1, justifyContent: 'flex-start' }}
            >
              New folder
            </Button>
            <Button size="small" onClick={() => setSelecting(true)} sx={{ textTransform: 'none', minHeight: 40 }}>
              Select
            </Button>
          </>
        )}
      </Box>

      {visible.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Nothing in this folder yet.
          </Typography>
          <Button
            size="small"
            startIcon={<AddOutlinedIcon />}
            onClick={onNew}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Build a test
          </Button>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            // Room for the fixed action bar, so the last card is never trapped
            // underneath it.
            pb: selecting ? 10 : 0,
          }}
        >
          {visible.map((t) => (
            <StudentTestCard
              key={t.id}
              test={t}
              onStart={onStart}
              selectable={selecting}
              selected={selected.has(t.id)}
              onToggleSelect={toggleSelect}
              onMenu={(test, anchor) => {
                setMenuFor(test);
                setMenuAnchor(anchor);
              }}
            />
          ))}
        </Box>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setMoveOpen(true);
          }}
          sx={{ minHeight: 44 }}
        >
          <DriveFileMoveOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
          Move to folder
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setConfirmDelete(true);
          }}
          sx={{ minHeight: 44, color: 'error.main' }}
        >
          <DeleteOutlineOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Bulk action bar. Fixed to the thumb zone, clearing the mobile BottomNav
          which sits at 56px. */}
      {selecting && selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: { xs: 56, sm: 0 },
            zIndex: 30,
            p: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            display: 'flex',
            gap: 1,
            justifyContent: 'center',
          }}
        >
          <Button
            variant="outlined"
            startIcon={<DriveFileMoveOutlinedIcon />}
            onClick={() => setMoveOpen(true)}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44, flex: 1, maxWidth: 200 }}
          >
            Move
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteOutlineOutlinedIcon />}
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44, flex: 1, maxWidth: 200 }}
          >
            Delete
          </Button>
        </Paper>
      )}

      {/* New folder */}
      <Dialog open={newFolderOpen} onClose={() => !busy && setNewFolderOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>New folder</DialogTitle>
        <DialogContent>
          {newFolderError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {newFolderError}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim() && !busy) createFolder();
            }}
            placeholder="Perspective drills"
            sx={{ mt: 1 }}
            // 16px blocks the zoom iOS applies to any smaller input.
            inputProps={{ style: { fontSize: 16 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNewFolderOpen(false)} disabled={busy} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={createFolder}
            disabled={busy || !newFolderName.trim()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move */}
      <Dialog open={moveOpen} onClose={() => !busy && setMoveOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          Move {targets.length} test{targets.length !== 1 ? 's' : ''}
        </DialogTitle>
        <DialogContent sx={{ px: 1 }}>
          {flatFolders.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              You have no folders yet. Close this and tap New folder first.
            </Typography>
          ) : (
            <>
              <MenuItem onClick={() => moveTo(null)} disabled={busy} sx={{ borderRadius: 1, minHeight: 44 }}>
                Unfiled
              </MenuItem>
              {flatFolders.map((f) => (
                <MenuItem
                  key={f.id}
                  onClick={() => moveTo(f.id)}
                  disabled={busy}
                  sx={{ borderRadius: 1, minHeight: 44 }}
                >
                  {f.label}
                </MenuItem>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMoveOpen(false)} disabled={busy} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete */}
      <Dialog open={confirmDelete} onClose={() => !busy && setConfirmDelete(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          Delete {targets.length} test{targets.length !== 1 ? 's' : ''}?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {/* Said plainly because it is the fact that makes this safe to press.
                A student who thinks deleting a paper wipes the score they worked
                for will keep the paper instead, and the pile never shrinks. */}
            {targets.length === 1 ? 'It disappears' : 'They disappear'} from My tests. Your scores stay in your
            results.
          </Typography>
          {targets.length > 1 && (
            <Box
              sx={{
                mt: 1.5,
                maxHeight: 200,
                overflowY: 'auto',
                bgcolor: 'action.hover',
                borderRadius: 1,
                p: 1,
              }}
            >
              {targets.map((t) => (
                <Typography key={t.id} variant="caption" sx={{ display: 'block', py: 0.25 }} noWrap>
                  {t.title}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(false)} disabled={busy} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={deleteTargets}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
