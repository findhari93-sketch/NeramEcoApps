'use client';

import { Card, CardContent, Typography, Box, CardActionArea } from '@neram/ui';
import CategoryBadge from './CategoryBadge';
import DifficultyChip from './DifficultyChip';
import type { DrawingQuestion } from '@neram/database/types';

export default function DrawingQuestionCard({
  question,
  onClick,
}: {
  question: DrawingQuestion;
  onClick: () => void;
}) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea onClick={onClick} sx={{ height: '100%', p: 0 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
            <CategoryBadge category={question.category} />
            <DifficultyChip difficulty={question.difficulty_tag} />
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
