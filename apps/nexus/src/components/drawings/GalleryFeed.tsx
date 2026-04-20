'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Skeleton, Button, CircularProgress,
} from '@neram/ui';
import GalleryCard from './GalleryCard';
import TagFilterBar from './TagFilterBar';
import type { GalleryPost, GalleryReactionType } from '@neram/database/types';
import type { DrawingViewMode } from '@/hooks/useDrawingViewMode';

const PAGE_SIZE = 12;

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

  const fetchFeed = useCallback(
    async (fetchOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const token = await getToken();
        const params = new URLSearchParams();
        if (tagSlugs.length > 0) params.set('tags', tagSlugs.join(','));
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
    [getToken, tagSlugs],
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

  /** Teacher-only: flip the gallery-visibility boolean for a submission. */
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
      }
    } catch {
      /* silent */
    }
  };

  return (
    <Box>
      <TagFilterBar selected={tagSlugs} onChange={setTagSlugs} />

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={viewMode === 'compact' ? 180 : 300} />
          ))}
        </Box>
      ) : posts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {tagSlugs.length > 0 ? 'No drawings match these tags' : 'No drawings in the gallery yet'}
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
              onHide={handleHide}
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
