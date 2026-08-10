'use client';

import { useState, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Chip,
  Checkbox,
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
import type { NexusQBQuestion, NexusQBQuestionOption, QBQuestionSection } from '@neram/database';
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
  questionNumber,
}: {
  value: QBQuestionSection | null;
  onChange: (next: QBQuestionSection) => void;
  disabled?: boolean;
  questionNumber: number;
}) {
  return (
    <Select
      size="small"
      value={value ?? ''}
      displayEmpty
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as QBQuestionSection)}
      SelectDisplayProps={{ 'aria-label': `Section for question ${questionNumber}` }}
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

/**
 * One answer option, with its LaTeX rendered.
 *
 * Option text comes out of the paper carrying the same LaTeX the question does
 * ("$\frac{1}{12}, \frac{4}{9}$"), and this dropdown used to print it raw, so
 * the answer column of a maths paper read as backslashes and braces while the
 * question beside it rendered properly.
 *
 * It also no longer truncates with substring(): cutting a string mid-LaTeX
 * leaves an unclosed $ that renders as garbage. Long options are clipped with
 * CSS instead, which cannot break the markup.
 */
function OptionLabel({ option, clamp }: { option: NexusQBQuestionOption; clamp?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, width: '100%' }}>
      <Box component="span" sx={{ fontWeight: 700, flexShrink: 0, fontSize: '0.8125rem' }}>
        {option.id.toUpperCase()}
      </Box>
      {option.text ? (
        <MathText
          text={option.text}
          variant="caption"
          sx={{
            minWidth: 0,
            ...(clamp
              ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
              : { whiteSpace: 'normal' }),
          }}
        />
      ) : option.nta_id ? (
        <Box component="span" sx={{ fontSize: '0.75rem', opacity: 0.7 }}>
          ({option.nta_id})
        </Box>
      ) : null}
    </Box>
  );
}

