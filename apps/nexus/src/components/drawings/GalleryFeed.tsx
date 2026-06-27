'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Skeleton, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Alert,
  TextField, MenuItem,
} from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import GalleryCard from './GalleryCard';
import TagFilterBar from './TagFilterBar';
import AlumniCollegeFilter from './AlumniCollegeFilter';
import type { GalleryPost, GalleryReactionType } from '@neram/database/types';
import type { DrawingViewMode } from '@/hooks/useDrawingViewMode';

const PAGE_SIZE = 12;

type GalleryAudience = 'current' | 'alumni';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All' },
  { value: '2d_composition', label: '2D' },
  { value: '3d_composition', label: '3D' },
  { value: 'kit_sculpture', label: 'Kit' },
];

/** Recent academic years in 'YYYY-YY' form (the Indian academic year flips ~June). */
function academicYearChoices(count = 6): string[] {
  const now = new Date();
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const years: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = startYear - i;
    years.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  }
  return years;
}

interface GalleryFeedProps {
  getToken: () => Promise<string | null>;
  teacherMode?: boolean;
  /** Optional view mode override. Parent pages own the localStorage-backed state
   *  so teacher and student gallery surfaces share the same preference. */
  viewMode?: DrawingViewMode;
}

/**
 * Unified gallery feed: any reviewed submission with `is_gallery_visible=true`,
 * regardless of status (completed or redo). Filtered by free-form tags rather
 * than the old 2D/3D/Kit sub-tabs. Redo-origin items are rendered with a
 * default overlay view and a subtle Learning badge.
 */
