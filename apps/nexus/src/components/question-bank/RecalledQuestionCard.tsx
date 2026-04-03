'use client';

import { Box, Paper, Typography, Chip, alpha, useTheme } from '@neram/ui';
import ImageIcon from '@mui/icons-material/Image';
import LinkIcon from '@mui/icons-material/Link';
import type { NexusQBQuestionListItem, QBConfidenceTier } from '@neram/database';
import ConfidenceTierBadge from './ConfidenceTierBadge';
import CategoryChips from './CategoryChips';
import DifficultyChip from './DifficultyChip';
import MathText from '@/components/common/MathText';

const TIER_BORDER_COLORS: Record<QBConfidenceTier, string> = {
  1: '#22C55E',
  2: '#F59E0B',
  3: '#9E9E9E',
};

interface RecalledQuestionCardProps {
  question: NexusQBQuestionListItem;
  questionIndex: number;
  lang?: 'en' | 'hi';
  onExpand: () => void;
  onCategoryClick?: (category: string) => void;
  onTopicIntelligenceClick?: () => void;
}

export default function RecalledQuestionCard({
  question,
  questionIndex,
  lang = 'en',
  onExpand,
  onCategoryClick,
  onTopicIntelligenceClick,
}: RecalledQuestionCardProps) {
  const theme = useTheme();
  const tier = question.confidence_tier || 2;
  const borderColor = TIER_BORDER_COLORS[tier];

  const questionText = lang === 'hi' && question.question_text_hi
    ? question.question_text_hi
    : question.question_text;

  // For drawing prompts
  const isDrawing = question.question_format === 'DRAWING_PROMPT';

  return (
    <Paper
      variant="outlined"
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(); }
      }}
      sx={{
        borderRadius: 1.5,
        borderLeft: `4px solid ${borderColor}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease-in-out',
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, 0.3),
          borderLeftColor: borderColor,
          boxShadow: theme.shadows[1],
        },
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: { xs: 1, md: 1.5 } }}>
        {/* Row 1: Index + Tier badge + Format + Difficulty */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary">
            Q{questionIndex + 1}
          </Typography>
          <ConfidenceTierBadge tier={tier} />
          <Chip
            label={isDrawing ? 'Drawing' : question.question_format}
            size="small"
            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
          />
          <DifficultyChip difficulty={question.difficulty} />
          {question.figure_type === 'placeholder' && (
            <Chip
              icon={<ImageIcon sx={{ fontSize: 12 }} />}
              label="Had figure"
              size="small"
              sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#FEF3C7', color: '#92400E' }}
            />
          )}
          {question.repeat_group_id && (
            <Chip
              icon={<LinkIcon sx={{ fontSize: 12 }} />}
              label="Seen in multiple sessions"
              size="small"
              sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#E0E7FF', color: '#3730A3' }}
            />
          )}
        </Box>

        {/* Row 2: Question text / Drawing prompt / Topic signal */}
        {tier === 3 ? (
          // Tier 3: Topic Signal — minimal content
          <Box sx={{ mb: 0.75 }}>
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              Topic signal — no question text available
            </Typography>
            {question.sub_topic && (
              <Typography variant="body2" fontWeight={500} sx={{ mt: 0.25 }}>
                {question.sub_topic}
              </Typography>
            )}
            {onTopicIntelligenceClick && (
              <Typography
                variant="caption"
                color="primary"
                onClick={(e) => { e.stopPropagation(); onTopicIntelligenceClick(); }}
                sx={{ cursor: 'pointer', fontWeight: 600, mt: 0.5, display: 'inline-block' }}
              >
                View Study Material →
              </Typography>
            )}
          </Box>
        ) : isDrawing ? (
          // Drawing prompt
          <Box sx={{ mb: 0.75 }}>
            {questionText && (
              <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                {questionText}
              </Typography>
            )}
            {question.drawing_marks && (
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                {question.drawing_marks} marks
                {question.design_principle_tested && ` · ${question.design_principle_tested}`}
                {question.colour_constraint && ` · ${question.colour_constraint}`}
              </Typography>
            )}
          </Box>
        ) : (
          // Tier 1 & 2: Question text
          <Box sx={{ mb: 0.75 }}>
            {questionText ? (
              <MathText
                text={questionText}
                sx={{
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              />
            ) : (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                Question text not yet available
              </Typography>
            )}
            {tier === 2 && question.answer_source === 'student_recalled' && question.correct_answer && (
              <Typography variant="caption" color="warning.main" fontWeight={500} sx={{ mt: 0.25, display: 'block' }}>
                Student-recalled answer: {question.correct_answer}
              </Typography>
            )}
          </Box>
        )}

        {/* Row 3: Categories */}
        {question.categories && question.categories.length > 0 && (
          <CategoryChips
            categories={question.categories}
            size="small"
            onCategoryClick={onCategoryClick}
          />
        )}
      </Box>
    </Paper>
  );
}