/** The answer dropdown for one MCQ. */
function AnswerSelect({
  options,
  value,
  onChange,
  fullWidth,
}: {
  options: NexusQBQuestionOption[];
  value: string;
  onChange: (next: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <Select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      displayEmpty
      fullWidth={fullWidth}
      renderValue={(selected) => {
        const opt = options.find((o) => o.id === selected);
        if (!opt) {
          return (
            <Box component="span" sx={{ fontStyle: 'italic', opacity: 0.6 }}>
              Select
            </Box>
          );
        }
        return <OptionLabel option={opt} clamp />;
      }}
      // Height is not pinned: a rendered fraction is taller than a line of
      // text, and clipping the answer is worse than a slightly taller row.
      sx={{
        minWidth: fullWidth ? undefined : 140,
        '& .MuiSelect-select': {
          py: 0.5,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
        },
      }}
    >
      <MenuItem value="">
        <em>Select</em>
      </MenuItem>
      {options.map((opt) => (
        <MenuItem key={opt.id} value={opt.id} sx={{ minHeight: 44 }}>
          <OptionLabel option={opt} />
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
   * Move questions into a section. Takes a list because correcting a paper is
   * almost never a one-question job: a bad import puts a whole block in the
   * wrong section, and fixing that a dropdown at a time is the slowest part of
   * preparing a paper. Omit to hide the section controls entirely.
   */
  onChangeSections?: (questionIds: string[], section: QBQuestionSection) => Promise<void>;
}

export default function AnswerKeyGrid({ questions, onSave, saving, onChangeSections }: AnswerKeyGridProps) {
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

  // Which questions the teacher has ticked, and whether a section write is in
  // flight. A section change saves immediately rather than joining the
  // answer-key dirty state, because the two are saved by different buttons and
  // merging them would let "Save All" quietly rewrite sections a teacher only
  // meant to look at.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSection, setBulkSection] = useState<QBQuestionSection | ''>('');
  const [applying, setApplying] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  // The last row ticked, so shift-click can fill the gap. Ranges are tracked by
  // question number rather than row index because the grid is grouped by
  // section: after a bad import the questions a teacher wants to fix are
  // scattered across groups, but they are always a contiguous run of Q numbers.
  const anchorRef = useRef<number | null>(null);

  const selectable = Boolean(onChangeSections);

  const toggleOne = (q: NexusQBQuestion, shiftKey: boolean) => {
    const qNum = q.display_order ?? 0;
    setSelected((prev) => {
      const next = new Set(prev);
      const anchor = anchorRef.current;

      if (shiftKey && anchor != null && anchor !== qNum) {
        const lo = Math.min(anchor, qNum);
        const hi = Math.max(anchor, qNum);
        for (const other of questions) {
          const n = other.display_order ?? 0;
          if (n >= lo && n <= hi) next.add(other.id);
        }
        return next;
      }

      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
    anchorRef.current = qNum;
  };

  const setSelection = (ids: string[]) => setSelected(new Set(ids));

  const selectRange = () => {
    const from = parseInt(rangeFrom, 10);
    const to = parseInt(rangeTo, 10);
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    setSelection(
      questions
        .filter((q) => {
          const n = q.display_order ?? 0;
          return n >= lo && n <= hi;
        })
        .map((q) => q.id),
    );
    anchorRef.current = hi;
  };

  const applyBulkSection = async () => {
    if (!onChangeSections || !bulkSection || selected.size === 0) return;
    setApplying(true);
    try {
      await onChangeSections(Array.from(selected), bulkSection);
      setSelected(new Set());
      setBulkSection('');
      anchorRef.current = null;
    } finally {
      setApplying(false);
    }
  };

  const handleSectionChange = async (questionId: string, next: QBQuestionSection) => {
    if (!onChangeSections) return;
    setApplying(true);
    try {
      await onChangeSections([questionId], next);
    } finally {
      setApplying(false);
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

      {/* Selection toolbar. A bad import puts a whole block of questions in the
          wrong section, so the fast paths are "everything from Q26 to Q40" and
          "everything currently in Drawing", not ticking ninety boxes. */}
      {selectable && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.25,
            mb: 2,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            borderRadius: 1.5,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Select
          </Typography>
          <Button
            size="small"
            onClick={() => setSelection(questions.map((q) => q.id))}
            sx={{ minHeight: 36, textTransform: 'none' }}
          >
            All
          </Button>
          <Button
            size="small"
            onClick={() => {
              setSelected(new Set());
              anchorRef.current = null;
            }}
            disabled={selected.size === 0}
            sx={{ minHeight: 36, textTransform: 'none' }}
          >
            None
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: { sm: 1 } }}>
            <TextField
              size="small"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ''))}
              placeholder="From"
              inputProps={{ inputMode: 'numeric', 'aria-label': 'First question number' }}
              sx={{ width: 76, '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem' } }}
            />
            <Typography variant="caption" color="text.secondary">
              to
            </Typography>
            <TextField
              size="small"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ''))}
              placeholder="To"
              inputProps={{ inputMode: 'numeric', 'aria-label': 'Last question number' }}
              sx={{ width: 76, '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem' } }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={selectRange}
              disabled={!rangeFrom || !rangeTo}
              sx={{ minHeight: 36, textTransform: 'none' }}
            >
              Select range
            </Button>
          </Box>

          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Tip: shift-click a tick box to select everything up to it
          </Typography>
        </Paper>
      )}

      {sections.map((section) => {
        const groupIds = section.questions.map((q) => q.id);
        const groupSelected = groupIds.filter((id) => selected.has(id)).length;
        const allGroupSelected = groupSelected === groupIds.length && groupIds.length > 0;

        return (
        <Box key={section.key} sx={{ mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            {selectable && (
              <Checkbox
                size="small"
                checked={allGroupSelected}
                indeterminate={groupSelected > 0 && !allGroupSelected}
                onChange={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (allGroupSelected) groupIds.forEach((id) => next.delete(id));
                    else groupIds.forEach((id) => next.add(id));
                    return next;
                  });
                }}
                inputProps={{ 'aria-label': `Select every question in ${section.title}` }}
                sx={{ p: 0.75 }}
              />
            )}
            <Typography variant="subtitle2" color="text.secondary">
              {section.title}
            </Typography>
          </Box>

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

                const isSelected = selected.has(q.id);

                return (
                  <Paper
                    key={q.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      ...(isSelected && {
                        borderColor: 'primary.main',
                        bgcolor: 'action.selected',
                      }),
                    }}
                  >
                    {/* Header row: Q#, Type, Status */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      {selectable && (
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onClick={(e) => toggleOne(q, (e as React.MouseEvent).shiftKey)}
                          inputProps={{ 'aria-label': `Select question ${qNum}` }}
                          sx={{ p: 0.75, ml: -0.75 }}
                        />
                      )}
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

                    {selectable && (
                      <Box sx={{ mb: 1 }}>
                        <SectionSelect
                          value={q.section}
                          disabled={applying}
                          questionNumber={qNum}
                          onChange={(next) => handleSectionChange(q.id, next)}
                        />
                      </Box>
                    )}

                    {/* Answer input */}
                    {isDrawing ? (
                      // "N/A" used to sit here, which read as a gap and was the
                      // visible end of the chain that kept drawings out of every
                      // paper test. They need no key, and are ready already.
                      <Typography variant="caption" color="success.main">
                        No answer key needed. A teacher marks this one.
                      </Typography>
                    ) : isMCQ ? (
                      <AnswerSelect
                        options={q.options || []}
                        value={currentAnswer}
                        onChange={(next) => handleChange(qNum, next)}
                        fullWidth
                      />
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
                    {selectable && <th style={{ width: 44 }} aria-label="Select" />}
                    <th style={{ width: 50 }}>Q#</th>
                    <th>Question</th>
                    <th style={{ width: 70 }}>Type</th>
                    {selectable && <th style={{ width: 170 }}>Section</th>}
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
                    const isSelected = selected.has(q.id);

                    return (
                      <tr
                        key={q.id}
                        style={isSelected ? { backgroundColor: theme.palette.action.selected } : undefined}
                      >
                        {selectable && (
                          <td style={{ paddingLeft: 4, paddingRight: 0 }}>
                            <Checkbox
                              size="small"
                              checked={isSelected}
                              onClick={(e) => toggleOne(q, (e as React.MouseEvent).shiftKey)}
                              inputProps={{ 'aria-label': `Select question ${qNum}` }}
                              sx={{ p: 0.75 }}
                            />
                          </td>
                        )}
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
                        {selectable && (
                          <td>
                            <SectionSelect
                              value={q.section}
                              disabled={applying}
                              questionNumber={qNum}
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
                            <AnswerSelect
                              options={q.options || []}
                              value={currentAnswer}
                              onChange={(next) => handleChange(qNum, next)}
                            />
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
        );
      })}

      {/* Spacer so the last rows are not sitting under the bulk bar. */}
      {selected.size > 0 && <Box sx={{ height: 96 }} />}

      {/* Bulk action bar. Fixed to the thumb zone, clearing the mobile
          BottomNav which sits at 56px. */}
      {selectable && selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: { xs: 56, sm: 0 },
            zIndex: 30,
            p: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <Typography variant="body2" fontWeight={700} sx={{ mr: 0.5 }}>
            {selected.size} selected
          </Typography>
          <Select
            size="small"
            value={bulkSection}
            displayEmpty
            onChange={(e) => setBulkSection(e.target.value as QBQuestionSection)}
            disabled={applying}
            // On the visible control, not inputProps: MUI puts inputProps on
            // the hidden native input, so a screen reader reading the combobox
            // a sighted user actually operates would find it unlabelled.
            SelectDisplayProps={{ 'aria-label': 'Section to move the selected questions into' }}
            sx={{ minWidth: 180, minHeight: 44 }}
          >
            <MenuItem value="" disabled>
              <em>Move to section...</em>
            </MenuItem>
            {QB_SECTIONS.map((s) => (
              <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>
                {qbSectionLabel(s)}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="contained"
            onClick={applyBulkSection}
            disabled={!bulkSection || applying}
            startIcon={applying ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44, minWidth: 100 }}
          >
            {applying ? 'Moving...' : 'Apply'}
          </Button>
          <Button
            onClick={() => {
              setSelected(new Set());
              anchorRef.current = null;
            }}
            disabled={applying}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Clear
          </Button>
        </Paper>
      )}

      <AnswerKeyUpload
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        questions={questions}
        onApply={onSave}
      />
    </Box>
  );
}
