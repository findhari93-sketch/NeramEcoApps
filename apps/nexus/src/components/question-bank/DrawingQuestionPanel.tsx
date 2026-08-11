'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Chip,
  MenuItem,
  Snackbar,
  Alert,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
 *
 * Colour rule, design principle, objects to include and focus points used to
 * live here too. Nobody was filling them in, so they are gone from
 * authoring: the columns stay on the row (drawing_marks aside, they are
 * simply never read or written by this panel any more), and a later change
 * of mind costs no migration.
 */

/** The slice of editor form state this panel owns. */
export interface DrawingFormState {
  drawing_marks: string;
  /**
   * One image, shown to a student before they draw in practice (subject to
   * their own reveal switch) and never before they submit in a test. It used
   * to be two fields, a "reference" and a "model solution", and nobody could
   * say what told them apart, since the same picture usually served both.
   */
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
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const prompt = useMemo(
    () =>
      buildSolutionPrompt(
        {
          question_text: questionText,
          drawing_marks: value.drawing_marks ? Number(value.drawing_marks) : null,
          category: (categories || []).find((c) => c !== 'drawing') || null,
        },
        level,
        medium,
      ),
    [questionText, value.drawing_marks, level, medium, categories],
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

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Solution image
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Hidden during a test until the student submits. In practice they can choose to reveal it
          before they draw.
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

      <TextField
        label="Marks in the exam"
        value={value.drawing_marks}
        onChange={(e) => onChange({ drawing_marks: e.target.value.replace(/[^0-9]/g, '') })}
        size="small"
        inputMode="numeric"
        helperText="Leave blank if the paper does not say"
        sx={{ width: { xs: '100%', sm: 200 } }}
      />

      <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Make the solution image with an external tool
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Copy this prompt, paste it into Gemini with no image attached, then upload what it gives
          you into Solution image above.
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
