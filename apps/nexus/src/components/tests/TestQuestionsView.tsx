'use client';

/**
 * Every question on the paper, with how students did on each, in one list.
 *
 * This replaces two lists of the same 150 questions: the Overview tab's (the
 * question and its answer, no results) and Question analysis (results, no
 * answer, two tabs deep). The teacher asked for it to work like a Microsoft
 * Form or a Google Form, where opening a question shows its answer and how
 * everybody answered in the same place.
 *
 * Built around the job they came to do: narrow to the questions worth a look
 * (0% right, a range, not yet checked by an AI), select everything left in one
 * press, and send it to an AI. What an AI already checked or fixed stays on
 * each row, so nobody checks the same question twice without meaning to.
 */

import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
  alpha,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloseIcon from '@mui/icons-material/Close';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MathText from '@/components/common/MathText';
import QuestionPreviewText from '@/components/question-bank/QuestionPreviewText';
import FieldDiff from '@/components/tests/FieldDiff';
import QuestionFilterPanel from '@/components/tests/QuestionFilterPanel';
import {
  DEFAULT_QUESTION_FILTERS,
  UNDER_20_RANGE,
  ZERO_RANGE,
  activeFilterCount,
  aiStateOf,
  applyQuestionFilters,
  numberQuestions,
  quickCounts,
  sameRange,
  type FilterableQuestion,
  type QuestionFilters,
} from '@/lib/question-filters';
import {
  describeFieldValue,
  isCorrectOption,
  optionLetter,
  type QuestionOptionLike,
} from '@/lib/test-question-options';

export type ReviewVerdictName = 'wrong_key' | 'ambiguous' | 'hard_but_fair' | 'fine';

export interface QuestionAiStatus {
  checks: number;
  last_checked_at: string | null;
  last_verdict: ReviewVerdictName | null;
  last_note: string | null;
  fixed: {
    at: string;
    fields: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    verdict: ReviewVerdictName | null;
    pct_before: number | null;
  } | null;
}

/** A row of the results route's per-question analysis. */
export interface QuestionAnalysisRow {
  question_id: string;
  question_text: string | null;
  sort_order: number;
  answered: number;
  correct: number;
  correct_pct: number | null;
  top_wrong_option: { key: string; text: string | null; count: number } | null;
  option_counts?: Record<string, number> | null;
  needs_review: boolean;
  ai?: QuestionAiStatus | null;
}

/** A question as the paper holds it, from the test itself. */
export interface PoolQuestion {
  test_question_id: string;
  question_id: string;
  question_text: string | null;
  question_image_url: string | null;
  question_format: string;
  options: QuestionOptionLike[] | null;
  marks: number;
  sort_order: number;
  correct_answer?: string | null;
  explanation_brief?: string | null;
}

interface Row extends FilterableQuestion {
  number: number;
  pool: PoolQuestion | null;
  correct: number;
  top_wrong_option: QuestionAnalysisRow['top_wrong_option'];
  option_counts: Record<string, number> | null;
  needs_review: boolean;
  ai: QuestionAiStatus | null;
}

interface Props {
  pool: PoolQuestion[];
  analysis: QuestionAnalysisRow[];
  /** True while the results for the current run are still arriving. */
  statsLoading: boolean;
  filters: QuestionFilters;
  onFiltersChange: (next: QuestionFilters) => void;
  onReview: (questionIds: string[]) => void;
  onEdit: (questionId: string) => void;
}

const VERDICT_LABELS: Record<ReviewVerdictName, string> = {
  wrong_key: 'Wrong answer key',
  ambiguous: 'Ambiguous',
  hard_but_fair: 'Hard but fair',
  fine: 'Nothing wrong',
};

const FIELD_LABELS: Record<string, string> = {
  question_text: 'Question',
  options: 'Options',
  correct_answer: 'Correct answer',
  explanation_brief: 'Explanation',
};

type Tone = 'success' | 'warning' | 'error' | 'info';

