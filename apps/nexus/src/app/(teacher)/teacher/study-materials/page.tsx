'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Card,
  CardActionArea,
  Chip,
  Breadcrumbs,
  Link,
  IconButton,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Stack,
  Snackbar,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  EmptyState,
  alpha,
  useTheme,
} from '@neram/ui';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudyFileViewer from '@/components/study-materials/StudyFileViewer';
import StudyUploadDialog from '@/components/study-materials/StudyUploadDialog';
import DownloadGrantDialog, { type GrantTarget } from '@/components/study-materials/DownloadGrantDialog';
import StudyTestAuthorDialog from '@/components/study-materials/StudyTestAuthorDialog';
import StudyVideoLinkDialog from '@/components/study-materials/StudyVideoLinkDialog';
import FolderMovePicker, { type MoveItem } from '@/components/study-materials/FolderMovePicker';
import { FileThumb, FileIcon } from '@/components/study-materials/FileThumb';
import type { NexusStudyFileDTO, NexusStudyFolderDTO } from '@neram/database/types';

const EXAM_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee', label: 'JEE' },
];
const PROGRAM_OPTIONS = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'software', label: 'Software' },
];

const VIEW_STORAGE_KEY = 'nexus:study-view';

type FolderDTO = NexusStudyFolderDTO;
// Staff responses add allow_download (null = inherit folder) on files.
type FileDTO = NexusStudyFileDTO & { allow_download?: boolean | null };

