'use client';

import { Stack, TextField, Typography } from '@neram/ui';
import DrawingSolutionFields from './DrawingSolutionFields';
import type { ImageState } from '@/lib/bulk-upload-schema';

/**
 * Everything that makes a drawing question answerable and markable.
 *
 * The solution itself (image, video, Copy prompt) lives in
 * DrawingSolutionFields. A single-task question renders it here once. A
 * question split into parts renders it once per part, beside that part's text
 * in DrawingPartsEditor, so this panel keeps only the question's marks.
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
  /** The question is split into parts, and each part carries its own solution. */
  hasParts?: boolean;
  /**
   * The marks the parts add up to, when every part of an "answer all parts"
   * question has marks. The save sets drawing_marks to this, so the field shows
   * it rather than inviting a number the server would overwrite.
   */
  derivedMarks?: number | null;
}

export default function DrawingQuestionPanel({
  value,
  onChange,
  getToken,
  questionText,
  categories,
  hasParts = false,
  derivedMarks = null,
}: Props) {
  return (
    <Stack spacing={2.5}>
      {hasParts ? (
        <Typography variant="body2" color="text.secondary">
          Each part has its own solution image and Copy prompt, under its text above.
        </Typography>
      ) : (
        <DrawingSolutionFields
          value={value}
          onChange={onChange}
          getToken={getToken}
          promptText={questionText}
          marks={value.drawing_marks ? Number(value.drawing_marks) : null}
          categories={categories}
        />
      )}

      <TextField
        label="Marks in the exam"
        value={derivedMarks != null ? String(derivedMarks) : value.drawing_marks}
        onChange={(e) => onChange({ drawing_marks: e.target.value.replace(/[^0-9]/g, '') })}
        size="small"
        inputMode="numeric"
        disabled={derivedMarks != null}
        helperText={
          derivedMarks != null
            ? 'The total of the part marks'
            : 'Leave blank if the paper does not say'
        }
        sx={{ width: { xs: '100%', sm: 200 } }}
      />
    </Stack>
  );
}
