'use client';

import { Card, CardContent, Typography, Box, CardActionArea, Chip } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import PendingIcon from '@mui/icons-material/Pending';
import RepeatIcon from '@mui/icons-material/Repeat';
import CategoryBadge from './CategoryBadge';
import DifficultyChip from './DifficultyChip';
import type { DrawingQuestion, DrawingAttemptStatus } from '@neram/database/types';

export default function DrawingQuestionCard({
  question,
  questionNumber,
  repeatCount,
  attemptStatus,
  onClick,
}: {
  question: DrawingQuestion;
  questionNumber?: number | null;
  repeatCount?: number;
  attemptStatus?: DrawingAttemptStatus;
  onClick: () => void;
}) {
  return (
    <Card variant="outlined" sx={{ height: '100%', position: 'relative' }}>
      <CardActionArea onClick={onClick} sx={{ height: '100%', p: 0 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          {/* Top row: Q number + attempt status */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            {questionNumber ? (
              <Box sx={{
                bgcolor: 'action.selected', borderRadius: '50%',
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary' }}>
                  Q{questionNumber}
                </Typography>
              </Box>
            ) : <Box />}
            {attemptStatus && attemptStatus !== 'not_attempted' && (
              attemptStatus === 'completed' ? <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
              : attemptStatus === 'redo' ? <ReplayIcon sx={{ fontSize: 16, color: 'warning.main' }} />
              : <PendingIcon sx={{ fontSize: 16, color: 'info.main' }} />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <CategoryBadge category={question.category} />
            <DifficultyChip difficulty={question.difficulty_tag} />
            {(repeatCount ?? 0) > 1 && (
              <Chip
                icon={<RepeatIcon sx={{ fontSize: 11 }} />}
                label={`x${repeatCount}`}
                size="small"
                sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, '& .MuiChip-icon': { ml: 0.25, mr: -0.25 }, '& .MuiChip-label': { px: 0.5 } }}
              />
            )}
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
              fontSize: '0.82rem',
            }}
          >
            {question.question_text}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
            {question.objects.slice(0, 3).map((obj) => (
              <Typography
                key={obj}
                variant="caption"
                sx={{ color: 'text.secondary', bgcolor: 'grey.100', px: 0.75, py: 0.25, borderRadius: 0.5 }}
              >
                {obj}
              </Typography>
            ))}
            {question.objects.length > 3 && (
              <Typography variant="caption" color="text.secondary">
                +{question.objects.length - 3}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            NATA {question.year}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
