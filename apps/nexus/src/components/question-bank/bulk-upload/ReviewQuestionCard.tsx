'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  TextField,
  Chip,
  Collapse,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ImageUploadZone from '@/components/question-bank/ImageUploadZone';
import type { ReviewQuestion, ReviewQuestionOption, ImageState } from '@/lib/bulk-upload-schema';

interface ReviewQuestionCardProps {
  question: ReviewQuestion;
  onChange: (updated: ReviewQuestion) => void;
  getToken: () => Promise<string | null>;
  compact?: boolean;
}

const FORMAT_COLORS: Record<string, string> = {
  MCQ: '#1976d2',
  NUMERICAL: '#e65100',
  DRAWING_PROMPT: '#7b1fa2',
  IMAGE_BASED: '#00838f',
};

const SECTION_LABELS: Record<string, string> = {
  math_mcq: 'Math MCQ',
  math_numerical: 'Math Num',
  aptitude: 'Aptitude',
  drawing: 'Drawing',
};

export default function ReviewQuestionCard({
  question,
  onChange,
  getToken,
  compact = true,
}: ReviewQuestionCardProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const formatColor = FORMAT_COLORS[question.question_format] || theme.palette.text.secondary;

  const updateField = <K extends keyof ReviewQuestion>(key: K, value: ReviewQuestion[K]) => {
    onChange({ ...question, [key]: value, _modified: true });
  };

  const updateOption = (index: number, updated: Partial<ReviewQuestionOption>) => {
    const newOptions = question.options.map((opt, i) =>
      i === index ? { ...opt, ...updated } : opt
    );
    updateField('options', newOptions);
  };

  const updateOptionImage = (index: number, image: ImageState | undefined) => {
    updateOption(index, { image });
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        borderColor: question._modified ? alpha(theme.palette.warning.main, 0.5) : theme.palette.divider,
        ...(question._errors?.length ? { borderColor: theme.palette.error.main } : {}),
      }}
    >
      {/* Compact header — always visible */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            fontSize: '0.8rem',
            minWidth: 28,
            color: formatColor,
          }}
        >
          Q{question.question_number}
        </Typography>

        <Chip
          label={question.question_format}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 600,
            bgcolor: alpha(formatColor, 0.1),
            color: formatColor,
            borderRadius: 1,
          }}
        />

        <Chip
          label={SECTION_LABELS[question.section] || question.section}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
        />

        {question.question_text && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {question.question_text.slice(0, 80)}
            {question.question_text.length > 80 ? '...' : ''}
          </Typography>
        )}

        {question.nta_question_id && (
          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem', flexShrink: 0 }}>
            {question.nta_question_id}
          </Typography>
        )}

        {question._modified && (
          <Chip label="edited" size="small" color="warning" sx={{ height: 18, fontSize: '0.6rem' }} />
        )}

        <ExpandMoreIcon
          sx={{
            fontSize: '1.1rem',
            color: 'text.secondary',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms',
            flexShrink: 0,
          }}
        />
      </Box>

      {/* Expanded detail view */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5, borderTop: `1px solid ${theme.palette.divider}` }}>
          {/* Edit toggle */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <IconButton
              size="small"
              onClick={() => setEditing(!editing)}
              sx={{
                bgcolor: editing ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              }}
            >
              {editing ? <CheckIcon sx={{ fontSize: '1rem' }} /> : <EditOutlinedIcon sx={{ fontSize: '1rem' }} />}
            </IconButton>
          </Box>

          {/* Question text */}
          {editing ? (
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              value={question.question_text}
              onChange={(e) => updateField('question_text', e.target.value)}
              placeholder="Enter question text..."
              sx={{ mb: 1.5 }}
            />
          ) : (
            question.question_text && (
              <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
                {question.question_text}
              </Typography>
            )
          )}

          {/* Question image */}
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Question Image
            </Typography>
            <ImageUploadZone
              image={question.question_image}
              onChange={(img) => updateField('question_image', img)}
              getToken={getToken}
              height={100}
              label="Add question image (drop, paste, or click)"
            />
          </Box>

          {/* MCQ Options */}
          {question.question_format === 'MCQ' && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Options
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {question.options.map((opt, i) => (
                  <Paper
                    key={i}
                    variant="outlined"
                    sx={{ p: 1, borderRadius: 1.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        minWidth: 20,
                        color: formatColor,
                        pt: editing ? 1 : 0,
                      }}
                    >
                      {opt.label || String.fromCharCode(65 + i)}
                    </Typography>

                    <Box sx={{ flex: 1 }}>
                      {editing ? (
                        <TextField
                          size="small"
                          fullWidth
                          value={opt.text}
                          onChange={(e) => updateOption(i, { text: e.target.value })}
                          placeholder={`Option ${opt.label || String.fromCharCode(65 + i)}`}
                          sx={{ mb: opt.image ? 1 : 0 }}
                        />
                      ) : (
                        opt.text && (
                          <Typography variant="body2" sx={{ mb: opt.image ? 1 : 0 }}>
                            {opt.text}
                          </Typography>
                        )
                      )}

                      {(editing || opt.image) && (
                        <ImageUploadZone
                          image={opt.image}
                          onChange={(img) => updateOptionImage(i, img)}
                          getToken={getToken}
                          height={60}
                          label="Option image"
                        />
                      )}
                    </Box>

                    {opt.nta_id && (
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem', flexShrink: 0 }}>
                        {opt.nta_id}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            </Box>
          )}

          {/* Metadata row */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {editing ? (
              <>
                <TextField
                  size="small"
                  label="Marks +"
                  type="number"
                  value={question.marks_correct ?? ''}
                  onChange={(e) => updateField('marks_correct', e.target.value ? Number(e.target.value) : undefined)}
                  sx={{ width: 80 }}
                />
                <TextField
                  size="small"
                  label="Marks -"
                  type="number"
                  value={question.marks_negative ?? ''}
                  onChange={(e) => updateField('marks_negative', e.target.value ? Number(e.target.value) : undefined)}
                  sx={{ width: 80 }}
                />
              </>
            ) : (
              <>
                {question.marks_correct !== undefined && (
                  <Chip label={`+${question.marks_correct}`} size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                )}
                {question.marks_negative !== undefined && (
                  <Chip label={`${question.marks_negative}`} size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                )}
              </>
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}
