'use client';

/**
 * StudyUploadDialog — multi-file upload for the teacher Study Materials page.
 *
 * Lets staff pick or drag-and-drop several PDFs / images at once, review the staged list
 * (remove any before sending), then upload them together with per-file status and an overall
 * progress bar. Uploads run with limited concurrency against POST /api/study-materials/files
 * (one file per request, as the API expects). Failed files stay visible and can be retried.
 */

import { useRef, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Stack,
  CircularProgress,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import { FileIcon, formatSize } from './FileThumb';
import DriveFilePickerDialog, { type DriveItem } from '@/components/shared/DriveFilePickerDialog';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const MAX_SIZE = 50 * 1024 * 1024; // keep in sync with the API route
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const CONCURRENCY = 3;

type Status = 'queued' | 'uploading' | 'done' | 'error';
interface UploadItem {
  id: number;
  file: File;
  status: Status;
  error?: string;
}

function kindOf(type: string): string {
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/')) return 'image';
  return 'other';
}

interface StudyUploadDialogProps {
  open: boolean;
  onClose: () => void;
  folderId: string | null;
  /** Authed fetch from the parent (injects the bearer token). */
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Called after an upload run finishes so the parent can refresh the folder. */
  onUploaded: () => void;
}

export default function StudyUploadDialog({ open, onClose, folderId, authFetch, onUploaded }: StudyUploadDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const { getToken, getFileSearchToken } = useNexusAuthContext();

  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // A file already in OneDrive/SharePoint: linked, not re-uploaded. Kept as a
  // list (not one slot) so picking a second file does not silently overwrite
  // the status of the first, and each one can be individually undone.
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveLinks, setDriveLinks] = useState<
    Array<{ localId: number; name: string; state: 'linking' | 'done' | 'error' | 'removing'; error?: string; fileId?: string }>
  >([]);
  const driveIdRef = useRef(0);

  const linkDriveItem = async (item: DriveItem) => {
    if (!folderId) return;
    const localId = driveIdRef.current++;
    setDriveLinks((prev) => [...prev, { localId, name: item.name, state: 'linking' }]);
    try {
      const res = await authFetch('/api/study-materials/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId, url: item.webUrl }),
      });
      const body = await res.json().catch(() => ({} as { file?: { id: string }; error?: string }));
      if (!res.ok) {
        setDriveLinks((prev) =>
          prev.map((d) => (d.localId === localId ? { ...d, state: 'error', error: body.error || 'Could not link that file' } : d)),
        );
        return;
      }
      setDriveLinks((prev) => prev.map((d) => (d.localId === localId ? { ...d, state: 'done', fileId: body.file?.id } : d)));
      onUploaded();
    } catch {
      setDriveLinks((prev) => prev.map((d) => (d.localId === localId ? { ...d, state: 'error', error: 'Network error, try again' } : d)));
    }
  };

  /** One picker session can hand back several files at once; link them with the same bounded concurrency as uploads. */
  const linkDriveItems = (picked: DriveItem[]) => {
    if (!picked.length) return;
    let cursor = 0;
    const worker = async () => {
      while (cursor < picked.length) {
        await linkDriveItem(picked[cursor++]);
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, picked.length) }, worker));
  };

  /** Undo a wrongly-picked file. Already-linked ones are unlinked server-side (never deletes the real Drive file, see the DELETE route). */
  const removeDriveLink = async (localId: number) => {
    const entry = driveLinks.find((d) => d.localId === localId);
    if (!entry) return;
    if (!entry.fileId) {
      setDriveLinks((prev) => prev.filter((d) => d.localId !== localId));
      return;
    }
    setDriveLinks((prev) => prev.map((d) => (d.localId === localId ? { ...d, state: 'removing' } : d)));
    try {
      await authFetch(`/api/study-materials/files/${entry.fileId}`, { method: 'DELETE' });
    } catch {
      // best-effort: still drop it from the picked list, staff can remove it from the folder view if the call failed
    }
    setDriveLinks((prev) => prev.filter((d) => d.localId !== localId));
    onUploaded();
  };

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;
    setItems((prev) => [
      ...prev,
      ...incoming.map((file) => {
        const tooBig = file.size > MAX_SIZE;
        const wrongType = !ALLOWED_TYPES.includes(file.type);
        const status: Status = tooBig || wrongType ? 'error' : 'queued';
        const error = tooBig ? 'Exceeds 50 MB limit' : wrongType ? 'Only PDF and image files' : undefined;
        return { id: idRef.current++, file, status, error };
      }),
    ]);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (isUploading) return;
    // Add everything dropped; per-file validation in addFiles flags unsupported/oversize as error rows.
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));

  const setStatus = (id: number, status: Status, error?: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status, error } : i)));

  const uploadAll = async () => {
    if (!folderId) return;
    const queue = items.filter((i) => i.status === 'queued' || i.status === 'error').filter((i) => i.file.size <= MAX_SIZE && ALLOWED_TYPES.includes(i.file.type));
    if (!queue.length) return;
    setIsUploading(true);

    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        setStatus(item.id, 'uploading');
        try {
          const form = new FormData();
          form.append('file', item.file);
          form.append('folder_id', folderId);
          const res = await authFetch('/api/study-materials/files', { method: 'POST', body: form });
          if (res.ok) {
            setStatus(item.id, 'done');
          } else {
            const body = await res.json().catch(() => ({} as { error?: string }));
            setStatus(item.id, 'error', body.error || 'Upload failed');
          }
        } catch {
          setStatus(item.id, 'error', 'Network error, try again');
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setIsUploading(false);
    onUploaded();
  };

  const driveBusy = driveLinks.some((d) => d.state === 'linking' || d.state === 'removing');

  const handleClose = () => {
    if (isUploading || driveBusy) return;
    setItems([]);
    setDriveLinks([]);
    onClose();
  };

  const total = items.length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const pendingCount = items.filter((i) => i.status === 'queued').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const retryable = items.filter((i) => i.status === 'error' && i.file.size <= MAX_SIZE && ALLOWED_TYPES.includes(i.file.type)).length;
  const uploadableCount = pendingCount + retryable;
  const allSettled = total > 0 && items.every((i) => i.status === 'done' || i.status === 'error');
  // Nothing left for either the Upload button or a picker request to finish:
  // safe to relabel the left action from "Cancel" to "Done".
  const hasActivity = total > 0 || driveLinks.length > 0;
  const nothingPending = (total === 0 || allSettled) && !driveBusy && !isUploading && uploadableCount === 0;
  const showDone = hasActivity && nothingPending;

  const statusChip = (item: UploadItem) => {
    if (item.status === 'uploading') return <CircularProgress size={16} thickness={5} />;
    if (item.status === 'done') return <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />;
    if (item.status === 'error')
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ErrorOutlineIcon sx={{ fontSize: 20, color: 'error.main' }} />
          <Typography variant="caption" sx={{ color: 'error.main' }} noWrap>{item.error}</Typography>
        </Box>
      );
    return null;
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <CloudUploadOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Upload files</Typography>
        <IconButton onClick={handleClose} disabled={isUploading || driveBusy} aria-label="Close" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* Drop zone */}
        <Box
          onClick={() => !isUploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!isUploading) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isUploading) inputRef.current?.click(); }}
          sx={{
            border: `2px dashed ${dragOver ? theme.palette.primary.main : theme.palette.divider}`,
            bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.06) : 'action.hover',
            borderRadius: 2,
            p: { xs: 2.5, sm: 3 },
            textAlign: 'center',
            cursor: isUploading ? 'default' : 'pointer',
            transition: 'border-color 150ms ease, background-color 150ms ease',
            '&:hover': { borderColor: isUploading ? theme.palette.divider : theme.palette.primary.main },
          }}
        >
          <CloudUploadOutlinedIcon sx={{ fontSize: 36, color: 'primary.main', mb: 0.5 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Drag files here, or tap to browse
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            PDF or images, up to 50 MB each. Select several at once.
          </Typography>
        </Box>
        <input ref={inputRef} type="file" hidden multiple accept="application/pdf,image/*" onChange={onPick} />

        {/* A file already in OneDrive/SharePoint (e.g. a shared library drive):
            link it instead of downloading it locally and re-uploading. */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
          <Button
            size="small"
            startIcon={<CloudOutlinedIcon />}
            onClick={() => setDriveOpen(true)}
            disabled={isUploading}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Pick from OneDrive/SharePoint
          </Button>
        </Box>

        {/* Everything staged this session, local uploads and drive links alike, in one
            list capped to a fixed height so a big batch scrolls in place instead of
            growing the dialog off the screen. */}
        {(total > 0 || driveLinks.length > 0) && (
          <Box sx={{ mt: 2, maxHeight: { xs: 'none', sm: 320 }, overflowY: { xs: 'visible', sm: 'auto' }, pr: { sm: 0.5 } }}>
            <Stack spacing={1}>
              {driveLinks.map((d) => (
                <Box
                  key={`drive-${d.localId}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    p: 1,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1.5,
                    bgcolor: d.state === 'done' ? alpha(theme.palette.success.main, 0.06) : 'background.paper',
                  }}
                >
                  <Box sx={{ width: 32, height: 32, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', flexShrink: 0 }}>
                    <CloudOutlinedIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{d.name}</Typography>
                    {d.state === 'error' && (
                      <Typography variant="caption" sx={{ color: 'error.main' }}>{d.error}</Typography>
                    )}
                    {d.state === 'done' && (
                      <Typography variant="caption" sx={{ color: 'success.main' }}>Linked</Typography>
                    )}
                  </Box>
                  {d.state === 'linking' && <CircularProgress size={16} thickness={5} />}
                  {d.state === 'removing' && <CircularProgress size={16} thickness={5} />}
                  {d.state === 'done' && <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />}
                  {d.state === 'error' && <ErrorOutlineIcon sx={{ fontSize: 20, color: 'error.main' }} />}
                  {(d.state === 'done' || d.state === 'error') && (
                    <IconButton
                      size="small"
                      onClick={() => removeDriveLink(d.localId)}
                      aria-label={`Remove ${d.name}`}
                      sx={{ flexShrink: 0 }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}

              {items.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    p: 1,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1.5,
                    bgcolor: item.status === 'done' ? alpha(theme.palette.success.main, 0.06) : 'background.paper',
                  }}
                >
                  <Box sx={{ width: 32, height: 32, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', flexShrink: 0 }}>
                    <FileIcon kind={kindOf(item.file.type)} size={20} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{item.file.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatSize(item.file.size)}</Typography>
                  </Box>
                  <Box sx={{ flexShrink: 0, maxWidth: '45%', display: 'flex', justifyContent: 'flex-end' }}>{statusChip(item)}</Box>
                  {(item.status === 'queued' || item.status === 'error') && !isUploading && (
                    <IconButton size="small" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.file.name}`} sx={{ flexShrink: 0 }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* Overall progress */}
        {(isUploading || (allSettled && doneCount > 0)) && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {doneCount} of {total} uploaded{errorCount ? ` · ${errorCount} failed` : ''}
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={total ? (doneCount / total) * 100 : 0} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isUploading || driveBusy}>
          {showDone ? 'Done' : 'Cancel'}
        </Button>
        <Button
          variant="contained"
          onClick={uploadAll}
          disabled={isUploading || uploadableCount === 0}
          startIcon={isUploading ? <CircularProgress size={16} color="inherit" /> : errorCount ? <ReplayIcon /> : <CloudUploadOutlinedIcon />}
        >
          {isUploading
            ? 'Uploading...'
            : errorCount && !pendingCount
              ? `Retry ${retryable} file${retryable === 1 ? '' : 's'}`
              : `Upload ${uploadableCount} file${uploadableCount === 1 ? '' : 's'}`}
        </Button>
      </DialogActions>

      <DriveFilePickerDialog
        open={driveOpen}
        onClose={() => setDriveOpen(false)}
        getToken={getToken}
        getSearchToken={getFileSearchToken}
        multiple
        onPickMultiple={linkDriveItems}
        kind="document"
        scope="both"
        title="Pick from OneDrive/SharePoint"
        subtitle="Select one or more files. They stay where they are; students read them through the app."
      />
    </Dialog>
  );
}
