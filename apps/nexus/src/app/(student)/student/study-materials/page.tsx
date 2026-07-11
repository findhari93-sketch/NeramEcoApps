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
  TextField,
  InputAdornment,
  Stack,
  Paper,
  EmptyState,
  alpha,
  useTheme,
} from '@neram/ui';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudyFileViewer from '@/components/study-materials/StudyFileViewer';
import type { NexusStudyBrowseResult, NexusStudyFileDTO, NexusStudySearchResult } from '@neram/database/types';

const coverSx = {
  width: '100%',
  height: 92,
  borderRadius: 2,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: 'action.hover',
  mb: 1,
} as const;

/** File cover: a Graph thumbnail (PDF first page / image) with a glyph fallback. */
function FileThumb({ kind, src }: { kind: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  const canPreview = (kind === 'pdf' || kind === 'image') && !!src && !failed;
  return (
    <Box sx={coverSx}>
      {canPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <FileIcon kind={kind} />
      )}
    </Box>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ kind, size = 30 }: { kind: string; size?: number }) {
  if (kind === 'pdf') return <PictureAsPdfOutlinedIcon sx={{ fontSize: size, color: '#d32f2f' }} />;
  if (kind === 'image') return <ImageOutlinedIcon sx={{ fontSize: size, color: '#1976d2' }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
}

function StudyMaterialsBrowser() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folder');
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<NexusStudyBrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewerFile, setViewerFile] = useState<NexusStudyFileDTO | null>(null);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NexusStudySearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getToken();
      if (!t) return;
      setToken(t);
      const res = await fetch(
        `/api/study-materials/folders${folderId ? `?parent=${folderId}` : ''}`,
        { headers: { Authorization: `Bearer ${t}` } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load this folder');
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [folderId, getToken]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

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

  const goToFolder = (id: string | null) =>
    router.push(id ? `/student/study-materials?folder=${id}` : '/student/study-materials');

  const contentUrl = (fileId: string, download = false) =>
    `/api/study-materials/files/${fileId}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`;

  const thumbUrl = (fileId: string) =>
    `/api/study-materials/files/${fileId}/thumbnail?token=${encodeURIComponent(token || '')}&size=medium`;

  // Record a file as read (once per open) and clear its unread dot optimistically.
  const markRead = useCallback((fileId: string) => {
    setData((prev) =>
      prev ? { ...prev, files: prev.files.map((f) => (f.id === fileId ? { ...f, is_unread: false } : f)) } : prev,
    );
    getToken().then((t) =>
      fetch(`/api/study-materials/files/${fileId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {}),
    );
  }, [getToken]);

  const openFile = (file: NexusStudyFileDTO) => {
    if (file.kind === 'pdf' || file.kind === 'image') {
      markRead(file.id);
      setViewerFile(file);
    } else if (file.downloadable) {
      markRead(file.id);
      window.open(contentUrl(file.id, true), '_blank');
    }
  };

  const toggleFavorite = async (file: NexusStudyFileDTO, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !file.is_favorite;
    setData((prev) =>
      prev ? { ...prev, files: prev.files.map((f) => (f.id === file.id ? { ...f, is_favorite: next } : f)) } : prev,
    );
    try {
      const t = token || (await getToken());
      const res = await fetch(`/api/study-materials/files/${file.id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const d = await res.json();
        setData((prev) =>
          prev ? { ...prev, files: prev.files.map((f) => (f.id === file.id ? { ...f, is_favorite: d.favorite } : f)) } : prev,
        );
      }
    } catch {
      // revert on failure
      setData((prev) =>
        prev ? { ...prev, files: prev.files.map((f) => (f.id === file.id ? { ...f, is_favorite: file.is_favorite } : f)) } : prev,
      );
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

  // ── Header ──
  const header = (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <FolderOpenOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Study Materials
        </Typography>
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
  if (loading) {
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

  if (error) {
    return (
      <Box>
        {header}
        <EmptyState
          title="Could not open this folder"
          description={error}
          icon={<FolderOutlinedIcon />}
          action={<Button variant="outlined" onClick={load}>Try again</Button>}
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
                    {!!file.comment_count && (
                      <Chip
                        size="small"
                        icon={<ChatBubbleOutlineIcon />}
                        label={file.comment_count}
                        sx={{ height: 20, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: '0.78rem', ml: '4px' } }}
                      />
                    )}
                  </Box>
                </Box>
              </CardActionArea>

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

      {/* View-only file viewer with a Google Classroom style comments panel. */}
      <StudyFileViewer
        file={viewerFile}
        token={token}
        getToken={getToken}
        onClose={() => setViewerFile(null)}
      />
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
