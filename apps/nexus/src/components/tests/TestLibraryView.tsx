'use client';

/**
 * The test library: folders on the left, the selected folder's tests on the right.
 *
 * This is the view that answers "where is my History of Architecture test", which
 * the old flat hub could not. Search spans every folder, because someone who
 * types a title wants the test, not a lesson about where they are standing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  TextField,
  Chip,
  Skeleton,
  Alert,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  InputAdornment,
  Drawer,
  Divider,
  Snackbar,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FolderTreeNav, { ALL_FOLDERS, UNFILED, type FolderNode } from './FolderTreeNav';

interface LibraryTest {
  id: string;
  title: string;
  folder_id: string | null;
  question_count: number;
  attempt_count: number;
  is_published: boolean;
  test_kind: string;
  placements: Array<{ context_type: string; context_label: string | null }>;
}

export default function TestLibraryView({
  getToken,
  onOpenTest,
}: {
  getToken: () => Promise<string | null>;
  onOpenTest: (testId: string) => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [tree, setTree] = useState<FolderNode[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [folder, setFolder] = useState<string>(ALL_FOLDERS);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tests, setTests] = useState<LibraryTest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [folderMenu, setFolderMenu] = useState<{ anchor: HTMLElement; folder: FolderNode } | null>(null);
  const [newFolder, setNewFolder] = useState<{ parentId: string | null } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renaming, setRenaming] = useState<FolderNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FolderNode | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  /**
   * Which listing request is the current one. Without this, a slow reply for an
   * earlier folder or search term can land after a newer one and repaint the
   * list with rows that do not match the heading above them. That was survivable
   * while the only bulk action was "move", and is not once "delete" is one click
   * away from a set of checkboxes.
   */
  const requestSeq = useRef(0);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Request failed');
      }
      return res.json();
    },
    [getToken],
  );

  const loadFolders = useCallback(async () => {
    try {
      const json = await authFetch('/api/test-folders');
      setTree(json.data?.tree || []);
      setUnfiledCount(json.data?.unfiled_count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
    }
  }, [authFetch]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadTests = useCallback(async () => {
    const seq = ++requestSeq.current;
    setTests(null);
    try {
      const params = new URLSearchParams();
      if (!debouncedSearch) {
        if (folder === UNFILED) params.set('folder', 'unfiled');
        else if (folder !== ALL_FOLDERS) params.set('folder', folder);
      }
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('page_size', '100');
      const json = await authFetch(`/api/question-bank/tests/library?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      setTests(json.data?.tests || []);
      setTotal(json.data?.total || 0);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load tests');
      setTests([]);
    }
  }, [authFetch, folder, debouncedSearch]);

  useEffect(() => {
    loadTests();
    setSelected(new Set());
  }, [loadTests]);

  const treeTotal = useMemo(() => {
    const walk = (nodes: FolderNode[]): number =>
      nodes.reduce((sum, n) => sum + n.test_count + walk(n.children), 0);
    return walk(tree) + unfiledCount;
  }, [tree, unfiledCount]);

  const flatFolders = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    const walk = (nodes: FolderNode[], prefix: string) => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} > ${n.name}` : n.name;
        out.push({ id: n.id, label });
        walk(n.children, label);
      }
    };
    walk(tree, '');
    return out;
  }, [tree]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await authFetch('/api/test-folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: newFolder?.parentId ?? null }),
      });
      setNewFolder(null);
      setNewFolderName('');
      await loadFolders();
      setToast(`Folder "${name}" created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the folder');
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      await authFetch(`/api/test-folders/${renaming.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setRenaming(null);
      await loadFolders();
      setToast('Folder renamed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the folder');
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const json = await authFetch(`/api/test-folders/${confirmDelete.id}`, { method: 'DELETE' });
      const unfiled = json.data?.unfiled || 0;
      setConfirmDelete(null);
      if (folder === confirmDelete.id) setFolder(ALL_FOLDERS);
      await Promise.all([loadFolders(), loadTests()]);
      setToast(
        unfiled > 0
          ? `Folder deleted. ${unfiled} test${unfiled !== 1 ? 's' : ''} moved to Unfiled.`
          : 'Folder deleted.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the folder');
    } finally {
      setBusy(false);
    }
  }

  async function moveSelected(targetFolderId: string | null) {
    setBusy(true);
    try {
      const json = await authFetch('/api/test-folders', {
        method: 'PATCH',
        body: JSON.stringify({ test_ids: [...selected], folder_id: targetFolderId }),
      });
      setMoveOpen(false);
      setSelected(new Set());
      await Promise.all([loadFolders(), loadTests()]);
      const moved = json.data?.moved || 0;
      setToast(`${moved} test${moved !== 1 ? 's' : ''} moved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the tests');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    setBusy(true);
    try {
      const json = await authFetch('/api/question-bank/tests/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ test_ids: [...selected] }),
      });
      const deleted = json.data?.deleted || 0;
      setConfirmBulkDelete(false);
      setSelected(new Set());
      await Promise.all([loadFolders(), loadTests()]);
      setToast(`${deleted} test${deleted !== 1 ? 's' : ''} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the tests');
    } finally {
      setBusy(false);
    }
  }

  const shown = tests || [];
  const selectedTests = useMemo(() => shown.filter((t) => selected.has(t.id)), [shown, selected]);
  // Attempted papers are the ones worth a second thought: deleting them takes a
  // test a student has already sat out of their list.
  const selectedAttempts = useMemo(
    () => selectedTests.reduce((n, t) => n + (t.attempt_count || 0), 0),
    [selectedTests],
  );
  const allShownSelected = shown.length > 0 && shown.every((t) => selected.has(t.id));

  const folderPanel = (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, flex: 1, color: 'text.secondary' }}>
          FOLDERS
        </Typography>
        <IconButton
          size="small"
          aria-label="New folder"
          onClick={() => {
            setNewFolder({ parentId: null });
            setNewFolderName('');
          }}
          sx={{ minWidth: 40, minHeight: 40 }}
        >
          <CreateNewFolderOutlinedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
      <FolderTreeNav
        tree={tree}
        unfiledCount={unfiledCount}
        selected={folder}
        totalCount={treeTotal}
        onSelect={(id) => {
          setFolder(id);
          setSearch('');
          setFoldersOpen(false);
        }}
        onFolderMenu={(f, anchor) => setFolderMenu({ anchor, folder: f })}
        sx={{ p: 1 }}
      />
    </Box>
  );

  const selectedFolderName =
    folder === ALL_FOLDERS
      ? 'All tests'
      : folder === UNFILED
        ? 'Unfiled'
        : flatFolders.find((f) => f.id === folder)?.label || 'Folder';

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      {!isMobile && (
        <Paper
          variant="outlined"
          sx={{ width: 260, flexShrink: 0, borderRadius: 2, position: 'sticky', top: 8, maxHeight: '75vh', overflowY: 'auto' }}
        >
          {folderPanel}
        </Paper>
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            label="Search tests"
            placeholder="Search by title across every folder"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
          />
          {isMobile && (
            <Button
              variant="outlined"
              startIcon={<FolderOutlinedIcon />}
              onClick={() => setFoldersOpen(true)}
              sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
            >
              Folders
            </Button>
          )}
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {debouncedSearch ? `Results for "${debouncedSearch}"` : selectedFolderName}
          {tests !== null && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
              {total} test{total !== 1 ? 's' : ''}
            </Typography>
          )}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {selected.size > 0 && (
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              mb: 1.5,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              bgcolor: 'action.selected',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
              {selected.size} selected
            </Typography>
            <Button
              size="small"
              startIcon={<DriveFileMoveOutlinedIcon />}
              onClick={() => setMoveOpen(true)}
              sx={{ textTransform: 'none', minHeight: 40 }}
            >
              Move to folder
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineOutlinedIcon />}
              onClick={() => setConfirmBulkDelete(true)}
              sx={{ textTransform: 'none', minHeight: 40 }}
            >
              Delete
            </Button>
            <Button size="small" onClick={() => setSelected(new Set())} sx={{ textTransform: 'none', minHeight: 40 }}>
              Clear
            </Button>
          </Paper>
        )}

        {tests === null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1.5 }} />
            ))}
          </Box>
        ) : tests.length === 0 ? (
          <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
            <FactCheckOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {debouncedSearch
                ? `No test matches "${debouncedSearch}".`
                : folder === ALL_FOLDERS
                  ? 'No tests yet. Import one from AI, or build one from the question bank.'
                  : 'No tests in this folder yet. Move one here, or import a new one.'}
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Checkbox
                size="small"
                checked={allShownSelected}
                indeterminate={selected.size > 0 && !allShownSelected}
                onChange={() =>
                  setSelected(allShownSelected ? new Set() : new Set(tests.map((t) => t.id)))
                }
                inputProps={{ 'aria-label': 'Select every test shown' }}
                sx={{ p: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                Select all {tests.length} shown
              </Typography>
            </Box>
            {tests.map((t) => {
              const isSelected = selected.has(t.id);
              return (
                <Paper
                  key={t.id}
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    transition: 'border-color 150ms ease',
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      })
                    }
                    inputProps={{ 'aria-label': `Select ${t.title}` }}
                    sx={{ p: 1 }}
                  />
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenTest(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenTest(t.id);
                      }
                    }}
                    sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
                      {t.title}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${t.question_count} Q`}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                      {t.attempt_count > 0 && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${t.attempt_count} attempt${t.attempt_count !== 1 ? 's' : ''}`}
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                      <Chip
                        size="small"
                        label={t.is_published ? 'Published' : 'Draft'}
                        color={t.is_published ? 'success' : 'default'}
                        variant={t.is_published ? 'filled' : 'outlined'}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                      {t.placements.slice(0, 2).map((p, i) => (
                        <Chip
                          key={`${p.context_type}-${i}`}
                          size="small"
                          variant="outlined"
                          label={p.context_label || p.context_type.replace(/_/g, ' ')}
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      ))}
                    </Box>
                  </Box>
                  <ChevronRightOutlinedIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
                </Paper>
              );
            })}
            {total > tests.length && (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                Showing {tests.length} of {total}. Narrow it with search.
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* Folder overflow menu */}
      <Menu
        open={Boolean(folderMenu)}
        anchorEl={folderMenu?.anchor}
        onClose={() => setFolderMenu(null)}
      >
        <MenuItem
          onClick={() => {
            setRenaming(folderMenu!.folder);
            setRenameValue(folderMenu!.folder.name);
            setFolderMenu(null);
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            setNewFolder({ parentId: folderMenu!.folder.id });
            setNewFolderName('');
            setFolderMenu(null);
          }}
        >
          New folder inside
        </MenuItem>
        <MenuItem
          onClick={() => {
            setConfirmDelete(folderMenu!.folder);
            setFolderMenu(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteOutlineOutlinedIcon sx={{ fontSize: 18, mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* New folder */}
      <Dialog open={Boolean(newFolder)} onClose={() => setNewFolder(null)} fullWidth maxWidth="xs">
        <DialogTitle>New folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Folder name"
            placeholder="History of Architecture"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            sx={{ mt: 1 }}
          />
          {newFolder?.parentId && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Inside {flatFolders.find((f) => f.id === newFolder.parentId)?.label}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolder(null)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={createFolder}
            disabled={!newFolderName.trim() || busy}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename folder */}
      <Dialog open={Boolean(renaming)} onClose={() => setRenaming(null)} fullWidth maxWidth="xs">
        <DialogTitle>Rename folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Folder name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && renameFolder()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={renameFolder}
            disabled={!renameValue.trim() || busy}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete folder */}
      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete this folder?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            &quot;{confirmDelete?.name}&quot; and any folders inside it will be removed. The tests are kept and
            moved to Unfiled, so nothing students have taken is lost.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={deleteFolder} disabled={busy} sx={{ textTransform: 'none', minHeight: 44 }}>
            Delete folder
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete selected tests */}
      <Dialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          Delete {selected.size} test{selected.size !== 1 ? 's' : ''}?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            They leave the library and stop opening for students. Attempt history is kept, so past
            scores stay on record.
          </Typography>
          {selectedAttempts > 0 && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {selectedAttempts} attempt{selectedAttempts !== 1 ? 's have' : ' has'} been made on
              these papers. Check you are not deleting a test a class has already sat.
            </Alert>
          )}
          <Box
            sx={{
              mt: 1.5,
              maxHeight: 200,
              overflowY: 'auto',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
            }}
          >
            {selectedTests.map((t) => (
              <Typography key={t.id} variant="caption" sx={{ display: 'block', py: 0.25 }} noWrap>
                {t.title}
              </Typography>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmBulkDelete(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={deleteSelected}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Delete {selected.size} test{selected.size !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move selected tests */}
      <Dialog open={moveOpen} onClose={() => setMoveOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>
          Move {selected.size} test{selected.size !== 1 ? 's' : ''}
        </DialogTitle>
        <DialogContent sx={{ px: 1 }}>
          <MenuItem onClick={() => moveSelected(null)} disabled={busy} sx={{ borderRadius: 1, minHeight: 44 }}>
            Unfiled
          </MenuItem>
          {flatFolders.map((f) => (
            <MenuItem
              key={f.id}
              onClick={() => moveSelected(f.id)}
              disabled={busy}
              sx={{ borderRadius: 1, minHeight: 44 }}
            >
              {f.label}
            </MenuItem>
          ))}
          {flatFolders.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No folders yet. Create one first.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor="left" open={foldersOpen && isMobile} onClose={() => setFoldersOpen(false)}>
        <Box sx={{ width: 280 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              Folders
            </Typography>
            <IconButton onClick={() => setFoldersOpen(false)} aria-label="Close folders" sx={{ minWidth: 44, minHeight: 44 }}>
              <CloseOutlinedIcon />
            </IconButton>
          </Box>
          <Divider />
          {folderPanel}
        </Box>
      </Drawer>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
}
