'use client';

import {
  Card,
  CardContent,
  CardActions,
  Chip,
  AvatarGroup,
  Avatar,
  Typography,
  IconButton,
  Stack,
  Tooltip,
  Box,
  alpha,
  useTheme,
} from '@neram/ui';
import ImageIcon from '@mui/icons-material/Image';
import type { ExamRecallThreadListItem, ExamRecallQuestionType, ExamRecallSection, ExamRecallClarity, ExamRecallThreadStatus, ExamRecallTopicCategory } from '@neram/database';
import ConfirmButton from './ConfirmButton';
import VouchButton from './VouchButton';

interface ThreadCardProps {
  thread: ExamRecallThreadListItem;
  onConfirm?: () => void;
  onThreadClick?: () => void;
  compact?: boolean;
}

const QUESTION_TYPE_LABELS: Record<ExamRecallQuestionType, string> = {
  mcq: 'MCQ',
  numerical: 'Numerical',
  fill_blank: 'Fill-blank',
  drawing: 'Drawing',
};

const QUESTION_TYPE_COLORS: Record<ExamRecallQuestionType, string> = {
  mcq: '#1976d2',
  numerical: '#7b1fa2',
  fill_blank: '#e65100',
  drawing: '#2e7d32',
};

const SECTION_LABELS: Record<ExamRecallSection, string> = {
  part_a: 'Part A',
  part_b: 'Part B',
};

const CLARITY_CONFIG: Record<ExamRecallClarity, { dot: string; label: string; color: string }> = {
  clear: { dot: '\u{1F7E2}', label: 'Clear', color: '#2e7d32' },
  partial: { dot: '\u{1F7E1}', label: 'Partial', color: '#ed6c02' },
  vague: { dot: '\u{1F534}', label: 'Vague', color: '#d32f2f' },
};

const STATUS_CONFIG: Record<ExamRecallThreadStatus, { label: string; color: string; bgcolor: string }> = {
  raw: { label: 'Raw', color: '#e65100', bgcolor: '#fff3e0' },
  under_review: { label: 'Under Review', color: '#1565c0', bgcolor: '#e3f2fd' },
  published: { label: 'Published', color: '#2e7d32', bgcolor: '#e8f5e9' },
  dismissed: { label: 'Dismissed', color: '#616161', bgcolor: '#f5f5f5' },
};

const TOPIC_LABELS: Record<ExamRecallTopicCategory, string> = {
  visual_reasoning: 'Visual Reasoning',
  logical_derivation: 'Logical Derivation',
  gk_architecture: 'GK / Architecture',
  language: 'Language',
  design_sensitivity: 'Design Sensitivity',
  numerical_ability: 'Numerical Ability',
  drawing: 'Drawing',
};

export default function ThreadCard({ thread, onConfirm, onThreadClick, compact }: ThreadCardProps) {
  const theme = useTheme();
  const clarity = thread.latest_version?.clarity ?? 'vague';
  const clarityInfo = CLARITY_CONFIG[clarity];
  const statusInfo = STATUS_CONFIG[thread.status];

  return (
    <Card
      variant="outlined"
      onClick={onThreadClick}
      role={onThreadClick ? 'button' : undefined}
      tabIndex={onThreadClick ? 0 : undefined}
      onKeyDown={onThreadClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onThreadClick();
        }
      } : undefined}
      sx={{
        cursor: onThreadClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease-in-out',
        '&:hover': onThreadClick ? {
          boxShadow: theme.shadows[4],
          borderColor: alpha(theme.palette.primary.main, 0.4),
        } : {},
      }}
    >
      <CardContent sx={{ p: { xs: 1.5, md: 2 }, '&:last-child': { pb: onConfirm ? 0 : undefined } }}>
        {/* Top row: badges */}
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" sx={{ mb: 1, gap: 0.5 }}>
          <Chip
            label={QUESTION_TYPE_LABELS[thread.question_type]}
            size="small"
            sx={{
              bgcolor: QUESTION_TYPE_COLORS[thread.question_type],
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 22,
            }}
          />
          <Chip
            label={SECTION_LABELS[thread.section]}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 22 }}
          />
          <Chip
            label={statusInfo.label}
            size="small"
            sx={{
              bgcolor: statusInfo.bgcolor,
              color: statusInfo.color,
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 22,
            }}
          />
          {thread.has_image && (
            <Tooltip title="Contains image" arrow>
              <ImageIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
            </Tooltip>
          )}
        </Stack>

        {/* Recall text (truncated 2 lines) */}
        <Typography
          variant="body2"
          sx={{
            mb: 1,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.5,
            color: 'text.primary',
            minHeight: compact ? 'auto' : 42,
          }}
        >
          {thread.latest_version?.recall_text || 'No text recorded'}
        </Typography>

        {/* Middle row: clarity + topic + avatars */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1, gap: 0.5 }}>
          {/* Clarity indicator */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box component="span" sx={{ fontSize: '0.6rem' }}>{clarityInfo.dot}</Box>
            <Typography variant="caption" sx={{ color: clarityInfo.color, fontWeight: 500 }}>
              {clarityInfo.label}
            </Typography>
          </Stack>

          {/* Topic chip */}
          {thread.topic_category && (
            <Chip
              label={TOPIC_LABELS[thread.topic_category]}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.65rem', height: 20 }}
            />
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* Contributor avatars */}
          {thread.contributors.length > 0 && (
            <AvatarGroup
              max={3}
              sx={{
                '& .MuiAvatar-root': {
                  width: 24,
                  height: 24,
                  fontSize: '0.7rem',
                  borderWidth: 1,
                },
              }}
            >
              {thread.contributors.map((c) => (
                <Tooltip key={c.id} title={c.name || 'Unknown'} arrow>
                  <Avatar src={c.avatar_url || undefined} alt={c.name || 'User'}>
                    {c.name?.[0] || '?'}
                  </Avatar>
                </Tooltip>
              ))}
            </AvatarGroup>
          )}
        </Stack>

        {/* Stats row */}
        {!compact && (
          <Typography variant="caption" color="text.secondary">
            {thread.confirm_count} Confirm{thread.confirm_count !== 1 ? 's' : ''}
            {' \u00B7 '}
            {thread.vouch_count} Vouch{thread.vouch_count !== 1 ? 'es' : ''}
            {' \u00B7 '}
            {thread.version_count} version{thread.version_count !== 1 ? 's' : ''}
          </Typography>
        )}
      </CardContent>

      {/* Action buttons */}
      {onConfirm && (
        <CardActions sx={{ px: { xs: 1.5, md: 2 }, py: 1, justifyContent: 'flex-start' }}>
          <ConfirmButton
            confirmed={thread.user_has_confirmed}
            count={thread.confirm_count}
            onClick={(e?: any) => {
              e?.stopPropagation?.();
              onConfirm();
            }}
          />
        </CardActions>
      )}
    </Card>
  );
}
