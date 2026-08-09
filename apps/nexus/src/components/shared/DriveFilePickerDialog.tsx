'use client';

/**
 * Pick a file out of SharePoint or the teacher's own OneDrive.
 *
 * Built for the case the upload button cannot serve: the file already exists in
 * Microsoft 365, and re-uploading it would fork it into a second copy that goes
 * stale the moment the original is edited. Attaching a LINK means everyone always
 * gets the current file.
 *
 * TWO CONSUMERS, TWO MODES.
 *   `onPick`   hands the chosen item back and lets the caller decide what to do
 *              with it. The chapter recordings dialog uses this.
 *   `classId`  posts the choice straight to the class resources API. The
 *              timetable uses this, and it is what the component did originally.
 * Exactly one of the two is required.
 *
 * SCOPE. `site` searches the shared Neram library app-only. `mine` searches the
 * signed-in teacher's own OneDrive with their own token. `both` asks the tenant
 * index as the caller, which reaches everything they can see including folders
 * shared with them by someone else, and falls back to the two drives when that
 * consent is not in place yet. The route says which one answered.
 *
 * WHERE IT OPENS is decided by the server, not here, which is the correction
 * this file needed most. It used to send `path=''` on first open, so the video
 * picker listed the top of the library: two folders, no files, and no way to
 * tell that anything was wrong. `path` is now NULL until the teacher navigates,
 * and null means "start where this kind belongs".
 *
 * A file on a drive belonging to none of these is still reachable by pasting its
 * share link into the box behind this dialog.
 *
 * Dialog on desktop, bottom drawer on mobile, matching AddResourceFromClassDialog.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
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
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { RADIUS } from '../timetable/timetable-theme';
import { isPresentation } from '@/lib/office-rendition';
import type { ClassResource } from '@/lib/class-resources';

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  mimeType: string | null;
  size: number | null;
  lastModified: string | null;
  isFolder: boolean;
  /** Which drive the row came from. Absent on older responses. */
  source?: 'site' | 'mine';
}

interface DriveFilePickerDialogProps {
  open: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  /** Attach-to-class mode. Required unless `onPick` is given. */
  classId?: string;
  onAdded?: (resource: ClassResource) => void;
  /** Hand-back mode. When given, nothing is posted anywhere. */
  onPick?: (item: DriveItem) => void;
  /**
   * A token that can search the tenant index, used for SEARCH alone.
   *
   * The index needs Files.Read.All, which is not in the base scopes, so the
   * token `getToken` mints cannot reach it. MUST be a silent-only acquirer:
   * anything routed through getAccessToken redirects the whole page when the
   * consent is missing, and a navigation cannot be caught, so the fallback below
   * would never run. Null, or absent, means the server answers from the two
   * drives instead and says so.
   */
  getSearchToken?: () => Promise<string | null>;
  /** Which files are offered. Defaults to documents. */
  kind?: 'document' | 'video';
  /** Which drives are read. Defaults to the shared library alone. */
  scope?: 'site' | 'mine' | 'both';
  title?: string;
  subtitle?: string;
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
  if (mime.startsWith('video/') || /\.(mp4|mkv|mov|webm|m4v)$/i.test(item.name)) {
    return <VideocamOutlinedIcon sx={sx} />;
  }
  if (isPresentation(item.mimeType, item.name)) return <SlideshowOutlinedIcon sx={sx} />;
  if (mime === 'application/pdf') return <PictureAsPdfOutlinedIcon sx={sx} />;
  if (mime.startsWith('image/')) return <ImageOutlinedIcon sx={sx} />;
  return <DescriptionOutlinedIcon sx={sx} />;
}

