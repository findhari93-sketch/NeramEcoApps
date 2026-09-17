'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
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
 * One drawing solution: the image, the video, and the Copy prompt that makes
 * the image in an external tool.
 *
 * A whole question has one of these. A question split into parts has one per
 * part, so 2014 Q82's balloon seller and its village women each get their own
 * model answer and their own prompt.
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

export interface DrawingSolutionState {
  /**
   * One image, shown to a student before they draw in practice (subject to
   * their own reveal switch) and never before they submit in a test.
   */
  solution_image?: ImageState;
  solution_video_url: string;
}

interface Props {
  value: DrawingSolutionState;
  onChange: (patch: Partial<DrawingSolutionState>) => void;
  getToken: () => Promise<string | null>;
  /** The task this solution answers, so the generated instruction describes it. */
  promptText: string;
  marks: number | null;
  /** Drives the default medium. Pass the question's categories. */
  categories?: string[] | null;
  /** "for part A", read into labels so two parts on one screen stay distinguishable. */
  labelSuffix?: string;
}

const MEDIA: DrawingMedium[] = ['graphite_pencil', 'charcoal_pencil', 'color_pencil'];
const LEVELS: SkillLevel[] = ['beginner', 'medium', 'expert'];

export default function DrawingSolutionFields({
  value,
  onChange,
  getToken,
  promptText,
  marks,
  categories,
  labelSuffix,
}: Props) {
  const defaultMedium = useMemo(
    () => getMediumFromCategory((categories || []).find((c) => c !== 'drawing') || ''),
    [categories],
  );
  const [medium, setMedium] = useState<DrawingMedium>(defaultMedium);
  const [level, setLevel] = useState<SkillLevel>('expert');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const suffix = labelSuffix ? ` ${labelSuffix}` : '';

  const prompt = useMemo(
    () =>
      buildSolutionPrompt(
        {
          question_text: promptText,
          drawing_marks: marks,
          category: (categories || []).find((c) => c !== 'drawing') || null,
        },
        level,
        medium,
      ),
    [promptText, marks, level, medium, categories],
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
          Solution image{suffix}
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
        label={`Solution video URL${suffix}`}
        value={value.solution_video_url}
        onChange={(e) => onChange({ solution_video_url: e.target.value })}
        fullWidth
        size="small"
        placeholder="https://..."
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
            Copy prompt{suffix}
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
