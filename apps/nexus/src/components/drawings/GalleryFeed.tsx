'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Avatar, Rating, IconButton,
  Tabs, Tab, Skeleton,
} from '@neram/ui';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CategoryBadge from './CategoryBadge';
import CommentSection from './CommentSection';
import type { GalleryPost, GalleryReactionType } from '@neram/database/types';

const REACTIONS: { type: GalleryReactionType; emoji: string }[] = [
  { type: 'heart', emoji: '❤️' },
  { type: 'clap', emoji: '👏' },
  { type: 'fire', emoji: '🔥' },
  { type: 'star', emoji: '⭐' },
  { type: 'wow', emoji: '😮' },
];

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: '2d_composition', label: '2D' },
  { value: '3d_composition', label: '3D' },
  { value: 'kit_sculpture', label: 'Kit' },
];

interface GalleryFeedProps {
  getToken: () => Promise<string | null>;
}

export default function GalleryFeed({ getToken }: GalleryFeedProps) {
  const [posts, setPosts] = useState<GalleryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      params.set('limit', '20');
      const res = await fetch(`/api/drawing/gallery?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, category]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

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
        setPosts((prev) => prev.map((p) => {
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
        }));
      }
    } catch { /* silent */ }
  };

  const toggleComments = (id: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <Tabs
        value={category}
        onChange={(_, v) => setCategory(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.25, textTransform: 'none' } }}
      >
        {CATEGORIES.map((c) => (
          <Tab key={c.value} value={c.value} label={c.label} />
        ))}
      </Tabs>

      {posts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No published drawings yet</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 600, mx: 'auto' }}>
          {posts.map((post) => {
            return (
              <Paper key={post.id} variant="outlined" sx={{ overflow: 'hidden' }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
                  <Avatar
                    src={post.student?.avatar_url || undefined}
                    sx={{ width: 32, height: 32, fontSize: '0.85rem' }}
                  >
                    {post.student?.name?.charAt(0) || '?'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{post.student?.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getTimeAgo(post.reviewed_at || post.submitted_at)}
                    </Typography>
                  </Box>
                  {post.question && <CategoryBadge category={post.question.category} />}
                </Box>

                {/* Image */}
                <Box
                  component="img"
                  src={post.reviewed_image_url || post.original_image_url}
                  alt="Drawing"
                  sx={{ width: '100%', display: 'block' }}
                />

                {/* Question text */}
                {post.question && (
                  <Box sx={{ px: 1.5, py: 0.75 }}>
                    <Typography variant="body2" color="text.secondary" sx={{
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {post.question.question_text}
                    </Typography>
                  </Box>
                )}

                {/* Tutor rating */}
                {post.tutor_rating && (
                  <Box sx={{ px: 1.5, pb: 0.5 }}>
                    <Rating value={post.tutor_rating} readOnly size="small" />
                  </Box>
                )}

                {/* Reactions bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                  {REACTIONS.map((r) => {
                    const count = post.reactions[r.type];
                    const active = post.user_reactions.includes(r.type);
                    return (
                      <IconButton
                        key={r.type}
                        size="small"
                        onClick={() => toggleReaction(post.id, r.type)}
                        sx={{
                          px: 0.75, py: 0.25, borderRadius: 2,
                          bgcolor: active ? 'primary.50' : 'transparent',
                          fontSize: '0.85rem',
                        }}
                      >
                        {r.emoji} {count > 0 && <Typography variant="caption" sx={{ ml: 0.25 }}>{count}</Typography>}
                      </IconButton>
                    );
                  })}
                  <Box sx={{ flex: 1 }} />
                  <IconButton size="small" onClick={() => toggleComments(post.id)}>
                    <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />
                    {post.comment_count > 0 && (
                      <Typography variant="caption" sx={{ ml: 0.25 }}>{post.comment_count}</Typography>
                    )}
                  </IconButton>
                </Box>

                {/* Comments section (expandable) */}
                {expandedComments.has(post.id) && (
                  <Box sx={{ px: 1.5, pb: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <CommentSection
                      submissionId={post.id}
                      getToken={getToken}
                      canComment={true}
                    />
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
