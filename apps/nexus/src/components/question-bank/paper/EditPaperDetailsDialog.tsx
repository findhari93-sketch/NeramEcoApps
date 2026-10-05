'use client';

/**
 * Correct a paper's exam, year, session or shift after upload.
 *
 * Bulk upload asks for them once, and a paper saved as "Session 1 (FN)" when it
 * was the afternoon paper had no way back short of deleting it and uploading
 * all 83 questions again. The route moves the paper and its question source
 * rows together (nexus_qb_rename_paper), so the questions, answers and
 * videos stay exactly where they are; only the name changes.
 *
 * A paper uploaded into the wrong question bank (a B.Planning paper saved as
 * JEE Paper 2A) moves whole the same way, through nexus_qb_change_paper_exam:
 * same paper, new exam. Sections the new exam lacks are mapped here first, and
 * drawing prompts with nowhere to go stay behind under the old name.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { QB_EXAM_TYPES, QB_EXAM_TYPE_LABELS, QB_SECTION_LABELS, type QBExamType } from '@neram/database';
import {
  PAPER_YEAR_MIN,
  paperYearMax,
  parsePaperIdentityEdit,
  sessionForExam,
  sessionOptionsFor,
  type PaperShift,
} from '@/lib/qb-paper-identity';
import {
  defaultSectionMap,
  leftBehindDrawings,
  paperExamRemaps,
  type MovableQuestion,
  type PaperSectionMap,
} from '@/lib/qb-move-plan';

export interface EditablePaper {
  id: string;
  exam_type: string;
  year: number;
  session: string | null;
  shift: string | null;
}

/** What a move to another exam did, beyond the rename. */
export interface PaperExamMove {
  remapped: number;
  left_behind: number;
  left_paper_id: string | null;
}

export interface EditPaperDetailsDialogProps {
  open: boolean;
  paper: EditablePaper;
  /** The paper's questions, so a change of exam can show which sections need a new home. */
  questions?: MovableQuestion[];
  onClose: () => void;
  getToken: () => Promise<string | null>;
  /** After a save, with the paper as stored, plus the move when the exam changed. */
  onSaved: (paper: EditablePaper, move?: PaperExamMove) => void;
}

const NO_SESSION = '__none__';
type ShiftChoice = PaperShift | 'none';

const examLabel = (exam: string) => QB_EXAM_TYPE_LABELS[exam as QBExamType] ?? exam;

