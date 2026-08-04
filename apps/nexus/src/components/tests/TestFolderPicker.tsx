'use client';

/**
 * Pick a folder for a test, the way a file manager does it.
 *
 * Replaces the typed "Foundation / History of Architecture" path the import
 * wizard used to take. A typed path could only ever be a guess: nothing on
 * screen showed which folders already existed, so a stray plural or a different
 * capitalisation quietly built a second folder next to the right one, and the
 * test went into it.
 *
 * Creating lives inside the picker for the reason it does in Drive and OneDrive:
 * the moment you find the folder you want is missing is the moment you want to
 * make it, and the parent you want it under is already the one selected.
 *
 * The tree comes from /api/test-folders, which resolves the scope from the
 * caller, so a student gets their own tree and staff get the shared one without
 * this component knowing the difference.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Paper,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import FolderTreeNav, { UNFILED, type FolderNode } from './FolderTreeNav';
import { canNestUnder, flattenTestFolders, searchTestFolders } from '@/lib/test-folder-path';

export interface TestFolderPickerProps {
  /** Chosen folder id. null means Unfiled, which is a real bucket, not a blank. */
  value: string | null;
  /** Gets the id and the folder's path from the root, which the prompt builder wants. */
  onChange: (folderId: string | null, path: string[]) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  label?: string;
  helperText?: React.ReactNode;
  /**
   * A path that has been suggested but does not exist yet, shown in the field
   * while nothing is picked. The import wizard passes the AI's suggestion here.
   */
  pendingPath?: string[];
  disabled?: boolean;
}

export default function TestFolderPicker({
  value,
  onChange,
  authFetch,
  label = 'Folder',
  helperText,
  pendingPath,
  disabled = false,
}: TestFolderPickerProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [tree, setTree] = useState<FolderNode[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(value);
  const [filter, setFilter] = useState('');
  const [creatingIn, setCreatingIn] = useState<{ parentId: string | null } | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const json = await authFetch('/api/test-folders');
      setTree(json.data?.tree || []);
      setUnfiledCount(json.data?.unfiled_count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the folders');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const flat = useMemo(() => flattenTestFolders(tree), [tree]);
  const byId = useMemo(() => new Map(flat.map((f) => [f.id, f])), [flat]);

  // Opening the tree to the pending folder matters right after a folder is
  // created: a new child of a collapsed parent is selected but off screen.
  const expandedIds = useMemo(
    () => (pendingId ? byId.get(pendingId)?.ancestorIds ?? [] : []),
    [pendingId, byId],
  );

  const matches = useMemo(() => searchTestFolders(flat, filter), [filter, flat]);

  const chosen = value ? byId.get(value) : undefined;
  const fieldValue = chosen
    ? chosen.label
    : pendingPath && pendingPath.length > 0
      ? pendingPath.join(' > ')
      : 'Unfiled';

  const pendingFolder = pendingId ? byId.get(pendingId) : undefined;
  const tooDeepToNest = !canNestUnder(pendingFolder);

  function openPicker() {
    if (disabled) return;
    setPendingId(value);
    setFilter('');
    setCreatingIn(null);
    setNewName('');
    setError(null);
    setOpen(true);
  }

  function confirm() {
    onChange(pendingId, pendingId ? byId.get(pendingId)?.path ?? [] : []);
    setOpen(false);
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const json = await authFetch('/api/test-folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: creatingIn?.parentId ?? null }),
      });
      setCreatingIn(null);
      setNewName('');
      setFilter('');
      await loadFolders();
      // Selected straight away, because the only reason to make a folder here is
      // to put this test in it.
      if (json.data?.id) setPendingId(json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the folder');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TextField
        label={label}
        value={loading && value ? 'Loading' : fieldValue}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        fullWidth
        size="small"
        disabled={disabled}
        helperText={
          helperText ??
          (chosen
            ? `Filed under ${chosen.label}`
            : pendingPath && pendingPath.length > 0
              ? `${pendingPath.join(' > ')} will be created`
              : 'Tap to choose a folder, or leave it in Unfiled')
        }
        InputLabelProps={{ shrink: true }}
        InputProps={{
          readOnly: true,
          startAdornment: (
            <InputAdornment position="start">
              <FolderOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <ExpandMoreOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
        inputProps={{
          'aria-haspopup': 'dialog',
          style: { cursor: disabled ? 'default' : 'pointer' },
        }}
        sx={{ '& .MuiInputBase-root': { cursor: disabled ? 'default' : 'pointer', minHeight: 48 } }}
      />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={fullScreen}
        fullWidth
        maxWidth="xs"
        aria-labelledby="folder-picker-title"
      >
        <DialogTitle
          id="folder-picker-title"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1, py: 1.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0, fontSize: '1.05rem', fontWeight: 700 }}>Choose a folder</Box>
          <Button
            size="small"
            startIcon={<CreateNewFolderOutlinedIcon />}
            disabled={busy || tooDeepToNest}
            onClick={() => {
              setCreatingIn({ parentId: pendingId });
              setNewName('');
              setError(null);
            }}
            sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
          >
            New folder
          </Button>
          {fullScreen && (
            <IconButton
              onClick={() => setOpen(false)}
              aria-label="Close"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <CloseOutlinedIcon />
            </IconButton>
          )}
        </DialogTitle>

        <DialogContent dividers sx={{ p: 1.5 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}

          <TextField
            placeholder="Search folders"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            inputProps={{ 'aria-label': 'Search folders' }}
            sx={{ mb: 1.5, '& .MuiInputBase-root': { minHeight: 44 } }}
          />

          {creatingIn && (
            <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {creatingIn.parentId
                  ? `Inside ${byId.get(creatingIn.parentId)?.name ?? 'the selected folder'}`
                  : 'At the top level'}
              </Typography>
              <TextField
                autoFocus
                label="Folder name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    createFolder();
                  }
                }}
                fullWidth
                size="small"
                sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  onClick={() => setCreatingIn(null)}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={createFolder}
                  disabled={!newName.trim() || busy}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  Create
                </Button>
              </Box>
            </Paper>
          )}

          {tooDeepToNest && !creatingIn && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Folders go four levels deep, so nothing new can go inside this one.
            </Typography>
          )}

          {loading ? (
            <LinearProgress sx={{ borderRadius: 1 }} />
          ) : filter.trim() ? (
            <Box role="listbox" aria-label="Matching folders">
              {matches.map((f) => (
                <Box
                  key={f.id}
                  role="option"
                  aria-selected={pendingId === f.id}
                  tabIndex={0}
                  onClick={() => setPendingId(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPendingId(f.id);
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 44,
                    px: 1,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    bgcolor: pendingId === f.id ? 'primary.main' : 'transparent',
                    color: pendingId === f.id ? 'primary.contrastText' : 'text.primary',
                    '&:hover': { bgcolor: pendingId === f.id ? 'primary.main' : 'action.hover' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                  }}
                >
                  <FolderOutlinedIcon sx={{ fontSize: 18, flexShrink: 0 }} />
                  <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {f.label}
                  </Typography>
                </Box>
              ))}
              {matches.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
                  No folder matches &quot;{filter.trim()}&quot;. Create one with the button above.
                </Typography>
              )}
            </Box>
          ) : (
            <FolderTreeNav
              tree={tree}
              unfiledCount={unfiledCount}
              selected={pendingId ?? UNFILED}
              expandedIds={expandedIds}
              onSelect={(id) => setPendingId(id === UNFILED ? null : id)}
              showAll={false}
            />
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={() => setOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={confirm}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {pendingFolder ? `Use ${pendingFolder.name}` : 'Leave in Unfiled'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
