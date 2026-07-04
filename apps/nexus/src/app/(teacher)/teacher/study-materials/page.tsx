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
  CircularProgress,
  EmptyState,
  alpha,
  useTheme,
} from '@neram/ui';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const EXAM_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee', label: 'JEE' },
];
const PROGRAM_OPTIONS = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'software', label: 'Software' },
];

interface FolderDTO {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
  target_exams?: string[];
  target_programs?: string[];
  allow_download?: boolean;
}
interface FileDTO {
  id: string;
  title: string;
  file_name: string;
  kind: string;
  downloadable: boolean;
  allow_download?: boolean | null;
}

function FileGlyph({ kind, size = 28 }: { kind: string; size?: number }) {
  if (kind === 'pdf') return <PictureAsPdfOutlinedIcon sx={{ fontSize: size, color: '#d32f2f' }} />;
  if (kind === 'image') return <ImageOutlinedIcon sx={{ fontSize: size, color: '#1976d2' }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
}

function TeacherStudyMaterials() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folder');
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [data, setData] = useState<{ breadcrumb: { id: string; name: string }[]; folders: FolderDTO[]; files: FileDTO[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      return fetch(url, {
        ...init,
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/study-materials/folders${folderId ? `?parent=${folderId}` : ''}`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch {
      setSnack({ msg: 'Could not load this folder', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [authFetch, folderId]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const goToFolder = (id: string | null) =>
    router.push(id ? `/teacher/study-materials?folder=${id}` : '/teacher/study-materials');

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

  // ── File upload ──
  const onUploadClick = () => fileInputRef.current?.click();
  const onFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !folderId) return;
    setBusy(true);
    let ok = 0;
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('folder_id', folderId);
        const res = await authFetch('/api/study-materials/files', { method: 'POST', body: form });
        if (res.ok) ok += 1;
      } catch {
        /* counted as failure below */
      }
    }
    setSnack({
      msg: ok === files.length ? `Uploaded ${ok} file(s)` : `Uploaded ${ok} of ${files.length}`,
      sev: ok === files.length ? 'success' : 'error',
    });
    setBusy(false);
    load();
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

  const toggleChip = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const folders = data?.folders || [];
  const files = data?.files || [];
  const atRoot = !folderId;

  return (
    <Box>
      {/* Header + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <FolderOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 800, flex: 1 }}>
          Study Materials
        </Typography>
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
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <UploadFileOutlinedIcon />}
          onClick={onUploadClick}
          disabled={busy || atRoot}
        >
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept="application/pdf,image/*"
          onChange={onFilesPicked}
        />
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Organise resources into folders for students. {atRoot ? 'Open a folder to upload files.' : 'New items default to view-only.'}
      </Typography>

      {/* Breadcrumb */}
      <Breadcrumbs separator="›" sx={{ mb: 2 }}>
        <Link
          component="button"
          underline="hover"
          color={atRoot ? 'text.primary' : 'text.secondary'}
          onClick={() => goToFolder(null)}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: atRoot ? 700 : 400 }}
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
              sx={{ fontWeight: isLast ? 700 : 400 }}
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
            <Button variant="contained" startIcon={<CreateNewFolderOutlinedIcon />} onClick={openCreate}>
              New Folder
            </Button>
          }
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {folders.map((f) => (
            <Card key={f.id} elevation={0} sx={{ position: 'relative', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5 }}>
              <CardActionArea onClick={() => goToFolder(f.id)} sx={{ p: 1.5, minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.primary.main, 0.1), mb: 1 }}>
                  <FolderOutlinedIcon sx={{ fontSize: 28, color: 'primary.main' }} />
                </Box>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>{f.name}</Typography>
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
                </Box>
              </CardActionArea>
              <IconButton size="small" onClick={(e) => setFolderMenu({ el: e.currentTarget, folder: f })} sx={{ position: 'absolute', top: 4, right: 4 }}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Card>
          ))}

          {files.map((file) => (
            <Card key={file.id} elevation={0} sx={{ position: 'relative', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5 }}>
              <Box sx={{ p: 1.5, minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.text.primary, 0.04), mb: 1 }}>
                  <FileGlyph kind={file.kind} />
                </Box>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.25 }} noWrap>{file.title}</Typography>
                  <Chip
                    size="small"
                    icon={file.downloadable ? <DownloadOutlinedIcon /> : <LockOutlinedIcon />}
                    label={file.allow_download === null || file.allow_download === undefined ? (file.downloadable ? 'Download (inherit)' : 'View only (inherit)') : file.downloadable ? 'Download' : 'View only'}
                    sx={{ mt: 0.5, height: 20, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: '0.78rem' } }}
                  />
                </Box>
              </Box>
              <IconButton size="small" onClick={(e) => setFileMenu({ el: e.currentTarget, file })} sx={{ position: 'absolute', top: 4, right: 4 }}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Card>
          ))}
        </Box>
      )}

      {/* Folder menu */}
      <Menu anchorEl={folderMenu?.el} open={!!folderMenu} onClose={() => setFolderMenu(null)}>
        <MenuItem onClick={() => { if (folderMenu) openEdit(folderMenu.folder); setFolderMenu(null); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit folder</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (folderMenu) deleteFolder(folderMenu.folder); setFolderMenu(null); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* File menu */}
      <Menu anchorEl={fileMenu?.el} open={!!fileMenu} onClose={() => setFileMenu(null)}>
        <MenuItem onClick={() => { if (fileMenu) { setRenameFile(fileMenu.file); setRenameValue(fileMenu.file.title); } setFileMenu(null); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Rename</ListItemText>
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
