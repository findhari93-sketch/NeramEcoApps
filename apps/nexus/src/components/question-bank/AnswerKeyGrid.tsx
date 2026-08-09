'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Chip,
  Select,
  MenuItem,
  CircularProgress,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import {
  QB_QUESTION_STATUS_COLORS,
  QB_QUESTION_STATUS_LABELS,
  QB_SECTIONS,
  QB_SECTION_ORDER,
  qbSectionLabel,
} from '@neram/database';
import MathText from '@/components/common/MathText';
import AnswerKeyUpload from './AnswerKeyUpload';

const IMAGE_KEYWORDS = /figure|image|diagram|picture|given below|shown below|problem figure|shown in|refer to|look at the/i;

/** Does this question need images at all? (based on format/keywords) */
export function questionNeedsImage(q: NexusQBQuestion): boolean {
  if (q.question_format === 'IMAGE_BASED') return true;
  if (q.question_text && IMAGE_KEYWORDS.test(q.question_text)) return true;
  const opts = q.options as { id: string; text: string; image_url?: string }[] | null;
  if (opts?.some((o) => IMAGE_KEYWORDS.test(o.text || ''))) return true;
  return false;
}

/** Does this question need images AND is missing any of them? */
export function questionMissingImages(q: NexusQBQuestion): boolean {
  if (!questionNeedsImage(q)) return false;
  // Check question image
  if (!q.question_image_url) return true;
  // Check option images (only for options with image keywords)
  const opts = q.options as { id: string; text: string; image_url?: string }[] | null;
  if (opts?.some((o) => IMAGE_KEYWORDS.test(o.text || '') && !o.image_url)) return true;
  return false;
}

/**
 * Move one question into a different section.
 *
 * Deliberately a plain labelled Select and not a colour-coded chip: which
 * section a question is in changes how it is marked, so it has to be readable
 * as a word, not inferred from a hue.
 */
function SectionSelect({
  value,
  onChange,
  disabled,
}: {
  value: QBQuestionSection | null;
  onChange: (next: QBQuestionSection) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      size="small"
      value={value ?? ''}
      displayEmpty
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as QBQuestionSection)}
      inputProps={{ 'aria-label': 'Section this question belongs to' }}
      sx={{ minWidth: 150, height: 32, fontSize: '0.8125rem' }}
    >
      <MenuItem value="" disabled>
        <em>Unsectioned</em>
      </MenuItem>
      {QB_SECTIONS.map((s) => (
        <MenuItem key={s} value={s}>
          {qbSectionLabel(s)}
        </MenuItem>
      ))}
    </Select>
  );
}

interface AnswerKeyGridProps {
  questions: NexusQBQuestion[];
  onSave: (answers: { question_number: number; correct_answer: string }[]) => Promise<void>;
  saving?: boolean;
  /**
   * Correct the section on a single question. Omit to hide the control
   * entirely: the section editor lives in its own tab, and this is only the
   * one-off fix a teacher wants without leaving the answer key.
   */
  onChangeSection?: (questionId: string, section: QBQuestionSection) => Promise<void>;
}