export default function DriveFilePickerDialog({
  open,
  onClose,
  getToken,
  classId,
  onAdded,
  onPick,
  getSearchToken,
  kind = 'document',
  scope = 'site',
  title,
  subtitle,
  onNotify,
}: DriveFilePickerDialogProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /**
   * Folder segments from the drive root. An empty array is the root itself; NULL
   * is "wherever the server thinks this kind should start", which is not the
   * same thing and is the whole reason this is nullable. Sending path='' on
   * first open is what made the video picker list the two folders at the top of
   * the library and nothing else.
   */
  const [path, setPath] = useState<string[] | null>(null);
  /**
   * What the server actually listed, which is what the breadcrumb and the Up
   * button have to be built from. Kept apart from `path` on purpose: folding the
   * resolved default back into `path` would change the state `load` depends on
   * and cost a second identical request every time the dialog opens.
   */
  const [resolvedPath, setResolvedPath] = useState<string[]>([]);
  /** Guards against a slow response landing on top of a newer one. */
  const requestSeq = useRef(0);

  const isVideo = kind === 'video';
  /**
   * `both` is a search-only scope on the server, because a folder path names a
   * folder in ONE drive. Browsing falls back to the library, which is the drive a
   * teacher is most likely to be organising files in anyway.
   */
  const browseScope = scope === 'both' ? 'site' : scope;

  const load = useCallback(async () => {
    if (!open) return;
    const seq = ++requestSeq.current;
    /** This response is still the newest one asked for. */
    const current = () => requestSeq.current === seq;

    setLoading(true);
    setError(null);
    setPartial(null);
    try {
      const q = query.trim();
      /**
       * The elevated token, for SEARCH only, and never allowed to be fatal.
       *
       * The caller is contracted to acquire it silently, but the try/catch stays
       * as the belt: a rejection here must not take down a picker that works
       * perfectly well without the index. It also cannot serve an injected E2E
       * token, which is another reason null has to be an ordinary answer.
       */
      let searchToken: string | null = null;
      if (q && getSearchToken) {
        try {
          searchToken = await getSearchToken();
        } catch {
          searchToken = null;
        }
      }
      const token = searchToken || (await getToken());
      if (!token) return;

      const params = new URLSearchParams(q ? { q, scope } : { scope: browseScope });
      // Omitted entirely while the path is unset, which is how the server is
      // told to choose the starting folder rather than list the drive root.
      if (!q && path !== null) params.set('path', path.join('/'));
      params.set('kind', kind);

      const res = await fetch(`/api/sharepoint/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!current()) return;

      if (!res.ok) {
        setError(data.error || 'Could not reach SharePoint.');
        setItems([]);
        return;
      }
      setItems(data.items || []);
      setPartial(data.partial || null);
      // Record whatever the server actually listed, so the breadcrumb and the Up
      // button describe the real folder rather than the one we guessed.
      if (!q && typeof data.path === 'string') {
        setResolvedPath(data.path ? data.path.split('/') : []);
      }
    } catch {
      if (current()) {
        setError('Could not reach SharePoint.');
        setItems([]);
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [open, getToken, getSearchToken, query, path, kind, scope, browseScope]);

  // Debounced, so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPath(null);
      setResolvedPath([]);
      setError(null);
      setPartial(null);
    }
  }, [open]);

  const choose = async (item: DriveItem) => {
    if (item.isFolder) {
      // Browsing into a folder clears the search, or the list would show results
      // from a query that no longer matches the breadcrumb above it. Built from
      // the RESOLVED path so drilling out of the server-chosen starting folder
      // goes one level deeper rather than jumping back to the drive root.
      setQuery('');
      setPath([...resolvedPath, item.name]);
      return;
    }

    // Hand-back mode. The caller owns what happens next, including its own busy
    // state, so this closes immediately rather than spinning on a request it is
    // not making.
    if (onPick) {
      onPick(item);
      onClose();
      return;
    }

    if (!classId) return;

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
        onAdded?.(data.resource);
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

  const heading =
    title || (isVideo ? 'Find the recording' : 'Choose from SharePoint');
  const blurb =
    subtitle ||
    (isVideo
      ? 'Search the Neram library and your own OneDrive for the video file, then pick it.'
      : 'Attach a presentation or document. Students read it inside the app and cannot edit or download it.');

  const emptyMessage = query
    ? scope === 'site'
      ? `Nothing in the Neram library matches that. A file saved only in your own OneDrive will not appear here, paste its share link instead.`
      : `Nothing matches that. Try part of the file name, or paste the file's share link instead.`
    : isVideo
      ? 'No video files in this folder. Go up a level, or search by name.'
      : 'This folder has nothing you can attach.';

  const body = (
    <Box sx={{ p: 2.5, maxHeight: { xs: '85vh', sm: 600 }, overflow: 'auto' }}>
      <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 0.5 }}>{heading}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.75 }}>
        {blurb}
      </Typography>

      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          scope === 'site' ? 'Search the Neram library' : 'Search the Neram library and your OneDrive'
        }
        inputProps={{
          'aria-label': isVideo
            ? 'Search SharePoint and OneDrive for a recording'
            : 'Search SharePoint for a file',
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1.25, '& .MuiInputBase-root': { minHeight: 48, borderRadius: RADIUS.control } }}
      />

      {/* One drive answered and the other did not. Said plainly, because the
          alternative is a teacher scrolling a half-list for a file that is in
          the half that failed. */}
      {partial && (
        <Typography
          variant="caption"
          color="warning.main"
          sx={{ display: 'block', mb: 1.25, fontWeight: 600 }}
        >
          {partial}
        </Typography>
      )}

      {/* Breadcrumb. Hidden while searching, because results span every folder
          and a trail would claim a location the list does not have. */}
      {!query && resolvedPath.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.25 }}>
          <IconButton
            size="small"
            aria-label="Go up one folder"
            onClick={() => setPath(resolvedPath.slice(0, -1))}
            sx={{ width: 48, height: 48 }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {resolvedPath.join(' / ')}
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
            // Only worth the pixels when results can come from either drive.
            const showSource = scope === 'both' && !!item.source && !item.isFolder;
            return (
              <Box
                key={`${item.source || 'site'}:${item.id}`}
                component="button"
                type="button"
                disabled={busyId !== null}
                onClick={() => choose(item)}
                aria-label={
                  item.isFolder
                    ? `Open folder ${item.name}`
                    : onPick
                      ? `Choose ${item.name}`
                      : `Attach ${item.name} to this class`
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                    {showSource && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={item.source === 'mine' ? 'My OneDrive' : 'Neram library'}
                        sx={{ height: 20, fontSize: '0.6875rem', flexShrink: 0 }}
                      />
                    )}
                    {(meta || item.isFolder) && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {item.isFolder ? 'Folder' : meta}
                      </Typography>
                    )}
                  </Box>
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
            {emptyMessage}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          onClick={onClose}
          sx={{ textTransform: 'none', minHeight: 48, borderRadius: RADIUS.control }}
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
