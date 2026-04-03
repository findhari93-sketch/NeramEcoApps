'use client';

import {
  Box,
  Typography,
  Button,
  Chip,
  alpha,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';

interface DrillQuestion {
  id: string;
  question: string;
  answer: string;
  explanation?: string | null;
  frequency?: number | null;
  category?: string | null;
}

interface DrillFlashcardProps {
  question: DrillQuestion;
  isFlipped: boolean;
  onFlip: () => void;
  onMastered: () => void;
  onPractice: () => void;
}

export default function DrillFlashcard({
  question,
  isFlipped,
  onFlip,
  onMastered,
  onPractice,
}: DrillFlashcardProps) {
  const theme = useTheme();

  return (
    <Box sx={{ perspective: '1000px', width: '100%', maxWidth: 500, mx: 'auto' }}>
      <Box
        onClick={!isFlipped ? onFlip : undefined}
        sx={{
          position: 'relative',
          width: '100%',
          minHeight: 280,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          cursor: !isFlipped ? 'pointer' : 'default',
        }}
      >
        {/* Front - Question */}
        <Box
          sx={{
            position: 'absolute',
            width: '100%',
            minHeight: 280,
            backfaceVisibility: 'hidden',
            borderRadius: 3,
            border: `2px solid ${alpha(theme.palette.primary.main, 0.15)}`,
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            textAlign: 'center',
            boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.08)}`,
          }}
        >
          {question.frequency != null && question.frequency >= 3 && (
            <Chip
              label={`${question.frequency}x in exams`}
              size="small"
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                height: 24,
                fontSize: '0.65rem',
                fontWeight: 700,
                bgcolor: alpha(theme.palette.error.main, 0.1),
                color: 'error.main',
              }}
            />
          )}
          {question.category && (
            <Chip
              label={question.category}
              size="small"
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                height: 22,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: alpha(theme.palette.info.main, 0.1),
                color: 'info.main',
              }}
            />
          )}
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: { xs: '1.1rem', sm: '1.25rem' },
              lineHeight: 1.5,
              color: 'text.primary',
            }}
          >
            {question.question}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              mt: 2,
              color: 'text.disabled',
              fontSize: '0.7rem',
            }}
          >
            Tap to reveal answer
          </Typography>
        </Box>

        {/* Back - Answer */}
        <Box
          sx={{
            position: 'absolute',
            width: '100%',
            minHeight: 280,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 3,
            border: `2px solid ${alpha(theme.palette.success.main, 0.2)}`,
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            p: 3,
            boxShadow: `0 4px 20px ${alpha(theme.palette.success.main, 0.08)}`,
          }}
        >
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'success.main',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontSize: '0.65rem',
                mb: 1,
              }}
            >
              Answer
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                lineHeight: 1.5,
                color: 'text.primary',
                mb: 1,
              }}
            >
              {question.answer}
            </Typography>
            {question.explanation && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}
              >
                {question.explanation}
              </Typography>
            )}
          </Box>

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={(e) => {
                e.stopPropagation();
                onPractice();
              }}
              startIcon={<ReplayIcon />}
              sx={{
                minHeight: 48,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'warning.main',
                borderColor: 'warning.main',
                '&:hover': { borderColor: 'warning.dark', bgcolor: alpha(theme.palette.warning.main, 0.05) },
              }}
            >
              Practice
            </Button>
            <Button
              variant="contained"
              fullWidth
              onClick={(e) => {
                e.stopPropagation();
                onMastered();
              }}
              startIcon={<CheckCircleOutlineIcon />}
              color="success"
              sx={{
                minHeight: 48,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                boxShadow: 'none',
                '&:hover': { boxShadow: 'none' },
              }}
            >
              Got it!
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