export default function AnswerKeyGrid({ questions, onSave, saving, onChangeSection }: AnswerKeyGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Initialize answers from existing data
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const q of questions) {
      if (q.correct_answer && q.display_order != null) {
        initial[q.display_order] = q.correct_answer;
      }
    }
    return initial;
  });

  const [dirty, setDirty] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  // The id of the question whose section is being saved right now. A section
  // change saves immediately rather than joining the answer-key dirty state,
  // because the two are saved by different buttons and merging them would let
  // "Save All" quietly rewrite sections a teacher only meant to look at.
  const [sectionSaving, setSectionSaving] = useState<string | null>(null);

  const handleSectionChange = async (questionId: string, next: QBQuestionSection) => {
    if (!onChangeSection) return;
    setSectionSaving(questionId);
    try {
      await onChangeSection(questionId, next);
    } finally {
      setSectionSaving(null);
    }
  };

  const toggleExpand = (qNum: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(qNum)) next.delete(qNum);
      else next.add(qNum);
      return next;
    });
  };

  const handleChange = (questionNumber: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionNumber]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    const entries = Object.entries(answers)
      .filter(([, v]) => v.trim() !== '')
      .map(([qNum, answer]) => ({
        question_number: parseInt(qNum, 10),
        correct_answer: answer.trim(),
      }));

    if (entries.length === 0) return;
    await onSave(entries);
    setDirty(false);
  };

  // Group questions by the section stored on each question.
  //
  // This used to re-derive the split from hardcoded question-number ranges,
  // which was a third copy of a guess that already lives in nta-parser.ts and
  // in the backfill migration, and which quietly mislabelled any paper that did
  // not follow the JEE Paper 2 numbering. Questions nobody has classified yet
  // group under "Unsectioned" at the end rather than being re-guessed here, so
  // the gap is visible and fixable instead of invisible and wrong.
  const sections = useMemo(() => {
    const groups = new Map<string, { order: number; questions: NexusQBQuestion[] }>();

    for (const q of questions) {
      const key = q.section ?? '__none__';
      if (!groups.has(key)) {
        groups.set(key, {
          order: q.section ? QB_SECTION_ORDER[q.section] ?? 98 : 99,
          questions: [],
        });
      }
      groups.get(key)!.questions.push(q);
    }

    return Array.from(groups.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, group]) => {
        const numbers = group.questions
          .map((q) => q.display_order)
          .filter((n): n is number => n != null);
        const range = numbers.length
          ? ` (Q${Math.min(...numbers)} to Q${Math.max(...numbers)})`
          : '';
        return {
          key,
          title: `${key === '__none__' ? 'Unsectioned' : qbSectionLabel(key)}${range}`,
          questions: group.questions,
        };
      });
  }, [questions]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Answer Key
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileIcon />}
            onClick={() => setUploadOpen(true)}
          >
            Upload Answer Key
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={!dirty || saving}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
          >
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </Box>
      </Box>

      {sections.map((section) => (
        <Box key={section.key} sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {section.title}
          </Typography>

          {isMobile ? (
            /* Mobile: Card layout with question text above answer input */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {section.questions.map((q) => {
                const qNum = q.display_order ?? 0;
                const isMCQ = q.question_format === 'MCQ';
                const isDrawing = q.question_format === 'DRAWING_PROMPT';
                const currentAnswer = answers[qNum] || '';
                const isExpanded = expandedRows.has(qNum);
                const needsImage = questionNeedsImage(q);

                return (
                  <Paper key={q.id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                    {/* Header row: Q#, Type, Status */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ minWidth: 32 }}>
                        Q{qNum}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {q.question_format}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      {needsImage && (
                        <Chip
                          icon={<ImageNotSupportedOutlinedIcon sx={{ fontSize: 14 }} />}
                          label="No Image"
                          size="small"
                          sx={{
                            bgcolor: '#F59E0B20',
                            color: '#D97706',
                            fontWeight: 600,
                            fontSize: '0.6rem',
                            height: 20,
                            '& .MuiChip-icon': { color: '#D97706' },
                          }}
                        />
                      )}
                      <Chip
                        label={QB_QUESTION_STATUS_LABELS[q.status] || q.status}
                        size="small"
                        sx={{
                          bgcolor: QB_QUESTION_STATUS_COLORS[q.status] + '20',
                          color: QB_QUESTION_STATUS_COLORS[q.status],
                          fontWeight: 600,
                          fontSize: '0.65rem',
                          height: 20,
                        }}
                      />
                    </Box>

                    {/* Question text preview */}
                    {q.question_text && (
                      <Box
                        onClick={() => toggleExpand(qNum)}
                        sx={{ cursor: 'pointer', mb: 1, py: 0.5 }}
                      >
                        <MathText
                          text={q.question_text}
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            display: isExpanded ? 'block' : '-webkit-box',
                            WebkitLineClamp: isExpanded ? undefined : 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: isExpanded ? 'visible' : 'hidden',
                            lineHeight: 1.4,
                          }}
                        />
                      </Box>
                    )}

                    {onChangeSection && (
                      <Box sx={{ mb: 1 }}>
                        <SectionSelect
                          value={q.section}
                          disabled={sectionSaving === q.id}
                          onChange={(next) => handleSectionChange(q.id, next)}
                        />
                      </Box>
                    )}

                    {/* Answer input */}
                    {isDrawing ? (
                      <Typography variant="caption" color="text.disabled">
                        N/A (self-assessed)
                      </Typography>
                    ) : isMCQ ? (
                      <Select
                        size="small"
                        value={currentAnswer}
                        onChange={(e) => handleChange(qNum, e.target.value)}
                        displayEmpty
                        fullWidth
                        sx={{ height: 36 }}
                      >
                        <MenuItem value="">
                          <em>Select answer</em>
                        </MenuItem>
                        {(q.options || []).map((opt) => (
                          <MenuItem key={opt.id} value={opt.id}>
                            Option {opt.id.toUpperCase()}
                            {opt.text ? ` — ${opt.text.substring(0, 60)}${opt.text.length > 60 ? '...' : ''}` : ''}
                            {opt.nta_id ? ` (${opt.nta_id})` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <TextField
                        size="small"
                        value={currentAnswer}
                        onChange={(e) => handleChange(qNum, e.target.value)}
                        placeholder="Enter answer"
                        fullWidth
                        sx={{ '& .MuiInputBase-input': { py: 0.75, fontSize: '0.875rem' } }}
                      />
                    )}
                  </Paper>
                );
              })}
            </Box>
          ) : (
            /* Desktop: Table layout with question text column */
            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box
                component="table"
                sx={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  '& th, & td': {
                    px: 1.5,
                    py: 0.75,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: '0.875rem',
                  },
                  '& th': {
                    bgcolor: 'grey.50',
                    fontWeight: 600,
                    textAlign: 'left',
                  },
                }}
              >
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Q#</th>
                    <th>Question</th>
                    <th style={{ width: 70 }}>Type</th>
                    {onChangeSection && <th style={{ width: 170 }}>Section</th>}
                    <th style={{ width: 220 }}>Correct Answer</th>
                    <th style={{ width: 80 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {section.questions.map((q) => {
                    const qNum = q.display_order ?? 0;
                    const isMCQ = q.question_format === 'MCQ';
                    const isDrawing = q.question_format === 'DRAWING_PROMPT';
                    const currentAnswer = answers[qNum] || '';
                    const isExpanded = expandedRows.has(qNum);
                    const needsImage = questionNeedsImage(q);

                    return (
                      <tr key={q.id}>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight={500}>
                              {qNum}
                            </Typography>
                            {needsImage && (
                              <Tooltip title="Image not uploaded — this question references a figure" arrow>
                                <ImageNotSupportedOutlinedIcon sx={{ fontSize: 16, color: '#D97706' }} />
                              </Tooltip>
                            )}
                          </Box>
                        </td>
                        <td>
                          {q.question_text ? (
                            <Box
                              onClick={() => toggleExpand(qNum)}
                              sx={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 0.5 }}
                            >
                              <MathText
                                text={q.question_text}
                                variant="caption"
                                sx={{
                                  flex: 1,
                                  color: 'text.secondary',
                                  display: isExpanded ? 'block' : '-webkit-box',
                                  WebkitLineClamp: isExpanded ? undefined : 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: isExpanded ? 'visible' : 'hidden',
                                  lineHeight: 1.4,
                                }}
                              />
                              <IconButton size="small" sx={{ mt: -0.25, p: 0.25 }}>
                                {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                              </IconButton>
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.disabled" fontStyle="italic">
                              (no text)
                            </Typography>
                          )}
                        </td>
                        <td>
                          <Typography variant="caption" color="text.secondary">
                            {q.question_format}
                          </Typography>
                        </td>
                        {onChangeSection && (
                          <td>
                            <SectionSelect
                              value={q.section}
                              disabled={sectionSaving === q.id}
                              onChange={(next) => handleSectionChange(q.id, next)}
                            />
                          </td>
                        )}
                        <td>
                          {isDrawing ? (
                            <Typography variant="caption" color="text.disabled">
                              N/A (self-assessed)
                            </Typography>
                          ) : isMCQ ? (
                            <Select
                              size="small"
                              value={currentAnswer}
                              onChange={(e) => handleChange(qNum, e.target.value)}
                              displayEmpty
                              sx={{ minWidth: 100, height: 32 }}
                            >
                              <MenuItem value="">
                                <em>Select</em>
                              </MenuItem>
                              {(q.options || []).map((opt) => (
                                <MenuItem key={opt.id} value={opt.id}>
                                  Option {opt.id.toUpperCase()}
                                  {opt.text ? ` — ${opt.text.substring(0, 40)}${opt.text.length > 40 ? '...' : ''}` : ''}
                                  {opt.nta_id ? ` (${opt.nta_id})` : ''}
                                </MenuItem>
                              ))}
                            </Select>
                          ) : (
                            <TextField
                              size="small"
                              value={currentAnswer}
                              onChange={(e) => handleChange(qNum, e.target.value)}
                              placeholder="Enter answer"
                              sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.875rem' } }}
                            />
                          )}
                        </td>
                        <td>
                          <Chip
                            label={QB_QUESTION_STATUS_LABELS[q.status] || q.status}
                            size="small"
                            sx={{
                              bgcolor: QB_QUESTION_STATUS_COLORS[q.status] + '20',
                              color: QB_QUESTION_STATUS_COLORS[q.status],
                              fontWeight: 600,
                              fontSize: '0.7rem',
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Box>
            </Paper>
          )}
        </Box>
      ))}

      <AnswerKeyUpload
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        questions={questions}
        onApply={onSave}
      />
    </Box>
  );
}