function pctTone(pct: number): Tone {
  if (pct >= 70) return 'success';
  if (pct >= 40) return 'warning';
  return 'error';
}

function formatDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function metaLine(row: Row): string {
  if (row.answered === 0) return 'No answers yet';
  const wrong =
    row.top_wrong_option && row.correct < row.answered
      ? ` · most picked "${row.top_wrong_option.text || row.top_wrong_option.key}" (${row.top_wrong_option.count})`
      : '';
  return `${row.correct} of ${row.answered} right${wrong}`;
}

function Marker({ tone, icon, label }: { tone: Tone; icon: React.ReactNode; label: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.5,
        px: 0.75,
        py: '2px',
        borderRadius: 1,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.4,
        color: `${tone}.dark`,
        bgcolor: (t) => alpha(t.palette[tone].main, 0.12),
        '& svg': { fontSize: 14 },
      }}
    >
      {icon}
      {label}
    </Box>
  );
}

/** What an AI has done with this question, or that it still needs a look. */
function AiMarker({ row }: { row: Row }) {
  const state = aiStateOf(row);
  const checks = row.ai?.checks ?? 0;
  const times = checks > 1 ? ` ${checks}×` : '';
  if (state === 'fixed') {
    const keyFixed = row.ai?.fixed?.fields.includes('correct_answer');
    return (
      <Marker
        tone="success"
        icon={<AutoFixHighOutlinedIcon />}
        label={`${keyFixed ? 'Key fixed by AI' : 'Fixed by AI'}${times}`}
      />
    );
  }
  if (state === 'checked') {
    return <Marker tone="info" icon={<VerifiedOutlinedIcon />} label={`AI checked${times}`} />;
  }
  if (row.needs_review) {
    return <Marker tone="warning" icon={<WarningAmberOutlinedIcon />} label="Needs a look" />;
  }
  return null;
}

/**
 * The correct rate. After a fix moved it, the rate at the time of the check is
 * shown struck through beside it: "was 0%, now 44%" without a sentence.
 */
