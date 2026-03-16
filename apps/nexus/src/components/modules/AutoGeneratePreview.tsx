'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Chip,
  Paper,
  MenuItem,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { GeneratedSection, GeneratedQuestion } from '@/lib/ai-generate';

interface AutoGeneratePreviewProps {
  open: boolean;
  sections: GeneratedSection[];
  onAccept: (sections: GeneratedSection[]) => void;
  onClose: () => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function AutoGeneratePreview({
  open,
  sections: initialSections,
  onAccept,
  onClose,
}: AutoGeneratePreviewProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [sections, setSections] = useState<GeneratedSection[]>(initialSections);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  // Reset state when dialog opens with new data
  const [prevSections, setPrevSections] = useState(initialSections);
  if (initialSections !== prevSections) {
    setPrevSections(initialSections);
    setSections(initialSections);
    setExpandedIdx(0);
  }

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  const updateSection = (idx: number, updates: Partial<GeneratedSection>) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  };

  const deleteSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
  };

  const updateQuestion = (sectionIdx: number, questionIdx: number, updates: Partial<GeneratedQuestion>) => {
    setSections((prev) =>
      prev.map((s, si) =>
        si === sectionIdx
          ? {
              ...s,
              questions: s.questions.map((q, qi) =>
                qi === questionIdx ? { ...q, ...updates } : q
              ),
            }
          : s
      )
    );
  };

  const deleteQuestion = (sectionIdx: number, questionIdx: number) => {
    setSections((prev) =>
      prev.map((s, si) =>
        si === sectionIdx
          ? { ...s, questions: s.questions.filter((_, qi) => qi !== questionIdx) }
          : s
      )
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: isMobile ? '100%' : '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <AutoAwesomeIcon sx={{ color: theme.palette.primary.main }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            AI-Generated Sections & Questions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {sections.length} sections, {totalQuestions} questions — review and edit before saving
          </Typography>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: isMobile ? 1.5 : 2, overflow: 'auto' }}>
        {sections.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            All sections have been removed. Click Cancel to discard.
          </Typography>
        )}

        {sections.map((section, si) => (
          <Paper
            key={si}
            variant="outlined"
            sx={{
              mb: 1.5,
              overflow: 'hidden',
              borderColor: expandedIdx === si ? theme.palette.primary.main : undefined,
            }}
          >
            {/* Section Header */}
            <Box
              onClick={() => setExpandedIdx(expandedIdx === si ? null : si)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.5,
                cursor: 'pointer',
                bgcolor: expandedIdx === si ? alpha(theme.palette.primary.main, 0.04) : undefined,
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
              }}
            >
              <Chip
                label={`S${si + 1}`}
                size="small"
                color="primary"
                sx={{ fontWeight: 700, minWidth: 40 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                  {section.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatTime(section.start_timestamp_seconds)} – {formatTime(section.end_timestamp_seconds)}
                  {' · '}
                  {section.questions.length} question{section.questions.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSection(si);
                }}
                sx={{ color: theme.palette.error.main }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
              {expandedIdx === si ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>

            {/* Section Body (expanded) */}
            {expandedIdx === si && (
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                <Divider sx={{ mb: 1.5 }} />

                <TextField
                  label="Section Title"
                  value={section.title}
                  onChange={(e) => updateSection(si, { title: e.target.value })}
                  fullWidth
                  size="small"
                  sx={{ mb: 1 }}
                />
                <TextField
                  label="Description"
                  value={section.description || ''}
                  onChange={(e) => updateSection(si, { description: e.target.value })}
                  fullWidth
                  size="small"
                  multiline
                  rows={2}
                  sx={{ mb: 1.5 }}
                />

                {/* Questions */}
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Questions ({section.questions.length})
                </Typography>

                {section.questions.map((q, qi) => (
                  <Paper
                    key={qi}
                    variant="outlined"
                    sx={{ p: 1.5, mb: 1, bgcolor: alpha(theme.palette.background.default, 0.5) }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                      <Chip label={`Q${qi + 1}`} size="small" variant="outlined" sx={{ mt: 0.5, fontWeight: 600 }} />
                      <TextField
                        value={q.question_text}
                        onChange={(e) => updateQuestion(si, qi, { question_text: e.target.value })}
                        fullWidth
                        size="small"
                        multiline
                        placeholder="Question text"
                      />
                      <IconButton
                        size="small"
                        onClick={() => deleteQuestion(si, qi)}
                        sx={{ color: theme.palette.error.main, mt: 0.5 }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                        gap: 0.75,
                        mb: 1,
                      }}
                    >
                      {(['a', 'b', 'c', 'd'] as const).map((opt) => (
                        <TextField
                          key={opt}
                          label={`Option ${opt.toUpperCase()}`}
                          value={q[`option_${opt}`]}
                          onChange={(e) => updateQuestion(si, qi, { [`option_${opt}`]: e.target.value } as any)}
                          size="small"
                          fullWidth
                          InputProps={{
                            sx: q.correct_option === opt
                              ? { bgcolor: alpha(theme.palette.success.main, 0.08), borderColor: theme.palette.success.main }
                              : undefined,
                          }}
                        />
                      ))}
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <TextField
                        select
                        label="Correct Answer"
                        value={q.correct_option}
                        onChange={(e) => updateQuestion(si, qi, { correct_option: e.target.value as 'a' | 'b' | 'c' | 'd' })}
                        size="small"
                        sx={{ minWidth: 130 }}
                      >
                        <MenuItem value="a">A</MenuItem>
                        <MenuItem value="b">B</MenuItem>
                        <MenuItem value="c">C</MenuItem>
                        <MenuItem value="d">D</MenuItem>
                      </TextField>
                      <TextField
                        label="Explanation"
                        value={q.explanation || ''}
                        onChange={(e) => updateQuestion(si, qi, { explanation: e.target.value })}
                        size="small"
                        fullWidth
                        sx={{ flex: 1, minWidth: 200 }}
                      />
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>
        ))}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<CheckCircleOutlineIcon />}
          onClick={() => onAccept(sections)}
          disabled={sections.length === 0}
        >
          Accept All ({sections.length} sections)
        </Button>
      </DialogActions>
    </Dialog>
  );
}
