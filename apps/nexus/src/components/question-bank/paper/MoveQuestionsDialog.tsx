'use client';

/**
 * Move questions that were filed in the wrong question bank.
 *
 * Two ways in, one dialog:
 *   - push: from a paper's selection bar. The questions are already picked, so
 *     it opens on "Where to".
 *   - pull: from an exam page ("Move questions here"). Step 1 picks the paper
 *     they were wrongly filed in and ticks them; step 2 is "Where to", with the
 *     exam fixed to the page's.
 *
 * Full screen on a phone, a 600px dialog from sm up. The action bar stays put
 * while the list scrolls, and carries the one-line summary of what Move does.
 * Anything the server would refuse (a drawing going to a paper with no Drawing
 * section) is shown before Move, with a button to leave it out.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  ListSubheader,
  MenuItem,
  Radio,
  RadioGroup,
  Skeleton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import {
  QB_EXAM_TYPE_LABELS,
  QB_SECTION_LABELS,
  QB_EXAM_TYPES,
  qbSectionLabel,
  qbSectionsForExam,
  type QBExamType,
} from '@neram/database';
import MathText from '@/components/common/MathText';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import {
  blockedDrawings,
  defaultMoveSection,
  groupBySection,
  homelessQuestions,
  moveSummary,
  moveTargetOptions,
  otherExams,
  sittingLabel,
  type MovablePaper,
  type MovableQuestion,
  type MoveSectionChoice,
} from '@/lib/qb-move-plan';

export interface MoveQuestionsResult {
  paper_id: string;
  created_paper: boolean;
  moved: number;
  copied: number;
}

type MoveQuestionsDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a move, with a sentence for the snackbar. */
  onMoved: (result: MoveQuestionsResult, message: string) => void;
} & (
  | { mode: 'push'; sourcePaper: MovablePaper; questions: MovableQuestion[] }
  | { mode: 'pull'; targetExam: QBExamType }
);

const TAP = { minHeight: 48, textTransform: 'none', borderRadius: 2 } as const;
// The list endpoint the exam pages already read, so this shares their cache.
const PAPERS_KEY = '/api/question-bank/papers?solutions=1';

