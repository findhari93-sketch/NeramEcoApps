'use client';

import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

export interface SimilarMatch {
  threadId: string;
  text: string;
  authorName: string;
  examDate: string;
  sessionNumber: number;
  similarity: number;
}

interface SimilarQuestionBannerProps {
  matches: SimilarMatch[];
  onSame: (threadId: string) => void;
  onRefine: (threadId: string) => void;
  onDifferent: () => void;
}

export default function SimilarQuestionBanner({
  matches,
  onSame,
  onRefine,
  onDifferent,
}: SimilarQuestionBannerProps) {
  const theme = useTheme();

  if (matches.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, md: 2 },
        borderColor: 'info.200',
        bgcolor: alpha(theme.palette.info.main, 0.04),
        borderRadius: 2,
      }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
        <SearchIcon sx={{ fontSize: '1.1rem', color: 'info.main' }} />
        <Typography variant="subtitle2" color="info.main" fontWeight={600}>
          Similar questions found
        </Typography>
      </Stack>

      <Stack spacing={1}>
        {matches.map((match) => (
          <Box
            key={match.threadId}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'grey.200',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                mb: 0.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {match.text}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                by {match.authorName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Session {match.sessionNumber} - {match.examDate}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography
                variant="caption"
                fontWeight={600}
                color={match.similarity > 0.8 ? 'success.main' : 'warning.main'}
              >
                {Math.round(match.similarity * 100)}% similar
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CheckCircleOutlineIcon sx={{ fontSize: '0.9rem' }} />}
                onClick={() => onSame(match.threadId)}
                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
              >
                Same question
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditIcon sx={{ fontSize: '0.9rem' }} />}
                onClick={() => onRefine(match.threadId)}
                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
              >
                Refine this
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

      <Button
        size="small"
        variant="text"
        startIcon={<CloseIcon sx={{ fontSize: '0.9rem' }} />}
        onClick={onDifferent}
        sx={{ textTransform: 'none', mt: 1, fontSize: '0.75rem' }}
      >
        Different question — continue adding mine
      </Button>
    </Paper>
  );
}