function PctPill({ row }: { row: Row }) {
  if (row.correct_pct == null) return null;
  const before = row.ai?.fixed?.pct_before;
  const moved = before != null && before !== row.correct_pct;
  const tone = pctTone(row.correct_pct);
  return (
    <Box
      component="span"
      data-testid={`pct-${row.number}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        height: 26,
        borderRadius: 13,
        flexShrink: 0,
        fontSize: 13,
        fontWeight: 800,
        color: `${tone}.dark`,
        bgcolor: (t) => alpha(t.palette[tone].main, 0.14),
      }}
    >
      {moved && (
        <Box component="s" sx={{ fontWeight: 600, opacity: 0.75 }} aria-label={`was ${before}%`}>
          {before}%
        </Box>
      )}
      <span>{row.correct_pct}%</span>
    </Box>
  );
}

function AiHistory({ row, options }: { row: Row; options: QuestionOptionLike[] }) {
  const ai = row.ai;
  if (!ai || ai.checks === 0) return null;
  const parts = [`Checked by AI ${ai.checks === 1 ? 'once' : `${ai.checks} times`}`];
  if (ai.last_verdict) parts.push(`last: ${VERDICT_LABELS[ai.last_verdict]}`);
  if (ai.last_checked_at) parts.push(formatDay(ai.last_checked_at));
  const fix = ai.fixed;

  return (
    <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <VerifiedOutlinedIcon sx={{ fontSize: 18, color: 'info.main' }} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {parts.join(' · ')}
        </Typography>
      </Box>
      {ai.last_note && (
        <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
          {ai.last_note}
        </Typography>
      )}
      {fix && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
            What changed{fix.pct_before != null ? `, when ${fix.pct_before}% were getting it right` : ''}
          </Typography>
          {fix.fields.map((field) => {
            const beforeOptions = Array.isArray(fix.before.options)
              ? (fix.before.options as QuestionOptionLike[])
              : options;
            const afterOptions = Array.isArray(fix.after.options)
              ? (fix.after.options as QuestionOptionLike[])
              : options;
            return (
              <FieldDiff
                key={field}
                label={FIELD_LABELS[field] || field}
                before={describeFieldValue(field, fix.before[field], beforeOptions)}
                after={describeFieldValue(field, fix.after[field], afterOptions)}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function QuestionDetail({
  row,
  onReview,
  onEdit,
}: {
  row: Row;
  onReview: (ids: string[]) => void;
  onEdit: (id: string) => void;
}) {
  const p = row.pool;
  const options = Array.isArray(p?.options) ? (p!.options as QuestionOptionLike[]) : [];
  const showBars = row.answered > 0 && row.option_counts != null;

  return (
    <>
      {p?.question_text && <MathText text={p.question_text} variant="body2" sx={{ mb: 1.5 }} />}
      {p?.question_image_url && (
        <Box
          component="img"
          src={p.question_image_url}
          alt="Question figure"
          loading="lazy"
          sx={{ display: 'block', maxWidth: '100%', borderRadius: 1, mb: 1.5, bgcolor: 'common.white' }}
        />
      )}

      {options.length > 0 ? (
        <Box
          component="ul"
          aria-label="Options and how many picked each"
          sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}
        >
          {options.map((opt, i) => {
            const correct = isCorrectOption(opt, i, p?.correct_answer);
            const count = row.option_counts?.[opt.id ?? ''] ?? 0;
            const pct = row.answered > 0 ? Math.round((count / row.answered) * 100) : 0;
            return (
              <Box
                component="li"
                key={opt.id || i}
                data-testid={correct ? 'correct-option' : undefined}
                sx={{
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: correct ? 'success.main' : 'divider',
                  px: 1.25,
                  py: 1,
                }}
              >
                {showBars && (
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: `${pct}%`,
                      bgcolor: (t) =>
                        correct ? alpha(t.palette.success.main, 0.16) : alpha(t.palette.text.primary, 0.07),
                      transition: 'width 250ms ease',
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                    }}
                  />
                )}
                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 18 }}>
                    {optionLetter(opt, i)}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <MathText text={opt.text || ''} variant="body2" />
                    {opt.image_url && (
                      <Box
                        component="img"
                        src={opt.image_url}
                        alt={`Option ${optionLetter(opt, i)}`}
                        loading="lazy"
                        sx={{ display: 'block', mt: 0.5, maxWidth: '100%', maxHeight: 140, objectFit: 'contain', borderRadius: 1, bgcolor: 'common.white' }}
                      />
                    )}
                  </Box>
                  {correct && (
                    <Box
                      component="span"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: 'success.dark', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 16 }} />
                      Correct
                    </Box>
                  )}
                  {showBars && (
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 56, textAlign: 'right', flexShrink: 0 }}>
                      {count} · {pct}%
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : p?.correct_answer != null ? (
        <Typography variant="body2">
          Answer: <b>{p.correct_answer}</b>
        </Typography>
      ) : null}

      {p?.explanation_brief && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
            Explanation
          </Typography>
          <MathText text={p.explanation_brief} variant="body2" />
        </Box>
      )}

      {row.needs_review && aiStateOf(row) === 'unchecked' && (
        <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 600, color: 'warning.dark' }}>
          Check this question. At this rate it is more likely unclear than hard.
        </Typography>
      )}

      <AiHistory row={row} options={options} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          startIcon={<AutoFixHighOutlinedIcon />}
          onClick={() => onReview([row.question_id])}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Check with AI
        </Button>
        <Button
          startIcon={<EditOutlinedIcon />}
          onClick={() => onEdit(row.question_id)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Edit question
        </Button>
        <Box sx={{ flex: 1 }} />
        {p && (
          <Typography variant="caption" color="text.secondary">
            {p.marks} {p.marks === 1 ? 'mark' : 'marks'}
          </Typography>
        )}
      </Box>
    </>
  );
}

interface RowProps {
  row: Row;
  expanded: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onReview: (ids: string[]) => void;
  onEdit: (id: string) => void;
}

const QuestionRow = memo(function QuestionRow({
  row,
  expanded,
  selected,
  onToggleSelect,
  onToggleExpand,
  onReview,
  onEdit,
}: RowProps) {
  const state = aiStateOf(row);
  // A stripe to scan by, always beside a marker that says the same thing in words.
  const stripe =
    state === 'fixed'
      ? 'success.main'
      : state === 'checked'
        ? 'info.main'
        : row.needs_review
          ? 'warning.main'
          : 'transparent';
  const panelId = `question-panel-${row.question_id}`;

  return (
    <Box
      component="li"
      data-testid={`question-row-${row.number}`}
      sx={{
        listStyle: 'none',
        borderLeft: '4px solid',
        borderLeftColor: stripe,
        bgcolor: selected ? 'action.selected' : 'background.paper',
        transition: 'background-color 150ms ease',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.25, pr: 1, py: 0.5 }}>
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(row.question_id)}
          inputProps={{ 'aria-label': `Select question ${row.number}` }}
          sx={{ width: 44, height: 44, flexShrink: 0 }}
        />
        <Box
          component="button"
          type="button"
          onClick={() => onToggleExpand(row.question_id)}
          aria-expanded={expanded}
          aria-controls={panelId}
          // The whole row reads as one sentence: which question, how it went,
          // and what an AI has done with it.
          aria-label={`Question ${row.number}, ${(row.question_text || 'image-based question')
            .replace(/\$/g, '')
            .slice(0, 140)}. ${metaLine(row)}${
            state === 'fixed'
              ? '. Fixed by AI'
              : state === 'checked'
                ? '. Checked by AI'
                : row.needs_review
                  ? '. Needs a look'
                  : ''
          }. ${expanded ? 'Hide' : 'Show'} answers`}
          sx={{
            appearance: 'none',
            border: 0,
            bgcolor: 'transparent',
            color: 'inherit',
            font: 'inherit',
            cursor: 'pointer',
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            gap: 1,
            py: 1,
            px: 0.5,
            textAlign: 'left',
            borderRadius: 1,
            transition: 'background-color 150ms ease',
            '&:hover': { bgcolor: 'action.hover' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
          }}
        >
          <Typography
            component="span"
            variant="body2"
            sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', minWidth: 24 }}
          >
            {row.number}
          </Typography>
          {row.pool?.question_image_url && (
            <Box
              component="img"
              src={row.pool.question_image_url}
              alt=""
              loading="lazy"
              sx={{ width: 36, height: 36, flexShrink: 0, objectFit: 'contain', borderRadius: 0.5, bgcolor: 'common.white' }}
            />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <QuestionPreviewText text={row.question_text} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {metaLine(row)}
            </Typography>
            <AiMarker row={row} />
          </Box>
          <PctPill row={row} />
          <ExpandMoreIcon
            sx={{
              color: 'text.secondary',
              flexShrink: 0,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms ease',
            }}
          />
        </Box>
      </Box>
      <Collapse in={expanded} unmountOnExit>
        <Box id={panelId} sx={{ pl: { xs: 2, sm: 7 }, pr: 2, pb: 2 }}>
          <QuestionDetail row={row} onReview={onReview} onEdit={onEdit} />
        </Box>
      </Collapse>
    </Box>
  );
});

function QuickChip({
  label,
  count,
  active,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  // A chip that opens onto nobody teaches that chips are decoration.
  if (count === 0 && !active) return null;
  return (
    <Chip
      data-testid={testId}
      clickable
      onClick={onClick}
      aria-pressed={active}
      color={active ? 'primary' : 'default'}
      variant={active ? 'filled' : 'outlined'}
      label={
        <>
          {label}
          <Box component="span" sx={{ ml: 0.75, fontWeight: 800 }}>
            {count}
          </Box>
        </>
      }
      sx={{ height: { xs: 44, md: 36 }, borderRadius: 22, fontWeight: 600, flexShrink: 0 }}
    />
  );
}

export default function TestQuestionsView({
  pool,
  analysis,
  statsLoading,
  filters,
  onFiltersChange,
  onReview,
  onEdit,
}: Props) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows: Row[] = useMemo(() => {
    const statsById = new Map(analysis.map((a) => [a.question_id, a]));
    const merged: Array<Omit<Row, 'number'>> =
      pool.length > 0
        ? pool.map((p) => {
            const s = statsById.get(p.question_id);
            return {
              question_id: p.question_id,
              question_text: p.question_text ?? s?.question_text ?? null,
              sort_order: p.sort_order,
              answered: s?.answered ?? 0,
              correct: s?.correct ?? 0,
              correct_pct: s?.correct_pct ?? null,
              top_wrong_option: s?.top_wrong_option ?? null,
              option_counts: s?.option_counts ?? null,
              needs_review: s?.needs_review ?? false,
              ai: s?.ai ?? null,
              pool: p,
            };
          })
        : analysis.map((s) => ({
            question_id: s.question_id,
            question_text: s.question_text,
            sort_order: s.sort_order,
            answered: s.answered,
            correct: s.correct,
            correct_pct: s.correct_pct,
            top_wrong_option: s.top_wrong_option,
            option_counts: s.option_counts ?? null,
            needs_review: s.needs_review,
            ai: s.ai ?? null,
            pool: null,
          }));
    return numberQuestions(merged);
  }, [pool, analysis]);

  const hasRates = useMemo(() => rows.some((r) => r.answered > 0), [rows]);
  const shown = useMemo(() => applyQuestionFilters(rows, filters, deferredSearch), [rows, filters, deferredSearch]);
  const quick = useMemo(() => quickCounts(rows, filters), [rows, filters]);
  const activeCount = activeFilterCount(filters);
  const narrowed = activeCount > 0 || search.trim() !== '';

  const setFilters = (patch: Partial<QuestionFilters>) => onFiltersChange({ ...filters, ...patch });

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.question_id));
  const someShownSelected = shown.some((r) => selected.has(r.question_id));

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shown.forEach((r) => next.delete(r.question_id));
      else shown.forEach((r) => next.add(r.question_id));
      return next;
    });
  }

  function clearFilters() {
    setSearch('');
    onFiltersChange({ ...DEFAULT_QUESTION_FILTERS, pct: [0, 100], sort: filters.sort });
  }

  // In paper order, so the AI prompt reads the way the paper does.
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.question_id)), [rows, selected]);
  const alreadyChecked = selectedRows.filter((r) => aiStateOf(r) !== 'unchecked');

  if (rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {statsLoading ? 'Loading questions.' : 'No questions found for this test.'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search questions, or type a question number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputProps={{ 'aria-label': 'Search questions' }}
          InputProps={{
            sx: { minHeight: 44, fontSize: 16 },
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton aria-label="Clear search" onClick={() => setSearch('')} edge="end" sx={{ width: 40, height: 40 }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            overflowX: 'auto',
            pb: 0.5,
            '&::-webkit-scrollbar': { height: 4 },
          }}
        >
          <Button
            variant={activeCount > 0 ? 'contained' : 'outlined'}
            startIcon={<TuneOutlinedIcon />}
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
            sx={{ flexShrink: 0, minHeight: { xs: 44, md: 36 }, borderRadius: 22, textTransform: 'none', fontWeight: 700 }}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Button>
          {hasRates && (
            <QuickChip
              testId="quick-zero"
              label="0% right"
              count={quick.zero}
              active={sameRange(filters.pct, ZERO_RANGE)}
              onClick={() => setFilters({ pct: sameRange(filters.pct, ZERO_RANGE) ? [0, 100] : ZERO_RANGE })}
            />
          )}
          {hasRates && (
            <QuickChip
              testId="quick-under20"
              label="Under 20%"
              count={quick.under20}
              active={sameRange(filters.pct, UNDER_20_RANGE)}
              onClick={() =>
                setFilters({ pct: sameRange(filters.pct, UNDER_20_RANGE) ? [0, 100] : UNDER_20_RANGE })
              }
            />
          )}
          <QuickChip
            testId="quick-unchecked"
            label="Not checked by AI"
            count={quick.unchecked}
            active={filters.ai === 'unchecked'}
            onClick={() => setFilters({ ai: filters.ai === 'unchecked' ? 'any' : 'unchecked' })}
          />
          <QuickChip
            testId="quick-fixed"
            label="Fixed by AI"
            count={quick.fixed}
            active={filters.ai === 'fixed'}
            onClick={() => setFilters({ ai: filters.ai === 'fixed' ? 'any' : 'fixed' })}
          />
        </Box>
      </Box>

      <QuestionFilterPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        filters={filters}
        onChange={onFiltersChange}
        questions={rows}
        matchCount={shown.length}
        hasRates={hasRates}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, minHeight: 44 }}>
        <Checkbox
          checked={allShownSelected}
          indeterminate={someShownSelected && !allShownSelected}
          onChange={toggleAllShown}
          disabled={shown.length === 0}
          inputProps={{
            'aria-label': allShownSelected
              ? `Unselect the ${shown.length} shown`
              : `Select all ${shown.length} shown`,
          }}
          sx={{ width: 44, height: 44, ml: '4px' }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600 }} aria-live="polite">
          {narrowed ? `${shown.length} of ${rows.length} questions` : `${rows.length} questions`}
        </Typography>
        {narrowed && (
          <Button onClick={clearFilters} sx={{ textTransform: 'none', minHeight: 36 }}>
            Clear filters
          </Button>
        )}
        {statsLoading && <CircularProgress size={16} sx={{ ml: 1 }} aria-label="Loading results" />}
      </Box>

      {shown.length === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            No question matches these filters.
          </Typography>
          <Button variant="outlined" onClick={clearFilters} sx={{ textTransform: 'none', minHeight: 44 }}>
            Clear filters
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box
            component="ul"
            aria-label="Questions"
            sx={{ listStyle: 'none', p: 0, m: 0, '& > li + li': { borderTop: '1px solid', borderTopColor: 'divider' } }}
          >
            {shown.map((row) => (
              <QuestionRow
                key={row.question_id}
                row={row}
                expanded={expanded.has(row.question_id)}
                selected={selected.has(row.question_id)}
                onToggleSelect={toggleSelect}
                onToggleExpand={toggleExpand}
                onReview={onReview}
                onEdit={onEdit}
              />
            ))}
          </Box>
        </Paper>
      )}

      {selected.size > 0 && (
        <Box
          role="region"
          aria-label="Selected questions"
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            mt: 1.5,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            p: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderTopColor: 'divider',
            boxShadow: '0 -6px 16px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Box sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {selected.size} selected
            </Typography>
            {alreadyChecked.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  {alreadyChecked.length} already checked by AI
                </Typography>
                <Button
                  size="small"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      alreadyChecked.forEach((r) => next.delete(r.question_id));
                      return next;
                    })
                  }
                  sx={{ textTransform: 'none', minHeight: 32, py: 0 }}
                >
                  Skip them
                </Button>
              </Box>
            )}
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setSelected(new Set())} sx={{ minHeight: 48, textTransform: 'none' }}>
            Clear
          </Button>
          {selected.size === 1 && (
            <Button
              variant="outlined"
              startIcon={<EditOutlinedIcon />}
              onClick={() => onEdit(selectedRows[0].question_id)}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Edit
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AutoFixHighOutlinedIcon />}
            onClick={() => onReview(selectedRows.map((r) => r.question_id))}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Check {selected.size} with AI
          </Button>
        </Box>
      )}
    </Box>
  );
}
