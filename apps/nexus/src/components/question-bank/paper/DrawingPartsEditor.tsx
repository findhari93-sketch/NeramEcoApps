'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  IconButton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  alpha,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import type { QBDrawingParts, QBDrawingPartsMode } from '@neram/database';
import MathField from '@/components/common/MathField';
import DrawingSolutionFields from '../DrawingSolutionFields';
import { PartBadge, PartsOrDivider } from '../DrawingPartsView';
import type { ImageState } from '@/lib/bulk-upload-schema';
import {
  MAX_DRAWING_PARTS,
  MIN_DRAWING_PARTS,
  composeDrawingPartsText,
  drawingPartsSummary,
  normalizeDrawingParts,
  partIdAt,
  partLabelAt,
  suggestDrawingParts,
} from '@/lib/drawing-parts';

/**
 * Split one drawing question into parts, each with its own text and solution.
 *
 * Built for the papers as printed: 2014 Q81 is 1(a) and 1(b), both answered;
 * 2014 Q82 and every paper since 2019 is "Draw X OR draw Y". The teacher picks
 * which with one toggle, and the student view says it in words.
 *
 * Nothing here saves. The form's one Save sends drawing_parts, and the server
 * rebuilds question_text from them (applyDrawingPartsToWrite).
 */

// ---------------------------------------------------------------------------
// Form shape
// ---------------------------------------------------------------------------

export interface DrawingPartForm {
  /** React key only. Survives reordering and removal; the stored id is positional. */
  key: string;
  text: string;
  text_hi: string;
  marks: string;
  solution_image?: ImageState;
  solution_video_url: string;
}

export interface DrawingPartsForm {
  mode: QBDrawingPartsMode;
  stem: string;
  stem_hi: string;
  items: DrawingPartForm[];
}

let keySeq = 0;
function newPartKey(): string {
  keySeq += 1;
  return `part-${Date.now()}-${keySeq}`;
}

function emptyPart(text = ''): DrawingPartForm {
  return { key: newPartKey(), text, text_hi: '', marks: '', solution_video_url: '' };
}

export function partsToForm(parts: QBDrawingParts | null | undefined): DrawingPartsForm | null {
  if (!parts) return null;
  return {
    mode: parts.mode,
    stem: parts.stem ?? '',
    stem_hi: parts.stem_hi ?? '',
    items: parts.items.map((p) => ({
      key: newPartKey(),
      text: p.text,
      text_hi: p.text_hi ?? '',
      marks: p.marks != null ? String(p.marks) : '',
      solution_image: p.solution_image_url ? { url: p.solution_image_url, uploaded: true } : undefined,
      solution_video_url: p.solution_video_url ?? '',
    })),
  };
}

/** The request body shape. Validation and relabelling happen on the server. */
export function formToParts(form: DrawingPartsForm): QBDrawingParts {
  return {
    mode: form.mode,
    stem: form.stem.trim() || null,
    stem_hi: form.stem_hi.trim() || null,
    items: form.items.map((item, i) => ({
      id: partIdAt(i),
      label: partLabelAt(i),
      text: item.text,
      text_hi: item.text_hi.trim() || null,
      marks: form.mode === 'all' && item.marks ? Number(item.marks) : null,
      solution_image_url: item.solution_image?.uploaded ? item.solution_image.url : null,
      solution_video_url: item.solution_video_url.trim() || null,
    })),
  };
}

/** What stops a save, in words a teacher can act on. Null when the parts are fine. */
export function partsFormProblem(form: DrawingPartsForm): string | null {
  const result = normalizeDrawingParts(formToParts(form));
  return result.ok ? null : result.error;
}

/** Sum of part marks when every part in an "answer all" question has one. */
export function partsFormTotalMarks(form: DrawingPartsForm): number | null {
  if (form.mode !== 'all') return null;
  if (!form.items.every((p) => Number(p.marks) > 0)) return null;
  return form.items.reduce((sum, p) => sum + Number(p.marks), 0);
}

/**
 * The question as one text again, for "Merge into one question". Uses the same
 * composer the server uses, and falls back to joining whatever text there is
 * when a part is still empty.
 */
