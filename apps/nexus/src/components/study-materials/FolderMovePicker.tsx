'use client';

/**
 * FolderMovePicker - the menu-driven "Move to folder..." path for Study Materials.
 *
 * Complements desktop drag-and-drop with a reliable, touch-friendly picker: it lists every
 * folder as an indented tree and calls onSelect(targetFolderId) when one is chosen. For a
 * folder being moved it hides the folder's own subtree (you cannot nest a folder inside itself);
 * for a file it also offers no "Top level" option because files must live inside a folder.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@neram/ui';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';

interface FlatFolder {
  id: string;
  parent_id: string | null;
  name: string;
}

export interface MoveItem {
  kind: 'file' | 'folder';
  id: string;
  title: string;
}

interface FolderMovePickerProps {
  open: boolean;
  onClose: () => void;
  item: MoveItem | null;
  /** The folder currently being viewed (where the item lives now); used to mark the current spot. */
  currentFolderId: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Called with the chosen destination (null = top level, folders only). */
  onSelect: (targetFolderId: string | null) => void;
  onError: (msg: string) => void;
}

export default function FolderMovePicker({
  open,
  onClose,
  item,
  currentFolderId,
  authFetch,
  onSelect,
  onError,
}: FolderMovePickerProps) {
  const [folders, setFolders] = useState<FlatFolder[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep the latest callbacks in refs so the fetch effect can run once per open, without
  // re-firing every time the parent re-renders (its onClose / onError are fresh each render).
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setFolders(null);
    (async () => {
      try {
        const res = await authFetch('/api/study-materials/folders?all=1');
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (active) setFolders(json.folders || []);
      } catch {
        if (active) {
          onErrorRef.current('Could not load folders');
          onCloseRef.current();
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, authFetch]);

  // Depth-first order with indentation, excluding a moved folder's own subtree.
  const rows = useMemo(() => {
    if (!folders) return [] as { folder: FlatFolder; depth: number }[];
    const childrenOf = new Map<string | null, FlatFolder[]>();
    for (const f of folders) {
      const arr = childrenOf.get(f.parent_id) || [];
      arr.push(f);
      childrenOf.set(f.parent_id, arr);
    }
    const excluded = new Set<string>();
    if (item?.kind === 'folder') {
      const stack = [item.id];
      while (stack.length) {
        const cur = stack.pop()!;
        excluded.add(cur);
        for (const c of childrenOf.get(cur) || []) stack.push(c.id);
      }
    }
    const out: { folder: FlatFolder; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const f of childrenOf.get(parent) || []) {
        if (excluded.has(f.id)) continue;
        out.push({ folder: f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [folders, item]);

  const isCurrent = (id: string | null) => id === currentFolderId;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Move {item?.kind === 'folder' ? 'folder' : 'file'}
        {item ? `: ${item.title}` : ''}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List dense disablePadding>
            {item?.kind === 'folder' && (
              <ListItemButton
                disabled={isCurrent(null)}
                onClick={() => onSelect(null)}
                sx={{ minHeight: 48 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <HomeOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Top level (Home)" />
                {isCurrent(null) && (
                  <Typography variant="caption" color="text.secondary">
                    Current
                  </Typography>
                )}
              </ListItemButton>
            )}
            {rows.map(({ folder, depth }) => (
              <ListItemButton
                key={folder.id}
                disabled={isCurrent(folder.id)}
                onClick={() => onSelect(folder.id)}
                sx={{ minHeight: 48, pl: 2 + depth * 2 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <FolderOutlinedIcon fontSize="small" color="primary" />
                </ListItemIcon>
                <ListItemText primary={folder.name} primaryTypographyProps={{ noWrap: true }} />
                {isCurrent(folder.id) && (
                  <Typography variant="caption" color="text.secondary">
                    Current
                  </Typography>
                )}
              </ListItemButton>
            ))}
            {rows.length === 0 && item?.kind === 'file' && (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No other folders yet. Create one first.
                </Typography>
              </Box>
            )}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
