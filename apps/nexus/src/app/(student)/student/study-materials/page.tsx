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
  Dialog,
  Button,
  Tooltip,
  EmptyState,
  ImageViewerDialog,
  alpha,
  useTheme,
  useMediaQuery,
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
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PDFReader from '@/components/reader/PDFReader';
import type { NexusStudyBrowseResult, NexusStudyFileDTO } from '@neram/database/types';

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
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<NexusStudyBrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pdfFile, setPdfFile] = useState<NexusStudyFileDTO | null>(null);
  const [imageFile, setImageFile] = useState<NexusStudyFileDTO | null>(null);

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

  const goToFolder = (id: string | null) =>
    router.push(id ? `/student/study-materials?folder=${id}` : '/student/study-materials');

  const contentUrl = (fileId: string, download = false) =>
    `/api/study-materials/files/${fileId}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`;

  const openFile = (file: NexusStudyFileDTO) => {
    if (file.kind === 'pdf') setPdfFile(file);
    else if (file.kind === 'image') setImageFile(file);
    else if (file.downloadable) window.open(contentUrl(file.id, true), '_blank');
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

  return (
    <Box>
      {header}
      {breadcrumb}

      {isEmpty ? (
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
                    bgcolor: alpha(theme.palette.text.primary, 0.04),
                    mb: 1,
                  }}
                >
                  <FileIcon kind={file.kind} />
                </Box>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.25 }} noWrap>
                    {file.title}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
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
                    {file.file_size_bytes ? (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem' }}>
                        {formatSize(file.file_size_bytes)}
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
              </CardActionArea>
              {file.downloadable && (
                <Tooltip title="Download">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(contentUrl(file.id, true), '_blank');
                    }}
                    sx={{ position: 'absolute', top: 6, right: 6, bgcolor: alpha(theme.palette.background.paper, 0.8) }}
                  >
                    <DownloadOutlinedIcon sx={{ fontSize: '1.05rem' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Card>
          ))}
        </Box>
      )}

      {/* PDF viewer (view-only: PDFReader hides the browser download/print toolbar) */}
      <Dialog
        open={!!pdfFile}
        onClose={() => setPdfFile(null)}
        fullScreen={isMobile}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: isMobile ? '100%' : '92vh', borderRadius: isMobile ? 0 : 2 } }}
      >
        {pdfFile && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1.25,
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <PictureAsPdfOutlinedIcon sx={{ color: '#d32f2f' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                {pdfFile.title}
              </Typography>
              {pdfFile.downloadable && (
                <Button
                  size="small"
                  startIcon={<DownloadOutlinedIcon />}
                  onClick={() => window.open(contentUrl(pdfFile.id, true), '_blank')}
                >
                  Download
                </Button>
              )}
              <IconButton size="small" onClick={() => setPdfFile(null)} aria-label="Close">
                <CloseIcon />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <PDFReader pdfUrl={contentUrl(pdfFile.id)} />
            </Box>
          </Box>
        )}
      </Dialog>

      {/* Image viewer */}
      {imageFile && (
        <ImageViewerDialog
          open={!!imageFile}
          onClose={() => setImageFile(null)}
          src={contentUrl(imageFile.id)}
          name={imageFile.title}
        />
      )}
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
