'use client';

import { Box, Typography, Paper, Avatar, Rating, IconButton, Chip } from '@neram/ui';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CategoryBadge from './CategoryBadge';
import CommentSection from './CommentSection';
import ImageCompareToggle from './ImageCompareToggle';
import type { GalleryPost, GalleryReactionType } from '@neram/database/types';

const REACTIONS: { type: GalleryReactionType; emoji: string }[] = [
  { type: 'heart', emoji: '\u2764\uFE0F' },
  { type: 'clap', emoji: '\uD83D\uDC4F' },
  { type: 'fire', emoji: '\uD83D\uDD25' },
  { type: 'star', emoji: '\u2B50' },
  { type: 'wow', emoji: '\uD83D\uDE2E' },
];

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

interface GalleryCardProps {
  post: GalleryPost;
  onReaction: (submissionId: string, type: GalleryReactionType) => void;
  onToggleComments: (submissionId: string) => void;
  commentsExpanded: boolean;
  getToken: () => Promise<string | null>;
  teacherMode?: boolean;
  onUnpublish?: (submissionId: string) => void;
}

export default function GalleryCard({
  post,
  onReaction,
  onToggleComments,
  commentsExpanded,
  getToken,
  teacherMode,
  onUnpublish,
}: GalleryCardProps) {
  const totalReactions = Object.values(post.reactions).reduce((sum, v) => sum + v, 0);

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
        <Avatar
          src={post.student?.avatar_url || undefined}
          sx={{ width: 32, height: 32, fontSize: '0.85rem' }}
        >
          {post.student?.name?.charAt(0) || '?'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {post.student?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {getTimeAgo(post.reviewed_at || post.submitted_at)}
          </Typography>
        </Box>
        {post.question && <CategoryBadge category={post.question.category} />}
        {post.tutor_rating && (
          <Rating value={post.tutor_rating} readOnly size="small" sx={{ ml: 0.5 }} />
        )}
      </Box>

      {/* Image area: side-by-side (desktop) or scroll-snap toggle (mobile) */}
      <ImageCompareToggle
        originalImageUrl={post.original_image_url}
        correctedImageUrl={post.corrected_image_url || null}
      />

      {/* Question text */}
      {post.question && (
        <Box sx={{ px: 1.5, py: 0.75 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {post.question.question_text}
          </Typography>
        </Box>
      )}

      {/* Reactions bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        {REACTIONS.map((r) => {
          const count = post.reactions[r.type];
          const active = post.user_reactions.includes(r.type);
          return (
            <IconButton
              key={r.type}
              size="small"
              onClick={() => onReaction(post.id, r.type)}
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: 2,
                bgcolor: active ? 'primary.50' : 'transparent',
                fontSize: '0.85rem',
              }}
            >
              {r.emoji}{' '}
              {count > 0 && (
                <Typography variant="caption" sx={{ ml: 0.25 }}>
                  {count}
                </Typography>
              )}
            </IconButton>
          );
        })}
        <Box sx={{ flex: 1 }} />

        {/* Teacher mode: stats + unpublish */}
        {teacherMode && (
          <>
            <Chip
              label={`${totalReactions} reactions`}
              size="small"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.65rem' }}
            />
            <IconButton
              size="small"
              color="warning"
              onClick={(e) => {
                e.stopPropagation();
                onUnpublish?.(post.id);
              }}
              title="Unpublish from gallery"
            >
              <VisibilityOffIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        )}

        <IconButton size="small" onClick={() => onToggleComments(post.id)}>
          <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />
          {post.comment_count > 0 && (
            <Typography variant="caption" sx={{ ml: 0.25 }}>
              {post.comment_count}
            </Typography>
          )}
        </IconButton>
      </Box>

      {/* Comments section (expandable) */}
      {commentsExpanded && (
        <Box sx={{ px: 1.5, pb: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <CommentSection submissionId={post.id} getToken={getToken} canComment={true} />
        </Box>
      )}
    </Paper>
  );
}
