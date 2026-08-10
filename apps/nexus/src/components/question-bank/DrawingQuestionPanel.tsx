'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  MenuItem,
  Snackbar,
  Alert,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ImageUploadZone from './ImageUploadZone';
import {
  buildSolutionPrompt,
  getMediumFromCategory,
  MEDIUM_LABELS,
  LEVEL_LABELS,
  type DrawingMedium,
  type SkillLevel,
} from '@/lib/drawing-prompt-templates';
import type { ImageState } from '@/lib/bulk-upload-schema';
import type { QBDrawingFocusPoint } from '@neram/database';

/**
 * Everything that makes a drawing question answerable and markable.
 *
 * The Copy prompt button is the whole AI story here. In-app AI evaluation of
 * drawings was deliberately switched off (/api/drawing/ai-feedback is a 410
 * stub) in favour of a teacher pasting a generated prompt into Gemini by hand,
 * and authoring a model solution follows the same road. Nothing in this file
 * calls a model, so nothing in it costs anything.
 *
 * The prompt is built from the CURRENT FORM STATE, not the saved row, so a
 * teacher can reword the question, press Copy, and get the reworded prompt
 * without first saving a draft they might throw away.
 */

/** The slice of editor form state this panel owns. */
export interface DrawingFormState {
  drawing_marks: string;
  colour_constraint: string;
  design_principle_tested: string;
  objects_to_include: Array<{ name: string; count?: number }>;
  drawing_focus_points: QBDrawingFocusPoint[];
  drawing_reference_image?: ImageState;
  solution_image?: ImageState;
  solution_video_url: string;
}

interface Props {
  value: DrawingFormState;
  onChange: (patch: Partial<DrawingFormState>) => void;
  getToken: () => Promise<string | null>;
  /** The prompt itself, so the generated instruction describes the real question. */
  questionText: string;
  /** Drives the default medium. Pass the question's categories. */
  categories?: string[] | null;
}

/** A focus list longer than this is not a focus. */
const MAX_FOCUS_POINTS = 8;

const MEDIA: DrawingMedium[] = ['graphite_pencil', 'charcoal_pencil', 'color_pencil'];
const LEVELS: SkillLevel[] = ['beginner', 'medium', 'expert'];

