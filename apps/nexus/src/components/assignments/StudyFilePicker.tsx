'use client';

/**
 * Pick an existing Study Materials file (SharePoint-backed) to attach to an
 * assignment, instead of re-uploading it. Browses the study-materials folder
 * tree via GET /api/study-materials/folders?parent=<id> and returns the chosen
 * file id to the caller, which links it as an assignment attachment.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box, Dialog, Typography, Stack, IconButton, Button, Skeleton, Breadcrumbs, Link as MuiLink,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface FolderNode { id: string; name: string; item_count: number }
interface FileNode { id: string; title: string; file_name: string; file_type: string | null }
interface Crumb { id: string; name: string }

export interface PickedFile { id: string; title: string; file_name: string; file_type: string | null }

export default function StudyFilePicker({
  open,
  onClose,
  authFetch,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onPick: (file: PickedFile) => void;
}) {
  const [parentId, setParentId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (pid: string | null) => {
      setLoading(true);
      setError('');
      try {
        const q = pid ? `?parent=${pid}` : '';
        const res = await authFetch(`/api/study-materials/folders${q}`);
        setFolders(res.folders || []);
        setFiles(res.files || []);
        setBreadcrumb(res.breadcrumb || []);
        setParentId(pid);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load folders.');
      } finally {
        setLoading(false);
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (open) load(null);
  }, [open, load]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 3 } }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', flex: 1 }}>Pick from Study Materials</Typography>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Breadcrumbs separator="›" sx={{ mb: 1.5 }}>
          <MuiLink component="button" underline="hover" color="inherit" onClick={() => load(null)} sx={{ fontWeight: 600 }}>
            Home
          </MuiLink>
          {breadcrumb.map((c) => (
            <MuiLink key={c.id} component="button" underline="hover" color="inherit" onClick={() => load(c.id)}>
              {c.name}
            </MuiLink>
          ))}
        </Breadcrumbs>

        {loading ? (
          <Stack spacing={1}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={52} sx={{ borderRadius: 2 }} />
            ))}
          </Stack>
        ) : error ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">{error}</Typography>
            <Button onClick={() => load(parentId)} sx={{ mt: 1, minHeight: 44 }}>Try again</Button>
          </Box>
        ) : folders.length === 0 && files.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 5, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="body2" color="text.disabled">This folder is empty.</Typography>
          </Box>
        ) : (
          <Stack spacing={0.75} sx={{ maxHeight: '55vh', overflowY: 'auto' }}>
            {folders.map((f) => (
              <Box
                key={f.id}
                role="button"
                onClick={() => load(f.id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, minHeight: 52,
                  borderRadius: 2, border: '1px solid', borderColor: 'divider', cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                }}
              >
                <FolderOutlinedIcon sx={{ color: 'primary.main' }} />
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{f.name}</Typography>
                <Typography variant="caption" color="text.secondary">{f.item_count}</Typography>
                <ChevronRightIcon sx={{ color: 'text.disabled' }} />
              </Box>
            ))}
            {files.map((file) => {
              const isPdf = file.file_type === 'application/pdf';
              return (
                <Box
                  key={file.id}
                  role="button"
                  onClick={() => onPick({ id: file.id, title: file.title, file_name: file.file_name, file_type: file.file_type })}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, minHeight: 52,
                    borderRadius: 2, border: '1px solid', borderColor: 'divider', cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                  }}
                >
                  {isPdf ? <PictureAsPdfOutlinedIcon sx={{ color: 'error.main' }} /> : <ImageOutlinedIcon sx={{ color: 'text.secondary' }} />}
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{file.title || file.file_name}</Typography>
                  <Button size="small" variant="outlined" sx={{ minHeight: 34, textTransform: 'none' }}>Attach</Button>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}
