'use client';

import { forwardRef } from 'react';
import { Box, Paper, Typography, Collapse, Skeleton, IconButton, Chip, alpha, useTheme } from '@neram/ui';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { NexusQBQuestionListItem, NexusQBQuestionDetail } from '@neram/database';
import SourceBadges from './SourceBadges';
import DifficultyChip from './DifficultyChip';
import CategoryChips from './CategoryChips';
import AttemptIndicator from './AttemptIndicator';
import QuestionDetail from './QuestionDetail';
import MathText from '@/components/common/MathText';

interface InlineQuestionCardProps {
  question: NexusQBQuestionListItem;
  questionDetail: NexusQBQuestionDetail | null;
  expanded: boolean;
  loading: boolean;
  questionIndex: number;
  lang?: 'en' | 'hi';
  onToggleExpand: () => void;
  onSubmit: (answer: string) => Promise<void>;
  onStudyToggle: () => void;
  onReport?: (questionId: string, reportType: string, description: string) => Promise<void>;
  onCategoryClick?: (category: string) => void;
}

const InlineQuestionCard = forwardRef<HTMLDivElement, InlineQuestionCardProps>(function InlineQuestionCard({
  question,
  questionDetail,
  expanded,
  loading,
  questionIndex,
  lang = 'en',
  onToggleExpand,
  onSubmit,
  onStudyToggle,
  onReport,
  onCategoryClick,
}, ref) {
  const theme = useTheme();

  return (
    <Paper
      ref={ref}
      variant="outlined"
      data-question-index={questionIndex}
      sx={{
        borderRadius: 1.5,
        transition: 'all 0.15s ease-in-out',
        borderColor: expanded
          ? alpha(theme.palette.primary.main, 0.5)
          : 'divider',
        boxShadow: expanded ? theme.shadows[1] : 'none',
        '&:hover': expanded
          ? {}
          : {
              borderColor: alpha(theme.palette.primary.main, 0.3),
            },
      }}
    >
      {/* Collapsed header - always visible, clickable to expand */}
      <Box
        onClick={expanded ? undefined : onToggleExpand}
        role={expanded ? undefined : 'button'}
        tabIndex={expanded ? undefined : 0}
        onKeyDown={
          expanded
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleExpand();
                }
              }
        }
        sx={{
          p: { xs: 0.75, md: 1.5 },
          cursor: expanded ? 'default' : 'pointer',
          display: 'flex',
          gap: { xs: 0.5, md: 1 },
        }}
      >
        {/* Question number */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: expanded ? 'primary.main' : 'text.secondary',
            minWidth: { xs: 22, md: 28 },
            pt: 0.25,
            fontSize: { xs: '0.7rem', md: '0.8rem' },
          }}
        >
          Q{questionIndex + 1}
        </Typography>

        {/* Main content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Source badges + difficulty in one row */}
          <Box sx={{ mb: 0.25, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <SourceBadges sources={question.sources} />
            {!expanded && <DifficultyChip difficulty={question.difficulty} size="small" />}
          </Box>

          {/* Question text preview (2 lines) */}
          {!expanded && (() => {
            const displayText = lang === 'hi' && question.question_text_hi
              ? question.question_text_hi
              : question.question_text;
            return (
              <Box
                sx={{
                  mb: 0.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.5,
                }}
              >
                {displayText ? (
                  <MathText
                    text={displayText}
                    variant="body2"
                    sx={{ color: 'text.primary' }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    Image-based question
                  </Typography>
                )}
              </Box>
            );
          })()}

          {/* Bottom row: categories, drawing badge, attempt indicator */}
          {!expanded && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                flexWrap: 'wrap',
              }}
            >
              <CategoryChips
                categories={(question.categories || []).slice(0, 2)}
                size="small"
                onCategoryClick={onCategoryClick}
              />
              {question.question_format === 'DRAWING_PROMPT' && (
                <Chip
                  label="Drawing"
                  size="small"
                  sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'secondary.50', color: 'secondary.dark', '& .MuiChip-label': { px: 0.5 } }}
                />
              )}
              <Box sx={{ flexGrow: 1 }} />
              <AttemptIndicator summary={question.attempt_summary} />
            </Box>
          )}
        </Box>

        {/* Image thumbnail (collapsed only) */}
        {!expanded && question.question_image_url && (
          <Box
            sx={{
              width: { xs: 56, md: 72 },
              height: { xs: 56, md: 72 },
              flexShrink: 0,
              borderRadius: 1,
              overflow: 'hidden',
              bgcolor: 'grey.100',
            }}
          >
            <Box
              component="img"
              src={question.question_image_url}
              alt="Question"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </Box>
        )}

        {/* Collapse button when expanded */}
        {expanded && (
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            size="small"
            aria-label="Collapse question"
            sx={{ alignSelf: 'flex-start', minWidth: 36, minHeight: 36 }}
          >
            <ExpandLessIcon />
          </IconButton>
        )}
      </Box>

      {/* Expanded content */}
      <Collapse in={expanded} timeout={300} unmountOnExit>
        <Box sx={{ px: { xs: 0.75, md: 2 }, pb: { xs: 0.75, md: 1.5 }, pt: 0 }}>
          {loading && !questionDetail ? (
            <Box>
              <Skeleton variant="text" width="100%" height={24} sx={{ mb: 1 }} />
              <Skeleton variant="text" width="90%" height={24} sx={{ mb: 1 }} />
              <Skeleton variant="rectangular" width="100%" height={160} sx={{ borderRadius: 1, mb: 1 }} />
              <Skeleton variant="rectangular" width="100%" height={48} sx={{ borderRadius: 1 }} />
            </Box>
          ) : questionDetail ? (
            <QuestionDetail
              question={questionDetail}
              onSubmit={onSubmit}
              onStudyToggle={onStudyToggle}
              onReport={
                onReport
                  ? (reportType: string, description: string) =>
                      onReport(question.id, reportType, description)
                  : undefined
              }
              onNext={() => {}}
              onPrev={() => {}}
              hasNext={false}
              hasPrev={false}
              currentIndex={questionIndex}
              totalCount={0}
              inline
              showSourceBadges={false}
              initialLang={lang}
            />
          ) : null}
        </Box>
      </Collapse>
    </Paper>
  );
});

export default InlineQuestionCard;
