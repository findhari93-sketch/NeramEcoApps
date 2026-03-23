'use client';

import {
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  Avatar,
  Box,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from '@neram/ui';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import type {
  NexusExamRecallTip,
  ExamRecallDifficulty,
  ExamRecallTimePressure,
  ExamRecallTopicCategory,
  User,
} from '@neram/database';

interface TipCardProps {
  tip: NexusExamRecallTip & { user: Pick<User, 'id' | 'name' | 'avatar_url'> };
  onUpvote: () => void;
}

const DIFFICULTY_LABELS: Record<ExamRecallDifficulty, { label: string; color: string }> = {
  easy: { label: 'Easy', color: '#2e7d32' },
  moderate: { label: 'Moderate', color: '#ed6c02' },
  hard: { label: 'Hard', color: '#d32f2f' },
};

const PRESSURE_LABELS: Record<ExamRecallTimePressure, { label: string; color: string }> = {
  plenty: { label: 'Plenty of Time', color: '#2e7d32' },
  just_enough: { label: 'Just Enough', color: '#ed6c02' },
  rushed: { label: 'Rushed', color: '#d32f2f' },
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

const TOPIC_COLORS: Record<ExamRecallTopicCategory, string> = {
  visual_reasoning: '#1976d2',
  logical_derivation: '#7b1fa2',
  gk_architecture: '#e65100',
  language: '#00695c',
  design_sensitivity: '#c62828',
  numerical_ability: '#283593',
  drawing: '#2e7d32',
};

export default function TipCard({ tip, onUpvote }: TipCardProps) {
  const theme = useTheme();
  const dist = tip.topic_distribution || {};
  const maxPct = Math.max(...Object.values(dist), 1);

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        {/* Author row */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Avatar
            src={tip.user.avatar_url || undefined}
            alt={tip.user.name || 'User'}
            sx={{ width: 32, height: 32, fontSize: '0.8rem' }}
          >
            {tip.user.name?.[0] || '?'}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={600}>
              {tip.user.name || 'Anonymous'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Session {tip.session_number} - {tip.exam_date}
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton size="small" onClick={onUpvote}>
              {tip.upvote_count > 0 ? (
                <ThumbUpIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
              ) : (
                <ThumbUpOutlinedIcon sx={{ fontSize: '1.1rem' }} />
              )}
            </IconButton>
            <Typography variant="caption" fontWeight={600}>
              {tip.upvote_count}
            </Typography>
          </Stack>
        </Stack>

        {/* Insights text */}
        <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {tip.insights_text}
        </Typography>

        {/* Topic distribution bar chart */}
        {Object.keys(dist).length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
              Topic Distribution
            </Typography>
            <Stack spacing={0.5}>
              {Object.entries(dist)
                .sort((a, b) => b[1] - a[1])
                .map(([key, pct]) => (
                  <Stack key={key} direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" sx={{ width: { xs: 80, md: 120 }, flexShrink: 0, fontSize: '0.65rem' }}>
                      {TOPIC_LABELS[key as ExamRecallTopicCategory] || key}
                    </Typography>
                    <Box
                      sx={{
                        flex: 1,
                        height: 8,
                        borderRadius: 4,
                        bgcolor: 'grey.100',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${(pct / maxPct) * 100}%`,
                          height: '100%',
                          borderRadius: 4,
                          bgcolor: TOPIC_COLORS[key as ExamRecallTopicCategory] || 'grey.400',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </Box>
                    <Typography variant="caption" fontWeight={600} sx={{ width: 28, textAlign: 'right', fontSize: '0.65rem' }}>
                      {pct}%
                    </Typography>
                  </Stack>
                ))}
            </Stack>
          </Box>
        )}

        {/* Difficulty + time pressure chips */}
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {tip.difficulty && (
            <Chip
              label={DIFFICULTY_LABELS[tip.difficulty].label}
              size="small"
              sx={{
                bgcolor: alpha(DIFFICULTY_LABELS[tip.difficulty].color, 0.1),
                color: DIFFICULTY_LABELS[tip.difficulty].color,
                fontWeight: 600,
                fontSize: '0.65rem',
                height: 22,
              }}
            />
          )}
          {tip.time_pressure && (
            <Chip
              label={PRESSURE_LABELS[tip.time_pressure].label}
              size="small"
              sx={{
                bgcolor: alpha(PRESSURE_LABELS[tip.time_pressure].color, 0.1),
                color: PRESSURE_LABELS[tip.time_pressure].color,
                fontWeight: 600,
                fontSize: '0.65rem',
                height: 22,
              }}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