export function mergePartsText(form: DrawingPartsForm): { text: string; text_hi: string | null } {
  const result = normalizeDrawingParts(formToParts(form));
  if (result.ok) {
    return {
      text: composeDrawingPartsText(result.parts, 'en') ?? '',
      text_hi: composeDrawingPartsText(result.parts, 'hi'),
    };
  }
  const joiner = form.mode === 'any_one' ? '\n\nOR\n\n' : '\n\n';
  const body = form.items.map((p) => p.text.trim()).filter(Boolean).join(joiner);
  return { text: [form.stem.trim(), body].filter(Boolean).join('\n\n'), text_hi: null };
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Suggest a split
// ---------------------------------------------------------------------------

interface SplitPromptProps {
  text: string;
  textHi: string;
  onSplit: (form: DrawingPartsForm, questionMarks: number | null) => void;
}

/**
 * Under a single question text. When the text reads like parts, say so and
 * show the split before anything happens. Otherwise offer a plain split, which
 * puts the whole text in A and leaves B for the teacher to cut into.
 */
export function SplitIntoPartsPrompt({ text, textHi, onSplit }: SplitPromptProps) {
  const [dismissed, setDismissed] = useState(false);
  const suggestion = useMemo(() => suggestDrawingParts(text, textHi), [text, textHi]);

  const manualSplit = () =>
    onSplit({ mode: 'any_one', stem: '', stem_hi: '', items: [emptyPart(text.trim()), emptyPart()] }, null);

  if (!suggestion || dismissed) {
    return (
      <Button
        size="small"
        startIcon={<CallSplitIcon />}
        onClick={manualSplit}
        sx={{ textTransform: 'none', minHeight: 44, mt: 0.5 }}
      >
        Split into parts
      </Button>
    );
  }

  const { parts, questionMarks } = suggestion;
  const n = parts.items.length;
  const labels = parts.items.map((p) => p.label);
  const anyOne = parts.mode === 'any_one';

  return (
    <Box
      role="region"
      aria-label="Split suggestion"
      sx={(theme) => ({
        mt: 1,
        mb: 1.5,
        p: 1.5,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.35),
        bgcolor: alpha(theme.palette.primary.main, 0.05),
      })}
    >
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <CallSplitIcon color="primary" aria-hidden sx={{ mt: '2px' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {anyOne
              ? `This looks like ${n} options joined by OR`
              : `This looks like ${n} parts, ${joinLabels(labels.map((l) => `(${l.toLowerCase()})`))}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {anyOne
              ? 'Split it so each option gets its own solution, and students see they attempt any one.'
              : 'Split it so each part gets its own solution and marks.'}
          </Typography>
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mb: 1 }}>
            {parts.items.map((p) => (
              <Box
                component="li"
                key={p.id}
                sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 0.75 }}
              >
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontWeight: 700, minWidth: 20, color: 'primary.main' }}
                >
                  {p.label}
                </Typography>
                <Typography
                  component="span"
                  variant="body2"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    minWidth: 0,
                  }}
                >
                  {p.text}
                  {!anyOne && p.marks ? ` (${p.marks} marks)` : ''}
                </Typography>
              </Box>
            ))}
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => onSplit(partsToForm(parts)!, questionMarks)}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Split into {joinLabels(labels)}
            </Button>
            <Button
              size="small"
              onClick={() => setDismissed(true)}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Not now
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

interface EditorProps {
  value: DrawingPartsForm;
  onChange: (next: DrawingPartsForm) => void;
  /** Merge back into one question. The editor has already asked when a solution would be lost. */
  onMerge: () => void;
  questionNumber: number | null;
  showHindi: boolean;
  getToken: () => Promise<string | null>;
  categories?: string[] | null;
  /** The question's own marks, used for the prompt of an either/or option. */
  questionMarks: number | null;
}

type Pending = { kind: 'merge' } | { kind: 'remove'; index: number } | null;

export default function DrawingPartsEditor({
  value,
  onChange,
  onMerge,
  questionNumber,
  showHindi,
  getToken,
  categories,
  questionMarks,
}: EditorProps) {
  const [pending, setPending] = useState<Pending>(null);
  const anyOne = value.mode === 'any_one';
  const total = partsFormTotalMarks(value);
  const noun = anyOne ? 'Option' : 'Part';

  const patchItem = (index: number, patch: Partial<DrawingPartForm>) =>
    onChange({
      ...value,
      items: value.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });

  const removeItem = (index: number) =>
    onChange({ ...value, items: value.items.filter((_, i) => i !== index) });

  const requestRemove = (index: number) => {
    const item = value.items[index];
    if (item.text.trim() || item.solution_image || item.solution_video_url.trim()) {
      setPending({ kind: 'remove', index });
    } else {
      removeItem(index);
    }
  };

  const requestMerge = () => {
    const hasSolutions = value.items.some((p) => p.solution_image || p.solution_video_url.trim());
    if (hasSolutions) setPending({ kind: 'merge' });
    else onMerge();
  };

  const confirmPending = () => {
    if (pending?.kind === 'remove') removeItem(pending.index);
    if (pending?.kind === 'merge') onMerge();
    setPending(null);
  };

  const summary = drawingPartsSummary({
    mode: value.mode,
    items: value.items.map((_, i) => ({ id: partIdAt(i), label: partLabelAt(i), text: '' })),
  });

  return (
    <Box
      component="section"
      aria-labelledby="drawing-parts-heading"
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: { xs: 1.5, md: 2 }, mb: 1.5 }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}
      >
        <Typography id="drawing-parts-heading" variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
          Parts
        </Typography>
        <Chip size="small" label={summary} variant="outlined" color="primary" />
        <Button size="small" onClick={requestMerge} sx={{ textTransform: 'none', minHeight: 44, ml: 'auto !important' }}>
          Merge into one question
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.75 }} id="parts-mode-label">
        How students answer
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        color="primary"
        value={value.mode}
        onChange={(_, mode: QBDrawingPartsMode | null) => {
          if (mode) onChange({ ...value, mode });
        }}
        aria-labelledby="parts-mode-label"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="any_one" sx={{ minHeight: 48, textTransform: 'none', gap: 1 }}>
          <AltRouteIcon fontSize="small" aria-hidden />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Attempt any one</Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Any one</Box>
        </ToggleButton>
        <ToggleButton value="all" sx={{ minHeight: 48, textTransform: 'none', gap: 1 }}>
          <ChecklistIcon fontSize="small" aria-hidden />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Answer all parts</Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>All parts</Box>
        </ToggleButton>
      </ToggleButtonGroup>

      <TextField
        label="Shared instruction (optional)"
        value={value.stem}
        onChange={(e) => onChange({ ...value, stem: e.target.value })}
        multiline
        minRows={1}
        fullWidth
        size="small"
        helperText='Printed before the parts, for example "Attempt any ONE of the following:"'
        sx={{ mb: showHindi ? 1.5 : 2 }}
      />
      {showHindi && (
        <TextField
          label="Shared instruction (Hindi)"
          value={value.stem_hi}
          onChange={(e) => onChange({ ...value, stem_hi: e.target.value })}
          multiline
          minRows={1}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
      )}

      {value.items.map((item, i) => {
        const label = partLabelAt(i);
        const hasSolution = Boolean(item.solution_image);
        const promptText = [value.stem.trim(), item.text.trim()].filter(Boolean).join('\n\n');
        const marks = anyOne ? questionMarks : item.marks ? Number(item.marks) : null;
        return (
          <Fragment key={item.key}>
            {anyOne && i > 0 && <PartsOrDivider />}
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                overflow: 'hidden',
                mb: anyOne ? 0 : 1.5,
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 1.5, py: 1, bgcolor: 'action.hover' }}
              >
                <PartBadge>{questionNumber != null ? `${questionNumber}${label}` : label}</PartBadge>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                  {noun} {label}
                </Typography>
                {!anyOne && (
                  <TextField
                    label="Marks"
                    value={item.marks}
                    onChange={(e) => patchItem(i, { marks: e.target.value.replace(/[^0-9]/g, '') })}
                    size="small"
                    inputProps={{ inputMode: 'numeric', 'aria-label': `Marks for part ${label}` }}
                    sx={{ width: 88, bgcolor: 'background.paper' }}
                  />
                )}
                {value.items.length > MIN_DRAWING_PARTS && (
                  <IconButton
                    aria-label={`Remove ${noun.toLowerCase()} ${label}`}
                    onClick={() => requestRemove(i)}
                    sx={{ width: 44, height: 44 }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>

              <Box sx={{ p: 1.5 }}>
                <MathField
                  label={`${noun} ${label} text`}
                  value={item.text}
                  onChange={(next) => patchItem(i, { text: next })}
                  minRows={2}
                />
                {showHindi && (
                  <TextField
                    label={`${noun} ${label} text (Hindi)`}
                    value={item.text_hi}
                    onChange={(e) => patchItem(i, { text_hi: e.target.value })}
                    multiline
                    minRows={1}
                    maxRows={4}
                    fullWidth
                    size="small"
                    sx={{ mb: 1 }}
                  />
                )}

                <Accordion disableGutters variant="outlined" sx={{ mt: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Solution for {label}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {hasSolution ? (
                          <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} aria-hidden />
                        ) : (
                          <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'text.disabled' }} aria-hidden />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {hasSolution ? 'Solution image added' : 'No solution yet'}
                        </Typography>
                      </Stack>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <DrawingSolutionFields
                      value={{ solution_image: item.solution_image, solution_video_url: item.solution_video_url }}
                      onChange={(patch) => patchItem(i, patch)}
                      getToken={getToken}
                      promptText={promptText}
                      marks={marks}
                      categories={categories}
                      labelSuffix={`for ${label}`}
                    />
                  </AccordionDetails>
                </Accordion>
              </Box>
            </Box>
          </Fragment>
        );
      })}

      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mt: anyOne ? 1.5 : 0, flexWrap: 'wrap', rowGap: 1 }}
      >
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onChange({ ...value, items: [...value.items, emptyPart()] })}
          disabled={value.items.length >= MAX_DRAWING_PARTS}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Add {noun.toLowerCase()}
        </Button>
        <Box sx={{ flex: 1 }} />
        {!anyOne && (
          <Typography variant="body2" color="text.secondary">
            {total != null ? `Total: ${total} marks` : 'Give every part its marks to total them'}
          </Typography>
        )}
      </Stack>

      <Dialog open={pending !== null} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {pending?.kind === 'merge'
            ? 'Merge into one question?'
            : `Remove ${noun.toLowerCase()} ${pending?.kind === 'remove' ? partLabelAt(pending.index) : ''}?`}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pending?.kind === 'merge'
              ? 'The parts become one text again. The question keeps one solution, from the first part that has one, and the others are removed when you save.'
              : 'Its text and solution are removed when you save. The parts after it move up a letter.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button onClick={confirmPending} color="error" variant="contained" sx={{ minHeight: 44 }}>
            {pending?.kind === 'merge' ? 'Merge' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
