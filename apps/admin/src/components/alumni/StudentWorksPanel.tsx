'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Rating,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  ImageViewerDialog,
} from '@neram/ui';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { MUTED, LINE } from './theme';

interface VaultSubmission {
  id: string;
  original_image_url: string;
  corrected_image_url: string | null;
  reviewed_image_url: string | null;
  status: string;
  tutor_rating: number | null;
  tutor_feedback: string | null;
  is_gallery_visible: boolean;
  alumni_featured: boolean | null;
  submitted_at: string;
  reviewed_at: string | null;
}

type WorksFilter = 'all' | 'published' | 'hidden';

/**
 * The admin "Vault": a read-only grid of every drawing a student submitted,
 * published and hidden alike. Reused by the alumni drawer and full profile.
 * No impersonation, just thumbnails that open an image viewer.
 */
export default function StudentWorksPanel({
  userId,
  studentName,
  compact = false,
}: {
  userId: string;
  studentName?: string | null;
  compact?: boolean;
}) {
  const [subs, setSubs] = useState<VaultSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<WorksFilter>('all');
  const [viewer, setViewer] = useState<{ src: string; name?: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}/submissions`);
      const data = await res.json();
      setSubs(res.ok ? data.submissions || [] : []);
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const publishedCount = subs.filter((s) => s.is_gallery_visible).length;
  const hiddenCount = subs.length - publishedCount;
  const filtered = subs.filter((s) =>
    filter === 'all' ? true : filter === 'published' ? s.is_gallery_visible : !s.is_gallery_visible,
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (subs.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: MUTED }}>
        No drawings submitted yet.
      </Typography>
    );
  }

  return (
    <Box>
      <ToggleButtonGroup
        value={filter}
        exclusive
        size="small"
        onChange={(_, val) => val && setFilter(val)}
        aria-label="Works filter"
        sx={{ mb: 1.5, '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5, py: 0.25, fontSize: 12 } }}
      >
        <ToggleButton value="all">All {subs.length}</ToggleButton>
        <ToggleButton value="published">Published {publishedCount}</ToggleButton>
        <ToggleButton value="hidden">Hidden {hiddenCount}</ToggleButton>
      </ToggleButtonGroup>

      {filtered.length === 0 ? (
        <Typography variant="body2" sx={{ color: MUTED }}>
          {filter === 'hidden' ? 'Nothing hidden from students.' : 'No published works.'}
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: compact
              ? 'repeat(3, 1fr)'
              : { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(6, 1fr)' },
            gap: 1,
          }}
        >
          {filtered.map((s) => (
            <Box
              key={s.id}
              onClick={() => setViewer({ src: s.original_image_url, name: studentName })}
              title={s.tutor_feedback || undefined}
              sx={{
                position: 'relative',
                borderRadius: 1.5,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: LINE,
                cursor: 'pointer',
                '&:hover': { borderColor: MUTED },
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.original_image_url}
                alt={`Drawing by ${studentName || 'student'}`}
                style={{ width: '100%', height: compact ? 84 : 96, objectFit: 'cover', display: 'block', background: '#f3f4f6' }}
              />
              {!s.is_gallery_visible && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    bgcolor: 'rgba(180,83,9,0.92)',
                    color: '#fff',
                    borderRadius: 0.75,
                    px: 0.5,
                    py: 0.125,
                  }}
                >
                  <VisibilityOffIcon sx={{ fontSize: 11 }} />
                  <Typography sx={{ fontSize: 9, fontWeight: 700 }}>Hidden</Typography>
                </Box>
              )}
              {s.tutor_rating ? (
                <Box sx={{ position: 'absolute', bottom: 2, left: 2, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 0.75, px: 0.5 }}>
                  <Rating value={s.tutor_rating} readOnly size="small" sx={{ fontSize: '0.65rem' }} />
                </Box>
              ) : (
                <Chip
                  label={s.status === 'submitted' ? 'Awaiting review' : s.status}
                  size="small"
                  sx={{ position: 'absolute', bottom: 2, left: 2, height: 16, fontSize: 9, textTransform: 'capitalize' }}
                />
              )}
            </Box>
          ))}
        </Box>
      )}

      <ImageViewerDialog
        open={!!viewer}
        onClose={() => setViewer(null)}
        src={viewer?.src || ''}
        name={viewer?.name}
        alt={`Drawing by ${studentName || 'student'}`}
      />

      {!compact && (
        <Typography variant="caption" sx={{ color: MUTED, display: 'block', mt: 1 }}>
          Read-only. These are every drawing {studentName || 'this student'} submitted in Nexus.
        </Typography>
      )}
    </Box>
  );
}