export default function DrawingQuestionPanel({
  value,
  onChange,
  getToken,
  questionText,
  categories,
}: Props) {
  const defaultMedium = useMemo(
    () => getMediumFromCategory((categories || []).find((c) => c !== 'drawing') || ''),
    [categories],
  );
  const [medium, setMedium] = useState<DrawingMedium>(defaultMedium);
  const [level, setLevel] = useState<SkillLevel>('expert');
  const [objectDraft, setObjectDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const prompt = useMemo(
    () =>
      buildSolutionPrompt(
        {
          question_text: questionText,
          design_principle_tested: value.design_principle_tested,
          colour_constraint: value.colour_constraint,
          objects_to_include: value.objects_to_include,
          focus_points: value.drawing_focus_points,
          drawing_marks: value.drawing_marks ? Number(value.drawing_marks) : null,
          category: (categories || []).find((c) => c !== 'drawing') || null,
        },
        level,
        medium,
      ),
    [questionText, value, level, medium, categories],
  );

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      // Clipboard needs a secure context and permission. Say so rather than
      // leaving the teacher pressing a button that appears to do nothing.
      setCopyFailed(true);
    }
  }, [prompt]);

  const addObject = useCallback(() => {
    const name = objectDraft.trim();
    if (!name) return;
    onChange({ objects_to_include: [...value.objects_to_include, { name }] });
    setObjectDraft('');
  }, [objectDraft, value.objects_to_include, onChange]);

  const setFocus = useCallback(
    (next: QBDrawingFocusPoint[]) => onChange({ drawing_focus_points: next }),
    [onChange],
  );

  const moveFocus = useCallback(
    (index: number, delta: number) => {
      const next = [...value.drawing_focus_points];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      setFocus(next);
    },
    [value.drawing_focus_points, setFocus],
  );

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Reference image
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          An aid for the prompt, such as a photo of the kit. Students see this before they draw.
        </Typography>
        <ImageUploadZone
          image={value.drawing_reference_image}
          onChange={(img) => onChange({ drawing_reference_image: img })}
          getToken={getToken}
          subfolder="drawing-references"
          height={140}
          label="Drop a reference image, paste, or click to upload"
        />
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Model solution image
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Hidden from a student until they upload their own attempt.
        </Typography>
        <ImageUploadZone
          image={value.solution_image}
          onChange={(img) => onChange({ solution_image: img })}
          getToken={getToken}
          subfolder="drawing-solutions"
          height={160}
          label="Drop the solution image, paste, or click to upload"
        />
      </Box>

      <TextField
        label="Solution video URL"
        value={value.solution_video_url}
        onChange={(e) => onChange({ solution_video_url: e.target.value })}
        fullWidth
        size="small"
        placeholder="https://..."
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Marks"
          value={value.drawing_marks}
          onChange={(e) => onChange({ drawing_marks: e.target.value.replace(/[^0-9]/g, '') })}
          size="small"
          inputMode="numeric"
          sx={{ width: { xs: '100%', sm: 140 } }}
        />
        <TextField
          label="Colour rule"
          value={value.colour_constraint}
          onChange={(e) => onChange({ colour_constraint: e.target.value })}
          size="small"
          fullWidth
          placeholder="maximum 3 colours"
        />
      </Stack>

      <TextField
        label="Design principle tested"
        value={value.design_principle_tested}
        onChange={(e) => onChange({ design_principle_tested: e.target.value })}
        size="small"
        fullWidth
        placeholder="balance, rhythm, emphasis"
      />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Objects to include
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField
            value={objectDraft}
            onChange={(e) => setObjectDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addObject();
              }
            }}
            size="small"
            fullWidth
            placeholder="chair, table, lamp"
            label="Add an object"
          />
          <Button
            onClick={addObject}
            disabled={!objectDraft.trim()}
            startIcon={<AddIcon />}
            sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
          >
            Add
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {value.objects_to_include.map((o, i) => (
            <Chip
              key={`${o.name}-${i}`}
              label={o.count && o.count > 1 ? `${o.name} x${o.count}` : o.name}
              onDelete={() =>
                onChange({ objects_to_include: value.objects_to_include.filter((_, j) => j !== i) })
              }
              sx={{ height: 36 }}
            />
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          What to concentrate on
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Shown to the student after they upload, and used in the prompt below. Up to{' '}
          {MAX_FOCUS_POINTS}, because a longer list is not a focus.
        </Typography>
        <Stack spacing={1}>
          {value.drawing_focus_points.map((fp, i) => (
            <Stack
              key={i}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'stretch', sm: 'flex-start' }}
            >
              <TextField
                value={fp.text}
                onChange={(e) => {
                  const next = [...value.drawing_focus_points];
                  next[i] = { ...next[i], text: e.target.value };
                  setFocus(next);
                }}
                size="small"
                fullWidth
                multiline
                maxRows={3}
                placeholder="Keep the horizon line consistent"
              />
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                <IconButton
                  onClick={() => moveFocus(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move focus point ${i + 1} up`}
                  sx={{ width: 44, height: 44 }}
                >
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  onClick={() => moveFocus(i, 1)}
                  disabled={i === value.drawing_focus_points.length - 1}
                  aria-label={`Move focus point ${i + 1} down`}
                  sx={{ width: 44, height: 44 }}
                >
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  onClick={() => setFocus(value.drawing_focus_points.filter((_, j) => j !== i))}
                  aria-label={`Remove focus point ${i + 1}`}
                  sx={{ width: 44, height: 44 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          ))}
        </Stack>
        <Button
          onClick={() => setFocus([...value.drawing_focus_points, { text: '' }])}
          disabled={value.drawing_focus_points.length >= MAX_FOCUS_POINTS}
          startIcon={<AddIcon />}
          sx={{ mt: 1, minHeight: 44 }}
        >
          Add focus point
        </Button>
      </Box>

      <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Make the solution image with an external tool
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Copy this prompt, paste it into Gemini with no image attached, then upload what it gives
          you into Model solution image above.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
          <TextField
            select
            label="Medium"
            value={medium}
            onChange={(e) => setMedium(e.target.value as DrawingMedium)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            {MEDIA.map((m) => (
              <MenuItem key={m} value={m}>
                {MEDIUM_LABELS[m]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Level"
            value={level}
            onChange={(e) => setLevel(e.target.value as SkillLevel)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            {LEVELS.map((l) => (
              <MenuItem key={l} value={l}>
                {LEVEL_LABELS[l]}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon />}
            onClick={copyPrompt}
            sx={{ minHeight: 44 }}
          >
            Copy prompt
          </Button>
          <Button
            variant="outlined"
            startIcon={<OpenInNewIcon />}
            href="https://gemini.google.com/app"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ minHeight: 44 }}
          >
            Open Gemini
          </Button>
        </Stack>
      </Box>

      <Snackbar
        open={copied}
        autoHideDuration={3000}
        onClose={() => setCopied(false)}
        message="Prompt copied. Paste it into Gemini, then upload the image it gives you."
      />
      <Snackbar open={copyFailed} autoHideDuration={5000} onClose={() => setCopyFailed(false)}>
        <Alert severity="warning" onClose={() => setCopyFailed(false)}>
          Could not reach the clipboard. Select the prompt text manually, or try over https.
        </Alert>
      </Snackbar>
    </Stack>
  );
}