export default function GalleryFeed({ getToken, teacherMode, viewMode = 'comfortable' }: GalleryFeedProps) {
  const [posts, setPosts] = useState<GalleryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tagSlugs, setTagSlugs] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [audience, setAudience] = useState<GalleryAudience>('current');
  const [category, setCategory] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [collegeId, setCollegeId] = useState('');
  // Teacher/admin-only moderation scope. Students never see this control and the
  // API forces them to 'visible' regardless.
  const [visibility, setVisibility] = useState<'visible' | 'hidden'>('visible');
  const [notice, setNotice] = useState<string | null>(null);

  const fetchFeed = useCallback(
    async (fetchOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const token = await getToken();
        const params = new URLSearchParams();
        if (tagSlugs.length > 0) params.set('tags', tagSlugs.join(','));
        params.set('audience', audience);
        if (category) params.set('category', category);
        if (academicYear) params.set('academicYear', academicYear);
        if (audience === 'alumni' && collegeId) params.set('collegeId', collegeId);
        if (teacherMode && visibility === 'hidden') params.set('visibility', 'hidden');
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(fetchOffset));

        const res = await fetch(`/api/drawing/gallery?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const newPosts: GalleryPost[] = data.posts || [];

        if (append) setPosts((prev) => [...prev, ...newPosts]);
        else setPosts(newPosts);
        setHasMore(newPosts.length === PAGE_SIZE);
      } catch {
        if (!append) setPosts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getToken, tagSlugs, audience, category, academicYear, collegeId, teacherMode, visibility],
  );

  useEffect(() => {
    setOffset(0);
    fetchFeed(0, false);
  }, [fetchFeed]);

  const handleLoadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchFeed(newOffset, true);
  };

  const toggleReaction = async (submissionId: string, reactionType: GalleryReactionType) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/gallery/${submissionId}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: reactionType }),
      });
      if (res.ok) {
        const { added } = await res.json();
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== submissionId) return p;
            return {
              ...p,
              reactions: {
                ...p.reactions,
                [reactionType]: p.reactions[reactionType] + (added ? 1 : -1),
              },
              user_reactions: added
                ? [...p.user_reactions, reactionType]
                : p.user_reactions.filter((r) => r !== reactionType),
            };
          }),
        );
      }
    } catch {
      /* silent */
    }
  };

  const toggleComments = (id: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Teacher-only: hide a work from the student gallery. It leaves the Visible
   *  list but is recoverable from the Hidden view (see handleRestore). */
  const handleHide = async (submissionId: string) => {
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/gallery/publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, visible: false }),
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== submissionId));
        setNotice('Hidden from students. Switch to Hidden to review or restore it.');
      }
    } catch {
      /* silent */
    }
  };

  /** Teacher-only: return a hidden work to the student gallery. */
  const handleRestore = async (submissionId: string) => {
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/gallery/publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, visible: true }),
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== submissionId));
        setNotice('Restored to the student gallery.');
      }
    } catch {
      /* silent */
    }
  };

  /** Teacher-only: pin/unpin alumnus work in the Hall of Fame. */
  const handleFeature = async (submissionId: string, featured: boolean) => {
    // Optimistic flip.
    setPosts((prev) => prev.map((p) => (p.id === submissionId ? { ...p, alumni_featured: featured } : p)));
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/gallery/${submissionId}/feature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured }),
      });
      if (!res.ok) {
        // Revert on failure.
        setPosts((prev) => prev.map((p) => (p.id === submissionId ? { ...p, alumni_featured: !featured } : p)));
      }
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === submissionId ? { ...p, alumni_featured: !featured } : p)));
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <ToggleButtonGroup
          value={audience}
          exclusive
          size="small"
          onChange={(_, val) => {
            if (val) {
              setAudience(val);
              if (val !== 'alumni') setCollegeId('');
            }
          }}
          aria-label="Gallery audience"
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2, minHeight: 40 } }}
        >
          <ToggleButton value="current" aria-label="Current students">
            Current students
          </ToggleButton>
          <ToggleButton value="alumni" aria-label="Alumni Hall of Fame">
            <EmojiEventsOutlinedIcon sx={{ fontSize: 18, mr: 0.75 }} />
            Hall of Fame
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Teacher/admin moderation scope. Students never render this. */}
      {teacherMode && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <ToggleButtonGroup
            value={visibility}
            exclusive
            size="small"
            onChange={(_, val) => {
              if (val) {
                setVisibility(val);
                setNotice(null);
              }
            }}
            aria-label="Moderation scope"
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2, minHeight: 40 } }}
          >
            <ToggleButton value="visible" aria-label="Visible to students">
              <VisibilityOutlinedIcon sx={{ fontSize: 18, mr: 0.75 }} />
              Visible
            </ToggleButton>
            <ToggleButton value="hidden" aria-label="Hidden from students">
              <VisibilityOffOutlinedIcon sx={{ fontSize: 18, mr: 0.75 }} />
              Hidden
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {notice && (
        <Alert severity="info" onClose={() => setNotice(null)} sx={{ mb: 2, maxWidth: 600, mx: 'auto' }}>
          {notice}
        </Alert>
      )}

      {/* Category + cohort-year filters. Wraps on small screens (no overflow). */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1.5 }}>
        <ToggleButtonGroup
          value={category}
          exclusive
          size="small"
          onChange={(_, val) => setCategory(val ?? '')}
          aria-label="Drawing category"
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.75, minHeight: 40 } }}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <ToggleButton key={c.value || 'all'} value={c.value} aria-label={c.label}>
              {c.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          select
          size="small"
          label="Year"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">All years</MenuItem>
          {academicYearChoices().map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* College filter: only on the Hall of Fame (seniors' works). */}
      {audience === 'alumni' && (
        <Box sx={{ mb: 1.5 }}>
          <AlumniCollegeFilter getToken={getToken} value={collegeId} onChange={setCollegeId} />
        </Box>
      )}

      <TagFilterBar selected={tagSlugs} onChange={setTagSlugs} />

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={viewMode === 'compact' ? 180 : 300} />
          ))}
        </Box>
      ) : posts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          {audience === 'alumni' && (
            <EmojiEventsOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          )}
          <Typography color="text.secondary">
            {teacherMode && visibility === 'hidden'
              ? 'No works are hidden from students'
              : tagSlugs.length > 0 || category || academicYear
                ? 'No drawings match these filters'
                : audience === 'alumni'
                  ? 'No alumni work in the Hall of Fame yet'
                  : 'No drawings in the gallery yet'}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: viewMode === 'compact' ? 'grid' : 'flex',
            flexDirection: viewMode === 'compact' ? undefined : 'column',
            gridTemplateColumns: viewMode === 'compact' ? { xs: '1fr', sm: 'repeat(2, 1fr)' } : undefined,
            gap: 2,
            maxWidth: viewMode === 'compact' ? 1000 : 600,
            mx: 'auto',
          }}
        >
          {posts.map((post) => (
            <GalleryCard
              key={post.id}
              post={post}
              onReaction={toggleReaction}
              onToggleComments={toggleComments}
              commentsExpanded={expandedComments.has(post.id)}
              getToken={getToken}
              teacherMode={teacherMode}
              isHiddenView={visibility === 'hidden'}
              onHide={handleHide}
              onRestore={handleRestore}
              onFeature={handleFeature}
              viewMode={viewMode}
            />
          ))}

          {hasMore && (
            <Box sx={{ textAlign: 'center', py: 2, gridColumn: '1 / -1' }}>
              <Button
                variant="outlined"
                onClick={handleLoadMore}
                disabled={loadingMore}
                sx={{ borderRadius: 6, px: 4 }}
              >
                {loadingMore ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
                {loadingMore ? 'Loading...' : 'Load More'}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
