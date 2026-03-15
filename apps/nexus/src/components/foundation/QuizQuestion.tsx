'use client';

import { Box, Typography, Radio, RadioGroup, FormControlLabel, alpha, useTheme } from '@neram/ui';

interface QuizQuestionProps {
  question: {
    id: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
  };
  selectedAnswer?: string;
  correctAnswer?: string;
  showResult?: boolean;
  onChange: (questionId: string, answer: string) => void;
  questionNumber: number;
}

export default function QuizQuestion({
  question,
  selectedAnswer,
  correctAnswer,
  showResult,
  onChange,
  questionNumber,
}: QuizQuestionProps) {
  const theme = useTheme();
  const options = [
    { key: 'a', text: question.option_a },
    { key: 'b', text: question.option_b },
    { key: 'c', text: question.option_c },
    { key: 'd', text: question.option_d },
  ];

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: 600, mb: 1.5, lineHeight: 1.4, fontSize: '0.9rem' }}
      >
        <Box component="span" sx={{ color: theme.palette.primary.main, mr: 0.5 }}>
          Q{questionNumber}.
        </Box>
        {question.question_text}
      </Typography>

      <RadioGroup
        value={selectedAnswer || ''}
        onChange={(e) => onChange(question.id, e.target.value)}
      >
        {options.map((opt) => {
          const isSelected = selectedAnswer === opt.key;
          const isCorrect = correctAnswer === opt.key;
          const isWrong = showResult && isSelected && !isCorrect;

          let borderColor = theme.palette.divider;
          let bgColor = 'transparent';
          if (showResult && isCorrect) {
            borderColor = theme.palette.success.main;
            bgColor = alpha(theme.palette.success.main, 0.06);
          } else if (isWrong) {
            borderColor = theme.palette.error.main;
            bgColor = alpha(theme.palette.error.main, 0.06);
          } else if (isSelected && !showResult) {
            borderColor = theme.palette.primary.main;
            bgColor = alpha(theme.palette.primary.main, 0.04);
          }

          return (
            <FormControlLabel
              key={opt.key}
              value={opt.key}
              disabled={showResult}
              control={
                <Radio
                  size="small"
                  sx={{
                    color: showResult && isCorrect
                      ? theme.palette.success.main
                      : isWrong
                        ? theme.palette.error.main
                        : undefined,
                    '&.Mui-checked': {
                      color: showResult && isCorrect
                        ? theme.palette.success.main
                        : isWrong
                          ? theme.palette.error.main
                          : theme.palette.primary.main,
                    },
                  }}
                />
              }
              label={
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: isSelected ? 500 : 400,
                  }}
                >
                  {opt.text}
                </Typography>
              }
              sx={{
                mx: 0,
                mb: 0.75,
                py: 0.75,
                px: 1.5,
                borderRadius: 2,
                border: `1px solid ${borderColor}`,
                bgcolor: bgColor,
                width: '100%',
                transition: 'all 150ms ease',
                minHeight: 48,
                ...(!showResult && {
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                  },
                }),
              }}
            />
          );
        })}
      </RadioGroup>
    </Box>
  );
}
