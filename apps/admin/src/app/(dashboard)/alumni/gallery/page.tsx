'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Avatar,
  Chip,
  Paper,
  CircularProgress,
  Alert,
  Rating,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
} from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { academicYearOptions } from '../../../../components/crm/academic-years';

interface GalleryItem {
  id: string;
  original_image_url: string;
  reviewed_at: string | null;
  tutor_rating: number | null;
  alumni_featured: boolean;
  student?: { id: string; name: string; avatar_url: string | null; academic_year?: string | null };
}

export default function AlumniGalleryPage() {
  const router = useRouter();
  const { supabaseUserId } = useAdminProfile();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [yearFilter, setYearFilter] = useState('');

  const load = useCallback(async () => {
    if (!supabaseUserId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminId: supabaseUserId, limit: '60' });
      if (yearFilter) params.set('academicYear', yearFilter);
      const res = await fetch(`/api/crm/alumni/gallery?${params}`);
      const data = await res.json();
      setItems(data.posts || []);
    } catch {
      setBanner({ type: 'error', text: 'Failed to load gallery' });
    } finally {
      setLoading(false);
    }
  }, [supabaseUserId, yearFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFeature = async (id: string, featured: boolean) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, alumni_featured: featured } : p)));
    try {
      const res = await fetch('/api/crm/alumni/gallery/feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, featured }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, alumni_featured: !featured } : p)));
      setBanner({ type: 'error', text: 'Failed to update feature status' });
    }
  };

  const hideItem = async (id: string) => {
    const prev = items;
    setItems((cur) => cur.filter((p) => p.id !== id));
    try {
      const res = await fetch('/api/crm/alumni/gallery/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, visible: false }),
      });
      if (!res.ok) throw new Error();
      setBanner({ type: 'success', text: 'Removed from the gallery.' });
    } catch {
      setItems(prev);
      setBanner({ type: 'error', text: 'Failed to hide item' });
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <IconButton onClick={() => router.push('/alumni')} aria-label="Back to alumni">
          <ArrowBackIcon />
        </IconButton>
        <EmojiEventsOutlinedIcon sx={{ color: '#B45309', fontSize: 30 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>
            Alumni Hall of Fame
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Curate past students&apos; best work. Star to feature, hide to remove.
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label="Cohort year"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All years</MenuItem>
          {academicYearOptions().map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {banner && (
        <Alert severity={banner.type} sx={{ mb: 2 }} onClose={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2 }}>
          <EmojiEventsOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No alumni work in the gallery yet.</Typography>
          <Typography variant="body2" color="text.secondary">
            Graduate a batch, then their reviewed drawings appear here.
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
            gap: 2,
          }}
        >
          {items.map((item) => (
            <Paper key={item.id} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
              {item.alumni_featured && (
                <Chip
                  icon={<StarIcon sx={{ fontSize: '0.85rem !important' }} />}
                  label="Featured"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    zIndex: 2,
                    height: 22,
                    bgcolor: 'rgba(217,119,6,0.95)',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    '& .MuiChip-icon': { color: '#fff' },
                  }}
                />
              )}
              {/* Internal admin tool: plain img avoids next/image remotePattern config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.original_image_url}
                alt={`Drawing by ${item.student?.name || 'alumnus'}`}
                style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block', background: '#f3f4f6' }}
              />
              <Box sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Avatar src={item.student?.avatar_url || undefined} sx={{ width: 28, height: 28, fontSize: 12 }}>
                    {item.student?.name?.charAt(0)?.toUpperCase() || '?'}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {item.student?.name || 'Unknown'}
                    </Typography>
                    {item.student?.academic_year && (
                      <Typography variant="caption" color="text.secondary">
                        Batch {item.student.academic_year}
                      </Typography>
                    )}
                  </Box>
                  {item.tutor_rating ? <Rating value={item.tutor_rating} readOnly size="small" /> : null}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                  <Tooltip title={item.alumni_featured ? 'Unfeature' : 'Feature in Hall of Fame'}>
                    <IconButton
                      size="small"
                      onClick={() => toggleFeature(item.id, !item.alumni_featured)}
                      sx={{ color: item.alumni_featured ? '#D97706' : 'text.disabled' }}
                    >
                      {item.alumni_featured ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Hide from gallery">
                    <IconButton size="small" color="warning" onClick={() => hideItem(item.id)}>
                      <VisibilityOffIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
