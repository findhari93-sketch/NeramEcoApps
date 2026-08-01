'use client';

/**
 * Where a teacher writes an assignment's questions.
 *
 * The job this replaces is typing everything into one instructions box, marks
 * included ("Q3. Find the Area of a Triangle (5 Marks)"), and then marking all
 * of it by hand. So the two things it has to get right are: adding a question
 * must be faster than typing a line of prose, and a question the machine can
 * mark must be obviously different from one it cannot.
 *
 * Three types, and the difference between them is what happens at marking time:
 *   MCQ         - student picks an option, marked instantly
 *   Numerical   - student types a value, marked instantly, tolerance allowed
 *   Working only- no answer box, the teacher marks it from the PDF
 *
 * Maths is typed as LaTeX between dollar signs and previewed live, because a
 * teacher writing \frac{1}{2} needs to see it render before twenty students do.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  Select,
  MenuItem,
  Radio,
  Divider,
  Collapse,
  Tooltip,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MathText from '@/components/common/MathText';
import { parseAssignmentBrief } from '@/lib/assignment-brief';

export type ComposerFormat = 'MCQ' | 'NUMERICAL' | 'SUBJECTIVE';

export interface ComposerOption {
  key: string;
  text: string;
}

export interface ComposerQuestion {
  /** Local key for React. Not the bank id. */
  uid: string;
  id?: string | null;
  question_text: string;
  format: ComposerFormat;
  options: ComposerOption[];
  correct_answer: string;
  answer_tolerance: string;
  explanation: string;
  marks: string;
}

const FORMAT_LABEL: Record<ComposerFormat, string> = {
  MCQ: 'Multiple choice',
  NUMERICAL: 'Numerical answer',
  SUBJECTIVE: 'Working only',
};

const FORMAT_HINT: Record<ComposerFormat, string> = {
  MCQ: 'Marked the moment the student submits.',
  NUMERICAL: 'Marked instantly. Set a tolerance if a close answer should count.',
  SUBJECTIVE: 'No answer box. You mark this from their uploaded working.',
};

