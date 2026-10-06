'use client';

import { Box, Card, CardActionArea, Typography, useTheme } from '@neram/ui';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import type { SimilarItem } from '@/lib/assistant/tutor/types';
import MathText from '@/components/common/MathText';
import { focusRing } from '@/components/assistant/focusRing';
import { SIMILAR_LEVEL_LABEL, SIMILAR_ORDER, difficultyLabel } from '../labels';

interface SimilarQuestionsProps {
  items: SimilarItem[];
  /** Opens the question in the practice reader, keeping the way back. */
  onOpen: (questionId: string) => void;
  disabled?: boolean;
}

/**
 * Up to four questions to try next, one per level, easiest stretch first:
 * almost the same, a variation, one new idea, a challenge.
 */
export default function SimilarQuestions({ items, onOpen, disabled = false }: SimilarQuestionsProps) {
  const theme = useTheme();
  const sorted = [...items].sort((a, b) => SIMILAR_ORDER.indexOf(a.level) - SIMILAR_ORDER.indexOf(b.level));
  if (!sorted.length) return null;
  return (
    <Box component="ul" aria-label="Similar questions" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
      {sorted.map((item) => {
        const diff = difficultyLabel(item.difficulty);
        const level = SIMILAR_LEVEL_LABEL[item.level] ?? 'Similar';
        return (
          <Box component="li" key={item.questionId}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardActionArea
                onClick={() => onOpen(item.questionId)}
                disabled={disabled}
                aria-label={`${level}${diff ? `, ${diff}` : ''}. Open this question`}
                sx={{
                  minHeight: 48,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1.25,
                  '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {level}
                    </Typography>
                    {diff && (
                      <Typography variant="caption" color="text.secondary">
                        {diff}
                      </Typography>
                    )}
                    {item.hasTutor && (
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: 'text.secondary' }}>
                        <SchoolOutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
                        <Typography variant="caption">Tutor ready</Typography>
                      </Box>
                    )}
                  </Box>
                  <MathText
                    text={item.preview}
                    variant="body2"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  />
                </Box>
                <ChevronRightRoundedIcon aria-hidden sx={{ color: 'text.secondary', flexShrink: 0 }} />
              </CardActionArea>
            </Card>
          </Box>
        );
      })}
    </Box>
  );
}
