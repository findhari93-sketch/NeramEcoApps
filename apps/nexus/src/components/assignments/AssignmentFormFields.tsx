'use client';

/**
 * The shared, controlled field set for a class assignment. This is the single
 * source of truth for how an assignment is edited, used by:
 *   - NewAssignmentDialog (manual create + edit)
 *   - PasteAssignmentsDialog (AI import "Preview" step, one instance per draft)
 *
 * It is fully controlled: it reads everything from `value` and reports every
 * change through `onChange(patch)`. It owns no assignment id, so it works both
 * before an assignment exists (AI preview, manual create phase 1) and while
 * editing one. Document "materials" (upload / pick / link) live OUTSIDE this
 * component because they need an existing assignment id.
 */
import { useState } from 'react';
import {
  Box, Typography, TextField, Stack, ToggleButtonGroup, ToggleButton, Collapse,
  MenuItem, Button, Chip, ImageUploadList, alpha, useTheme,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LinkIcon from '@mui/icons-material/Link';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import type { AssignmentFormat } from '@/lib/assignment-format';
import {
  ASSIGNMENT_MODES,
  assignmentTypeForMode,
  defaultEvaluationForMode,
  modeSwitchBlockedReason,
  type AssignmentMode,
} from '@/lib/assignment-mode';

export type AssignmentType = 'drawing' | 'document';
export type AssignmentEvaluation = 'marks' | 'stars';

export type AssignmentTiming = 'prework' | 'homework';

const MODE_ICON: Record<AssignmentMode, typeof QuizOutlinedIcon> = {
  questions: QuizOutlinedIcon,
  upload: UploadFileOutlinedIcon,
  drawing: BrushOutlinedIcon,
};

export interface AssignmentDraft {
  type: AssignmentType;
  /**
   * What students will do. Derived from `type` plus whether a paper is attached,
   * but held on the draft too because the picker needs to distinguish the two
   * document modes BEFORE any question exists.
   */
  mode: AssignmentMode;
  /** What a finished piece of work looks like (optional, its own block). */
  expectedOutcome: string;
  /** What to concentrate on, one point per line (optional, rendered as bullets). */
  focusPoints: string;
  /**
   * Whether the work is due BEFORE the class it is attached to, or set in it.
   * Only meaningful with a class context, so the control is hidden without one.
   */
  timing: AssignmentTiming;
  title: string;
  instructions: string;
  classDate: string;
  dueDate: string;
  format: AssignmentFormat;
  /** How the work is graded: numeric marks (out of maxMarks) or a 1-5 star rating. */
  evaluationType: AssignmentEvaluation;
  maxMarks: string;
  category: string;
  refImageUrls: string[];
  recordingUrl: string;
  catchupDays: string;
}

export const DRAWING_CATEGORIES: { value: string; label: string }[] = [
  { value: '3d_composition', label: '3D composition' },
  { value: '2d_composition', label: '2D composition' },
  { value: 'kit_sculpture', label: 'Kit / sculpture' },
];

/**
 * A fresh draft with the same defaults the manual create form starts from.
 *
 * It opens on "Answer questions" because that is the mode teachers could not
 * find. The old default was Drawing, which meant the question path was two
 * decisions away from where the form started.
 */
export function blankDraft(classDate: string): AssignmentDraft {
  return {
    type: 'document',
    mode: 'questions',
    expectedOutcome: '',
    focusPoints: '',
    timing: 'homework',
    title: '',
    instructions: '',
    classDate,
    dueDate: '',
    format: 'pdf_or_image',
    evaluationType: 'marks', // written work is marked; drawings switch to stars
    maxMarks: '10',
    category: '3d_composition',
    refImageUrls: [],
    recordingUrl: '',
    catchupDays: '7',
  };
}

interface AssignmentFormFieldsProps {
  value: AssignmentDraft;
  onChange: (patch: Partial<AssignmentDraft>) => void;
  /** Injected uploader for a drawing reference image (auth/bucket stay per-caller). */
  uploadReference: (file: File) => Promise<{ url: string }>;
  /** Injected resolver for a pasted OneDrive/SharePoint image link -> a public url. */
  linkReference: (url: string) => Promise<{ url: string }>;
  /**
   * Lock the mode picker (true only when editing an existing assignment).
   * A locked picker still SHOWS every mode, greyed, with the reason. Hiding the
   * others is what made the question path invisible in the first place.
   */
  lockType?: boolean;
  /**
   * The class this work is attached to, when there is one. Used to say where the
   * recording comes from, so a teacher does not paste a link that already exists.
   */
  classContextLabel?: string;
  /**
   * Show the Before class / After class control. Only pass this with a class
   * context: outside one, "before the class" has no referent.
   */
  showTiming?: boolean;
  /** "Thu 20 Aug, 7:00 PM", so the derived prework deadline is legible. */
  classStartLabel?: string;
  /** Show the drawing-category select (create / preview only, hidden on edit). */
  showCategory?: boolean;
  /**
   * Optional: run when the reference images change (e.g. edit mode syncs them to the
   * server immediately). Defaults to patching `refImageUrls` on the draft.
   */
  onReferenceChange?: (urls: string[]) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  /** Autofocus the title (only when a single form is on screen). */
  autoFocusTitle?: boolean;
  /**
   * Catch a pasted image for the reference uploader anywhere in the surface.
   * Enable only when THIS form is the sole image target on screen (the single
   * create/edit dialog, or the currently-expanded card in the paste-preview list),
   * otherwise every mounted form would grab the same paste.
   */
  enableReferencePaste?: boolean;
}

export default function AssignmentFormFields({
  value,
  onChange,
  uploadReference,
  linkReference,
  lockType = false,
  classContextLabel,
  showTiming = false,
  classStartLabel,
  showCategory = true,
  onReferenceChange,
  showAdvanced,
  onToggleAdvanced,
  autoFocusTitle = false,
  enableReferencePaste = false,
}: AssignmentFormFieldsProps) {
  const theme = useTheme();
  const { type, mode } = value;
  const MAX_REFS = 6;
  const handleReference = (urls: string[]) =>
    onReferenceChange ? onReferenceChange(urls) : onChange({ refImageUrls: urls });

  const [linkInput, setLinkInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  // "Custom" is active when the max is not one of the quick presets.
  const [customMarks, setCustomMarks] = useState(() => !['10', '100'].includes(value.maxMarks));
  const addLink = async () => {
    const u = linkInput.trim();
    if (!u || value.refImageUrls.length >= MAX_REFS) return;
    setLinking(true);
    setLinkError('');
    try {
      const { url } = await linkReference(u);
      handleReference([...value.refImageUrls, url]);
      setLinkInput('');
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Could not import that link.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <Stack spacing={2}>
      {/*
        The first decision, and the one that used to be asked wrongly.
        "Drawing or Document" is a question about storage; this asks what the
        student actually does, which is the only framing that puts multiple
        choice and numerical on the opening screen where they can be found.
        Stacked at 375px so each card keeps its blurb; a row from `sm`.
      */}
      <Box>
        <Typography component="h3" variant="body2" sx={{ fontWeight: 700, mb: 1 }} id="assignment-mode-label">
          What will students do?
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          role="radiogroup"
          aria-labelledby="assignment-mode-label"
        >
          {ASSIGNMENT_MODES.map((m) => {
            const Icon = MODE_ICON[m.mode];
            const selected = mode === m.mode;
            // Read-only once the assignment exists. Crossing the drawing
            // boundary is genuinely impossible, and the two written modes are
            // not a switch at all: the mode is derived from whether a paper is
            // attached, so it changes by adding or removing questions. A pill
            // that looked tappable and then snapped back on reload would be a
            // lie about how this works.
            const blocked = lockType ? modeSwitchBlockedReason(mode, m.mode) : null;
            const disabled = lockType && !selected;
            return (
              <Box
                key={m.mode}
                component="button"
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${m.title}. ${m.blurb}`}
                disabled={disabled}
                title={blocked ?? undefined}
                onClick={() =>
                  !disabled &&
                  onChange({
                    mode: m.mode,
                    type: assignmentTypeForMode(m.mode),
                    evaluationType: defaultEvaluationForMode(m.mode),
                  })
                }
                sx={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 72,
                  display: 'flex',
                  alignItems: { xs: 'center', sm: 'flex-start' },
                  flexDirection: { xs: 'row', sm: 'column' },
                  gap: { xs: 1.25, sm: 0.5 },
                  textAlign: 'left',
                  p: 1.5,
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'background.paper',
                  color: 'text.primary',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                  position: 'relative',
                  font: 'inherit',
                  transition: 'border-color 0.2s, background-color 0.2s',
                  '&:hover:not(:disabled)': {
                    borderColor: selected ? 'primary.main' : 'text.disabled',
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <Icon
                  sx={{ fontSize: 22, flexShrink: 0, color: selected ? 'primary.main' : 'text.secondary' }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                    {m.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', lineHeight: 1.35 }}
                  >
                    {m.blurb}
                  </Typography>
                </Box>
                {selected && (
                  <CheckCircleIcon
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      fontSize: 16,
                      color: 'primary.main',
                      display: { xs: 'none', sm: 'block' },
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Stack>
        {lockType && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {mode === 'drawing'
              ? 'A drawing task stays a drawing task. Create a new assignment to set written work.'
              : 'Adding or removing questions below is what moves this between answering and uploading.'}
          </Typography>
        )}
        {!lockType && mode === 'questions' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            You write the questions in the next step. You can decide there whether students also
            upload their working.
          </Typography>
        )}
      </Box>

      {/* When the work is due, relative to its class. Hidden without a class
          context, where "before the class" would mean nothing. */}
      {showTiming && (
        <ToggleButtonGroup
          value={value.timing}
          exclusive
          onChange={(_, v) => v && onChange({ timing: v })}
          fullWidth
          size="small"
        >
          <ToggleButton value="prework" sx={{ minHeight: 52, textTransform: 'none', gap: 0.75, flexDirection: 'column', py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Before class</Typography>
            <Typography variant="caption" color="text.secondary">Do it before we meet</Typography>
          </ToggleButton>
          <ToggleButton value="homework" sx={{ minHeight: 52, textTransform: 'none', gap: 0.75, flexDirection: 'column', py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>After class</Typography>
            <Typography variant="caption" color="text.secondary">Homework from this class</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      <TextField
        label="Title"
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
        fullWidth
        autoFocus={autoFocusTitle}
        error={!value.title.trim()}
        placeholder={type === 'drawing' ? 'e.g. Recreate the India Gate in pencil' : 'e.g. JEE 2024 Maths paper'}
      />

      {/*
        The brief, in parts.

        One box used to carry the task, what a good result looks like, and what
        to concentrate on, all at once. Three fields is not more typing: it is
        the same words with somewhere to put them, and the student gets three
        labelled blocks instead of a paragraph. Both extra fields are optional
        and both stay available to a written assignment, because "what does good
        look like" is a fair thing to say about a maths paper too.
      */}
      <TextField
        label={type === 'drawing' ? 'The task' : 'Instructions (optional)'}
        value={value.instructions}
        onChange={(e) => onChange({ instructions: e.target.value })}
        fullWidth
        multiline
        rows={3}
        placeholder={
          type === 'drawing'
            ? 'Recreate the India Gate in one-point perspective, on A3.'
            : 'Solve every question and upload your solved paper.'
        }
      />
      <TextField
        label="Expected outcome (optional)"
        value={value.expectedOutcome}
        onChange={(e) => onChange({ expectedOutcome: e.target.value })}
        fullWidth
        multiline
        rows={2}
        placeholder={
          type === 'drawing'
            ? 'A clean sheet with the arch centred and a single, correct vanishing point.'
            : 'Every step shown, with the final answer boxed.'
        }
        helperText="What a finished, successful piece of work looks like."
      />
      <TextField
        label="What to focus on (optional)"
        value={value.focusPoints}
        onChange={(e) => onChange({ focusPoints: e.target.value })}
        fullWidth
        multiline
        rows={3}
        placeholder={'Proportion of the arch\nOne vanishing point\nLine weight on the near edges'}
        helperText="One point per line. Students see these as a checklist."
      />

      {type === 'drawing' ? (
        <Stack spacing={2}>
          {showCategory && (
            <TextField select label="Drawing type" value={value.category} onChange={(e) => onChange({ category: e.target.value })} fullWidth>
              {DRAWING_CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </TextField>
          )}
          <ImageUploadList
            label="Reference / expected output (optional)"
            values={value.refImageUrls}
            onChange={handleReference}
            upload={uploadReference}
            helperText="Paste, drop, or choose"
            maxFiles={MAX_REFS}
            enableGlobalPaste={enableReferencePaste}
            camera
          />
          <Box>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                size="small"
                fullWidth
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                placeholder="Or paste a OneDrive/SharePoint image link"
                disabled={linking || value.refImageUrls.length >= MAX_REFS}
                InputProps={{ startAdornment: <LinkIcon sx={{ fontSize: 18, mr: 0.5, color: 'text.disabled' }} /> }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={addLink}
                disabled={linking || !linkInput.trim() || value.refImageUrls.length >= MAX_REFS}
                sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
              >
                {linking ? 'Adding...' : 'Add link'}
              </Button>
            </Stack>
            {linkError && (
              <Typography color="error" variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                {linkError}
              </Typography>
            )}
          </Box>
        </Stack>
      ) : (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>What can students upload?</Typography>
          <ToggleButtonGroup value={value.format} exclusive onChange={(_, v) => v && onChange({ format: v })} fullWidth size="small">
            <ToggleButton value="pdf_or_image" sx={{ minHeight: 48, textTransform: 'none' }}>PDF or photos</ToggleButton>
            <ToggleButton value="pdf" sx={{ minHeight: 48, textTransform: 'none' }}>PDF only</ToggleButton>
            <ToggleButton value="image" sx={{ minHeight: 48, textTransform: 'none' }}>Photos only</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* How the work is graded (applies to both drawing and document). */}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>How will you grade this?</Typography>
        <ToggleButtonGroup
          value={value.evaluationType}
          exclusive
          onChange={(_, v) => v && onChange({ evaluationType: v })}
          fullWidth
          size="small"
        >
          <ToggleButton value="marks" sx={{ minHeight: 48, textTransform: 'none' }}>Marks</ToggleButton>
          <ToggleButton value="stars" sx={{ minHeight: 48, textTransform: 'none' }}>Star rating</ToggleButton>
        </ToggleButtonGroup>
        {value.evaluationType === 'marks' ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">Out of</Typography>
            {['10', '100'].map((preset) => (
              <Chip
                key={preset}
                label={preset}
                clickable
                color={!customMarks && value.maxMarks === preset ? 'primary' : 'default'}
                variant={!customMarks && value.maxMarks === preset ? 'filled' : 'outlined'}
                onClick={() => { setCustomMarks(false); onChange({ maxMarks: preset }); }}
                sx={{ minHeight: 40, px: 0.5, fontWeight: 700 }}
              />
            ))}
            <Chip
              label="Custom"
              clickable
              color={customMarks ? 'primary' : 'default'}
              variant={customMarks ? 'filled' : 'outlined'}
              onClick={() => setCustomMarks(true)}
              sx={{ minHeight: 40, px: 0.5, fontWeight: 700 }}
            />
            {customMarks && (
              <TextField
                label="Max marks"
                value={value.maxMarks}
                onChange={(e) => onChange({ maxMarks: e.target.value.replace(/[^0-9.]/g, '') })}
                inputProps={{ inputMode: 'decimal' }}
                size="small"
                sx={{ width: 110 }}
              />
            )}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Students see a 1 to 5 star rating, no number.
          </Typography>
        )}
      </Box>

      {/* Pre-class work has no date fields at all. Its deadline is the class
          start, derived server side, so there is no way for a typed date to
          contradict the class it belongs to. Removing the input removes the
          whole bug class. */}
      {showTiming && value.timing === 'prework' ? (
        <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {classStartLabel ? `Due before ${classStartLabel}` : 'Due when the class starts'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This follows the class. If you move the class, the deadline moves with it.
          </Typography>
        </Box>
      ) : (
        <Stack direction="row" spacing={2}>
          <TextField label="Class date" type="date" value={value.classDate} onChange={(e) => onChange({ classDate: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
          <TextField label="Due (optional)" type="date" value={value.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
        </Stack>
      )}

      <Button
        onClick={onToggleAdvanced}
        endIcon={<ExpandMoreIcon sx={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
        sx={{ alignSelf: 'flex-start', minHeight: 40, textTransform: 'none', color: 'text.secondary' }}
      >
        More options
      </Button>
      <Collapse in={showAdvanced}>
        <Stack spacing={2}>
          <TextField
            label="Catch-up window (days for late joiners)"
            value={value.catchupDays}
            onChange={(e) => onChange({ catchupDays: e.target.value.replace(/[^0-9]/g, '') })}
            inputProps={{ inputMode: 'numeric' }}
            fullWidth
          />
          {/* Where the recording comes from, so nobody pastes one that already
              exists. This used to be the ONLY way a student ever saw a
              recording, because the automatic lookup searched a column that is
              never written. Now the class link resolves on its own and this
              field is a genuine override. */}
          {classContextLabel && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="flex-start"
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
              }}
            >
              <EventAvailableOutlinedIcon sx={{ fontSize: 18, color: 'primary.dark', mt: '2px' }} />
              <Typography variant="caption" sx={{ color: 'primary.dark' }}>
                Students already get the recording from <strong>{classContextLabel}</strong> once it
                is available. Paste a link below only to point them somewhere else.
              </Typography>
            </Stack>
          )}
          <TextField
            label="Class recording link (optional)"
            value={value.recordingUrl}
            onChange={(e) => onChange({ recordingUrl: e.target.value })}
            fullWidth
            placeholder="YouTube or SharePoint URL, for late joiners"
          />
        </Stack>
      </Collapse>
    </Stack>
  );
}