export default function EditPaperDetailsDialog({
  open,
  paper,
  questions = [],
  onClose,
  getToken,
  onSaved,
}: EditPaperDetailsDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [exam, setExam] = useState<string>(paper.exam_type);
  const [year, setYear] = useState(paper.year);
  const [session, setSession] = useState(paper.session ?? NO_SESSION);
  const [shift, setShift] = useState<ShiftChoice>((paper.shift as PaperShift | null) ?? 'none');
  const [sectionMap, setSectionMap] = useState<PaperSectionMap>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the paper as it is each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setExam(paper.exam_type);
    setYear(paper.year);
    setSession(paper.session ?? NO_SESSION);
    setShift((paper.shift as PaperShift | null) ?? 'none');
    setSectionMap({});
    setError(null);
  }, [open, paper.exam_type, paper.year, paper.session, paper.shift]);

  const examChanged = exam !== paper.exam_type;
  const targetExam = exam as QBExamType;

  function pickExam(next: string) {
    setExam(next);
    setError(null);
    const current = session === NO_SESSION ? null : session;
    setSession(sessionForExam(current, exam, next) ?? NO_SESSION);
    setSectionMap(next === paper.exam_type ? {} : defaultSectionMap(questions, next as QBExamType));
  }

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = paperYearMax(); y >= PAPER_YEAR_MIN; y -= 1) list.push(y);
    return list;
  }, []);

  // The exam's usual sessions, plus whatever odd value is chosen or an old
  // upload stored, so opening the dialog never silently changes it.
  const sessionOptions = useMemo(() => {
    const options = sessionOptionsFor(exam).map((o) => ({ value: o.value, label: `${o.label} (${o.hint})` }));
    for (const odd of [paper.session, session === NO_SESSION ? null : session]) {
      if (odd && !options.some((o) => o.value === odd)) options.push({ value: odd, label: odd });
    }
    return options;
  }, [exam, paper.session, session]);

  const remaps = useMemo(() => (examChanged ? paperExamRemaps(questions, targetExam) : []), [examChanged, questions, targetExam]);
  const leftBehind = useMemo(
    () => (examChanged ? leftBehindDrawings(questions, targetExam, sectionMap) : []),
    [examChanged, questions, targetExam, sectionMap],
  );
  const everythingLeft = questions.length > 0 && leftBehind.length === questions.length;

  const next = {
    year,
    session: session === NO_SESSION ? null : session,
    shift: shift === 'none' ? null : shift,
  };
  const unchanged =
    !examChanged &&
    next.year === paper.year &&
    (next.session ?? null) === (paper.session ?? null) &&
    next.shift === (paper.shift ?? null);

  const nameOf = (examType: string, n: { year: number; session: string | null; shift: string | null }) =>
    `${examLabel(examType)} ${n.year}${n.session ? ` ${n.session}` : ''}${
      n.shift ? ` (${n.shift === 'forenoon' ? 'FN' : 'AN'})` : ''
    }`;
  const preview = nameOf(exam, next);

  async function save() {
    const checked = parsePaperIdentityEdit(next, paper);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const body = examChanged
        ? { ...checked.value, exam_type: exam, section_map: sectionMap }
        : checked.value;
      const res = await fetch(`/api/question-bank/papers/${paper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || 'The paper could not be saved. Try again.');
        return;
      }
      const saved = { ...paper, ...(examChanged ? { exam_type: exam } : {}), ...(json?.data ?? checked.value) };
      if (examChanged) {
        onSaved(saved, {
          remapped: json?.moved?.remapped ?? 0,
          left_behind: json?.moved?.left_behind ?? 0,
          left_paper_id: json?.moved?.left_paper_id ?? null,
        });
      } else {
        onSaved(saved);
      }
      onClose();
    } catch {
      setError('The connection dropped. Check it and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={fullScreen}
      PaperProps={{ 'aria-labelledby': 'edit-paper-details-title' } as Record<string, string>}
    >
      <DialogTitle id="edit-paper-details-title">Edit paper details</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            Fix the question bank, year, session or shift picked wrongly at upload. The questions, answer keys and
            videos stay with the paper.
          </Typography>

          <Box>
            <Typography id="edit-paper-exam-label" variant="body2" fontWeight={600} sx={{ mb: 0.25 }}>
              Question bank
            </Typography>
            <RadioGroup aria-labelledby="edit-paper-exam-label" value={exam} onChange={(e) => pickExam(e.target.value)}>
              {QB_EXAM_TYPES.map((e) => (
                <FormControlLabel
                  key={e}
                  value={e}
                  control={<Radio />}
                  label={
                    <span>
                      {examLabel(e)}
                      {e === paper.exam_type && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          Current
                        </Typography>
                      )}
                    </span>
                  }
                  sx={{ minHeight: 44, mr: 0 }}
                />
              ))}
            </RadioGroup>
          </Box>

          <TextField
            select
            label="Year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            fullWidth
            SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}
          >
            {years.map((y) => (
              <MenuItem key={y} value={y} sx={{ minHeight: 44 }}>
                {y}
              </MenuItem>
            ))}
          </TextField>

          <TextField select label="Session" value={session} onChange={(e) => setSession(e.target.value)} fullWidth>
            <MenuItem value={NO_SESSION} sx={{ minHeight: 44 }}>
              No session (one paper that year)
            </MenuItem>
            {sessionOptions.map((o) => (
              <MenuItem key={o.value} value={o.value} sx={{ minHeight: 44 }}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Typography id="edit-paper-shift-label" variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
              Shift
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={shift}
              onChange={(_, value: ShiftChoice | null) => value && setShift(value)}
              aria-labelledby="edit-paper-shift-label"
            >
              <ToggleButton value="forenoon" sx={{ minHeight: 44, textTransform: 'none' }}>
                Forenoon (FN)
              </ToggleButton>
              <ToggleButton value="afternoon" sx={{ minHeight: 44, textTransform: 'none' }}>
                Afternoon (AN)
              </ToggleButton>
              <ToggleButton value="none" sx={{ minHeight: 44, textTransform: 'none' }}>
                None
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {remaps.map((r) => (
            <TextField
              key={r.section}
              select
              fullWidth
              label={`${QB_SECTION_LABELS[r.section]} questions (${r.count}) go to`}
              helperText={`${examLabel(exam)} has no ${QB_SECTION_LABELS[r.section]} section.`}
              value={sectionMap[r.section] ?? ''}
              onChange={(e) => setSectionMap((m) => ({ ...m, [r.section]: e.target.value }))}
            >
              {r.options.map((s) => (
                <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>
                  {QB_SECTION_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
          ))}

          {examChanged && leftBehind.length > 0 && !everythingLeft && (
            <Alert severity="info">
              {leftBehind.length === 1 ? '1 drawing question stays' : `${leftBehind.length} drawing questions stay`} as{' '}
              {nameOf(paper.exam_type, paper)}, on a paper of their own, since {examLabel(exam)} has no Drawing section.
            </Alert>
          )}

          {examChanged && everythingLeft && (
            <Alert severity="error">
              Every question on this paper is a drawing, and {examLabel(exam)} has no Drawing section. Pick another
              question bank.
            </Alert>
          )}

          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
              {examChanged ? 'Moves to' : 'Saves as'}
            </Typography>
            <Typography variant="body1" fontWeight={700} data-testid="paper-details-preview">
              {preview}
            </Typography>
            {examChanged && !everythingLeft && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                The whole paper moves: its questions, answers, solutions, videos, student attempts and reports.
              </Typography>
            )}
          </Box>

          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || unchanged || everythingLeft}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          // The theme's primary gradient also paints the disabled state, so a
          // refused move would look pressable without this.
          sx={{ minHeight: 44, textTransform: 'none', '&.Mui-disabled': { background: 'none', bgcolor: 'action.disabledBackground', color: 'text.secondary' } }}
        >
          {saving ? (examChanged ? 'Moving...' : 'Saving...') : examChanged ? 'Move paper' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
