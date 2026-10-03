'use client';

import { Card, CardContent, Typography, Box, Chip, Avatar, Stack } from '@neram/ui';
import Link from 'next/link';
import type { QuestionPostDisplay } from '@neram/database';
import ConfidenceIndicator from './ConfidenceIndicator';
import AdminBadge from './AdminBadge';

const CATEGORY_LABELS: Record<string, string> = {
  mathematics: 'Mathematics',
  general_aptitude: 'General Aptitude',
  drawing: 'Drawing',
  logical_reasoning: 'Logical Reasoning',
  aesthetic_sensitivity: 'Aesthetic Sensitivity',
  other: 'Other',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function wasEdited(createdAt: string, updatedAt: string): boolean {
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 5 * 60 * 1000;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface QuestionCardProps {
  question: QuestionPostDisplay;
}

export default function QuestionCard({ question }: QuestionCardProps) {
  return (
    <Card
      component={Link}
      href={`/tools/nata/question-bank/${question.id}`}
      sx={{
        display: 'block',
        textDecoration: 'none',
        transition: 'border-color 0.2s',
        '&:hover': { borderColor: 'primary.main' },
        '&:focus-visible': { outline: '3px solid var(--focus-ring-color)', outlineOffset: 2 },
        borderLeft: question.is_admin_post ? '3px solid' : undefined,
        borderLeftColor: question.is_admin_post ? 'warning.main' : undefined,
      }}
      variant="outlined"
    >
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Author row */}
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          <Avatar
            src={question.author?.avatar_url || undefined}
            alt=""
            sx={{ width: 28, height: 28, fontSize: '0.8125rem' }}
          >
            {(question.author?.name || 'U')[0]}
          </Avatar>
          <Typography variant="body2" color="text.secondary">
            {question.author?.name || 'Anonymous'}
          </Typography>
          <AdminBadge isAdminPost={question.is_admin_post} authorUserType={question.author?.user_type} />
          <Typography variant="caption" color="text.secondary">
            {timeAgo(question.created_at)}
            {wasEdited(question.created_at, question.updated_at) && (
              <> · Updated {timeAgo(question.updated_at)}</>
            )}
          </Typography>
        </Stack>

        {/* Title */}
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
          {question.title}
        </Typography>

        {/* Body preview */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {question.body}
        </Typography>

        {/* Tags / meta row */}
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label={CATEGORY_LABELS[question.category] || question.category}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 24, fontSize: '0.75rem' }}
          />
          {question.exam_month && question.exam_year ? (
            <Chip
              label={`${MONTH_NAMES[question.exam_month - 1]} ${question.exam_year}`}
              size="small"
              variant="outlined"
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
          ) : question.exam_year ? (
            <Chip
              label={`NATA ${question.exam_year}`}
              size="small"
              variant="outlined"
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
          ) : null}
          {question.exam_session && (
            <Chip
              label={question.exam_session}
              size="small"
              variant="outlined"
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
          )}
          {question.confidence_level && question.confidence_level !== 3 && (
            <ConfidenceIndicator level={question.confidence_level} />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {question.vote_score > 0 ? '+' : ''}{question.vote_score} votes
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {question.comment_count} {question.comment_count === 1 ? 'comment' : 'comments'}
          </Typography>
          {question.improvement_count > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {question.improvement_count} {question.improvement_count === 1 ? 'improvement' : 'improvements'}
            </Typography>
          )}
          {question.session_count > 0 && (
            <Chip
              label={`${question.session_count} ${question.session_count === 1 ? 'session' : 'sessions'}`}
              size="small"
              variant="outlined"
              color="info"
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
