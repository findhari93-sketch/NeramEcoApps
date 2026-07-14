'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Card, CardActionArea, Chip, IconButton, Skeleton, Button, Tooltip,
  EmptyState, alpha, useTheme,
} from '@neram/ui';
import StarIcon from '@mui/icons-material/Star';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudyFileViewer from '@/components/study-materials/StudyFileViewer';
import type { NexusStudyFileDTO } from '@neram/database/types';

type StarredFile = NexusStudyFileDTO & { breadcrumb: { id: string; name: string }[] };

function Glyph({ kind, size = 30 }: { kind: string; size?: number }) {
  if (kind === 'pdf') return <PictureAsPdfOutlinedIcon sx={{ fontSize: size, color: '#d32f2f' }} />;
  if (kind === 'image') return <ImageOutlinedIcon sx={{ fontSize: size, color: '#1976d2' }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
}

function Thumb({ kind, src }: { kind: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  const canPreview = (kind === 'pdf' || kind === 'image') && !!src && !failed;
  return (
    <Box sx={{ width: '100%', height: 92, borderRadius: 2, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', mb: 1 }}>
      {canPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" loading="lazy" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Glyph kind={kind} />
      )}
    </Box>
  );
}

export default function StarredPage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, user, loading: authLoading } = useNexusAuthContext();

  // Identity stamped over PDFs/images to deter redistribution (name + phone/email).
  const watermark = user
    ? [user.name, user.phone || user.email].filter(Boolean).join('   ·   ')
    : undefined;

  const [token, setToken] = useState<string | null>(null);
  const [files, setFiles] = useState<StarredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<NexusStudyFileDTO | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getToken();
      if (!t) return;
      setToken(t);
      const res = await fetch('/api/study-materials/favorites', { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || 'Could not load your starred files');
      }
      const data = await res.json();
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  const contentUrl = (fileId: string, download = false) =>
    `/api/study-materials/files/${fileId}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`;
  const thumbUrl = (fileId: string) =>
    `/api/study-materials/files/${fileId}/thumbnail?token=${encodeURIComponent(token || '')}&size=large`;

  const openFile = (file: StarredFile) => {
    if (file.kind === 'pdf' || file.kind === 'image') setViewerFile(file);
    else if (file.downloadable) window.open(contentUrl(file.id, true), '_blank');
  };

  const unstar = async (file: StarredFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    try {
      const t = token || (await getToken());
      await fetch(`/api/study-materials/files/${file.id}/favorite`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
    } catch {
      load();
    }
  };

  const header = (
    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton onClick={() => router.push('/student/study-materials')} aria-label="Back to materials" sx={{ width: 44, height: 44 }}>
        <ArrowBackIcon />
      </IconButton>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StarIcon sx={{ color: '#f5b400' }} />
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Starred</Typography>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Your quick-access study files.</Typography>
      </Box>
    </Box>
  );

  if (loading) {
    return (
      <Box>
        {header}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rounded" height={150} />)}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        {header}
        <EmptyState title="Could not load starred" description={error} icon={<StarOutlineIcon />}
          action={<Button variant="outlined" onClick={load}>Try again</Button>} />
      </Box>
    );
  }

  return (
    <Box>
      {header}
      {files.length === 0 ? (
        <EmptyState
          title="No starred files yet"
          description="Tap the star on any file in Study Materials to keep it here for quick revision."
          icon={<StarOutlineIcon />}
          action={<Button variant="outlined" onClick={() => router.push('/student/study-materials')}>Browse materials</Button>}
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {files.map((file) => (
            <Card
              key={file.id}
              elevation={0}
              sx={{
                position: 'relative', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5,
                transition: 'transform 150ms ease, box-shadow 150ms ease',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 6px 20px ${alpha('#000', 0.08)}` },
              }}
            >
              <CardActionArea onClick={() => openFile(file)} sx={{ p: 1.5, height: '100%', minHeight: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                <Thumb kind={file.kind} src={thumbUrl(file.id)} />
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.25 }} noWrap>{file.title}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {file.breadcrumb.map((b) => b.name).join(' › ') || 'Study Materials'}
                  </Typography>
                  <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      icon={file.downloadable ? <DownloadOutlinedIcon /> : <LockOutlinedIcon />}
                      label={file.downloadable ? 'Download' : 'View only'}
                      sx={{
                        height: 20, fontSize: '0.62rem', '& .MuiChip-icon': { fontSize: '0.8rem', ml: '4px' },
                        bgcolor: file.downloadable ? alpha(theme.palette.success.main, 0.12) : alpha(theme.palette.text.secondary, 0.1),
                        color: file.downloadable ? 'success.main' : 'text.secondary',
                      }}
                    />
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
                  </Box>
                </Box>
              </CardActionArea>
              <Tooltip title="Remove from starred">
                <IconButton size="small" onClick={(e) => unstar(file, e)} aria-label="Remove from starred"
                  sx={{ position: 'absolute', top: 6, left: 6, bgcolor: alpha(theme.palette.background.paper, 0.85), '&:hover': { bgcolor: theme.palette.background.paper } }}>
                  <StarIcon sx={{ fontSize: '1.05rem', color: '#f5b400' }} />
                </IconButton>
              </Tooltip>
            </Card>
          ))}
        </Box>
      )}

      <StudyFileViewer file={viewerFile} token={token} getToken={getToken} onClose={() => setViewerFile(null)} watermark={watermark} track onProgressChange={load} />
    </Box>
  );
}
