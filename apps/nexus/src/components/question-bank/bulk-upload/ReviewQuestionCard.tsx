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
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ImageUploadZone from '@/components/question-bank/ImageUploadZone';
import type { ReviewQuestion, ReviewQuestionOption, ImageState } from '@/lib/bulk-upload-schema';
import MathText from '@/components/common/MathText';

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

        {(question.explanation_brief || question.explanation_detailed) && (
          <LightbulbOutlinedIcon sx={{ fontSize: '0.85rem', color: 'success.main', flexShrink: 0 }} />
        )}

        {question.solution_video_url && (
          <OndemandVideoOutlinedIcon sx={{ fontSize: '0.85rem', color: 'info.main', flexShrink: 0 }} />
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
            <>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                maxRows={6}
                value={question.question_text}
                onChange={(e) => updateField('question_text', e.target.value)}
                placeholder="Enter question text (use $...$ for inline math, $$...$$ for block math)..."
                sx={{ mb: 0.5 }}
              />
              {question.question_text && question.question_text.includes('$') && (
                <Box sx={{ mb: 1.5, p: 1, bgcolor: alpha(theme.palette.info.main, 0.04), borderRadius: 1, border: `1px solid ${theme.palette.divider}` }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Math Preview
                  </Typography>
                  <MathText text={question.question_text} variant="body2" />
                </Box>
              )}
            </>
          ) : (
            question.question_text && (
              <MathText text={question.question_text} variant="body2" sx={{ mb: 1.5 }} />
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
                          <MathText text={opt.text} variant="body2" sx={{ mb: opt.image ? 1 : 0 }} />
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

          {/* Solution & Explanation section */}
          {(editing || question.solution_video_url || question.explanation_brief || question.explanation_detailed) && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.5,
                bgcolor: alpha(theme.palette.success.main, 0.04),
                borderRadius: 1.5,
                border: `1px solid ${alpha(theme.palette.success.main, 0.15)}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <LightbulbOutlinedIcon sx={{ fontSize: '1rem', color: 'success.main' }} />
                <Typography variant="caption" fontWeight={700} color="success.main">
                  Solution & Explanation
                </Typography>
              </Box>

              {/* Solution Video URL */}
              {editing ? (
                <TextField
                  size="small"
                  fullWidth
                  label="Solution Video URL"
                  value={question.solution_video_url || ''}
                  onChange={(e) => updateField('solution_video_url', e.target.value || undefined)}
                  placeholder="https://youtube.com/watch?v=... or SharePoint link"
                  sx={{ mb: 1 }}
                  InputProps={{
                    startAdornment: (
                      <OndemandVideoOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary', mr: 0.5 }} />
                    ),
                  }}
                />
              ) : question.solution_video_url ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                  <OndemandVideoOutlinedIcon sx={{ fontSize: '0.9rem', color: 'text.secondary' }} />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                  >
                    {question.solution_video_url}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => window.open(question.solution_video_url, '_blank', 'noopener,noreferrer')}
                    sx={{ p: 0.25 }}
                  >
                    <OpenInNewIcon sx={{ fontSize: '0.85rem' }} />
                  </IconButton>
                </Box>
              ) : null}

              {/* Explanation Brief */}
              {editing ? (
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={4}
                  label="Explanation (Brief)"
                  value={question.explanation_brief || ''}
                  onChange={(e) => updateField('explanation_brief', e.target.value || undefined)}
                  placeholder="Concise 1-2 sentence summary of the solution approach..."
                  sx={{ mb: 1 }}
                />
              ) : question.explanation_brief ? (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Brief:
                  </Typography>
                  <MathText text={question.explanation_brief} variant="caption" sx={{ display: 'block', color: 'text.secondary' }} />
                </Box>
              ) : null}

              {/* Explanation Detailed */}
              {editing ? (
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={8}
                  label="Explanation (Detailed)"
                  value={question.explanation_detailed || ''}
                  onChange={(e) => updateField('explanation_detailed', e.target.value || undefined)}
                  placeholder="Step-by-step solution with reasoning (use $...$ for math)..."
                />
              ) : question.explanation_detailed ? (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Detailed:
                  </Typography>
                  <MathText text={question.explanation_detailed} variant="caption" sx={{ display: 'block', color: 'text.secondary' }} />
                </Box>
              ) : null}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
