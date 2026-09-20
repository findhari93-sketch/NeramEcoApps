'use client';

import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DrawingSolutionFields, { SolutionStatus } from './DrawingSolutionFields';
import type { ImageState } from '@/lib/bulk-upload-schema';

/**
 * What a drawing question needs beyond its text: the solution, and the marks.
 *
 * The solution itself (image, video, Copy prompt) lives in
 * DrawingSolutionFields. A single-task question renders it here once, under a
 * "Solution" line that says whether there is one yet. A question split into
 * parts renders it once per part, beside that part's text in
 * DrawingPartsEditor, so this panel is then only the marks line.
 *
 * Marks are a sentence, not a field. Every drawing question in the bank is
 * worth 50, so a labelled input asking for a number the teacher already knows
 * is a control that only ever gets skipped. Press Change on the rare paper
 * that says otherwise.
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
   * question has marks. The save sets drawing_marks to this, so the line reads
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
  const [editingMarks, setEditingMarks] = useState(false);
  const fixed = derivedMarks != null;

  return (
    <Stack spacing={2}>
      {!hasParts && (
        <Accordion defaultExpanded disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Solution
              </Typography>
              <SolutionStatus hasSolution={Boolean(value.solution_image)} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <DrawingSolutionFields
              value={value}
              onChange={onChange}
              getToken={getToken}
              promptText={questionText}
              marks={value.drawing_marks ? Number(value.drawing_marks) : null}
              categories={categories}
            />
          </AccordionDetails>
        </Accordion>
      )}

      {editingMarks && !fixed ? (
        <TextField
          label="Marks in the exam"
          value={value.drawing_marks}
          onChange={(e) => onChange({ drawing_marks: e.target.value.replace(/[^0-9]/g, '') })}
          size="small"
          inputMode="numeric"
          autoFocus
          helperText="Leave blank if the paper does not say"
          sx={{ width: { xs: '100%', sm: 200 } }}
        />
      ) : (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {fixed
              ? `Worth ${derivedMarks} marks in the exam, the total of the parts.`
              : value.drawing_marks
                ? `Worth ${value.drawing_marks} marks in the exam.`
                : 'No marks recorded for the exam.'}
          </Typography>
          {!fixed && (
            <Button
              size="small"
              onClick={() => setEditingMarks(true)}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Change
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
