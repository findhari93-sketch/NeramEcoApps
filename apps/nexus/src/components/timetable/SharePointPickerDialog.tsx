'use client';

/**
 * Pick a file out of the Neram SharePoint library and attach it to a class.
 *
 * Built for the case the upload button cannot serve: a teacher has already made
 * the PowerPoint, it already lives in SharePoint, and re-uploading it would fork
 * it into a second copy that goes stale the moment the original is edited.
 * Attaching a LINK means every student always reads the current deck.
 *
 * Searches the shared site only, never personal OneDrive. That is a permissions
 * decision rather than an oversight: personal OneDrive needs the delegated
 * Files.Read.All scope, which would make every teacher re-consent at next
 * sign-in. A file that only exists in someone's OneDrive can still be attached by
 * pasting its share link into the box behind this dialog.
 *
 * Dialog on desktop, bottom drawer on mobile, matching AddResourceFromClassDialog.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Drawer,
  IconButton,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { RADIUS } from './timetable-theme';
import { isPresentation } from '@/lib/office-rendition';
import type { ClassResource } from '@/lib/class-resources';

interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  mimeType: string | null;
  size: number | null;
  lastModified: string | null;
  isFolder: boolean;
}

interface SharePointPickerDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  getToken: () => Promise<string | null>;
  onAdded: (resource: ClassResource) => void;
  onNotify?: (message: string, severity?: 'success' | 'error') => void;
}

/** "2.4 MB". Returns an empty string for an unknown size rather than "0 B". */
function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "12 Mar 2026", or an empty string when Graph reported nothing usable. */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function itemIcon(item: DriveItem) {
  const sx = { fontSize: 22 };
  if (item.isFolder) return <FolderOutlinedIcon sx={sx} />;
  const mime = (item.mimeType || '').toLowerCase();
  if (isPresentation(item.mimeType, item.name)) return <SlideshowOutlinedIcon sx={sx} />;
  if (mime === 'application/pdf') return <PictureAsPdfOutlinedIcon sx={sx} />;
  if (mime.startsWith('image/')) return <ImageOutlinedIcon sx={sx} />;
  return <DescriptionOutlinedIcon sx={sx} />;
}

export default function SharePointPickerDialog({
  open,
  onClose,
  classId,
  getToken,
  onAdded,
  onNotify,
}: SharePointPickerDialogProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** Folder segments from the library root. Empty means the root itself. */
  const [path, setPath] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const q = query.trim();
      const params = q
        ? `q=${encodeURIComponent(q)}`
        : `path=${encodeURIComponent(path.join('/'))}`;
      const res = await fetch(`/api/sharepoint/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not reach SharePoint.');
        setItems([]);
        return;
      }
      setItems(data.items || []);
    } catch {
      setError('Could not reach SharePoint.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [open, getToken, query, path]);

  // Debounced, so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPath([]);
      setError(null);
    }
  }, [open]);

  const attach = async (item: DriveItem) => {
    if (item.isFolder) {
      // Browsing into a folder clears the search, or the list would show results
      // from a query that no longer matches the breadcrumb above it.
      setQuery('');
      setPath((prev) => [...prev, item.name]);
      return;
    }

    setBusyId(item.id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sharepoint_item_id: item.id,
          name: item.name,
          mime_type: item.mimeType,
          size: item.size,
          web_url: item.webUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onAdded(data.resource);
        onClose();
      } else {
        onNotify?.(data.error || 'Could not attach that file', 'error');
      }
    } catch {
      onNotify?.('Could not attach that file', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const body = (
    <Box sx={{ p: 2.5, maxHeight: { xs: '85vh', sm: 600 }, overflow: 'auto' }}>
      <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 0.5 }}>
        Choose from SharePoint
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.75 }}>
        Attach a presentation or document. Students read it inside the app and cannot edit or
        download it.
      </Typography>

      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the Neram library"
        inputProps={{ 'aria-label': 'Search SharePoint for a file' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1.25, '& .MuiInputBase-root': { minHeight: 48, borderRadius: RADIUS.control } }}
      />

      {/* Breadcrumb. Hidden while searching, because results span every folder
          and a trail would claim a location the list does not have. */}
      {!query && path.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.25 }}>
          <IconButton
            size="small"
            aria-label="Go up one folder"
            onClick={() => setPath((prev) => prev.slice(0, -1))}
            sx={{ width: 40, height: 40 }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {path.join(' / ')}
          </Typography>
        </Box>
      )}

      {loading ? (
        // Skeleton rows rather than a spinner, at the same height as the real
        // rows, so the list does not jump when the results land.
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Box>
      ) : error ? (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.error.main}`,
            borderRadius: RADIUS.control,
            p: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1.25 }}>
            {error}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={load}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            Try again
          </Button>
        </Box>
      ) : items.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {items.map((item) => {
            const meta = [formatSize(item.size), formatDate(item.lastModified)]
              .filter(Boolean)
              .join(' · ');
            const isBusy = busyId === item.id;
            return (
              <Box
                key={item.id}
                component="button"
                type="button"
                disabled={busyId !== null}
                onClick={() => attach(item)}
                aria-label={
                  item.isFolder ? `Open folder ${item.name}` : `Attach ${item.name} to this class`
                }
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  width: '100%',
                  minHeight: 56,
                  px: 1.25,
                  py: 1,
                  textAlign: 'left',
                  cursor: busyId !== null ? 'default' : 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: RADIUS.control,
                  bgcolor: 'transparent',
                  opacity: busyId !== null && !isBusy ? 0.5 : 1,
                  transition: 'background-color 200ms, border-color 200ms',
                  '&:hover:not(:disabled)': {
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    borderColor: alpha(theme.palette.primary.main, 0.4),
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 1,
                    color: item.isFolder ? 'text.secondary' : 'primary.main',
                    bgcolor: alpha(
                      item.isFolder ? theme.palette.text.primary : theme.palette.primary.main,
                      0.08,
                    ),
                  }}
                >
                  {itemIcon(item)}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600 }} noWrap>
                    {item.name}
                  </Typography>
                  {(meta || item.isFolder) && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {item.isFolder ? 'Folder' : meta}
                    </Typography>
                  )}
                </Box>

                {isBusy && (
                  <Typography variant="caption" color="primary" sx={{ flexShrink: 0 }}>
                    Adding
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.control,
            p: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {query
              ? 'Nothing in the Neram library matches that. A file saved only in your own OneDrive will not appear here, paste its share link instead.'
              : 'This folder has nothing you can attach.'}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          onClick={onClose}
          sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
        >
          Close
        </Button>
      </Box>
    </Box>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        {body}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
    >
      {body}
    </Drawer>
  );
}
