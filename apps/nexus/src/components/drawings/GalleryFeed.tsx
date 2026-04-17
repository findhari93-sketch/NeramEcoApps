'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Skeleton, Button, Switch, FormControlLabel,
  useTheme, useMediaQuery, IconButton, Tooltip, CircularProgress,
} from '@neram/ui';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import GalleryCard from './GalleryCard';
import type { GalleryPost, GalleryReactionType } from '@neram/database/types';

const PAGE_SIZE = 12;

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: '2d_composition', label: '2D' },
  { value: '3d_composition', label: '3D' },
  { value: 'kit_sculpture', label: 'Kit' },
];

interface GalleryFeedProps {
  getToken: () => Promise<string | null>;
  teacherMode?: boolean;
}

export default function GalleryFeed({ getToken, teacherMode }: GalleryFeedProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [posts, setPosts] = useState<GalleryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState('');
  const [hasReference, setHasReference] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const fetchFeed = useCallback(
    async (fetchOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const token = await getToken();
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (hasReference) params.set('hasReference', 'true');
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(fetchOffset));

        const res = await fetch(`/api/drawing/gallery?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const newPosts: GalleryPost[] = data.posts || [];

        if (append) {
          setPosts((prev) => [...prev, ...newPosts]);
        } else {
          setPosts(newPosts);
        }
        setHasMore(newPosts.length === PAGE_SIZE);
      } catch {
        if (!append) setPosts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getToken, category, hasReference],
  );

  // Reset and refetch when filters change
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

  const handleUnpublish = async (submissionId: string) => {
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/gallery/publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, publish: false }),
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== submissionId));
      }
    } catch {
      /* silent */
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={300} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {/* Filter bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Tabs
          value={category}
          onChange={(_, v) => setCategory(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            flex: 1,
            minHeight: 32,
            '& .MuiTab-root': { minHeight: 32, py: 0.25, textTransform: 'none' },
          }}
        >
          {CATEGORIES.map((c) => (
            <Tab key={c.value} value={c.value} label={c.label} />
          ))}
        </Tabs>

        {/* Teacher Refs Only toggle */}
        {isMobile ? (
          <Tooltip title="Teacher Refs Only">
            <IconButton
              size="small"
              color={hasReference ? 'primary' : 'default'}
              onClick={() => setHasReference((v) => !v)}
            >
              <PhotoLibraryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={hasReference}
                onChange={(_, v) => setHasReference(v)}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                Teacher Refs Only
              </Typography>
            }
            sx={{ ml: 0, mr: 0 }}
          />
        )}
      </Box>

      {posts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {hasReference ? 'No drawings with teacher references yet' : 'No published drawings yet'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 600, mx: 'auto' }}>
          {posts.map((post) => (
            <GalleryCard
              key={post.id}
              post={post}
              onReaction={toggleReaction}
              onToggleComments={toggleComments}
              commentsExpanded={expandedComments.has(post.id)}
              getToken={getToken}
              teacherMode={teacherMode}
              onUnpublish={handleUnpublish}
            />
          ))}

          {/* Load More */}
          {hasMore && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Button
                variant="outlined"
                onClick={handleLoadMore}
                disabled={loadingMore}
                sx={{ borderRadius: 6, px: 4 }}
              >
                {loadingMore ? (
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                ) : null}
                {loadingMore ? 'Loading...' : 'Load More'}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