export default function MoveQuestionsDialog(props: MoveQuestionsDialogProps) {
  const { open, onClose, onMoved, mode } = props;
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken, tokenReady } = useNexusAuthContext();

  const { data: papersRes, isLoading: papersLoading } = useAuthSWR<{ data: MovablePaper[] }>(
    open && tokenReady ? PAPERS_KEY : null,
  );
  const papers = useMemo(() => papersRes?.data ?? [], [papersRes]);

  // Pull: the paper the questions were wrongly filed in, and which are ticked.
  const [step, setStep] = useState<1 | 2>(mode === 'pull' ? 1 : 2);
  const [pullSourceId, setPullSourceId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data: sourceRes, isLoading: sourceLoading } = useAuthSWR<{
    data: { questions: MovableQuestion[] };
  }>(open && mode === 'pull' && pullSourceId ? `/api/question-bank/papers/${pullSourceId}` : null);

  const sourcePaper: MovablePaper | null =
    mode === 'push' ? props.sourcePaper : papers.find((p) => p.id === pullSourceId) ?? null;
  const pullQuestions = useMemo(() => sourceRes?.data?.questions ?? [], [sourceRes]);

  // Where to.
  const examChoices = sourcePaper ? otherExams(sourcePaper.exam_type) : [];
  const [targetExam, setTargetExam] = useState<QBExamType | ''>(mode === 'pull' ? props.targetExam : '');
  const [targetValue, setTargetValue] = useState('');
  const [section, setSection] = useState<MoveSectionChoice>('keep');
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pushQuestions = mode === 'push' ? props.questions : null;
  const chosen: MovableQuestion[] = useMemo(() => {
    const base = pushQuestions ?? pullQuestions.filter((q) => picked.has(q.id));
    return base.filter((q) => !leftOut.has(q.id));
  }, [pushQuestions, pullQuestions, picked, leftOut]);

  const targetOptions = useMemo(
    () => (sourcePaper && targetExam ? moveTargetOptions(sourcePaper, papers, targetExam) : []),
    [sourcePaper, targetExam, papers],
  );
  // The teacher's pick while it is still offered, else the first option (the
  // same sitting), so a new exam never shows the last exam's paper.
  const target = targetOptions.find((o) => o.value === targetValue) ?? targetOptions[0] ?? null;

  // Fresh state every time it opens.
  useEffect(() => {
    if (!open) return;
    setStep(mode === 'pull' ? 1 : 2);
    setPullSourceId('');
    setPicked(new Set());
    setLeftOut(new Set());
    setError(null);
    setSubmitting(false);
    if (mode === 'push') {
      // 2A opens on 2B and 2B on 2A: the two JEE papers are the usual mix-up.
      setTargetExam(otherExams(props.sourcePaper.exam_type)[0]);
    } else {
      setTargetExam(props.targetExam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new exam resets the section to its default.
  useEffect(() => {
    if (targetExam && step === 2) setSection(defaultMoveSection(chosen, targetExam));
    // Only when the exam or the step changes; editing the section must stick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetExam, step]);

  const blocked = blockedDrawings(chosen, section);
  const homeless = targetExam ? homelessQuestions(chosen, targetExam, section) : [];
  const canMove =
    !!sourcePaper && !!targetExam && !!target && chosen.length > 0 && blocked.length === 0 && homeless.length === 0;

  async function handleMove() {
    if (!canMove || !sourcePaper || !target || !targetExam) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/papers/${sourcePaper.id}/move-questions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_ids: chosen.map((q) => q.id),
          ...(target.willCreate ? { target_exam_type: targetExam } : { target_paper_id: target.value }),
          section: section === 'keep' ? null : section,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not move the questions');
        return;
      }
      const result = json.data as MoveQuestionsResult;
      const where = `${QB_EXAM_TYPE_LABELS[targetExam]} ${target.label.replace(/, will be created$/, '')}`;
      onMoved(
        result,
        `Moved ${result.moved} question${result.moved === 1 ? '' : 's'} to ${where}.` +
          (result.copied > 0 ? ` ${result.copied} Maths and Aptitude questions copied there too.` : ''),
      );
    } catch {
      setError('Could not move the questions');
    } finally {
      setSubmitting(false);
    }
  }

  // Pull step 1: papers outside the page's exam, grouped by exam.
  const pullSourceGroups =
    mode === 'pull'
      ? QB_EXAM_TYPES.filter((e) => e !== props.targetExam).map((exam) => ({
          exam,
          papers: papers
            .filter((p) => p.exam_type === exam)
            .sort((a, b) => b.year - a.year || (a.session ?? '').localeCompare(b.session ?? '')),
        }))
      : [];

  const titleId = 'move-questions-title';
  const stepText = mode === 'pull' ? `Step ${step} of 2` : null;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3 } }}
    >
      <DialogTitle id={titleId} sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1, py: 1.5 }}>
        {mode === 'pull' && step === 2 && (
          <IconButton aria-label="Back to the questions" onClick={() => setStep(1)} sx={{ width: 44, height: 44 }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {stepText && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
              {stepText}
            </Typography>
          )}
          <Typography component="span" variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {mode === 'pull'
              ? step === 1
                ? `Move questions into ${QB_EXAM_TYPE_LABELS[props.targetExam]}`
                : 'Where should they go?'
              : `Move ${chosen.length} question${chosen.length === 1 ? '' : 's'} to another question bank`}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={submitting} sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
        {mode === 'pull' && step === 1 ? (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Pick the paper they were uploaded into by mistake, then tick the questions that belong here.
            </Typography>
            <TextField
              select
              fullWidth
              label="Wrongly filed in"
              value={pullSourceId}
              onChange={(e) => {
                setPullSourceId(e.target.value);
                setPicked(new Set());
                setLeftOut(new Set());
              }}
              disabled={papersLoading}
              SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 420 } } } }}
              sx={{ mb: 2, '& .MuiInputBase-root': { minHeight: 48 } }}
            >
              {pullSourceGroups.flatMap((g) => [
                <ListSubheader
                  key={`h-${g.exam}`}
                  sx={{ fontWeight: 700, color: 'text.primary', lineHeight: '40px', bgcolor: 'background.paper' }}
                >
                  {QB_EXAM_TYPE_LABELS[g.exam]}
                </ListSubheader>,
                ...(g.papers.length === 0
                  ? [
                      <MenuItem key={`none-${g.exam}`} disabled sx={{ minHeight: 44, pl: 3 }}>
                        No papers yet
                      </MenuItem>,
                    ]
                  : g.papers.map((p) => (
                      <MenuItem key={p.id} value={p.id} sx={{ minHeight: 44, pl: 3 }}>
                        {sittingLabel(p)}
                      </MenuItem>
                    ))),
              ])}
            </TextField>

            {pullSourceId && (
              <PickList
                loading={sourceLoading}
                questions={pullQuestions}
                picked={picked}
                onChange={setPicked}
              />
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {mode === 'push' && sourcePaper && (
              <Box>
                <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Exam
                </Typography>
                <RadioGroup
                  value={targetExam}
                  onChange={(e) => {
                    setTargetExam(e.target.value as QBExamType);
                    setTargetValue('');
                  }}
                  aria-label="Move to which exam"
                >
                  {QB_EXAM_TYPES.map((exam) => {
                    const isSource = exam === sourcePaper.exam_type;
                    return (
                      <FormControlLabel
                        key={exam}
                        value={exam}
                        disabled={isSource || !examChoices.includes(exam)}
                        control={<Radio />}
                        label={`${QB_EXAM_TYPE_LABELS[exam]}${isSource ? ' (this paper)' : ''}`}
                        sx={{ minHeight: 44, mr: 0 }}
                      />
                    );
                  })}
                </RadioGroup>
              </Box>
            )}

            {targetExam && !papersLoading && targetOptions.length === 0 && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                There is no {QB_EXAM_TYPE_LABELS[targetExam]} paper to move them to yet. Upload that paper first, then
                move them.
              </Alert>
            )}

            {targetExam && targetOptions.length > 0 && (
              <TextField
                select
                fullWidth
                label={`${QB_EXAM_TYPE_LABELS[targetExam]} paper`}
                value={target?.value ?? ''}
                onChange={(e) => setTargetValue(e.target.value)}
                disabled={papersLoading}
                helperText={target?.willCreate ? 'This paper does not exist yet. Moving creates it.' : ' '}
                sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
              >
                {targetOptions.map((o) => (
                  <MenuItem key={o.value} value={o.value} sx={{ minHeight: 44 }}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {targetExam && (
              <TextField
                select
                fullWidth
                label="Section"
                value={section}
                onChange={(e) => setSection(e.target.value as MoveSectionChoice)}
                sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
              >
                <MenuItem value="keep" sx={{ minHeight: 44 }}>
                  Keep their current section
                </MenuItem>
                {qbSectionsForExam(targetExam).map((s) => (
                  <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>
                    {QB_SECTION_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {homeless.length > 0 && targetExam && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                {homeless.length} of these {homeless.length === 1 ? 'is' : 'are'} in{' '}
                {Array.from(new Set(homeless.map((q) => qbSectionLabel(q.section)))).join(' and ')}, which{' '}
                {QB_EXAM_TYPE_LABELS[targetExam]} does not have. Pick a section above.
              </Alert>
            )}

            {blocked.length > 0 && (
              <Alert
                severity="warning"
                sx={{ borderRadius: 2, alignItems: 'center' }}
                action={
                  <Button
                    color="inherit"
                    onClick={() => setLeftOut((prev) => new Set([...Array.from(prev), ...blocked.map((q) => q.id)]))}
                    sx={{ ...TAP, minHeight: 44, whiteSpace: 'nowrap' }}
                  >
                    Leave {blocked.length === 1 ? 'it' : 'them'} out
                  </Button>
                }
              >
                {blocked.length} drawing question{blocked.length === 1 ? '' : 's'} can only go into a Drawing section.
              </Alert>
            )}

            {targetExam === 'JEE_PAPER_2B' && target && (
              <Typography variant="body2" color="text.secondary">
                If that paper has no Maths or Aptitude yet, they are copied in from JEE Paper 2A (B.Arch) of the same
                sitting.
              </Typography>
            )}

            {error && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {error}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: { xs: 2, sm: 3 },
          py: 1.5,
          gap: 1,
          flexWrap: 'wrap',
          // Clear of the iOS home bar when full screen.
          pb: fullScreen ? 'calc(12px + env(safe-area-inset-bottom))' : 1.5,
        }}
      >
        {mode === 'pull' && step === 1 ? (
          <>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' } }}
              aria-live="polite"
            >
              {picked.size > 0 ? `${picked.size} selected` : 'Tick the questions to move'}
            </Typography>
            <Box sx={{ flex: 1, display: { xs: 'block', sm: 'none' } }} />
            <Button onClick={onClose} sx={TAP}>
              Cancel
            </Button>
            <Button variant="contained" disabled={picked.size === 0} onClick={() => setStep(2)} sx={TAP}>
              Next
            </Button>
          </>
        ) : (
          <>
            {sourcePaper && targetExam && chosen.length > 0 && (
              <Typography variant="body2" sx={{ flex: '1 1 100%', mb: 0.5 }} aria-live="polite">
                {moveSummary(chosen.length, sourcePaper, targetExam, target, section)}
              </Typography>
            )}
            {chosen.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 100%' }}>
                Nothing left to move.
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose} disabled={submitting} sx={TAP}>
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<DriveFileMoveOutlinedIcon />}
              disabled={!canMove || submitting}
              onClick={handleMove}
              sx={TAP}
            >
              {submitting ? 'Moving...' : `Move ${chosen.length}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** Pull step 1: the wrongly filed paper's questions, by section, with a select-all per section. */
function PickList({
  loading,
  questions,
  picked,
  onChange,
}: {
  loading: boolean;
  questions: MovableQuestion[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} />
        ))}
      </Box>
    );
  }
  if (questions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        This paper has no questions.
      </Typography>
    );
  }

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(picked);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {groupBySection(questions).map((group) => {
        const ids = group.questions.map((q) => q.id);
        const all = ids.every((id) => picked.has(id));
        const label = qbSectionLabel(group.section || null);
        return (
          <Box key={group.section || 'none'} component="section" aria-label={label}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                mb: 0.5,
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
                {label}{' '}
                <Typography component="span" variant="body2" color="text.secondary">
                  ({group.questions.length})
                </Typography>
              </Typography>
              <Button size="small" onClick={() => toggle(ids, !all)} sx={{ ...TAP, minHeight: 44 }}>
                {all ? `Untick all ${group.questions.length}` : `Select all ${group.questions.length} in ${label}`}
              </Button>
            </Box>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              {group.questions.map((q, i) => {
                const checked = picked.has(q.id);
                return (
                  <Box
                    key={q.id}
                    component="label"
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                      minHeight: 56,
                      px: 1,
                      py: 0.75,
                      cursor: 'pointer',
                      borderTop: i === 0 ? 0 : 1,
                      borderColor: 'divider',
                      bgcolor: checked ? 'action.selected' : 'transparent',
                      transition: 'background-color 150ms',
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      '&:hover': { bgcolor: checked ? 'action.selected' : 'action.hover' },
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={(e) => toggle([q.id], e.target.checked)}
                      inputProps={{ 'aria-label': `Question ${q.display_order ?? ''}` }}
                      sx={{ p: 1.25 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0, pt: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Q{q.display_order ?? '?'}
                        </Typography>
                        {q.question_format === 'DRAWING_PROMPT' && (
                          <Chip size="small" label="Drawing" variant="outlined" sx={{ height: 22 }} />
                        )}
                      </Box>
                      <MathText
                        text={q.question_text || 'No question text'}
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