const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `q_${uidCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyQuestion(format: ComposerFormat = 'NUMERICAL'): ComposerQuestion {
  return {
    uid: nextUid(),
    id: null,
    question_text: '',
    format,
    options:
      format === 'MCQ'
        ? [
            { key: 'a', text: '' },
            { key: 'b', text: '' },
          ]
        : [],
    correct_answer: '',
    answer_tolerance: '',
    explanation: '',
    marks: '1',
  };
}

/** Shape the API accepts, from the shape the form holds. */
export function toApiQuestions(questions: ComposerQuestion[]) {
  return questions.map((q) => ({
    id: q.id || null,
    question_text: q.question_text.trim(),
    format: q.format,
    options: q.format === 'MCQ' ? q.options.filter((o) => o.text.trim()) : undefined,
    correct_answer: q.format === 'SUBJECTIVE' ? null : q.correct_answer.trim(),
    answer_tolerance:
      q.format === 'NUMERICAL' && q.answer_tolerance.trim() !== ''
        ? Number(q.answer_tolerance)
        : null,
    explanation: q.explanation.trim() || null,
    marks: Number(q.marks) || 0,
  }));
}

/** Load a saved paper back into the form. */
export function fromApiQuestions(paperQuestions: any[]): ComposerQuestion[] {
  return (paperQuestions || []).map((q) => ({
    uid: nextUid(),
    id: q.id,
    question_text: q.question_text || '',
    format: (String(q.format || 'MCQ').toUpperCase() as ComposerFormat) || 'MCQ',
    options: (q.options || []).map((o: any) => ({ key: o.key, text: o.text })),
    correct_answer: q.correct_answer ?? '',
    answer_tolerance: q.answer_tolerance == null ? '' : String(q.answer_tolerance),
    explanation: q.explanation ?? '',
    marks: String(q.marks ?? 1),
  }));
}

/**
 * Turn a pasted brief into draft questions.
 *
 * Reuses the same parser that renders existing assignments, so a teacher can
 * paste the paper they already wrote and get its headings and mark values back
 * as real fields. Everything lands as "Working only" because the parser reads
 * questions, not answers, and silently inventing an answer key would be worse
 * than asking for one.
 */
export function questionsFromPastedBrief(text: string): ComposerQuestion[] {
  const brief = parseAssignmentBrief(text);
  if (!brief.questions.length) return [];
  return brief.questions.map((q) => ({
    ...emptyQuestion('SUBJECTIVE'),
    question_text: [q.title, q.body].filter(Boolean).join('\n').trim(),
    marks: String(q.marks ?? 1),
  }));
}

interface QuestionComposerProps {
  value: ComposerQuestion[];
  onChange: (questions: ComposerQuestion[]) => void;
  /** Locked once students have answered, since re-keying their answers is not on. */
  disabled?: boolean;
  disabledReason?: string | null;
}

export default function QuestionComposer({
  value,
  onChange,
  disabled = false,
  disabledReason,
}: QuestionComposerProps) {
  const theme = useTheme();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});

  const totals = useMemo(() => {
    const total = value.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    const auto = value
      .filter((q) => q.format !== 'SUBJECTIVE')
      .reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    return { total, auto, manual: total - auto };
  }, [value]);

  const update = (uid: string, patch: Partial<ComposerQuestion>) => {
    onChange(value.map((q) => (q.uid === uid ? { ...q, ...patch } : q)));
  };

  const changeFormat = (q: ComposerQuestion, format: ComposerFormat) => {
    update(q.uid, {
      format,
      // Answers do not carry across a type change: an option key means nothing
      // to a numerical question, and keeping it would key the answer to a letter
      // no longer on screen.
      correct_answer: '',
      answer_tolerance: '',
      options:
        format === 'MCQ' && q.options.length === 0
          ? [
              { key: 'a', text: '' },
              { key: 'b', text: '' },
            ]
          : q.options,
    });
  };

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const duplicate = (index: number) => {
    const source = value[index];
    const copy: ComposerQuestion = {
      ...source,
      uid: nextUid(),
      // A duplicate is a NEW question. Carrying the bank id would make saving
      // overwrite the original instead of adding beside it.
      id: null,
      options: source.options.map((o) => ({ ...o })),
    };
    onChange([...value.slice(0, index + 1), copy, ...value.slice(index + 1)]);
  };

  const applyPaste = () => {
    const parsed = questionsFromPastedBrief(pasteText);
    if (parsed.length) {
      onChange([...value, ...parsed]);
      setPasteText('');
      setPasteOpen(false);
    }
  };

  const pasteCount = useMemo(() => questionsFromPastedBrief(pasteText).length, [pasteText]);

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.5 }}
        flexWrap="wrap"
        useFlexGap
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Questions
        </Typography>
        {value.length > 0 && (
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={`${totals.total} marks`}
              sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
            />
            {totals.auto > 0 && (
              <Chip
                size="small"
                label={`${totals.auto} auto`}
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  bgcolor: alpha(theme.palette.success.main, 0.14),
                  color: 'success.dark',
                }}
              />
            )}
            {totals.manual > 0 && (
              <Chip
                size="small"
                label={`${totals.manual} you mark`}
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  bgcolor: alpha(theme.palette.warning.main, 0.16),
                  color: 'warning.dark',
                }}
              />
            )}
          </Stack>
        )}
      </Stack>

      {disabled && disabledReason && (
        <Box
          role="status"
          sx={{
            p: 1.5,
            mb: 1.5,
            borderRadius: 2,
            bgcolor: alpha('#EF6C00', 0.1),
            border: `1px solid ${alpha('#EF6C00', 0.3)}`,
          }}
        >
          <Typography variant="body2" sx={{ color: '#B54700' }}>
            {disabledReason}
          </Typography>
        </Box>
      )}

      <Stack spacing={1.5}>
        {value.map((q, index) => {
          const isPreviewing = !!previewing[q.uid];
          return (
            <Box
              key={q.uid}
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                overflow: 'hidden',
              }}
            >
              {/* Header: which question, what type, worth how much */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                sx={{ p: 1.25, bgcolor: alpha(theme.palette.text.primary, 0.03) }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      px: 1,
                      minWidth: 34,
                      height: 24,
                      borderRadius: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                      color: 'primary.main',
                      flexShrink: 0,
                    }}
                  >
                    Q{index + 1}
                  </Box>
                  <Select
                    value={q.format}
                    onChange={(e) => changeFormat(q, e.target.value as ComposerFormat)}
                    size="small"
                    disabled={disabled}
                    inputProps={{ 'aria-label': `Question ${index + 1} type` }}
                    sx={{ flex: 1, minWidth: 0, '& .MuiSelect-select': { py: 0.75, fontSize: '0.875rem' } }}
                  >
                    {(Object.keys(FORMAT_LABEL) as ComposerFormat[]).map((f) => (
                      <MenuItem key={f} value={f} sx={{ minHeight: 44 }}>
                        {FORMAT_LABEL[f]}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>

                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                  <TextField
                    value={q.marks}
                    onChange={(e) => update(q.uid, { marks: e.target.value.replace(/[^0-9.]/g, '') })}
                    size="small"
                    disabled={disabled}
                    inputProps={{
                      inputMode: 'decimal',
                      'aria-label': `Marks for question ${index + 1}`,
                      style: { textAlign: 'center', fontWeight: 600 },
                    }}
                    sx={{ width: 68 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                    marks
                  </Typography>
                  <Tooltip title="Move up">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Move question ${index + 1} up`}
                        onClick={() => move(index, -1)}
                        disabled={disabled || index === 0}
                        sx={{ width: 36, height: 36 }}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Move question ${index + 1} down`}
                        onClick={() => move(index, 1)}
                        disabled={disabled || index === value.length - 1}
                        sx={{ width: 36, height: 36 }}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Duplicate">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Duplicate question ${index + 1}`}
                        onClick={() => duplicate(index)}
                        disabled={disabled}
                        sx={{ width: 36, height: 36 }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Delete question ${index + 1}`}
                        onClick={() => onChange(value.filter((x) => x.uid !== q.uid))}
                        disabled={disabled}
                        sx={{ width: 36, height: 36, color: 'error.main' }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>

              <Divider />

              <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
                <TextField
                  label="Question"
                  value={q.question_text}
                  onChange={(e) => update(q.uid, { question_text: e.target.value })}
                  fullWidth
                  multiline
                  minRows={2}
                  disabled={disabled}
                  placeholder={'Find the area of the triangle with vertices $A(-2, 1)$, $B(4, 5)$, $C(6, -1)$.'}
                  helperText="Wrap maths in $...$ for inline, $$...$$ for its own line."
                />

                <Stack direction="row" justifyContent="flex-end" sx={{ mt: 0.5 }}>
                  <Button
                    size="small"
                    startIcon={<VisibilityOutlinedIcon />}
                    onClick={() => setPreviewing((p) => ({ ...p, [q.uid]: !p[q.uid] }))}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {isPreviewing ? 'Hide preview' : 'Preview'}
                  </Button>
                </Stack>
                <Collapse in={isPreviewing}>
                  <Box
                    sx={{
                      p: 1.5,
                      mb: 1,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.05),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: 'primary.main', display: 'block', mb: 0.5 }}
                    >
                      What the student sees
                    </Typography>
                    <MathText text={q.question_text || 'Nothing yet.'} variant="body2" />
                  </Box>
                </Collapse>

                {q.format === 'MCQ' && (
                  <Box
                    role="radiogroup"
                    aria-label={`Correct option for question ${index + 1}`}
                    sx={{ mt: 1 }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Tap the circle to mark the correct answer.
                    </Typography>
                    <Stack spacing={0.75}>
                      {q.options.map((opt, oi) => (
                        <Stack key={opt.key} direction="row" spacing={1} alignItems="center">
                          <Radio
                            checked={q.correct_answer === opt.key}
                            onChange={() => update(q.uid, { correct_answer: opt.key })}
                            disabled={disabled}
                            inputProps={{ 'aria-label': `Option ${opt.key.toUpperCase()} is correct` }}
                            sx={{ width: 44, height: 44 }}
                          />
                          <TextField
                            value={opt.text}
                            onChange={(e) => {
                              const options = [...q.options];
                              options[oi] = { ...opt, text: e.target.value };
                              update(q.uid, { options });
                            }}
                            size="small"
                            fullWidth
                            disabled={disabled}
                            placeholder={`Option ${opt.key.toUpperCase()}`}
                            inputProps={{ 'aria-label': `Option ${opt.key.toUpperCase()} text` }}
                          />
                          <IconButton
                            size="small"
                            aria-label={`Remove option ${opt.key.toUpperCase()}`}
                            disabled={disabled || q.options.length <= 2}
                            onClick={() => {
                              const options = q.options
                                .filter((_, i) => i !== oi)
                                // Re-letter so the keys stay a, b, c with no gap.
                                .map((o, i) => ({ ...o, key: OPTION_KEYS[i] }));
                              update(q.uid, {
                                options,
                                correct_answer: options.some((o) => o.key === q.correct_answer)
                                  ? q.correct_answer
                                  : '',
                              });
                            }}
                            sx={{ width: 36, height: 36 }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                    {q.options.length < OPTION_KEYS.length && (
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        disabled={disabled}
                        onClick={() =>
                          update(q.uid, {
                            options: [...q.options, { key: OPTION_KEYS[q.options.length], text: '' }],
                          })
                        }
                        sx={{ mt: 0.5, textTransform: 'none', minHeight: 40 }}
                      >
                        Add option
                      </Button>
                    )}
                  </Box>
                )}

                {q.format === 'NUMERICAL' && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                    <TextField
                      label="Correct answer"
                      value={q.correct_answer}
                      onChange={(e) => update(q.uid, { correct_answer: e.target.value })}
                      size="small"
                      fullWidth
                      disabled={disabled}
                      inputProps={{ inputMode: 'decimal' }}
                      placeholder="14"
                    />
                    <TextField
                      label="Tolerance"
                      value={q.answer_tolerance}
                      onChange={(e) => update(q.uid, { answer_tolerance: e.target.value.replace(/[^0-9.]/g, '') })}
                      size="small"
                      fullWidth
                      disabled={disabled}
                      inputProps={{ inputMode: 'decimal' }}
                      placeholder="0"
                      helperText="Leave blank for an exact match"
                    />
                  </Stack>
                )}

                {q.format === 'SUBJECTIVE' && (
                  <Box
                    sx={{
                      mt: 1.5,
                      p: 1.25,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.warning.main, 0.08),
                      border: `1px solid ${alpha(theme.palette.warning.main, 0.25)}`,
                    }}
                  >
                    <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
                      {FORMAT_HINT.SUBJECTIVE}
                    </Typography>
                  </Box>
                )}

                {q.format !== 'SUBJECTIVE' && (
                  <TextField
                    label="Explanation (optional)"
                    value={q.explanation}
                    onChange={(e) => update(q.uid, { explanation: e.target.value })}
                    fullWidth
                    multiline
                    minRows={1}
                    size="small"
                    disabled={disabled}
                    sx={{ mt: 1.5 }}
                    helperText="Shown with the answer once the student submits."
                  />
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>

      {value.length === 0 && !pasteOpen && (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            borderRadius: 2,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No questions yet. Students will only upload their working.
          </Typography>
        </Box>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={disabled}
          onClick={() => onChange([...value, emptyQuestion()])}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Add question
        </Button>
        <Button
          variant="text"
          startIcon={<AutoAwesomeOutlinedIcon />}
          disabled={disabled}
          onClick={() => setPasteOpen((o) => !o)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Paste a question paper
        </Button>
      </Stack>

      <Collapse in={pasteOpen}>
        <Box sx={{ mt: 1.5, p: { xs: 1.5, sm: 2 }, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Paste what you have already written
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Headings like &quot;Q1. Find the area (5 Marks)&quot; become questions with their marks
            filled in. Add the answers afterwards.
          </Typography>
          <TextField
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            fullWidth
            multiline
            minRows={4}
            placeholder={'Q1. Find the Missing Coordinate (5 Marks)\nFind the value of k such that...'}
            inputProps={{ 'aria-label': 'Question paper to import' }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
            <Button
              variant="contained"
              disabled={pasteCount === 0}
              onClick={applyPaste}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              {pasteCount > 0 ? `Add ${pasteCount} question${pasteCount === 1 ? '' : 's'}` : 'Add questions'}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setPasteOpen(false);
                setPasteText('');
              }}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Cancel
            </Button>
            {pasteText.trim() !== '' && pasteCount === 0 && (
              <Typography variant="caption" color="text.secondary" role="status">
                No question headings found.
              </Typography>
            )}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
