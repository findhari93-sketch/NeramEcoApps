'use client';

import { Box, Typography, Paper, Avatar, Rating, IconButton, Chip } from '@neram/ui';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CommentSection from './CommentSection';
import GalleryImageViewer from './GalleryImageViewer';
import type { GalleryPost, GalleryReactionType, DrawingTag } from '@neram/database/types';
import type { DrawingViewMode } from '@/hooks/useDrawingViewMode';

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
  /** Teacher-only: hide this submission from the gallery (keeps the submission, just flips visibility). */
  onHide?: (submissionId: string) => void;
  viewMode?: DrawingViewMode;
}

export default function GalleryCard({
  post,
  onReaction,
  onToggleComments,
  commentsExpanded,
  getToken,
  teacherMode,
  onHide,
  viewMode = 'comfortable',
}: GalleryCardProps) {
  const totalReactions = Object.values(post.reactions).reduce((sum, v) => sum + v, 0);
  const isRedoOrigin = post.status === 'redo';
  const isCompact = viewMode === 'compact';
  const tags = (post.tags as DrawingTag[] | undefined) || [];
  const imageHeight = isCompact ? 200 : 280;

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', position: 'relative' }}>
      {/* Learning badge for redo-origin cards */}
      {isRedoOrigin && (
        <Chip
          icon={<SchoolOutlinedIcon sx={{ fontSize: '0.85rem !important' }} />}
          label="Learning"
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 3,
            height: 22,
            bgcolor: 'rgba(124,58,237,0.9)',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            '& .MuiChip-icon': { color: '#fff' },
          }}
        />
      )}

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
        <Avatar
          src={post.student?.avatar_url || undefined}
          sx={{ width: isCompact ? 26 : 32, height: isCompact ? 26 : 32, fontSize: '0.85rem' }}
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
        {post.tutor_rating && (
          <Rating value={post.tutor_rating} readOnly size="small" />
        )}
      </Box>

      {/* 3-mode image viewer. Redo-origin items default to overlay so students
          see the teacher's corrections layered on the attempt at a glance. */}
      <GalleryImageViewer
        originalImageUrl={post.original_image_url}
        correctedImageUrl={post.corrected_image_url || null}
        defaultMode={isRedoOrigin ? 'overlay' : 'original'}
        height={imageHeight}
      />

      {/* Question text */}
      {post.question && !isCompact && (
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

      {/* Tags */}
      {tags.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, py: 0.5 }}>
          {tags.slice(0, isCompact ? 3 : 6).map((t) => (
            <Chip
              key={t.id}
              label={t.label}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          ))}
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

        {teacherMode && (
          <>
            {!isCompact && (
              <Chip
                label={`${totalReactions} reactions`}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: '0.65rem' }}
              />
            )}
            <IconButton
              size="small"
              color="warning"
              onClick={(e) => {
                e.stopPropagation();
                onHide?.(post.id);
              }}
              title="Hide from gallery"
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
