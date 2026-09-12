'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
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
  Skeleton,
  Button,
  Tooltip,
  Menu,
  MenuItem,
  TextField,
  InputAdornment,
  Stack,
  Paper,
  EmptyState,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
  useTheme,
} from '@neram/ui';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import StudyFileViewer from '@/components/study-materials/StudyFileViewer';
import { FileThumb, FileIcon } from '@/components/study-materials/FileThumb';
import type { NexusStudyBrowseResult, NexusStudyFileDTO, NexusStudySearchResult } from '@neram/database/types';

// Layout preference, shared with the teacher study-materials view.
const VIEW_STORAGE_KEY = 'nexus:study-view';

function StudyMaterialsBrowser() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folder');
  const { getToken, user, tokenReady } = useNexusAuthContext();

  // Identity stamped over PDFs/images to deter redistribution (name + phone/email).
  const watermark = user
    ? [user.name, user.phone || user.email].filter(Boolean).join('   ·   ')
    : undefined;

  /**
   * Only for the URLs that cannot carry a header: the PDF/image content stream and the
   * thumbnails, which are an <img> and pdf.js. Everything else goes through useAuthSWR,
   * which resolves the token inside its own fetcher.
   */
  const [token, setToken] = useState<string | null>(null);

  const [viewerFile, setViewerFile] = useState<NexusStudyFileDTO | null>(null);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NexusStudySearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [view, setView] = useState<'grid' | 'list'>('grid');

  /**
   * Wait for MSAL, NOT for /api/auth/me.
   *
   * This used to be gated on the auth context's `loading`, which also covers the
   * /api/auth/me round trip. Nothing here needs that profile, so on a cold device it
   * put a 1.6s request in front of this one, in series, for no reason. `tokenReady` is
   * the half that actually matters: can getToken() answer yet.
   *
   * A null key is SWR's documented way to skip, so nothing fires until it can.
   */
  const folderKey = tokenReady
    ? `/api/study-materials/folders${folderId ? `?parent=${folderId}` : ''}`
    : null;

  const { data, error, isLoading, mutate } = useAuthSWR<NexusStudyBrowseResult>(folderKey);

  // The token for the header-less URLs. Deliberately not gated on the profile either.
  useEffect(() => {
    if (!tokenReady) return;
    let active = true;
    getToken().then((t) => {
      if (active && t) setToken(t);
    });
    return () => {
      active = false;
    };
  }, [tokenReady, getToken]);

  // Debounced search across all materials.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const t = token || (await getToken());
        const res = await fetch(`/api/study-materials/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const d = await res.json();
        if (active) setSearchResults(Array.isArray(d.results) ? d.results : []);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [search, token, getToken]);

  // Restore the saved layout preference (shared with the teacher view).
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

  const goToFolder = (id: string | null) =>
    router.push(id ? `/student/study-materials?folder=${id}` : '/student/study-materials');

  const contentUrl = (fileId: string, download = false) =>
    `/api/study-materials/files/${fileId}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`;

  const thumbUrl = (fileId: string) =>
    `/api/study-materials/files/${fileId}/thumbnail?token=${encodeURIComponent(token || '')}&size=large`;

  // Record a file as read (once per open) and clear its unread dot optimistically.
  const markRead = useCallback((fileId: string) => {
    // revalidate: false, because the server is being told what we just drew, not asked.
    mutate(
      (prev) =>
        prev
          ? { ...prev, files: prev.files.map((f) => (f.id === fileId ? { ...f, is_unread: false } : f)) }
          : prev,
      { revalidate: false },
    );
    getToken().then((t) =>
      fetch(`/api/study-materials/files/${fileId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {}),
    );
  }, [getToken, mutate]);

  const openFile = (file: NexusStudyFileDTO) => {
    if (file.kind === 'pdf' || file.kind === 'image') {
      markRead(file.id);
      setViewerFile(file);
    } else if (file.downloadable) {
      markRead(file.id);
      window.open(contentUrl(file.id, true), '_blank');
    }
  };

  /**
   * Open a recording, carrying the folder so the player can send them back here.
   *
   * The watch page used to push a bare /student/study-materials on the way out,
   * which drops ?folder= and lands a student at the top of the tree however deep
   * they were. Passing it forward costs one query parameter and is the only way
   * the player can know where "back" is.
   */
  const openTrack = (trackId: string) => {
    const back = folderId ? `?folder=${encodeURIComponent(folderId)}` : '';
    router.push(`/student/study-materials/watch/${trackId}${back}`);
  };

  /** Which chapter's language menu is open, and what it is anchored to. */
  const [watchMenu, setWatchMenu] = useState<{
    anchor: HTMLElement;
    file: NexusStudyFileDTO;
  } | null>(null);

  const toggleFavorite = async (file: NexusStudyFileDTO, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !file.is_favorite;
    const setFavorite = (value: boolean | undefined) =>
      mutate(
        (prev) =>
          prev
            ? {
                ...prev,
                files: prev.files.map((f) => (f.id === file.id ? { ...f, is_favorite: value } : f)),
              }
            : prev,
        { revalidate: false },
      );

    setFavorite(next);
    try {
      const t = token || (await getToken());
      const res = await fetch(`/api/study-materials/files/${file.id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const d = await res.json();
        setFavorite(d.favorite);
      }
    } catch {
      // revert on failure
      setFavorite(file.is_favorite);
    }
  };

  const openSearchResult = (r: NexusStudySearchResult) => {
    if (r.kind === 'folder') {
      setSearch('');
      setSearchResults(null);
      goToFolder(r.folder_id);
      return;
    }
    const partial: NexusStudyFileDTO = {
      id: r.id,
      folder_id: r.folder_id || '',
      title: r.name,
      file_name: r.name,
      file_type: null,
      file_size_bytes: null,
      page_count: null,
      kind: r.file_kind || 'other',
      downloadable: !!r.downloadable,
      sort_order: 0,
      created_at: '',
    };
    openFile(partial);
  };

  /**
   * The way into a chapter's recording, as a control of its own.
   *
   * Rendered as a SIBLING of the card's action area, never inside it, which is
   * the same shape the star and the download button already use and for the same
   * reason: the grid card's action area is a real <button> and nothing
   * interactive can legally live inside it. The chips under the title say which
   * languages exist; this is what opens one.
   *
   * One language goes straight there. Two or more open a menu, because guessing
   * which one a student wants is the thing that sends them into a recording they
   * cannot follow.
   */
  const watchButton = (file: NexusStudyFileDTO, sx: object) => {
    const langs = file.video_languages || [];
    if (!langs.length) return null;
    const only = langs.length === 1 ? langs[0] : null;
    return (
      <Tooltip title={only ? `Watch in ${only.label}` : 'Watch the class'}>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            if (only) openTrack(only.track_id);
            else setWatchMenu({ anchor: e.currentTarget, file });
          }}
          aria-label={only ? `Watch this chapter in ${only.label}` : 'Watch this chapter'}
          aria-haspopup={only ? undefined : 'menu'}
          sx={{
            width: 44,
            height: 44,
            color: 'info.main',
            bgcolor: alpha(theme.palette.background.paper, 0.85),
            transition: 'background-color 200ms',
            '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.16) },
            ...sx,
          }}
        >
          <PlayCircleOutlineIcon sx={{ fontSize: '1.35rem' }} />
        </IconButton>
      </Tooltip>
    );
  };

  // Status + affordance chips shown under a file's title in both grid and list layouts.
  const fileStatusChips = (file: NexusStudyFileDTO) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
      <Chip
        size="small"
        icon={file.downloadable ? <DownloadOutlinedIcon /> : <LockOutlinedIcon />}
        label={file.downloadable ? 'Download' : 'View only'}
        sx={{
          height: 20,
          fontSize: '0.62rem',
          '& .MuiChip-icon': { fontSize: '0.8rem', ml: '4px' },
          bgcolor: file.downloadable
            ? alpha(theme.palette.success.main, 0.12)
            : alpha(theme.palette.text.secondary, 0.1),
          color: file.downloadable ? 'success.main' : 'text.secondary',
        }}
      />
      {file.is_new && (
        <Chip size="small" label="New" color="success" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }} />
      )}
      {file.status === 'completed' && (
        <Chip
          size="small"
          icon={<CheckCircleOutlineIcon />}
          label={file.best_score_pct != null ? `Completed · ${Math.round(file.best_score_pct)}%` : 'Completed'}
          sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, '& .MuiChip-icon': { fontSize: '0.8rem', ml: '4px' }, bgcolor: alpha(theme.palette.success.main, 0.16), color: 'success.main' }}
        />
      )}
      {file.status === 'studying' && (
        <Chip
          size="small"
          icon={<AutoStoriesOutlinedIcon />}
          label="In progress"
          sx={{ height: 20, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: '0.8rem', ml: '4px' }, bgcolor: alpha(theme.palette.warning.main, 0.16), color: 'warning.dark' }}
        />
      )}
      {/* Which languages this chapter's class was recorded in, and the way in.
          The data has been available per chapter since the tracks shipped and
          was never drawn on a card, so the only way to find out a chapter had a
          Tamil recording was to open it. Only published recordings appear, so a
          card promises nothing a student cannot press.

          THEY STAY LABELS, and the way in is the overlay button instead. Making
          these chips pressable was the obvious move and the wrong one twice
          over: this row renders inside a CardActionArea in the grid layout,
          which is a real <button>, and an interactive element nested in a button
          is invalid and does not reliably receive the click. A 20px control is
          also unhittable on a phone, and it sits inside a card that is itself
          tappable, so a near miss opens the PDF rather than nothing. The star
          and the download button solved this same problem long ago by sitting
          OUTSIDE the action area; watchButton below does the same. */}
      {(file.video_languages || []).map((l) => (
        <Chip
          key={l.code}
          size="small"
          icon={<SmartDisplayOutlinedIcon />}
          label={l.label}
          sx={{
            height: 20,
            fontSize: '0.6rem',
            fontWeight: 600,
            '& .MuiChip-icon': { fontSize: '0.8rem', ml: '4px' },
            bgcolor: alpha(theme.palette.info.main, 0.14),
            color: 'info.main',
          }}
        />
      ))}
      {/* A label, like the language chips above: the Slides switch is inside
          the chapter, so the card only has to say the deck is there. */}
      {file.has_slides && (
        <Chip
          size="small"
          icon={<SlideshowOutlinedIcon />}
          label="Slides"
          sx={{
            height: 20,
            fontSize: '0.6rem',
            fontWeight: 600,
            '& .MuiChip-icon': { fontSize: '0.8rem', ml: '4px' },
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: 'primary.main',
          }}
        />
      )}
      {!!file.comment_count && (
        <Chip
          size="small"
          icon={<ChatBubbleOutlineIcon />}
          label={file.comment_count}
          sx={{ height: 20, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: '0.78rem', ml: '4px' } }}
        />
      )}
    </Box>
  );

  // ── Header ──
  const header = (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <FolderOpenOutlinedIcon sx={{ color: 'primary.main' }} />
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
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Question papers, books, references and counseling documents, organised for you.
      </Typography>
    </Box>
  );

  // ── Breadcrumb ──
  const breadcrumb = (
    <Breadcrumbs
      separator="›"
      sx={{ mb: 2, '& .MuiBreadcrumbs-li': { display: 'flex', alignItems: 'center' } }}
    >
      <Link
        component="button"
        underline="hover"
        color={folderId ? 'text.secondary' : 'text.primary'}
        onClick={() => goToFolder(null)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: folderId ? 400 : 700 }}
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
            sx={{ fontWeight: isLast ? 700 : 400, cursor: isLast ? 'default' : 'pointer' }}
          >
            {crumb.name}
          </Link>
        );
      })}
    </Breadcrumbs>
  );

  // ── Loading skeleton ──
  // Two conditions, both needed. `isLoading` covers the request being in flight, and
  // `!tokenReady` covers the moment before it: SWR reports isLoading false while the key
  // is still null, so without it the page would flash "no materials yet" at a student
  // who simply has not finished signing in. `&& !data` keeps a background revalidation
  // from replacing the folder they are already reading with a grid of skeletons.
  if ((isLoading || !tokenReady) && !data) {
    return (
      <Box>
        {header}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={130} />
          ))}
        </Box>
      </Box>
    );
  }

  // Only when there is no usable data. A failed background revalidation should leave the
  // folder on screen rather than swapping it for an error.
  if (error && !data) {
    const denied = error.status === 403;
    return (
      <Box>
        {header}
        <EmptyState
          title={denied ? 'Not available' : 'Could not open this folder'}
          description={
            denied
              ? 'This folder is not part of your course.'
              : error.message || 'Something went wrong'
          }
          icon={<FolderOutlinedIcon />}
          action={
            denied ? undefined : (
              <Button variant="outlined" onClick={() => mutate()}>
                Try again
              </Button>
            )
          }
        />
      </Box>
    );
  }

  const folders = data?.folders || [];
  const files = data?.files || [];
  const isEmpty = folders.length === 0 && files.length === 0;

  const searchBox = (
    <TextField
      fullWidth
      size="small"
      placeholder="Search materials..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      sx={{ mb: 2 }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
        ),
        endAdornment: search ? (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => setSearch('')} aria-label="Clear search">
              <CloseIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
      inputProps={{ 'aria-label': 'Search materials' }}
    />
  );

  const searchResultsView =
    searching && (searchResults === null || searchResults.length === 0) ? (
      <Stack spacing={1}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={56} />)}</Stack>
    ) : searchResults && searchResults.length === 0 ? (
      <EmptyState title="No matches" description={`Nothing found for "${search.trim()}".`} icon={<SearchIcon />} />
    ) : (
      <Stack spacing={1}>
        {(searchResults || []).map((r) => (
          <Paper
            key={`${r.kind}-${r.id}`}
            elevation={0}
            onClick={() => openSearchResult(r)}
            sx={{
              p: 1.25, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, cursor: 'pointer',
              display: 'flex', gap: 1.25, alignItems: 'center',
              transition: 'background-color 150ms ease',
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) },
            }}
          >
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', flexShrink: 0 }}>
              {r.kind === 'folder' ? <FolderOutlinedIcon sx={{ color: 'primary.main' }} /> : <FileIcon kind={r.file_kind || 'other'} size={22} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>{r.name}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {r.breadcrumb.map((b) => b.name).join(' › ') || 'Home'}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Stack>
    );

  // ── Compact list view (folders then files, one row each) ──
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
          sx={rowSx}
        >
          <Box sx={{ width: 44, height: 44, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.primary.main, 0.1), flexShrink: 0 }}>
            <FolderOutlinedIcon sx={{ color: 'primary.main' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>{f.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {f.item_count} {f.item_count === 1 ? 'item' : 'items'}
              {f.unread_count ? ` · ${f.unread_count} new` : ''}
            </Typography>
          </Box>
        </Box>
      ))}

      {files.map((file) => (
        <Box
          key={file.id}
          onClick={() => openFile(file)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') openFile(file); }}
          sx={rowSx}
        >
          <Box sx={{ width: 44, height: 44, flexShrink: 0, position: 'relative' }}>
            <FileThumb kind={file.kind} src={thumbUrl(file.id)} sx={{ height: 44, mb: 0, borderRadius: 1.5 }} iconSize={22} />
            {file.is_unread && (
              <Box sx={{ position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: '50%', bgcolor: 'primary.main', border: `2px solid ${theme.palette.background.paper}` }} />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: file.is_unread ? 700 : 600 }} noWrap>{file.title}</Typography>
            {fileStatusChips(file)}
          </Box>
          {/* Before the star, because watching is the thing a student came for. */}
          {watchButton(file, { flexShrink: 0 })}
          <Tooltip title={file.is_favorite ? 'Remove from starred' : 'Add to starred'}>
            <IconButton
              size="small"
              onClick={(e) => toggleFavorite(file, e)}
              aria-label={file.is_favorite ? 'Remove from starred' : 'Add to starred'}
              sx={{ flexShrink: 0 }}
            >
              {file.is_favorite
                ? <StarIcon sx={{ fontSize: '1.05rem', color: '#f5b400' }} />
                : <StarBorderIcon sx={{ fontSize: '1.05rem' }} />}
            </IconButton>
          </Tooltip>
          {file.downloadable && (
            <Tooltip title="Download">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); window.open(contentUrl(file.id, true), '_blank'); }}
                aria-label="Download"
                sx={{ flexShrink: 0 }}
              >
                <DownloadOutlinedIcon sx={{ fontSize: '1.05rem' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ))}
    </Stack>
  );

  return (
    <Box>
      {header}
      {breadcrumb}
      {searchBox}

      {searchResults !== null ? (
        searchResultsView
      ) : isEmpty ? (
        <EmptyState
          title="Nothing here yet"
          description="Your teachers have not added materials to this folder yet. Check back soon."
          icon={<FolderOutlinedIcon />}
        />
      ) : view === 'list' ? (
        listView
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          {/* Folders first */}
          {folders.map((f) => (
            <Card
              key={f.id}
              elevation={0}
              sx={{
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2.5,
                transition: 'transform 150ms ease, box-shadow 150ms ease',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 6px 20px ${alpha('#000', 0.08)}` },
              }}
            >
              <CardActionArea
                onClick={() => goToFolder(f.id)}
                sx={{ p: 1.5, height: '100%', minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    mb: 1,
                  }}
                >
                  <FolderOutlinedIcon sx={{ fontSize: 28, color: 'primary.main' }} />
                </Box>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
                    {f.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {f.item_count} {f.item_count === 1 ? 'item' : 'items'}
                    {f.unread_count ? ` · ${f.unread_count} new` : ''}
                  </Typography>
                </Box>
              </CardActionArea>
            </Card>
          ))}

          {/* Then files */}
          {files.map((file) => (
            <Card
              key={file.id}
              elevation={0}
              sx={{
                position: 'relative',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2.5,
                transition: 'transform 150ms ease, box-shadow 150ms ease',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 6px 20px ${alpha('#000', 0.08)}` },
              }}
            >
              <CardActionArea
                onClick={() => openFile(file)}
                sx={{ p: 1.5, height: '100%', minHeight: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}
              >
                <FileThumb kind={file.kind} src={thumbUrl(file.id)} />
                <Box sx={{ width: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {file.is_unread && (
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                    )}
                    <Typography variant="subtitle2" sx={{ fontWeight: file.is_unread ? 700 : 600, lineHeight: 1.25 }} noWrap>
                      {file.title}
                    </Typography>
                  </Box>
                  {fileStatusChips(file)}
                </Box>
              </CardActionArea>

              {/* Watch (bottom-right overlay), outside the action area for the
                  same reason the star and the download button are. */}
              {watchButton(file, {
                position: 'absolute',
                bottom: 6,
                right: 6,
                boxShadow: `0 2px 8px ${alpha('#000', 0.12)}`,
              })}

              {/* Favorite star (top-left overlay) */}
              <Tooltip title={file.is_favorite ? 'Remove from starred' : 'Add to starred'}>
                <IconButton
                  size="small"
                  onClick={(e) => toggleFavorite(file, e)}
                  aria-label={file.is_favorite ? 'Remove from starred' : 'Add to starred'}
                  sx={{ position: 'absolute', top: 6, left: 6, bgcolor: alpha(theme.palette.background.paper, 0.85), '&:hover': { bgcolor: theme.palette.background.paper } }}
                >
                  {file.is_favorite
                    ? <StarIcon sx={{ fontSize: '1.05rem', color: '#f5b400' }} />
                    : <StarBorderIcon sx={{ fontSize: '1.05rem' }} />}
                </IconButton>
              </Tooltip>

              {/* Download (top-right overlay) */}
              {file.downloadable && (
                <Tooltip title="Download">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(contentUrl(file.id, true), '_blank');
                    }}
                    sx={{ position: 'absolute', top: 6, right: 6, bgcolor: alpha(theme.palette.background.paper, 0.85) }}
                  >
                    <DownloadOutlinedIcon sx={{ fontSize: '1.05rem' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Card>
          ))}
        </Box>
      )}

      {/* View-only file viewer with a Google Classroom style comments panel.
          No onProgressChange: the test now opens in the full player, which
          navigates away and back, so this page remounts and reloads from the
          server rather than being told optimistically. */}
      <StudyFileViewer
        file={viewerFile}
        token={token}
        getToken={getToken}
        onClose={() => setViewerFile(null)}
        watermark={watermark}
        track
      />

      {/* Which language, when a chapter was recorded in more than one. Anchored
          to the button that opened it, so the chapter it belongs to is never in
          doubt on a grid of them. */}
      <Menu
        anchorEl={watchMenu?.anchor || null}
        open={!!watchMenu}
        onClose={() => setWatchMenu(null)}
        MenuListProps={{ 'aria-label': 'Watch this chapter in' }}
      >
        {(watchMenu?.file.video_languages || []).map((l) => (
          <MenuItem
            key={l.code}
            onClick={() => {
              setWatchMenu(null);
              openTrack(l.track_id);
            }}
            sx={{ minHeight: 48, gap: 1 }}
          >
            <SmartDisplayOutlinedIcon fontSize="small" sx={{ color: 'info.main' }} />
            {l.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

export default function StudyMaterialsPage() {
  return (
    <Suspense fallback={<Box sx={{ p: 2 }}><Skeleton variant="rounded" height={400} /></Box>}>
      <StudyMaterialsBrowser />
    </Suspense>
  );
}