function TeacherStudyMaterials() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folder');
  const { getToken, activeClassroom, loading: authLoading } = useNexusAuthContext();

  const [data, setData] = useState<{ breadcrumb: { id: string; name: string }[]; folders: FolderDTO[]; files: FileDTO[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [viewerFile, setViewerFile] = useState<NexusStudyFileDTO | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Menus
  const [folderMenu, setFolderMenu] = useState<{ el: HTMLElement; folder: FolderDTO } | null>(null);
  const [fileMenu, setFileMenu] = useState<{ el: HTMLElement; file: FileDTO } | null>(null);

  // Folder create/edit dialog
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'edit'; folder?: FolderDTO } | null>(null);
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fExams, setFExams] = useState<string[]>([]);
  const [fPrograms, setFPrograms] = useState<string[]>([]);
  const [fDownload, setFDownload] = useState(false);

  // File rename dialog
  const [renameFile, setRenameFile] = useState<FileDTO | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Time-limited download grant dialog (file or folder target).
  const [grantTarget, setGrantTarget] = useState<GrantTarget | null>(null);
  // Test authoring dialog (per file).
  const [testFile, setTestFile] = useState<{ id: string; title: string } | null>(null);
  // Class-recording link dialog (per file).
  const [videoFile, setVideoFile] = useState<FileDTO | null>(null);

  // Deep-link from the Tests hub (?testFile=<id>&testTitle=<name>): open the authoring dialog,
  // then strip the params so closing or refresh does not re-open it.
  const deepLinkTestFile = searchParams.get('testFile');
  useEffect(() => {
    if (!deepLinkTestFile) return;
    setTestFile({ id: deepLinkTestFile, title: searchParams.get('testTitle') || '' });
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.delete('testFile');
    sp.delete('testTitle');
    const qs = sp.toString();
    router.replace(`/teacher/study-materials${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTestFile]);

  // Drag-and-drop organise (Windows Explorer style): reorder within a group, or drop onto a
  // folder / breadcrumb to move an item into it. Native HTML5 DnD (desktop); the ... menu carries
  // the same actions for touch.
  const dragRef = useRef<{ kind: 'file' | 'folder'; id: string } | null>(null);
  const [dropHint, setDropHint] = useState<{ kind: 'file' | 'folder'; id: string; mode: 'into' | 'before' | 'after' } | null>(null);
  const [dropCrumb, setDropCrumb] = useState<string | 'home' | null>(null);
  const [movePicker, setMovePicker] = useState<MoveItem | null>(null);

  // Restore the saved layout preference.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const changeView = (next: 'grid' | 'list' | null) => {
    if (!next) return;
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const t = await getToken();
      if (!t) throw new Error('Not authenticated');
      return fetch(url, {
        ...init,
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${t}` },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await getToken();
      if (t) setToken(t);
      const res = await fetch(`/api/study-materials/folders${folderId ? `?parent=${folderId}` : ''}`, {
        headers: t ? { Authorization: `Bearer ${t}` } : undefined,
      });
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch {
      setSnack({ msg: 'Could not load this folder', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getToken, folderId]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const goToFolder = (id: string | null) =>
    router.push(id ? `/teacher/study-materials?folder=${id}` : '/teacher/study-materials');

  const thumbUrl = (fileId: string) =>
    token ? `/api/study-materials/files/${fileId}/thumbnail?token=${encodeURIComponent(token)}&size=large` : null;

  const openFile = (file: FileDTO) => {
    if (file.kind === 'pdf' || file.kind === 'image') {
      setViewerFile(file);
    } else if (token) {
      // Non-previewable types: staff can always download.
      window.open(`/api/study-materials/files/${file.id}/content?token=${encodeURIComponent(token)}&download=1`, '_blank');
    }
  };

  // ── Folder create / edit ──
  const openCreate = () => {
    setFName('');
    setFDesc('');
    setFExams([]);
    setFPrograms([]);
    setFDownload(false);
    setFolderDialog({ mode: 'create' });
  };
  const openEdit = (folder: FolderDTO) => {
    setFName(folder.name);
    setFDesc(folder.description || '');
    setFExams(folder.target_exams || []);
    setFPrograms(folder.target_programs || []);
    setFDownload(!!folder.allow_download);
    setFolderDialog({ mode: 'edit', folder });
  };
  const saveFolder = async () => {
    if (!fName.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: fName.trim(),
        description: fDesc.trim() || null,
        target_exams: fExams,
        target_programs: fPrograms,
        allow_download: fDownload,
        ...(folderDialog?.mode === 'create' ? { parent_id: folderId } : {}),
      };
      const res = await authFetch(
        folderDialog?.mode === 'create'
          ? '/api/study-materials/folders'
          : `/api/study-materials/folders/${folderDialog?.folder?.id}`,
        {
          method: folderDialog?.mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error();
      setSnack({ msg: folderDialog?.mode === 'create' ? 'Folder created' : 'Folder updated', sev: 'success' });
      setFolderDialog(null);
      load();
    } catch {
      setSnack({ msg: 'Could not save folder', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const deleteFolder = async (folder: FolderDTO) => {
    if (!confirm(`Delete "${folder.name}" and everything inside it?`)) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/study-materials/folders/${folder.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setSnack({ msg: 'Folder deleted', sev: 'success' });
      load();
    } catch {
      setSnack({ msg: 'Could not delete folder', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // ── File actions ──
  const toggleFileDownload = async (file: FileDTO, value: boolean | null) => {
    setFileMenu(null);
    setBusy(true);
    try {
      const res = await authFetch(`/api/study-materials/files/${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_download: value }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setSnack({ msg: 'Could not update file', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const saveRename = async () => {
    if (!renameFile || !renameValue.trim()) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/study-materials/files/${renameFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (!res.ok) throw new Error();
      setRenameFile(null);
      load();
    } catch {
      setSnack({ msg: 'Could not rename file', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const deleteFile = async (file: FileDTO) => {
    setFileMenu(null);
    if (!confirm(`Delete "${file.title}"?`)) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/study-materials/files/${file.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setSnack({ msg: 'File deleted', sev: 'success' });
      load();
    } catch {
      setSnack({ msg: 'Could not delete file', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // ── Drag-and-drop organise (reorder within a group, or move into a folder) ──
  const applyReorder = async (kind: 'file' | 'folder', ordered: (FileDTO | FolderDTO)[]) => {
    // Optimistic: show the new order immediately, then persist.
    setData((prev) =>
      prev
        ? kind === 'file'
          ? { ...prev, files: ordered as FileDTO[] }
          : { ...prev, folders: ordered as FolderDTO[] }
        : prev,
    );
    setBusy(true);
    try {
      const payload =
        kind === 'file'
          ? { files: ordered.map((x, i) => ({ id: x.id, sort_order: i })) }
          : { folders: ordered.map((x, i) => ({ id: x.id, sort_order: i })) };
      const res = await authFetch('/api/study-materials/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSnack({ msg: 'Could not save the new order', sev: 'error' });
      load(); // reconcile from server
    } finally {
      setBusy(false);
    }
  };

  const moveBy = (kind: 'file' | 'folder', id: string, delta: number) => {
    setFileMenu(null);
    setFolderMenu(null);
    const arr = ((kind === 'file' ? data?.files : data?.folders) || []) as (FileDTO | FolderDTO)[];
    const idx = arr.findIndex((x) => x.id === id);
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= arr.length) return;
    const next = [...arr];
    const [moved] = next.splice(idx, 1);
    next.splice(to, 0, moved);
    applyReorder(kind, next);
  };

  const moveItemToFolder = async (item: MoveItem, targetFolderId: string | null) => {
    setMovePicker(null);
    setFileMenu(null);
    setFolderMenu(null);
    if (targetFolderId === folderId) return; // already here
    if (item.kind === 'file' && targetFolderId === null) {
      setSnack({ msg: 'Files must stay inside a folder', sev: 'error' });
      return;
    }
    setBusy(true);
    try {
      const url =
        item.kind === 'file'
          ? `/api/study-materials/files/${item.id}`
          : `/api/study-materials/folders/${item.id}`;
      const body = item.kind === 'file' ? { folder_id: targetFolderId } : { parent_id: targetFolderId };
      const res = await authFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(e.error || 'Move failed');
      }
      setSnack({ msg: `Moved "${item.title}"`, sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not move item', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const titleOf = (kind: 'file' | 'folder', id: string): string => {
    const row = ((kind === 'file' ? data?.files : data?.folders) || []).find((x) => x.id === id);
    if (!row) return '';
    return kind === 'file' ? (row as FileDTO).title : (row as FolderDTO).name;
  };

  const onItemDragStart = (e: React.DragEvent, kind: 'file' | 'folder', id: string) => {
    dragRef.current = { kind, id };
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {
      /* some browsers require this; ignore failures */
    }
  };

  const onItemDragOver = (e: React.DragEvent, targetKind: 'file' | 'folder', targetId: string) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === targetKind && drag.id === targetId) {
      setDropHint(null);
      return;
    }
    let mode: 'into' | 'before' | 'after' | null = null;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientY - rect.top) / rect.height;
    if (targetKind === 'folder') {
      // A file always drops INTO a folder; a folder can reorder (edges) or nest (middle).
      mode = drag.kind === 'file' ? 'into' : rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'into';
    } else {
      // Files reorder among files; a folder cannot live among files.
      if (drag.kind !== 'file') {
        setDropHint(null);
        return;
      }
      mode = rel < 0.5 ? 'before' : 'after';
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropCrumb) setDropCrumb(null);
    setDropHint({ kind: targetKind, id: targetId, mode });
  };

  const onItemDrop = (e: React.DragEvent, targetKind: 'file' | 'folder', targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragRef.current;
    const hint = dropHint;
    setDropHint(null);
    dragRef.current = null;
    if (!drag || !hint || hint.id !== targetId || hint.kind !== targetKind) return;
    if (drag.kind === targetKind && drag.id === targetId) return;

    if (hint.mode === 'into') {
      moveItemToFolder({ kind: drag.kind, id: drag.id, title: titleOf(drag.kind, drag.id) }, targetId);
      return;
    }
    if (drag.kind !== targetKind) return;
    const arr = ((targetKind === 'file' ? data?.files : data?.folders) || []) as (FileDTO | FolderDTO)[];
    const from = arr.findIndex((x) => x.id === drag.id);
    if (from < 0) return;
    const next = [...arr];
    const [moved] = next.splice(from, 1);
    let targetIdx = next.findIndex((x) => x.id === targetId);
    if (targetIdx < 0) return;
    if (hint.mode === 'after') targetIdx += 1;
    next.splice(targetIdx, 0, moved);
    applyReorder(targetKind, next);
  };

  const onDragEnd = () => {
    dragRef.current = null;
    setDropHint(null);
    setDropCrumb(null);
  };

  const onCrumbDragOver = (e: React.DragEvent, crumbKey: string | 'home') => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHint(null);
    setDropCrumb(crumbKey);
  };

  const onCrumbDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    const drag = dragRef.current;
    setDropCrumb(null);
    dragRef.current = null;
    if (!drag) return;
    moveItemToFolder({ kind: drag.kind, id: drag.id, title: titleOf(drag.kind, drag.id) }, targetFolderId);
  };

  /** Drop-target visual: outline for "into", an edge line for reorder. */
  const dropSx = (kind: 'file' | 'folder', id: string) => {
    if (!dropHint || dropHint.kind !== kind || dropHint.id !== id) return {};
    const c = theme.palette.primary.main;
    if (dropHint.mode === 'into') return { outline: `2px solid ${c}`, outlineOffset: '-2px', bgcolor: alpha(c, 0.06) };
    if (dropHint.mode === 'before') return { boxShadow: `inset 0 3px 0 ${c}` };
    return { boxShadow: `inset 0 -3px 0 ${c}` };
  };

  const toggleChip = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const folders = data?.folders || [];
  const files = data?.files || [];
  const atRoot = !folderId;

  /**
   * Always-on drag handle (desktop). Touch users reorder/move via the ... menu.
   * Written as a render function, not a nested component, so the dragged node is reconciled in
   * place across the re-renders that dragover triggers (a remount would abort the native drag).
   */
  const renderDragHandle = (kind: 'file' | 'folder', id: string, sx?: object) => (
    <Box
      draggable
      onDragStart={(e) => onItemDragStart(e, kind, id)}
      onDragEnd={onDragEnd}
      onClick={(e) => e.stopPropagation()}
      aria-label="Drag to reorder or move"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        color: 'text.disabled',
        '&:active': { cursor: 'grabbing' },
        '&:hover': { color: 'text.secondary' },
        ...sx,
      }}
    >
      <DragIndicatorIcon fontSize="small" />
    </Box>
  );

  const fileChip = (file: FileDTO) => (
    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
      <Chip
        size="small"
        icon={file.downloadable ? <DownloadOutlinedIcon /> : <LockOutlinedIcon />}
        label={
          file.allow_download === null || file.allow_download === undefined
            ? file.downloadable
              ? 'Download (inherit)'
              : 'View only (inherit)'
            : file.downloadable
              ? 'Download'
              : 'View only'
        }
        sx={{ height: 20, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: '0.78rem' } }}
      />
      <Chip
        size="small"
        icon={file.has_test ? <QuizOutlinedIcon /> : <ErrorOutlineIcon />}
        label={file.has_test ? 'Test' : 'No test'}
        sx={{
          height: 20,
          fontSize: '0.6rem',
          '& .MuiChip-icon': { fontSize: '0.78rem' },
          bgcolor: file.has_test ? alpha(theme.palette.success.main, 0.14) : alpha(theme.palette.warning.main, 0.18),
          color: file.has_test ? 'success.main' : 'warning.dark',
        }}
      />
      {file.recording && (
        <Chip
          size="small"
          icon={<SmartDisplayOutlinedIcon />}
          label="Video"
          sx={{
            height: 20,
            fontSize: '0.6rem',
            '& .MuiChip-icon': { fontSize: '0.78rem' },
            bgcolor: alpha(theme.palette.info.main, 0.14),
            color: 'info.main',
          }}
        />
      )}
    </Box>
  );

  const folderMeta = (f: FolderDTO) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{f.item_count} items</Typography>
      {(f.target_exams?.length || f.target_programs?.length) ? (
        <Chip size="small" label={[...(f.target_exams || []), ...(f.target_programs || [])].join(', ')} sx={{ height: 18, fontSize: '0.58rem' }} />
      ) : null}
      <Chip
        size="small"
        icon={f.allow_download ? <DownloadOutlinedIcon /> : <LockOutlinedIcon />}
        label={f.allow_download ? 'Downloadable' : 'View only'}
        sx={{ height: 18, fontSize: '0.58rem', '& .MuiChip-icon': { fontSize: '0.7rem' } }}
      />
    </Box>
  );

  const handleOverlaySx = {
    position: 'absolute' as const,
    top: 4,
    left: 4,
    zIndex: 2,
    width: 26,
    height: 26,
    borderRadius: 1,
    bgcolor: alpha(theme.palette.background.paper, 0.85),
  };

  // ── Grid view ──
  const gridView = (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
      {folders.map((f) => (
        <Card
          key={f.id}
          elevation={0}
          onDragOver={(e) => onItemDragOver(e, 'folder', f.id)}
          onDrop={(e) => onItemDrop(e, 'folder', f.id)}
          onDragEnd={onDragEnd}
          sx={{ position: 'relative', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5, transition: 'transform 150ms ease, box-shadow 150ms ease', '&:hover': dropHint ? undefined : { transform: 'translateY(-2px)', boxShadow: `0 6px 20px ${alpha('#000', 0.08)}` }, ...dropSx('folder', f.id) }}
        >
          <CardActionArea onClick={() => goToFolder(f.id)} sx={{ p: 1.5, pt: 3.75, minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ width: 48, height: 48, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.primary.main, 0.1), mb: 1 }}>
              <FolderOutlinedIcon sx={{ fontSize: 28, color: 'primary.main' }} />
            </Box>
            <Box sx={{ width: '100%' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>{f.name}</Typography>
              {folderMeta(f)}
            </Box>
          </CardActionArea>
          {renderDragHandle('folder', f.id, handleOverlaySx)}
          <IconButton size="small" onClick={(e) => setFolderMenu({ el: e.currentTarget, folder: f })} sx={{ position: 'absolute', top: 4, right: 4 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Card>
      ))}

      {files.map((file) => (
        <Card
          key={file.id}
          elevation={0}
          onDragOver={(e) => onItemDragOver(e, 'file', file.id)}
          onDrop={(e) => onItemDrop(e, 'file', file.id)}
          onDragEnd={onDragEnd}
          sx={{ position: 'relative', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5, transition: 'transform 150ms ease, box-shadow 150ms ease', '&:hover': dropHint ? undefined : { transform: 'translateY(-2px)', boxShadow: `0 6px 20px ${alpha('#000', 0.08)}` }, ...dropSx('file', file.id) }}
        >
          <CardActionArea onClick={() => openFile(file)} sx={{ p: 1.5, minHeight: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
            <FileThumb kind={file.kind} src={thumbUrl(file.id)} />
            <Box sx={{ width: '100%' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.25 }} noWrap>{file.title}</Typography>
              {fileChip(file)}
            </Box>
          </CardActionArea>
          {renderDragHandle('file', file.id, handleOverlaySx)}
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setFileMenu({ el: e.currentTarget, file }); }} sx={{ position: 'absolute', top: 4, right: 4, bgcolor: alpha(theme.palette.background.paper, 0.85), '&:hover': { bgcolor: theme.palette.background.paper } }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Card>
      ))}
    </Box>
  );

  // ── List view ──
  const rowSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1.25,
    p: 1,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 2,
    cursor: 'pointer',
    transition: 'background-color 150ms ease',
    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
  } as const;

  const listView = (
    <Stack spacing={1}>
      {folders.map((f) => (
        <Box
          key={f.id}
          onClick={() => goToFolder(f.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') goToFolder(f.id); }}
          onDragOver={(e) => onItemDragOver(e, 'folder', f.id)}
          onDrop={(e) => onItemDrop(e, 'folder', f.id)}
          onDragEnd={onDragEnd}
          sx={{ ...rowSx, ...dropSx('folder', f.id) }}
        >
          {renderDragHandle('folder', f.id, { flexShrink: 0, width: 24, height: 44, ml: -0.5 })}
          <Box sx={{ width: 44, height: 44, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.primary.main, 0.1), flexShrink: 0 }}>
            <FolderOutlinedIcon sx={{ color: 'primary.main' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>{f.name}</Typography>
            {folderMeta(f)}
          </Box>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setFolderMenu({ el: e.currentTarget, folder: f }); }} aria-label="Folder actions" sx={{ flexShrink: 0 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      {files.map((file) => (
        <Box
          key={file.id}
          onClick={() => openFile(file)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') openFile(file); }}
          onDragOver={(e) => onItemDragOver(e, 'file', file.id)}
          onDrop={(e) => onItemDrop(e, 'file', file.id)}
          onDragEnd={onDragEnd}
          sx={{ ...rowSx, ...dropSx('file', file.id) }}
        >
          {renderDragHandle('file', file.id, { flexShrink: 0, width: 24, height: 44, ml: -0.5 })}
          <Box sx={{ width: 44, height: 44, flexShrink: 0 }}>
            <FileThumb kind={file.kind} src={thumbUrl(file.id)} sx={{ height: 44, mb: 0, borderRadius: 1.5 }} iconSize={22} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>{file.title}</Typography>
            {fileChip(file)}
          </Box>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setFileMenu({ el: e.currentTarget, file }); }} aria-label="File actions" sx={{ flexShrink: 0 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Stack>
  );

  return (
    <Box>
      {/* Header + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <FolderOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 800, flex: 1 }}>
          Study Materials
        </Typography>
        <ToggleButtonGroup
          value={view}
          exclusive
          size="small"
          onChange={(_, v) => changeView(v)}
          aria-label="View layout"
          sx={{ '& .MuiToggleButton-root': { px: 1 } }}
        >
          <ToggleButton value="grid" aria-label="Grid view"><GridViewOutlinedIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="list" aria-label="List view"><ViewListOutlinedIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CreateNewFolderOutlinedIcon />}
          onClick={openCreate}
          disabled={busy}
        >
          New Folder
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<UploadFileOutlinedIcon />}
          onClick={() => setUploadOpen(true)}
          disabled={busy || atRoot}
        >
          Upload
        </Button>
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Organise resources into folders for students. {atRoot ? 'Open a folder to upload files.' : 'Tap a file to preview it.'} Drag the handle to reorder, or drop an item onto a folder to move it. On a phone, use the menu (Move to folder, Move up or down).
      </Typography>

      {/* Breadcrumb (also a drop target: drag an item onto a crumb to move it there) */}
      <Breadcrumbs separator="›" sx={{ mb: 2 }}>
        <Link
          component="button"
          underline="hover"
          color={atRoot ? 'text.primary' : 'text.secondary'}
          onClick={() => goToFolder(null)}
          onDragOver={(e) => onCrumbDragOver(e, 'home')}
          onDrop={(e) => onCrumbDrop(e, null)}
          onDragEnd={onDragEnd}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: atRoot ? 700 : 400, borderRadius: 1, px: 0.5, bgcolor: dropCrumb === 'home' ? alpha(theme.palette.primary.main, 0.14) : 'transparent' }}
        >
          <HomeOutlinedIcon sx={{ fontSize: '1rem' }} /> Home
        </Link>
        {(data?.breadcrumb || []).map((crumb, i, arr) => {
          const isLast = i === arr.length - 1;
          return (
            <Link
              key={crumb.id}
              component="button"
              underline="hover"
              color={isLast ? 'text.primary' : 'text.secondary'}
              onClick={() => !isLast && goToFolder(crumb.id)}
              onDragOver={(e) => onCrumbDragOver(e, crumb.id)}
              onDrop={(e) => onCrumbDrop(e, crumb.id)}
              onDragEnd={onDragEnd}
              sx={{ fontWeight: isLast ? 700 : 400, borderRadius: 1, px: 0.5, bgcolor: dropCrumb === crumb.id ? alpha(theme.palette.primary.main, 0.14) : 'transparent' }}
            >
              {crumb.name}
            </Link>
          );
        })}
      </Breadcrumbs>

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={130} />
          ))}
        </Box>
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyState
          title="This folder is empty"
          description={atRoot ? 'Create your first folder to get started.' : 'Upload files or create a subfolder.'}
          icon={<FolderOutlinedIcon />}
          action={
            atRoot ? (
              <Button variant="contained" startIcon={<CreateNewFolderOutlinedIcon />} onClick={openCreate}>
                New Folder
              </Button>
            ) : (
              <Button variant="contained" startIcon={<UploadFileOutlinedIcon />} onClick={() => setUploadOpen(true)}>
                Upload files
              </Button>
            )
          }
        />
      ) : view === 'grid' ? (
        gridView
      ) : (
        listView
      )}

      {/* Folder menu */}
      <Menu anchorEl={folderMenu?.el} open={!!folderMenu} onClose={() => setFolderMenu(null)}>
        <MenuItem onClick={() => { if (folderMenu) openEdit(folderMenu.folder); setFolderMenu(null); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Rename / edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (folderMenu) setMovePicker({ kind: 'folder', id: folderMenu.folder.id, title: folderMenu.folder.name }); setFolderMenu(null); }}>
          <ListItemIcon><DriveFileMoveOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move to folder...</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={busy || !folderMenu || folders.findIndex((x) => x.id === folderMenu.folder.id) <= 0}
          onClick={() => folderMenu && moveBy('folder', folderMenu.folder.id, -1)}
        >
          <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move up</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={busy || !folderMenu || folders.findIndex((x) => x.id === folderMenu.folder.id) >= folders.length - 1}
          onClick={() => folderMenu && moveBy('folder', folderMenu.folder.id, 1)}
        >
          <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move down</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (folderMenu) setGrantTarget({ kind: 'folder', id: folderMenu.folder.id, name: folderMenu.folder.name }); setFolderMenu(null); }}>
          <ListItemIcon><LockClockOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Grant download access...</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (folderMenu) deleteFolder(folderMenu.folder); setFolderMenu(null); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* File menu */}
      <Menu anchorEl={fileMenu?.el} open={!!fileMenu} onClose={() => setFileMenu(null)}>
        <MenuItem onClick={() => { if (fileMenu) openFile(fileMenu.file); setFileMenu(null); }}>
          <ListItemIcon><FileIcon kind={fileMenu?.file.kind || 'other'} size={18} /></ListItemIcon>
          <ListItemText>Preview</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (fileMenu) { setRenameFile(fileMenu.file); setRenameValue(fileMenu.file.title); } setFileMenu(null); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (fileMenu) setMovePicker({ kind: 'file', id: fileMenu.file.id, title: fileMenu.file.title }); setFileMenu(null); }}>
          <ListItemIcon><DriveFileMoveOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move to folder...</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={busy || !fileMenu || files.findIndex((x) => x.id === fileMenu.file.id) <= 0}
          onClick={() => fileMenu && moveBy('file', fileMenu.file.id, -1)}
        >
          <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move up</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={busy || !fileMenu || files.findIndex((x) => x.id === fileMenu.file.id) >= files.length - 1}
          onClick={() => fileMenu && moveBy('file', fileMenu.file.id, 1)}
        >
          <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move down</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => fileMenu && toggleFileDownload(fileMenu.file, true)}>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Allow download</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => fileMenu && toggleFileDownload(fileMenu.file, false)}>
          <ListItemIcon><LockOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>View only</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => fileMenu && toggleFileDownload(fileMenu.file, null)}>
          <ListItemIcon><FolderOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Inherit from folder</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (fileMenu) setGrantTarget({ kind: 'file', id: fileMenu.file.id, name: fileMenu.file.title, folderId: fileMenu.file.folder_id }); setFileMenu(null); }}>
          <ListItemIcon><LockClockOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Grant download access...</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (fileMenu) setTestFile({ id: fileMenu.file.id, title: fileMenu.file.title }); setFileMenu(null); }}>
          <ListItemIcon><QuizOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{fileMenu?.file.has_test ? 'Edit test' : 'Attach test'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (fileMenu) setVideoFile(fileMenu.file); setFileMenu(null); }}>
          <ListItemIcon><SmartDisplayOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{fileMenu?.file.recording ? 'Edit video' : 'Link video'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (fileMenu) router.push(`/teacher/study-materials/completion/${fileMenu.file.id}`); setFileMenu(null); }}>
          <ListItemIcon><GroupsOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>View completion</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (fileMenu) deleteFile(fileMenu.file); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Folder create/edit dialog */}
      <Dialog open={!!folderDialog} onClose={() => setFolderDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{folderDialog?.mode === 'create' ? 'New Folder' : 'Edit Folder'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Folder name" value={fName} onChange={(e) => setFName(e.target.value)} fullWidth autoFocus size="small" />
            <TextField label="Description (optional)" value={fDesc} onChange={(e) => setFDesc(e.target.value)} fullWidth size="small" multiline minRows={2} />
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Show to exams (none = everyone)</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                {EXAM_OPTIONS.map((o) => (
                  <Chip key={o.value} label={o.label} clickable color={fExams.includes(o.value) ? 'primary' : 'default'} variant={fExams.includes(o.value) ? 'filled' : 'outlined'} onClick={() => toggleChip(fExams, setFExams, o.value)} />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Show to programs (none = everyone)</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                {PROGRAM_OPTIONS.map((o) => (
                  <Chip key={o.value} label={o.label} clickable color={fPrograms.includes(o.value) ? 'primary' : 'default'} variant={fPrograms.includes(o.value) ? 'filled' : 'outlined'} onClick={() => toggleChip(fPrograms, setFPrograms, o.value)} />
                ))}
              </Box>
            </Box>
            <FormControlLabel
              control={<Switch checked={fDownload} onChange={(e) => setFDownload(e.target.checked)} />}
              label={fDownload ? 'Files downloadable by default' : 'View-only by default'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFolderDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveFolder} disabled={busy || !fName.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* File rename dialog */}
      <Dialog open={!!renameFile} onClose={() => setRenameFile(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename file</DialogTitle>
        <DialogContent>
          <TextField value={renameValue} onChange={(e) => setRenameValue(e.target.value)} fullWidth autoFocus size="small" sx={{ mt: 0.5 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameFile(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveRename} disabled={busy || !renameValue.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Multi-file upload */}
      <StudyUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        folderId={folderId}
        authFetch={authFetch}
        onUploaded={load}
      />

      {/* In-app preview (same viewer students use) */}
      <StudyFileViewer
        file={viewerFile}
        token={token}
        getToken={getToken}
        onClose={() => setViewerFile(null)}
      />

      {/* Time-limited download grants (file or folder) */}
      <DownloadGrantDialog
        open={!!grantTarget}
        target={grantTarget}
        classroomId={activeClassroom?.id ?? null}
        authFetch={authFetch}
        onClose={() => setGrantTarget(null)}
      />

      {/* Per-file test authoring (JSON upload or manual) */}
      <StudyTestAuthorDialog
        open={!!testFile}
        file={testFile}
        authFetch={authFetch}
        onClose={() => setTestFile(null)}
        onSaved={load}
      />

      {/* Per-file class-recording link */}
      <StudyVideoLinkDialog
        open={!!videoFile}
        file={videoFile}
        authFetch={authFetch}
        onClose={() => setVideoFile(null)}
        onSaved={load}
      />

      {/* Move to folder... picker (touch-friendly path; drag-and-drop does the same on desktop) */}
      <FolderMovePicker
        open={!!movePicker}
        onClose={() => setMovePicker(null)}
        item={movePicker}
        currentFolderId={folderId}
        authFetch={authFetch}
        onSelect={(target) => movePicker && moveItemToFolder(movePicker, target)}
        onError={(msg) => setSnack({ msg, sev: 'error' })}
      />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack ? <Alert severity={snack.sev} onClose={() => setSnack(null)} variant="filled">{snack.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

export default function TeacherStudyMaterialsPage() {
  return (
    <Suspense fallback={<Box sx={{ p: 2 }}><Skeleton variant="rounded" height={400} /></Box>}>
      <TeacherStudyMaterials />
    </Suspense>
  );
}
